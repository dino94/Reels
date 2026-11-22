import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Film, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/dashboard-shell";
import { UploadCard } from "@/components/upload-card";
import { SpotlightPanel } from "@/components/spotlight-panel";
import { VideoLibrary } from "@/components/video-library";

export default async function Dashboard() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: videos, error } = await supabase.from("videos").select("id,title,status,duration_seconds,created_at")
    .eq("user_id", user.id).order("created_at", { ascending: false }).limit(10);
  if (error) console.error("Could not load videos:", error.message);
  const completed = videos?.filter((video) => video.status === "completed").length || 0;
  return <DashboardShell email={user.email || ""}>
    <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8">
      <header className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div><p className="mb-2 text-xs font-semibold uppercase tracking-[.2em] text-accent">Workspace créateur</p><h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1><p className="mt-2 text-sm text-muted">Décodez les mécaniques virales du football.</p></div>
        <div className="flex gap-2 text-xs text-muted"><span className="rounded-lg border border-line bg-panel px-3 py-2"><Sparkles className="mr-1 inline text-accent" size={14} />{completed} analyses</span><span className="rounded-lg border border-line bg-panel px-3 py-2"><Film className="mr-1 inline text-signal" size={14} />{videos?.length || 0} vidéos</span></div>
      </header>
      <div className="grid items-start gap-5 lg:grid-cols-[1fr_.85fr]">
        <UploadCard userId={user.id} />
        <SpotlightPanel className="p-5 sm:p-7">
          <section>
            <div className="mb-5 flex items-center justify-between gap-3">
              <div><h2 className="font-semibold">Analyses récentes</h2><p className="mt-1 text-xs text-muted">Votre bibliothèque vidéo</p></div>
              <Link href="/dashboard/analyses" className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-accent hover:underline">Tout voir <ArrowRight size={14} /></Link>
            </div>
            <VideoLibrary initialVideos={videos || []} />
            {error && <p className="mt-4 text-xs text-red-300">Les vidéos n&apos;ont pas pu être chargées.</p>}
          </section>
        </SpotlightPanel>
      </div>
      <footer className="mt-8 border-t border-line pt-4 text-xs text-muted">Les analyses IA sont des estimations et ne garantissent pas la performance d&apos;une publication.</footer>
    </div>
  </DashboardShell>;
}
