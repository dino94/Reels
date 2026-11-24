import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/dashboard-shell";
import { AnalysisView } from "@/components/analysis-view";
import type { AnalysisRecord, VideoRecord } from "@/lib/types";

export default async function VideoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: video } = await supabase.from("videos").select("*").eq("id", id).eq("user_id", user.id).single();
  if (!video) notFound();
  const { data: analysis } = await supabase.from("analyses").select("*").eq("video_id", id).eq("user_id", user.id).order("created_at", { ascending: false }).limit(1).single();
  const { data: report } = await supabase.from("reports").select("id").eq("video_id", id).eq("user_id", user.id).eq("kind", "analysis").order("created_at", { ascending: false }).limit(1).single();
  const { data: translationReport } = await supabase.from("reports").select("id,content")
    .eq("video_id", id).eq("user_id", user.id).eq("kind", "translation")
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  const { data: generatedVideo } = await supabase.from("reports").select("id,storage_path")
    .eq("video_id", id).eq("user_id", user.id).eq("kind", "explanation_video")
    .order("created_at", { ascending: false }).limit(1).single();
  const { data: signedVideo } = generatedVideo
    ? await supabase.storage.from("reports").createSignedUrl(generatedVideo.storage_path, 3600)
    : { data: null };
  const thumbnailPaths = (video.thumbnail_paths || []) as string[];
  const { data: signedThumbnails } = thumbnailPaths.length
    ? await supabase.storage.from("videos").createSignedUrls(thumbnailPaths, 3600)
    : { data: [] };
  const thumbnailUrls = (signedThumbnails || []).flatMap((thumbnail) => thumbnail.signedUrl ? [thumbnail.signedUrl] : []);
  const thumbnailSeconds = thumbnailPaths.map((path) => Number(path.match(/second_(\d+)\.jpg$/)?.[1] || 0));
  return <DashboardShell email={user.email || ""}>
    {analysis
      ? <AnalysisView
          video={video as VideoRecord}
          analysis={analysis as AnalysisRecord}
          reportId={report?.id}
          thumbnailUrls={thumbnailUrls}
          thumbnailSeconds={thumbnailSeconds}
          generatedVideoId={generatedVideo?.id}
          generatedVideoUrl={signedVideo?.signedUrl}
          initialTranslation={translationReport?.content?.replace(/^# Traduction anglaise\s*/, "").trim()}
          translationReportId={translationReport?.id}
        />
      : <div className="mx-auto max-w-xl px-5 py-24 text-center">
          <p className="text-xs uppercase tracking-[.2em] text-accent">{video.status === "failed" ? "Analyse échouée" : "Analyse en attente"}</p>
          <h1 className="mt-3 text-2xl font-semibold">{video.status === "failed" ? "Cette vidéo n'a pas pu être analysée" : "Aucun rapport disponible"}</h1>
          <p className="mt-3 break-words text-sm text-muted">{video.error_message || "Retournez au dashboard et relancez l'import de cette vidéo."}</p>
        </div>}
  </DashboardShell>;
}
