"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, Download, FileText, Film, Languages, LoaderCircle, WandSparkles } from "lucide-react";
import type { AnalysisRecord, VideoAnalysis, VideoRecord } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { formatDuration } from "@/lib/utils";
import { SpotlightPanel } from "@/components/spotlight-panel";

function initialHighlightSelection(analysis: VideoAnalysis, duration: number) {
  return analysis.scenes
    .flatMap((scene, index) => sceneRange(scene, duration) ? [index] : []);
}

function sceneRange(scene: VideoAnalysis["scenes"][number], duration: number) {
  const startSeconds = Number(scene.start);
  const endSeconds = Number(scene.end);
  if (!Number.isFinite(startSeconds) || !Number.isFinite(endSeconds) || endSeconds <= startSeconds) return null;
  const start = Math.max(0, startSeconds);
  const end = Math.min(duration, endSeconds);
  return end > start ? { start, end } : null;
}

function mergeOverlappingClips(clips: Array<{ start: number; end: number }>) {
  return clips.reduce<Array<{ start: number; end: number }>>((merged, clip) => {
    const previous = merged[merged.length - 1];
    if (previous && clip.start < previous.end) {
      previous.end = Math.max(previous.end, clip.end);
    } else {
      merged.push({ ...clip });
    }
    return merged;
  }, []);
}

function selectedHighlightClips(analysis: VideoAnalysis, selected: number[], duration: number) {
  const clips = selected
    .map((index) => {
      const scene = analysis.scenes[index];
      return scene ? sceneRange(scene, duration) : null;
    })
    .filter((clip): clip is NonNullable<typeof clip> => clip !== null)
    .sort((a, b) => a.start - b.start);
  return mergeOverlappingClips(clips);
}

