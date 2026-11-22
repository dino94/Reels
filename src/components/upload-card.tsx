"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileVideo2, LoaderCircle, UploadCloud } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { BrowserVideoDecodeError, extractBrowserVideoFrames, transcodeVideoToH264 } from "@/lib/browser-video";
import { ShinyButton } from "@/components/ui/shiny-button";
import { SpotlightPanel } from "@/components/spotlight-panel";

const MAX_BYTES = Number(process.env.NEXT_PUBLIC_MAX_VIDEO_SIZE_MB || 500) * 1024 * 1024;

export function UploadCard({ userId }: { userId: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function choose(candidate?: File) {
    setError("");
    if (!candidate) return;
    if (!candidate.type.startsWith("video/") && !candidate.name.toLowerCase().endsWith(".mp4")) {
      setError("Choisissez un fichier vidéo MP4.");
      return;
    }
    if (candidate.size > MAX_BYTES) {
      setError(`La taille maximale est de ${Math.round(MAX_BYTES / 1024 / 1024)} Mo.`);
      return;
    }
    setFile(candidate);
  }

  async function submit() {
    if (!file) return;
    setBusy(true);
    setError("");
    let supabase: ReturnType<typeof createClient> | undefined;
    let storagePath: string | undefined;
    const uploadedPaths: string[] = [];
    let videoCreated = false;
    try {
      supabase = createClient();
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) throw new Error("Votre session a expiré. Reconnectez-vous avant d’importer une vidéo.");
      if (user.id !== userId) throw new Error("Le compte connecté a changé. Rechargez la page avant de continuer.");

      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
      storagePath = `${user.id}/${crypto.randomUUID()}-${safeName}`;
      const { error: uploadError } = await supabase.storage.from("videos").upload(storagePath, file, {
        contentType: file.type || "video/mp4",
        upsert: false,
      });
      if (uploadError) {
        const message = /row-level security policy/i.test(uploadError.message)
          ? "Supabase a refusé l’envoi. Vérifiez que la politique RLS « Users upload their own videos » est appliquée au bucket videos."
          : uploadError.message;
        throw new Error(message);
      }
      uploadedPaths.push(storagePath);

      let uploadFile = file;
      let extracted;
      try {
        extracted = await extractBrowserVideoFrames(uploadFile);
      } catch (cause) {
        if (!(cause instanceof BrowserVideoDecodeError)) throw cause;
        uploadFile = await transcodeVideoToH264(storagePath, file.size, file.name);
        const convertedName = `${safeName.replace(/\.[^.]+$/, "")}-h264.mp4`;
        const convertedPath = `${user.id}/${crypto.randomUUID()}-${convertedName}`;
        const { error: convertedUploadError } = await supabase.storage.from("videos").upload(convertedPath, uploadFile, {
          contentType: "video/mp4",
          upsert: false,
        });
        if (convertedUploadError) throw new Error(convertedUploadError.message);
        uploadedPaths.push(convertedPath);
        extracted = await extractBrowserVideoFrames(uploadFile);
        const { error: originalDeleteError } = await supabase.storage.from("videos").remove([storagePath]);
        if (originalDeleteError) throw new Error(originalDeleteError.message);
        uploadedPaths.splice(uploadedPaths.indexOf(storagePath), 1);
        storagePath = convertedPath;
      }
      const { metadata, frames } = extracted;
      const createResponse = await fetch("/api/videos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storagePath, title: file.name }),
      });
      const created = await createResponse.json();
      if (!createResponse.ok) throw new Error(created.error || "Enregistrement de la vidéo impossible.");
      videoCreated = true;
      const thumbnailPaths = frames.map(({ second }) =>
        `${user.id}/${created.id}/frames/second_${second}.jpg`,
      );
      for (let index = 0; index < frames.length; index++) {
        const { error: frameError } = await supabase.storage.from("videos").upload(
          thumbnailPaths[index],
          frames[index].blob,
          { contentType: "image/jpeg", upsert: true },
        );
        if (frameError) throw new Error(`Impossible d'enregistrer l'image à ${frames[index].second}s : ${frameError.message}`);
      }
      const analysisResponse = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videoId: created.id,
          metadata,
          frames: frames.map(({ second }, index) => ({ second, path: thumbnailPaths[index] })),
        }),
      });
      const analysis = await analysisResponse.json();
      if (!analysisResponse.ok) throw new Error(analysis.error || "Analyse impossible.");
      router.push(`/dashboard/${created.id}`);
      router.refresh();
    } catch (cause) {
      if (uploadedPaths.length && !videoCreated && supabase) {
        try {
          const { error: cleanupError } = await supabase.storage.from("videos").remove(uploadedPaths);
          if (cleanupError) console.error("Impossible de supprimer la vidéo importée après un échec.", cleanupError);
        } catch (cleanupError) {
          console.error("Impossible de supprimer la vidéo importée après un échec.", cleanupError);
        }
      }
      setError(cause instanceof Error ? cause.message : "Une erreur est survenue.");
      setBusy(false);
    }
  }

  return <SpotlightPanel className="p-5 sm:p-7">
    <section>
      <div className="mb-5 flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-xl bg-accent/10 text-accent"><UploadCloud size={19} /></span>
        <div><h2 className="font-semibold">Nouvelle analyse</h2><p className="mt-1 text-xs text-muted">Déposez un Reel ou un fichier MP4</p></div>
      </div>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => { event.preventDefault(); choose(event.dataTransfer.files[0]); }}
        className="flex min-h-44 w-full flex-col items-center justify-center rounded-xl border border-dashed border-line bg-black/10 px-4 text-center transition hover:border-accent/60 hover:bg-accent/[0.03]"
      >
        {file ? <><FileVideo2 className="mb-3 text-accent" size={27} /><span className="max-w-full truncate text-sm font-medium">{file.name}</span><span className="mt-1 text-xs text-muted">{(file.size / 1024 / 1024).toFixed(1)} Mo</span></> :
          <><UploadCloud className="mb-3 text-muted" size={27} /><span className="text-sm font-medium">Glissez votre vidéo ici</span><span className="mt-1 text-xs text-muted">ou cliquez pour parcourir · MP4 · jusqu&apos;à 500 Mo</span></>}
      </button>
      <input ref={inputRef} className="hidden" type="file" accept="video/mp4,video/*,.mp4" onChange={(event) => choose(event.target.files?.[0])} />
      {error && <p role="alert" className="mt-3 text-sm text-red-400">{error}</p>}
      <ShinyButton className="mt-4" disabled={!file || busy} onClick={submit}>
        {busy ? <><LoaderCircle className="animate-spin" size={16} /> Traitement en cours…</> : "Analyser la vidéo"}
      </ShinyButton>
    </section>
  </SpotlightPanel>;
}
