export type BrowserFrame = {
  second: number;
  blob: Blob;
};

export type BrowserVideoMetadata = {
  duration: number;
  width: number;
  height: number;
};

const MAX_FRAMES = 60;
const MAX_FRAME_WIDTH = 1024;
const EVENT_TIMEOUT_MS = 30_000;

export class BrowserVideoDecodeError extends Error {
  constructor() {
    super("Le navigateur ne peut pas décoder cette vidéo. Essayez un MP4 H.264.");
    this.name = "BrowserVideoDecodeError";
  }
}

function waitForMediaEvent(
  video: HTMLVideoElement,
  successEvent: "loadedmetadata" | "loadeddata" | "seeked",
) {
  return new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error("Le navigateur met trop de temps à décoder la vidéo."));
    }, EVENT_TIMEOUT_MS);
    const cleanup = () => {
      window.clearTimeout(timer);
      video.removeEventListener(successEvent, onSuccess);
      video.removeEventListener("error", onError);
    };
    const onSuccess = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new BrowserVideoDecodeError());
    };
    video.addEventListener(successEvent, onSuccess, { once: true });
    video.addEventListener("error", onError, { once: true });
  });
}

function sampledSeconds(duration: number) {
  const secondCount = Math.max(1, Math.ceil(duration));
  const frameCount = Math.min(MAX_FRAMES, secondCount);
  if (frameCount === 1) return [0];
  return Array.from({ length: frameCount }, (_, index) =>
    Math.round(index * (secondCount - 1) / (frameCount - 1)),
  );
}

function canvasToJpeg(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error("Impossible de générer une miniature vidéo.")),
      "image/jpeg",
      0.82,
    );
  });
}

export async function extractBrowserVideoFrames(file: File): Promise<{
  metadata: BrowserVideoMetadata;
  frames: BrowserFrame[];
}> {
  const video = document.createElement("video");
  const objectUrl = URL.createObjectURL(file);
  video.preload = "auto";
  video.muted = true;
  video.playsInline = true;
  try {
    const metadataReady = waitForMediaEvent(video, "loadedmetadata");
    video.src = objectUrl;
    video.load();
    await metadataReady;

    const { duration, videoWidth: width, videoHeight: height } = video;
    if (!Number.isFinite(duration) || duration <= 0 || !width || !height) {
      throw new Error("Les métadonnées de cette vidéo sont invalides.");
    }

    const canvas = document.createElement("canvas");
    const scale = Math.min(1, MAX_FRAME_WIDTH / width);
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Le navigateur ne permet pas de générer des images.");

    const seconds = sampledSeconds(duration);
    const frames: BrowserFrame[] = [];
    for (const second of seconds) {
      if (Math.abs(video.currentTime - second) > 0.01) {
        const seekComplete = waitForMediaEvent(video, "seeked");
        video.currentTime = second;
        await seekComplete;
      } else if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        const frameReady = waitForMediaEvent(video, "loadeddata");
        await frameReady;
      }
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      frames.push({ second, blob: await canvasToJpeg(canvas) });
    }
    return { metadata: { duration, width, height }, frames };
  } finally {
    video.pause();
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(objectUrl);
  }
}

export async function transcodeVideoToH264(storagePath: string, fileSize: number, fileName: string) {
  const response = await fetch("/api/transcode", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ storagePath, expectedSize: fileSize }),
  });
  if (!response.ok) {
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const result = await response.json();
      throw new Error(result.error || "Conversion H.264 impossible.");
    }
    throw new Error(`Conversion H.264 impossible (HTTP ${response.status}).`);
  }

  const converted = await response.blob();
  if (!converted.size) throw new Error("FFmpeg n’a produit aucun fichier vidéo.");
  const baseName = fileName.replace(/\.[^.]+$/, "");
  return new File([converted], `${baseName}-h264.mp4`, { type: "video/mp4" });
}