function timestamp(seconds: number) {
  const value = Math.max(0, Math.floor(seconds));
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`;
}

export function AnalysisView({ video, analysis, reportId, thumbnailUrls = [], thumbnailSeconds = [], generatedVideoId, generatedVideoUrl, initialTranslation = "", translationReportId = "" }: {
  video: VideoRecord; analysis: AnalysisRecord; reportId?: string; thumbnailUrls?: string[]; thumbnailSeconds?: number[];
  generatedVideoId?: string; generatedVideoUrl?: string; initialTranslation?: string; translationReportId?: string;
}) {
  const result = analysis.result as VideoAnalysis;
  const [remake, setRemake] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [selectedHighlights, setSelectedHighlights] = useState(() => initialHighlightSelection(result, video.duration_seconds || 0));
  const [highlightBusy, setHighlightBusy] = useState(false);
  const [highlightError, setHighlightError] = useState("");
  const [highlightStatus, setHighlightStatus] = useState("");
  const [translation, setTranslation] = useState(initialTranslation);
  const [translationReport, setTranslationReport] = useState(translationReportId);
  const [translationBusy, setTranslationBusy] = useState(false);
  const [translationError, setTranslationError] = useState("");
  const videoId = generatedVideoId;
  const videoUrl = generatedVideoUrl;
  const highlightClips = selectedHighlightClips(result, selectedHighlights, video.duration_seconds || 0);
  const selectedDuration = highlightClips.reduce((total, clip) => total + clip.end - clip.start, 0);

  async function translateVideo() {
    setTranslationBusy(true);
    setTranslationError("");
    try {
      const response = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId: video.id }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Traduction impossible.");
      setTranslation(data.translation);
      setTranslationReport(data.reportId);
    } catch (cause) {
      setTranslationError(cause instanceof Error ? cause.message : "Traduction impossible.");
    } finally {
      setTranslationBusy(false);
    }
  }

  async function generateRemake() {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/recreate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId: video.id }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Génération impossible.");
      setRemake(data.content);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Erreur inattendue.");
    } finally { setBusy(false); }
  }

  async function createHighlightReel(format: "vertical" | "youtube") {
    if (!highlightClips.length) {
      setHighlightError("Aucun passage valide n’est sélectionné.");
      return;
    }

    setHighlightBusy(true);
    setHighlightError("");
    const formatLabel = format === "vertical" ? "vertical 9:16" : "horizontal YouTube 16:9";
    setHighlightStatus(`Création du montage ${formatLabel} avec FFmpeg…`);
    try {
      const response = await fetch("/api/highlights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId: video.id, clips: highlightClips, format }),
      });
      if (!response.ok) {
        const contentType = response.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
          const result = await response.json();
          throw new Error(result.error || "Création du montage impossible.");
        }
        throw new Error(`Création du montage impossible (HTTP ${response.status}).`);
      }
      const finalVideo = await response.blob();
      if (!finalVideo.size) throw new Error("FFmpeg n’a produit aucun montage.");
      const downloadUrl = URL.createObjectURL(finalVideo);
      const anchor = document.createElement("a");
      anchor.href = downloadUrl;
      anchor.download = `football-highlights-${format === "vertical" ? "vertical-9x16" : "youtube-16x9"}.mp4`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 30_000);
      setHighlightStatus(`Montage ${formatLabel} téléchargé avec le son d’origine.`);
    } catch (cause) {
      setHighlightError(cause instanceof Error ? cause.message : "Impossible de créer le montage des temps forts.");
      setHighlightStatus("");
    } finally {
      setHighlightBusy(false);
    }
  }

  return <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8">
    <Link href="/dashboard" className="mb-7 inline-flex items-center gap-2 text-sm text-muted hover:text-white"><ArrowLeft size={16} /> Toutes les analyses</Link>
    <header className="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
      <div><p className="mb-2 text-xs font-semibold uppercase tracking-[.2em] text-accent">Rapport d&apos;analyse</p><h1 className="max-w-2xl break-words text-2xl font-semibold sm:text-3xl">{video.title}</h1>
      <p className="mt-2 text-sm text-muted">{formatDuration(video.duration_seconds)} · {video.width}×{video.height} · {video.fps ? `${video.fps.toFixed(1)} fps` : "fps inconnu"}</p></div>
      <div className="flex flex-wrap gap-2">
        {reportId && <a href={`/api/reports/${reportId}`}><Button variant="secondary"><Download size={16} /> VIDEO.md</Button></a>}
        <Button variant="secondary" onClick={translateVideo} disabled={translationBusy || busy || highlightBusy}>
          {translationBusy ? <LoaderCircle className="animate-spin" size={16} /> : <Languages size={16} />}
          Traduire en anglais
        </Button>
        <Button onClick={generateRemake} disabled={busy || highlightBusy}>{busy ? <LoaderCircle className="animate-spin" size={16} /> : <WandSparkles size={16} />} Generate Football Remake</Button>
      </div>
    </header>
    {error && <p role="alert" className="mb-4 text-sm text-red-400">{error}</p>}
    <p role="status" className="mb-4 rounded-xl border border-line bg-panel px-4 py-3 text-sm text-muted">La génération vidéo par API est temporairement suspendue pour éviter les frais. Les vidéos déjà enregistrées restent accessibles ci-dessous.</p>
    {translationError && <p role="alert" className="mb-4 text-sm text-red-400">{translationError}</p>}
    {translation && <SpotlightPanel className="mb-4 p-6">
      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <div><h2 className="font-semibold">Traduction anglaise</h2><p className="mt-1 text-xs text-muted">Générée par Whisper</p></div>
          {translationReport && <a href={`/api/reports/${translationReport}`}><Button variant="secondary"><Download size={16} /> TRANSLATION.md</Button></a>}
        </div>
        <p className="whitespace-pre-wrap text-sm leading-7 text-white/85">{translation}</p>
      </section>
    </SpotlightPanel>}
    <SpotlightPanel surface="rgba(59,212,255,0.05)" className="mt-4 border-accent/25 p-6">
      <section>
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h2 className="font-semibold">Monter les temps forts</h2>
            <p className="mt-1 text-sm leading-6 text-muted">Choisis le format vertical 9:16 ou horizontal 16:9 pour YouTube. Toute l’image d’origine reste visible, sans zoom ni recadrage; un fond flouté remplit l’espace autour si nécessaire. FFmpeg conserve le son d’origine, sans API IA ni frais externe.</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button onClick={() => createHighlightReel("vertical")} disabled={highlightBusy || !selectedHighlights.length}>
              {highlightBusy ? <LoaderCircle className="animate-spin" size={16} /> : <Film size={16} />}
              Créer le montage vertical 9:16
            </Button>
            <Button variant="secondary" onClick={() => createHighlightReel("youtube")} disabled={highlightBusy || !selectedHighlights.length}>
              {highlightBusy ? <LoaderCircle className="animate-spin" size={16} /> : <Film size={16} />}
              Créer le montage YouTube 16:9
            </Button>
          </div>
        </div>
        <p className="mt-2 text-xs text-muted">Durée des passages sélectionnés : {formatDuration(selectedDuration)} (avant fondus). Toutes les scènes détectées sont incluses par défaut; les scènes qui se chevauchent sont fusionnées. Tu peux décocher les passages à exclure. Un fondu de 0,5 s est appliqué entre les passages.</p>
        {!!result.scenes.length && <div className="mt-5 grid gap-2">
          {result.scenes.map((scene, index) => {
            const range = sceneRange(scene, video.duration_seconds || 0);
            const checked = selectedHighlights.includes(index);
            return <label key={`${scene.start}-${index}`} className="flex cursor-pointer items-start gap-3 rounded-xl border border-line bg-black/20 p-3 text-sm">
              <input
                type="checkbox"
                className="mt-1 accent-accent"
                checked={checked}
                disabled={!range || highlightBusy}
                onChange={(event) => setSelectedHighlights((current) => event.target.checked
                  ? [...current, index]
                  : current.filter((selected) => selected !== index))}
              />
              <span className="min-w-0 flex-1">
                <span className="font-medium text-white/90">{range ? `${timestamp(range.start)}–${timestamp(range.end)}` : "Durée invalide"}</span>
                <span className="ml-2 text-xs uppercase text-accent">{scene.purpose || "Temps fort"}</span>
                <span className="mt-1 block leading-5 text-muted">{scene.description}</span>
              </span>
            </label>;
          })}
        </div>}
        {highlightStatus && <p role="status" className="mt-4 text-sm text-muted">{highlightStatus}</p>}
        {highlightError && <p role="alert" className="mt-4 text-sm text-red-400">{highlightError}</p>}
      </section>
    </SpotlightPanel>
    <section className="grid gap-4 lg:grid-cols-[1.4fr_.6fr]">
      <SpotlightPanel className="p-6">
        <article>
          <p className="text-xs font-semibold uppercase tracking-widest text-muted">Hook détecté</p>
          <h2 className="mt-4 text-2xl font-semibold leading-snug">“{result.hook}”</h2>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <Info label="Pattern interrupt" value={result.patternInterrupt || "Non identifié"} />
            <Info label="Structure narrative" value={result.narrativeStructure || "Non déterminée"} />
          </div>
        </article>
      </SpotlightPanel>
      <SpotlightPanel className="p-6">
        <article className="flex items-center gap-5">
          <div className="score-ring" style={{ "--score": `${result.viralScore}%` } as React.CSSProperties}><span>{result.viralScore}</span></div>
          <div><p className="font-semibold">Potentiel viral</p><p className="mt-1 text-xs leading-5 text-muted">Estimation IA basée sur le hook, le rythme et la structure. Ce score n&apos;est pas une prédiction de performance.</p></div>
        </article>
      </SpotlightPanel>
    </section>
    <section className="mt-4 grid gap-4 lg:grid-cols-[1.4fr_.6fr]">
      <SpotlightPanel className="p-6">
        <article>
          <h2 className="mb-5 font-semibold">Timeline des scènes</h2>
          <div className="timeline">
            {result.scenes.map((scene, index) => <div key={`${scene.start}-${index}`} className="timeline-row">
              <div className="timeline-time">{scene.start}s<span>{scene.end}s</span></div>
              <div className="timeline-dot" />
              <div className="min-w-0 flex-1 pb-6"><p className="text-sm leading-6 text-white/90">{scene.description}</p>
                <p className="mt-1 text-xs text-muted">{scene.purpose || "Scène"}{scene.transition ? ` · ${scene.transition}` : ""}</p>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/5"><div className="h-full rounded-full bg-accent/70" style={{ width: `${Math.min(100, Math.max(12, (Number(scene.end) - Number(scene.start)) * 14))}%` }} /></div>
              </div>
            </div>)}
            {!result.scenes.length && <p className="text-sm text-muted">Aucune scène n&apos;a été identifiée.</p>}
          </div>
        </article>
      </SpotlightPanel>
      <div className="space-y-4">
        <SpotlightPanel className="p-6">
          <article><h2 className="mb-4 font-semibold">Éléments détectés</h2>
            <Info label="CTA" value={result.cta || "Aucun CTA détecté"} />
            <Info label="Musique supposée" value={result.music} />
            <Info label="Audience cible" value={result.targetAudience} />
            <Info label="Textes affichés" value={result.texts.join(" · ") || "Aucun texte lisible"} />
            <Info label="Emojis" value={result.emojis.join(" ") || "Aucun"} />
          </article>
        </SpotlightPanel>
        <SpotlightPanel className="p-6">
          <article><h2 className="mb-4 font-semibold">Signature de montage</h2><Info label="Style visuel" value={result.visualStyle} /><Info label="Rythme & montage" value={result.editingStyle} /><Info label="Effets sonores" value={result.soundEffects?.join(", ") || "Non identifiés"} /></article>
        </SpotlightPanel>
        <SpotlightPanel className="p-6">
          <article><h2 className="mb-4 font-semibold">Pistes d&apos;amélioration</h2>
            <ul className="space-y-3">{result.improvementTips.map((tip, index) => <li key={index} className="flex gap-3 text-sm leading-5 text-white/75"><span className="text-accent">↗</span>{tip}</li>)}</ul>
          </article>
        </SpotlightPanel>
      </div>
    </section>
    {!!thumbnailUrls.length && <SpotlightPanel className="mt-4 p-6">
      <section>
        <div className="mb-4 flex items-baseline justify-between"><h2 className="font-semibold">Images clés</h2><p className="text-xs text-muted">Images extraites à intervalles réguliers · {thumbnailUrls.length}</p></div>
        <div className="frame-strip">{thumbnailUrls.map((url, index) => <div key={url} className="relative">
          <Image src={url} alt={`Image vidéo à ${thumbnailSeconds[index] ?? index} seconde`} width={360} height={640} unoptimized />
          <span className="absolute bottom-2 left-2 rounded bg-black/75 px-1.5 py-0.5 text-[10px]">{thumbnailSeconds[index] ?? index}s</span>
        </div>)}</div>
      </section>
    </SpotlightPanel>}
    {videoUrl && <SpotlightPanel surface="rgba(59,212,255,0.05)" className="mt-5 border-accent/25 p-6">
      <section>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="font-semibold">Vidéo explicative enregistrée</h2><p className="mt-1 text-xs text-muted">Vidéo déjà sauvegardée dans ton compte</p></div>
          {videoId && <a href={`/api/reports/${videoId}`}><Button variant="secondary"><Download size={16} /> Télécharger MP4</Button></a>}
        </div>
        <video className="w-full max-w-sm rounded-xl border border-line bg-black" src={videoUrl} controls playsInline />
      </section>
    </SpotlightPanel>}
    {remake && <SpotlightPanel surface="rgba(59,212,255,0.05)" className="mt-5 border-accent/25 p-6">
      <section>
        <div className="mb-4 flex items-center gap-2 text-accent"><WandSparkles size={18} /><h2 className="font-semibold">Votre remake football</h2></div>
        <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-7 text-white/80">{remake}</pre>
        <button className="mt-4 inline-flex items-center gap-2 text-sm text-accent" onClick={() => {
          const blob = new Blob([remake], { type: "text/markdown" });
          const url = URL.createObjectURL(blob);
          const anchor = document.createElement("a"); anchor.href = url; anchor.download = "REMAKE.md"; anchor.click(); URL.revokeObjectURL(url);
        }}><FileText size={15} /> Télécharger REMAKE.md</button>
      </section>
    </SpotlightPanel>}
  </div>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="border-b border-line py-3 last:border-0"><p className="text-[11px] font-medium uppercase tracking-wider text-muted">{label}</p><p className="mt-1.5 break-words text-sm leading-5 text-white/85">{value}</p></div>;
}
