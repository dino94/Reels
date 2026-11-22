import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateRemake } from "@/lib/gemini";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  const { videoId } = await request.json();
  const { data: analysis, error: analysisError } = await supabase.from("analyses")
    .select("id,result,video_id").eq("video_id", videoId).eq("user_id", user.id)
    .order("created_at", { ascending: false }).limit(1).single();
  if (analysisError || !analysis) return NextResponse.json({ error: "Analyse introuvable." }, { status: 404 });
  try {
    const remake = JSON.parse(await generateRemake(analysis.result));
    const content = `# FOOTBALL REMAKE\n\n## HOOK\n\n${remake.hook}\n\n## TEXTE À L'ÉCRAN\n\n${(remake.onScreenText || []).map((text: string) => `- ${text}`).join("\n")}\n\n## SÉQUENCE DE CLIPS\n\n${(remake.scenes || []).map((scene: { start: string; end: string; clip: string; shot: string; editingNote: string }, index: number) => `### SCÈNE ${index + 1} — ${scene.start}-${scene.end}s\n\n- Clip : ${scene.clip}\n- Cadrage : ${scene.shot}\n- Montage : ${scene.editingNote}`).join("\n\n")}\n\n## SCRIPT DE MONTAGE\n\n${(remake.editingScript || []).map((line: string) => `- ${line}`).join("\n")}\n\n## CTA\n\n${remake.cta}\n\n## INTENTION\n\n${remake.rationale || ""}\n`;
    const path = `${user.id}/${videoId}/REMAKE.md`;
    const { error: uploadError } = await supabase.storage.from("reports").upload(
      path, new Blob([content], { type: "text/markdown" }), { upsert: true },
    );
    if (uploadError) throw new Error(uploadError.message);
    const { error: saveError } = await supabase.from("reports").insert({
      video_id: videoId, user_id: user.id, analysis_id: analysis.id,
      storage_path: path, content, kind: "remake",
    });
    if (saveError) throw new Error(saveError.message);
    return NextResponse.json({ content });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Génération impossible." }, { status: 500 });
  }
}
