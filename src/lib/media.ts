import { createWriteStream } from "node:fs";
import { rm } from "node:fs/promises";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

/** Lit un ReadableStream web et émet des Buffer Node, en annulant le lecteur si le flux est interrompu. */
export async function* readWebStreamChunks(body: ReadableStream<Uint8Array>) {
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

/** Écrit un ReadableStream web dans un fichier avec une limite de taille. Renvoie le nombre d'octets écrits. */
export async function writeWebStreamToFile(
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

/** Supprime un dossier temporaire en best-effort (les erreurs sont loguées, jamais levées). */
export function cleanupTemporaryDirectory(directory: string | undefined, context: string) {
  if (!directory) return;
  void rm(directory, { recursive: true, force: true }).catch((error: unknown) => {
    console.error(`Impossible de nettoyer les fichiers temporaires (${context}).`, error);
  });
}
