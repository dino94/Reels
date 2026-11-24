import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { readdir, readFile, rm, stat, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_VIDEO_BYTES = Number(process.env.NEXT_PUBLIC_MAX_VIDEO_SIZE_MB || 500) * 1024 * 1024;
const MAX_AUDIO_BYTES = 24 * 1024 * 1024;
const MAX_AUDIO_SEGMENTS = 60;
const requestSchema = z.object({ videoId: z.string().uuid() });

class NoAudioTrackError extends Error {
  constructor() {
    super("Aucune piste audio n’a été trouvée dans cette vidéo.");
    this.name = "NoAudioTrackError";
  }
}

async function* readWebStreamChunks(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader();
  let completed = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        completed = true;
        return;
      }
      yield Buffer.from(value);
    }
  } finally {
    if (!completed) {
      await reader.cancel().catch((error: unknown) => {
        console.error("Impossible d’annuler le téléchargement audio interrompu.", error);
      });
    }
    reader.releaseLock();
  }
}

async function downloadVideo(body: ReadableStream<Uint8Array>, outputPath: string) {
  let bytes = 0;
  const sizeGuard = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      bytes += chunk.length;
      if (bytes > MAX_VIDEO_BYTES) callback(new Error("La vidéo dépasse la taille maximale autorisée."));
      else callback(null, chunk);
    },
  });
  await pipeline(Readable.from(readWebStreamChunks(body)), sizeGuard, createWriteStream(outputPath));
  if (!bytes) throw new Error("Le fichier vidéo est vide.");
}

function extractAudioSegments(videoPath: string, outputDirectory: string) {
  return new Promise<void>((resolve, reject) => {
    const executable = process.env.FFMPEG_PATH || "ffmpeg";
    const ffmpeg = spawn(executable, [
      "-hide_banner",
      "-loglevel", "error",
      "-nostdin",
      "-y",
      "-i", videoPath,
      "-map", "0:a:0",
      "-vn",
      "-c:a", "libmp3lame",
      "-b:a", "64k",
      "-ac", "1",
      "-ar", "16000",
      "-f", "segment",
      "-segment_time", "600",
      "-reset_timestamps", "1",
      "-segment_format", "mp3",
      join(outputDirectory, "audio-%03d.mp3"),
    ], { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });

    let stderr = "";
    ffmpeg.stderr?.setEncoding("utf8");
    ffmpeg.stderr?.on("data", (chunk: string) => {
      stderr = `${stderr}${chunk}`.slice(-2000);
    });
    ffmpeg.once("error", (error: NodeJS.ErrnoException) => {
      reject(error.code === "ENOENT"
        ? new Error("FFmpeg est introuvable sur le serveur. Installe FFmpeg ou configure FFMPEG_PATH.")
        : new Error(`Impossible de démarrer FFmpeg : ${error.message}`));
    });
    ffmpeg.once("close", (code) => {
      if (code === 0) {
        resolve();
      } else if (/matches no streams|does not contain any stream|stream specifier.*matches no streams/i.test(stderr)) {
        reject(new NoAudioTrackError());
      } else {
        reject(new Error(`FFmpeg n’a pas pu extraire l’audio.${stderr ? ` ${stderr.trim()}` : ""}`));
      }
    });
  });
}

