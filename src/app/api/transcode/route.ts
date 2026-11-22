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

const MAX_INPUT_BYTES = Number(process.env.NEXT_PUBLIC_MAX_VIDEO_SIZE_MB || 500) * 1024 * 1024;
const FILE_TOO_LARGE = "La vidéo dépasse la taille maximale autorisée.";
const FILE_EMPTY = "Le fichier vidéo est vide.";
const INVALID_VIDEO = "Le fichier vidéo semble incomplet ou invalide (métadonnées MP4 manquantes). Réexporte ou retélécharge entièrement la vidéo, puis réessaie.";
const requestSchema = z.object({
  storagePath: z.string().min(1),
  expectedSize: z.number().int().positive().max(MAX_INPUT_BYTES),
});

class InvalidVideoError extends Error {
  constructor(receivedBytes: number, expectedBytes: number | null) {
    const sizes = expectedBytes === null
      ? `Taille reçue : ${receivedBytes} octets.`
      : `Taille reçue : ${receivedBytes} octets ; taille sélectionnée : ${expectedBytes} octets.`;
    super(`${INVALID_VIDEO} ${sizes}`);
    this.name = "InvalidVideoError";
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
        console.error("Impossible d’annuler le téléchargement vidéo interrompu.", error);
      });
    }
    reader.releaseLock();
  }
}

function transcodeToH264(inputPath: string, outputPath: string, receivedBytes: number, expectedBytes: number | null) {
  return new Promise<void>((resolve, reject) => {
    const executable = process.env.FFMPEG_PATH || "ffmpeg";
    const ffmpeg = spawn(executable, [
      "-hide_banner",
      "-loglevel", "error",
      "-nostdin",
      "-y",
      "-i", inputPath,
      "-map", "0:v:0",
      "-map", "0:a?",
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", "23",
      "-pix_fmt", "yuv420p",
      "-c:a", "aac",
      "-b:a", "192k",
      "-movflags", "+faststart",
      "-f", "mp4",
      outputPath,
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
      } else {
        if (/moov atom not found|invalid data found when processing input/i.test(stderr)) {
          reject(new InvalidVideoError(receivedBytes, expectedBytes));
          return;
        }
        reject(new Error(`FFmpeg n’a pas pu convertir cette vidéo en H.264.${stderr ? ` ${stderr.trim()}` : ""}`));
      }
    });
  });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non autorisé." }, { status: 401 });

  let requestBody: unknown;
  try {
    requestBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête de conversion invalide." }, { status: 400 });
  }
  const parsed = requestSchema.safeParse(requestBody);
  if (!parsed.success) return NextResponse.json({ error: "Fichier ou taille vidéo invalide." }, { status: 400 });
  const { storagePath, expectedSize } = parsed.data;
  const pathParts = storagePath.split("/");
  if (pathParts[0] !== user.id || pathParts.length < 2 || pathParts.some((part) => part === "." || part === "..")) {
    return NextResponse.json({ error: "Chemin de stockage invalide." }, { status: 400 });
  }

  const { data: signedSource, error: signedUrlError } = await supabase.storage
    .from("videos")
    .createSignedUrl(storagePath, 300);
  if (signedUrlError || !signedSource?.signedUrl) {
    return NextResponse.json({ error: signedUrlError?.message || "Vidéo source introuvable." }, { status: 404 });
  }
  let sourceResponse: Response;
  try {
    sourceResponse = await fetch(signedSource.signedUrl);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Erreur réseau.";
    return NextResponse.json({ error: `Impossible de récupérer la vidéo depuis Supabase : ${message}` }, { status: 502 });
  }
  if (!sourceResponse.ok || !sourceResponse.body) {
    return NextResponse.json({ error: "Impossible de télécharger la vidéo source depuis Supabase." }, { status: 502 });
  }
  const contentLengthHeader = sourceResponse.headers.get("content-length");
  const sourceContentLength = contentLengthHeader ? Number(contentLengthHeader) : null;
  if (sourceContentLength !== null && Number.isFinite(sourceContentLength) && sourceContentLength !== expectedSize) {
    return NextResponse.json({
      error: `La vidéo stockée est incomplète : ${sourceContentLength} octets reçus au lieu de ${expectedSize}.`,
    }, { status: 409 });
  }

  let temporaryDirectory: string | undefined;
  try {
    temporaryDirectory = await mkdtemp(join(tmpdir(), "football-video-transcode-"));
    const inputPath = join(temporaryDirectory, "input-video");
    const outputPath = join(temporaryDirectory, "output-h264.mp4");
    let inputBytes = 0;
    const sizeGuard = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        inputBytes += chunk.length;
        if (inputBytes > MAX_INPUT_BYTES) callback(new Error(FILE_TOO_LARGE));
        else callback(null, chunk);
      },
    });
    await pipeline(Readable.from(readWebStreamChunks(sourceResponse.body)), sizeGuard, createWriteStream(inputPath));
    if (!inputBytes) throw new Error(FILE_EMPTY);
    if (inputBytes !== expectedSize) {
      throw new Error(`Le téléchargement depuis Supabase est incomplet : ${inputBytes} octets reçus au lieu de ${expectedSize}.`);
    }

    await transcodeToH264(inputPath, outputPath, inputBytes, expectedSize);
    const outputStats = await stat(outputPath);
    if (!outputStats.size) throw new Error("FFmpeg n’a produit aucun fichier vidéo.");
    if (outputStats.size > MAX_INPUT_BYTES) {
      throw new Error("La vidéo convertie dépasse la taille maximale autorisée.");
    }

    let cleanupStarted = false;
    const cleanup = () => {
      if (cleanupStarted) return;
      cleanupStarted = true;
      if (temporaryDirectory) {
        void rm(temporaryDirectory, { recursive: true, force: true }).catch((error: unknown) => {
          console.error("Impossible de nettoyer les fichiers temporaires de conversion.", error);
        });
      }
    };
    const outputStream = createReadStream(outputPath);
    outputStream.once("close", cleanup);
    outputStream.once("error", (error) => {
      console.error("Erreur pendant l’envoi de la vidéo convertie.", error);
      cleanup();
    });
    const webOutputStream = new ReadableStream<Uint8Array>({
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
    return new Response(webOutputStream, {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": String(outputStats.size),
        "Content-Disposition": 'attachment; filename="video-h264.mp4"',
        "Cache-Control": "no-store",
      },
    });
  } catch (cause) {
    if (temporaryDirectory) {
      await rm(temporaryDirectory, { recursive: true, force: true }).catch((error: unknown) => {
        console.error("Impossible de nettoyer les fichiers temporaires après échec.", error);
      });
    }
    const message = cause instanceof Error ? cause.message : "Conversion vidéo impossible.";
    const status = cause instanceof InvalidVideoError ? 422
      : message === FILE_TOO_LARGE ? 413
      : message === FILE_EMPTY ? 400
          : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
