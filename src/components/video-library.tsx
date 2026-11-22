"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { Check, LoaderCircle, Pencil, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { formatDuration } from "@/lib/utils";

type VideoListItem = {
  id: string;
  title: string;
  status: "uploaded" | "processing" | "completed" | "failed";
  duration_seconds: number | null;
  created_at: string;
};

export function VideoLibrary({ initialVideos, emptyTitle = "Aucune vidéo pour l'instant", emptyDescription = "Importez un clip pour lancer votre première analyse." }: {
  initialVideos: VideoListItem[];
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  const router = useRouter();
  const [videos, setVideos] = useState(initialVideos);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [error, setError] = useState("");

  useEffect(() => setVideos(initialVideos), [initialVideos]);

  async function deleteVideo(video: VideoListItem) {
    if (!window.confirm(`Supprimer définitivement « ${video.title} », sa vidéo, ses analyses et ses rapports ?`)) return;
    setPendingId(video.id);
    setError("");
    try {
      const response = await fetch(`/api/videos/${video.id}`, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Suppression impossible.");
      setVideos((current) => current.filter((item) => item.id !== video.id));
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Suppression impossible.");
    } finally {
      setPendingId(null);
    }
  }

  function startRenaming(video: VideoListItem) {
    setError("");
    setDraftTitle(video.title);
    setRenamingId(video.id);
  }

  async function renameVideo(event: FormEvent<HTMLFormElement>, video: VideoListItem) {
    event.preventDefault();
    const title = draftTitle.trim();
    if (!title || title.length > 120) {
      setError("Le nom doit contenir entre 1 et 120 caractères.");
      return;
    }

    setPendingId(video.id);
    setError("");
    try {
      const response = await fetch(`/api/videos/${video.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Impossible de modifier le nom.");
      setVideos((current) => current.map((item) => item.id === video.id ? { ...item, title: result.title } : item));
      setRenamingId(null);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Impossible de modifier le nom.");
    } finally {
      setPendingId(null);
    }
  }

  return <>
    <div className="divide-y divide-line">
      {videos.map((video) => <div key={video.id} className="flex items-center justify-between gap-2 py-4 first:pt-0 last:pb-0">
        {renamingId === video.id
          ? <form onSubmit={(event) => void renameVideo(event, video)} className="flex min-w-0 flex-1 items-center gap-2">
              <input
                className="form-input mt-0 min-w-0 flex-1 py-2 text-sm"
                name="title"
                aria-label={`Nouveau nom pour ${video.title}`}
                value={draftTitle}
                maxLength={120}
                autoFocus
                onChange={(event) => setDraftTitle(event.target.value)}
                disabled={pendingId !== null}
              />
              <button type="submit" disabled={pendingId !== null} aria-label="Enregistrer le nom" title="Enregistrer" className="rounded-lg border border-accent/30 p-2 text-accent hover:bg-accent/10 disabled:opacity-50">
                {pendingId === video.id ? <LoaderCircle className="animate-spin" size={15} /> : <Check size={15} />}
              </button>
              <button type="button" onClick={() => setRenamingId(null)} disabled={pendingId !== null} aria-label="Annuler le renommage" title="Annuler" className="rounded-lg border border-line p-2 text-muted hover:bg-white/5 disabled:opacity-50">
                <X size={15} />
              </button>
            </form>
          : <Link href={video.status === "completed" ? `/dashboard/${video.id}` : "#"} className="flex min-w-0 flex-1 items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{video.title}</p>
                <p className="mt-1 text-xs text-muted">{formatDuration(video.duration_seconds)} · {new Date(video.created_at).toLocaleDateString("fr-FR")}</p>
              </div>
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold ${video.status === "completed" ? "bg-accent/10 text-accent" : video.status === "failed" ? "bg-red-400/10 text-red-300" : "bg-white/5 text-muted"}`}>{video.status === "completed" ? "Prête" : video.status === "failed" ? "Échec" : video.status === "processing" ? "Analyse…" : "Uploadée"}</span>
            </Link>}
        {renamingId !== video.id && <button
          type="button"
          onClick={() => startRenaming(video)}
          disabled={pendingId !== null}
          aria-label={`Modifier le nom de ${video.title}`}
          title="Modifier le nom"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-line px-2.5 py-2 text-xs text-muted transition hover:bg-white/5 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Pencil size={14} />
          <span className="hidden sm:inline">Renommer</span>
        </button>}
        <button
          type="button"
          onClick={() => void deleteVideo(video)}
          disabled={pendingId !== null || renamingId === video.id}
          aria-label={`Supprimer ${video.title}`}
          title="Supprimer cette vidéo"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-red-400/20 px-2.5 py-2 text-xs text-red-300 transition hover:bg-red-400/10 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pendingId === video.id ? <LoaderCircle className="animate-spin" size={14} /> : <Trash2 size={14} />}
          <span className="hidden sm:inline">{pendingId === video.id ? "Suppression…" : "Supprimer"}</span>
        </button>
      </div>)}
      {!videos.length && <div className="py-9 text-center">
        <p className="text-sm font-medium">{emptyTitle}</p>
        <p className="mt-1 text-xs text-muted">{emptyDescription}</p>
      </div>}
    </div>
    {error && <p role="alert" className="mt-4 text-xs text-red-300">{error}</p>}
  </>;
}
