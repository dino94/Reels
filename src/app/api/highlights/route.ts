import { spawn } from "node:child_process";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_FILE_BYTES = Number(process.env.NEXT_PUBLIC_MAX_VIDEO_SIZE_MB || 500) * 1024 * 1024;
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
        console.error("Impossible d’annuler le transfert vidéo interrompu.", error);
      });
    }
    reader.releaseLock();
  }
}

async function writeWebStreamToFile(
  body: ReadableStream<Uint8Array>,
  filePath: string,
  maxBytes: number,
) {
  let bytes = 0;
  const sizeGuard = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      bytes += chunk.length;
      if (bytes > maxBytes) callback(new Error("Le fichier vidéo dépasse la taille maximale autorisée."));
      else callback(null, chunk);
    },
  });
  await pipeline(Readable.from(readWebStreamChunks(body)), sizeGuard, createWriteStream(filePath));
  return bytes;
}

function renderHighlights(
  sourcePath: string,
  outputPath: string,
  clips: Array<{ start: number; end: number }>,
  dimensions: { width: number; height: number },
) {
  return new Promise<void>((resolve, reject) => {
    const durations = clips.map((clip) => clip.end - clip.start);
    const transitions = durations.slice(1).map((duration, index) =>
      Math.min(0.5, durations[index], duration),
    );
    const filters: string[] = [];
    if (clips.length > 1) {
      filters.push(`[0:v:0]split=${clips.length}${clips.map((_, index) => `[vsrc${index}]`).join("")}`);
      filters.push(`[0:a:0]asplit=${clips.length}${clips.map((_, index) => `[asrc${index}]`).join("")}`);
    }
    clips.forEach((clip, index) => {
      const videoInput = clips.length > 1 ? `[vsrc${index}]` : "[0:v:0]";
      const audioInput = clips.length > 1 ? `[asrc${index}]` : "[0:a:0]";
      filters.push(
        `${videoInput}trim=start=${clip.start.toFixed(3)}:end=${clip.end.toFixed(3)},setpts=PTS-STARTPTS,fps=30,setpts=N/(30*TB),split=2[backgroundsrc${index}][foregroundsrc${index}]`,
      );
      filters.push(
        `[backgroundsrc${index}]scale=${dimensions.width}:${dimensions.height}:force_original_aspect_ratio=increase,crop=${dimensions.width}:${dimensions.height},boxblur=24:12,setsar=1[background${index}]`,
      );
      filters.push(
        `[foregroundsrc${index}]scale=${dimensions.width}:${dimensions.height}:force_original_aspect_ratio=decrease,setsar=1[foreground${index}]`,
      );
      filters.push(
        `[background${index}][foreground${index}]overlay=(W-w)/2:(H-h)/2,format=yuv420p,settb=AVTB[v${index}]`,
      );
      filters.push(
        `${audioInput}atrim=start=${clip.start.toFixed(3)}:end=${clip.end.toFixed(3)},aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,asetpts=N/SR/TB[a${index}]`,
      );
    });

    let videoLabel = "[v0]";
    let audioLabel = "[a0]";
    let assembledDuration = durations[0];
    for (let index = 1; index < clips.length; index++) {
      const transitionDuration = transitions[index - 1];
      const offset = Math.max(0, assembledDuration - transitionDuration);
      const nextVideoLabel = `[vx${index}]`;
      const nextAudioLabel = `[ax${index}]`;
      filters.push(
        `${videoLabel}[v${index}]xfade=transition=fade:duration=${transitionDuration.toFixed(3)}:offset=${offset.toFixed(3)}${nextVideoLabel}`,
      );
      filters.push(
        `${audioLabel}[a${index}]acrossfade=d=${transitionDuration.toFixed(3)}:c1=tri:c2=tri${nextAudioLabel}`,
      );
      videoLabel = nextVideoLabel;
      audioLabel = nextAudioLabel;
      assembledDuration += durations[index] - transitionDuration;
    }
    filters.push(`${videoLabel}null[vout]`);
    filters.push(`${audioLabel}apad[aout]`);
    const filter = filters.join(";");
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

    let cleanupStarted = false;
    const cleanup = () => {
      if (cleanupStarted) return;
      cleanupStarted = true;
      if (temporaryDirectory) {
        void rm(temporaryDirectory, { recursive: true, force: true }).catch((error: unknown) => {
          console.error("Impossible de nettoyer les fichiers temporaires du montage.", error);
        });
      }
    };
    const outputStream = createReadStream(outputPath);
    outputStream.once("close", cleanup);
    outputStream.once("error", (error) => {
      console.error("Erreur pendant l’envoi du montage final.", error);
      cleanup();
    });
    const responseStream = new ReadableStream<Uint8Array>({
      start(controller) {
        outputStream.on("data", (chunk: Buffer | string) => {
          controller.enqueue(typeof chunk === "string" ? new TextEncoder().encode(chunk) : new Uint8Array(chunk));
        });
        outputStream.once("end", () => {
          controller.close();
          cleanup();
        });
        outputStream.once("error", (error) => controller.error(error));
      },
      cancel() {
        outputStream.destroy();
        cleanup();
      },
    });
    return new Response(responseStream, {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": String(outputStats.size),
        "Content-Disposition": `attachment; filename="football-highlights-${format === "vertical" ? "vertical-9x16" : "youtube-16x9"}.mp4"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (cause) {
    if (temporaryDirectory) {
      await rm(temporaryDirectory, { recursive: true, force: true }).catch((error: unknown) => {
        console.error("Impossible de nettoyer les fichiers temporaires après échec du montage.", error);
      });
    }
    const message = cause instanceof Error ? cause.message : "Création du montage impossible.";
    const status = cause instanceof NoAudioTrackError ? 422
      : message.includes("taille maximale") ? 413
      : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
