import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Clapperboard, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/dashboard-shell";
import { SpotlightPanel } from "@/components/spotlight-panel";
import { VideoLibrary } from "@/components/video-library";

export default async function AnalysesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: videos, error } = await supabase.from("videos")
    .select("id,title,status,duration_seconds,created_at")
    .eq("user_id", user.id)
    .eq("status", "completed")
    .order("created_at", { ascending: false });
  if (error) console.error("Could not load analyses:", error.message);

  return <DashboardShell email={user.email || ""}>
    <div className="mx-auto max-w-4xl px-5 py-8 sm:px-8">
      <header className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <Link href="/dashboard" className="mb-5 inline-flex items-center gap-2 text-sm text-muted hover:text-white">
            <ArrowLeft size={16} /> Dashboard
          </Link>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[.2em] text-accent">Votre bibliothèque</p>
          <h1 className="flex items-center gap-3 text-3xl font-semibold tracking-tight"><Clapperboard className="text-accent" size={28} /> Mes analyses</h1>
          <p className="mt-2 text-sm text-muted">Retrouvez ici toutes vos vidéos analysées.</p>
        </div>
        <Link href="/dashboard" className="inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3 text-sm font-bold text-ink hover:brightness-110">
          <Plus size={17} /> Nouvelle analyse
        </Link>
      </header>

      <SpotlightPanel className="p-5 sm:p-7">
        <section>
          {error && <p role="alert" className="mb-4 text-sm text-red-300">Les analyses n&apos;ont pas pu être chargées.</p>}
          <VideoLibrary
            initialVideos={videos || []}
            emptyTitle="Aucune analyse pour le moment"
            emptyDescription="Importez une vidéo depuis le dashboard pour lancer votre première analyse."
          />
        </section>
      </SpotlightPanel>
    </div>
  </DashboardShell>;
}