async function translateAudio(audioPath: string, apiKey: string) {
  const audio = await readFile(audioPath);
  if (!audio.length) throw new Error("FFmpeg a produit un segment audio vide.");
  if (audio.length > MAX_AUDIO_BYTES) {
    throw new Error("Un segment audio dépasse la limite d’envoi à Whisper.");
  }

  const form = new FormData();
  form.append("model", "whisper-1");
  form.append("file", new Blob([new Uint8Array(audio)], { type: "audio/mpeg" }), "audio.mp3");
  const response = await fetch("https://api.openai.com/v1/audio/translations", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  let result: unknown;
  try {
    result = await response.json();
  } catch {
    throw new Error(`Whisper a renvoyé une réponse invalide (HTTP ${response.status}).`);
  }
  if (!response.ok) {
    const message = z.object({ error: z.object({ message: z.string() }).optional() })
      .safeParse(result).data?.error?.message;
    throw new Error(message || `La traduction Whisper a échoué (HTTP ${response.status}).`);
  }
  const parsed = z.object({ text: z.string() }).safeParse(result);
  if (!parsed.success) throw new Error("Whisper n’a pas renvoyé de traduction exploitable.");
  return parsed.data.text.trim();
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "La traduction n’est pas configurée : ajoutez OPENAI_API_KEY au serveur." }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête de traduction invalide." }, { status: 400 });
  }
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Identifiant vidéo invalide." }, { status: 400 });

  const { data: video, error: videoError } = await supabase.from("videos")
    .select("id,storage_path")
    .eq("id", parsed.data.videoId)
    .eq("user_id", user.id)
    .single();
  if (videoError || !video) return NextResponse.json({ error: "Vidéo introuvable." }, { status: 404 });

  const { data: signedSource, error: signedUrlError } = await supabase.storage
    .from("videos")
    .createSignedUrl(video.storage_path, 300);
  if (signedUrlError || !signedSource?.signedUrl) {
    return NextResponse.json({ error: signedUrlError?.message || "Vidéo source introuvable." }, { status: 404 });
  }

  let sourceResponse: Response;
  try {
    sourceResponse = await fetch(signedSource.signedUrl);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Erreur réseau.";
    return NextResponse.json({ error: `Impossible de récupérer la vidéo source : ${message}` }, { status: 502 });
  }
  if (!sourceResponse.ok || !sourceResponse.body) {
    return NextResponse.json({ error: "Impossible de télécharger la vidéo source." }, { status: 502 });
  }

  const sourceLength = Number(sourceResponse.headers.get("content-length"));
  if (Number.isFinite(sourceLength) && sourceLength > MAX_VIDEO_BYTES) {
    return NextResponse.json({ error: "La vidéo dépasse la taille maximale autorisée." }, { status: 413 });
  }

  let temporaryDirectory: string | undefined;
  try {
    temporaryDirectory = await mkdtemp(join(tmpdir(), "football-translation-"));
    const sourcePath = join(temporaryDirectory, "source-video");
    await downloadVideo(sourceResponse.body, sourcePath);
    await extractAudioSegments(sourcePath, temporaryDirectory);

    const segmentPaths = (await readdir(temporaryDirectory))
      .filter((name) => /^audio-\d+\.mp3$/.test(name))
      .sort()
      .map((name) => join(temporaryDirectory!, name));
    if (!segmentPaths.length) throw new NoAudioTrackError();
    if (segmentPaths.length > MAX_AUDIO_SEGMENTS) {
      throw new Error("Cette vidéo est trop longue pour une traduction en une seule demande.");
    }

    const translatedParts: string[] = [];
    for (const segmentPath of segmentPaths) {
      const segmentStats = await stat(segmentPath);
      if (segmentStats.size > MAX_AUDIO_BYTES) {
        throw new Error("Un segment audio dépasse la limite d’envoi à Whisper.");
      }
      const text = await translateAudio(segmentPath, process.env.OPENAI_API_KEY);
      if (text) translatedParts.push(text);
    }
    const translation = translatedParts.join("\n\n").trim();
    if (!translation) throw new Error("Aucune parole n’a pu être traduite dans cette vidéo.");

    const content = `# Traduction anglaise\n\n${translation}\n`;
    const storagePath = `${user.id}/${video.id}/TRANSLATION.md`;
    const { error: uploadError } = await supabase.storage.from("reports").upload(
      storagePath, new Blob([content], { type: "text/markdown" }), { upsert: true },
    );
    if (uploadError) throw new Error(uploadError.message);

    const { data: existingReport, error: existingReportError } = await supabase.from("reports")
      .select("id")
      .eq("video_id", video.id)
      .eq("user_id", user.id)
      .eq("kind", "translation")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existingReportError) throw new Error(existingReportError.message);

    const reportQuery = existingReport
      ? supabase.from("reports").update({ content, storage_path: storagePath })
          .eq("id", existingReport.id).eq("user_id", user.id).select("id").single()
      : supabase.from("reports").insert({
          video_id: video.id,
          user_id: user.id,
          storage_path: storagePath,
          content,
          kind: "translation",
        }).select("id").single();
    const { data: report, error: reportError } = await reportQuery;
    if (reportError || !report) throw new Error(reportError?.message || "Impossible d’enregistrer la traduction.");

    return NextResponse.json({ translation, reportId: report.id });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Traduction impossible.";
    const status = cause instanceof NoAudioTrackError ? 422
      : message.includes("taille maximale") ? 413
      : message.includes("trop longue") ? 413
      : 500;
    return NextResponse.json({ error: message }, { status });
  } finally {
    if (temporaryDirectory) {
      await rm(temporaryDirectory, { recursive: true, force: true }).catch((error: unknown) => {
        console.error("Impossible de nettoyer les fichiers temporaires de traduction.", error);
      });
    }
  }
}
