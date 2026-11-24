import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { mkdtemp, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { z } from "zod";
import { buildHighlightsFilter } from "@/lib/highlights-filter";
import { cleanupTemporaryDirectory, writeWebStreamToFile } from "@/lib/media";
import { checkRateLimit, releaseRateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_FILE_BYTES = Number(process.env.MAX_VIDEO_SIZE_MB || process.env.NEXT_PUBLIC_MAX_VIDEO_SIZE_MB || 500) * 1024 * 1024;
const clipSchema = z.object({
  start: z.number().finite().min(0),
  end: z.number().finite().positive(),
});
const requestSchema = z.object({
  videoId: z.string().uuid(),
  clips: z.array(clipSchema).min(1).max(60),
  format: z.enum(["vertical", "youtube"]).default("vertical"),
});

class NoAudioTrackError extends Error {
  constructor() {
    super("Aucune piste audio n’a été trouvée dans la vidéo stockée. Réimporte l’original contenant le son.");
    this.name = "NoAudioTrackError";
  }
}

function renderHighlights(
  sourcePath: string,
  outputPath: string,
  clips: Array<{ start: number; end: number }>,
  dimensions: { width: number; height: number },
) {
  return new Promise<void>((resolve, reject) => {
    const { filter, assembledDuration } = buildHighlightsFilter(clips, dimensions);
    const executable = process.env.FFMPEG_PATH || "ffmpeg";
    const ffmpeg = spawn(executable, [
      "-hide_banner",
      "-loglevel", "error",
      "-nostdin",
      "-y",
      "-i", sourcePath,
      "-filter_complex", filter,
      "-map", "[vout]",
      "-map", "[aout]",
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", "23",
      "-pix_fmt", "yuv420p",
      "-c:a", "aac",
      "-b:a", "192k",
      "-movflags", "+faststart",
      "-t", assembledDuration.toFixed(3),
      "-shortest",
      "-f", "mp4",
      outputPath,
    ], { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });

    let stderr = "";
    ffmpeg.stderr?.setEncoding("utf8");
    ffmpeg.stderr?.on("data", (chunk: string) => {
      stderr = `${stderr}${chunk}`.slice(-3000);
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
        reject(new Error(`FFmpeg n’a pas pu ajouter le son d’origine.${stderr ? ` ${stderr.trim()}` : ""}`));
      }
    });
  });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non autorisé." }, { status: 401 });

  const rateLimit = checkRateLimit(user.id, "highlights");
  if (!rateLimit.allowed) return NextResponse.json({ error: rateLimit.message }, { status: 429 });

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête de montage invalide." }, { status: 400 });
  }
  const parsedRequest = requestSchema.safeParse(payload);
  if (!parsedRequest.success) return NextResponse.json({ error: "Identifiant ou liste des passages invalide." }, { status: 400 });
  const { videoId, clips, format } = parsedRequest.data;
  const dimensions = format === "vertical"
    ? { width: 1080, height: 1920 }
    : { width: 1920, height: 1080 };

  const { data: video, error: videoError } = await supabase.from("videos")
    .select("storage_path,duration_seconds")
    .eq("id", videoId)
    .eq("user_id", user.id)
    .single();
  if (videoError || !video) return NextResponse.json({ error: "Vidéo source introuvable." }, { status: 404 });

  for (let index = 0; index < clips.length; index++) {
    const clip = clips[index];
    if (clip.end <= clip.start
      || (video.duration_seconds && clip.end > video.duration_seconds + 0.05)
      || (index > 0 && clip.start < clips[index - 1].end)) {
      return NextResponse.json({ error: "Les passages sélectionnés sont hors limites ou se chevauchent." }, { status: 400 });
    }
  }

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

  let temporaryDirectory: string | undefined;
  try {
    temporaryDirectory = await mkdtemp(join(tmpdir(), "football-highlights-"));
    const sourcePath = join(temporaryDirectory, "source-video");
    const outputPath = join(temporaryDirectory, "highlights-with-audio.mp4");

    const sourceLengthHeader = sourceResponse.headers.get("content-length");
    const sourceLength = sourceLengthHeader ? Number(sourceLengthHeader) : null;
    if (sourceLength !== null && Number.isFinite(sourceLength) && sourceLength > MAX_FILE_BYTES) {
      throw new Error("La vidéo source dépasse la taille maximale autorisée.");
    }
    await writeWebStreamToFile(sourceResponse.body, sourcePath, MAX_FILE_BYTES);

    await renderHighlights(sourcePath, outputPath, clips, dimensions);
    const outputStats = await stat(outputPath);
    if (!outputStats.size) throw new Error("FFmpeg n’a produit aucun montage.");
    if (outputStats.size > MAX_FILE_BYTES) {
      throw new Error("Le montage final dépasse la taille maximale autorisée.");
    }

    const outputStream = createReadStream(outputPath);
    outputStream.once("close", () => {
      cleanupTemporaryDirectory(temporaryDirectory, "montage");
      releaseRateLimit(user.id, "highlights");
    });
    outputStream.once("error", (error) => {
      console.error("Erreur pendant l’envoi du montage final.", error);
      cleanupTemporaryDirectory(temporaryDirectory, "montage");
      releaseRateLimit(user.id, "highlights");
    });
    const responseStream = Readable.toWeb(outputStream) as unknown as ReadableStream<Uint8Array>;

    return new Response(responseStream, {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": String(outputStats.size),
        "Content-Disposition": `attachment; filename="football-highlights-${format === "vertical" ? "vertical-9x16" : "youtube-16x9"}.mp4"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (cause) {
    releaseRateLimit(user.id, "highlights");
    cleanupTemporaryDirectory(temporaryDirectory, "montage après échec");
    const message = cause instanceof Error ? cause.message : "Création du montage impossible.";
    const status = cause instanceof NoAudioTrackError ? 422
      : message.includes("taille maximale") ? 413
      : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
