import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  const { data, error } = await supabase.from("reports").select("content,kind,storage_path")
    .eq("id", id).eq("user_id", user.id).single();
  if (error || !data) return NextResponse.json({ error: "Rapport introuvable." }, { status: 404 });
  if (data.kind === "explanation_video") {
    const { data: video, error: videoError } = await supabase.storage.from("reports").download(data.storage_path);
    if (videoError || !video) return NextResponse.json({ error: "Vidéo introuvable." }, { status: 404 });
    return new Response(video, {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Disposition": 'attachment; filename="football-explainer.mp4"',
      },
    });
  }
  return new Response(data.content, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${data.kind === "remake" ? "REMAKE" : data.kind === "translation" ? "TRANSLATION" : "VIDEO"}.md"`,
    },
  });
}
