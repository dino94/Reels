import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { GeminiError, generateRemake } from "@/lib/gemini";
import { checkRateLimit } from "@/lib/rate-limit";
import { remakeSchema } from "@/lib/remake-schema";

export const runtime = "nodejs";
// Doit couvrir 3 tentatives Gemini (90 s chacune) + délais de retry.
export const maxDuration = 300;

const requestSchema = z.object({ videoId: z.string().uuid() });

type Remake = z.infer<typeof remakeSchema>;

function renderRemake(remake: Remake) {
  const scenes = remake.scenes.map((scene, index) =>
    `### SCÈNE ${index + 1} — ${scene.start}-${scene.end}s\n\n- Clip : ${scene.clip}\n- Cadrage : ${scene.shot}\n- Montage : ${scene.editingNote}`,
  ).join("\n\n");
  return `# FOOTBALL REMAKE\n\n## HOOK\n\n${remake.hook}\n\n## TEXTE À L'ÉCRAN\n\n${remake.onScreenText.map((text) => `- ${text}`).join("\n")}\n\n## SÉQUENCE DE CLIPS\n\n${scenes}\n\n## SCRIPT DE MONTAGE\n\n${remake.editingScript.map((line) => `- ${line}`).join("\n")}\n\n## CTA\n\n${remake.cta}\n\n## INTENTION\n\n${remake.rationale}\n`;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non autorisé." }, { status: 401 });

  const rateLimit = checkRateLimit(user.id, "recreate");
  if (!rateLimit.allowed) return NextResponse.json({ error: rateLimit.message }, { status: 429 });

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  const parsedRequest = requestSchema.safeParse(payload);
  if (!parsedRequest.success) return NextResponse.json({ error: "Identifiant vidéo invalide." }, { status: 400 });
  const { videoId } = parsedRequest.data;

  const { data: analysis, error: analysisError } = await supabase.from("analyses")
    .select("id,result,video_id").eq("video_id", videoId).eq("user_id", user.id)
    .order("created_at", { ascending: false }).limit(1).single();
  if (analysisError || !analysis) return NextResponse.json({ error: "Analyse introuvable." }, { status: 404 });

  try {
    const remake = remakeSchema.parse(JSON.parse(await generateRemake(analysis.result)));
    const content = renderRemake(remake);
    const path = `${user.id}/${videoId}/REMAKE.md`;
    const { error: uploadError } = await supabase.storage.from("reports").upload(
      path, new Blob([content], { type: "text/markdown" }), { upsert: true },
    );
    if (uploadError) throw new Error(uploadError.message);

    // Le fichier est écrasé (upsert) : on met aussi à jour la ligne existante au lieu d'en ajouter une.
    const { data: existing, error: lookupError } = await supabase.from("reports")
      .select("id").eq("video_id", videoId).eq("user_id", user.id)
      .eq("kind", "remake").eq("storage_path", path).maybeSingle();
    if (lookupError) throw new Error(lookupError.message);
    const { error: saveError } = existing
      ? await supabase.from("reports").update({ analysis_id: analysis.id, content }).eq("id", existing.id).eq("user_id", user.id)
      : await supabase.from("reports").insert({
        video_id: videoId, user_id: user.id, analysis_id: analysis.id,
        storage_path: path, content, kind: "remake",
      });
    if (saveError) throw new Error(saveError.message);
    return NextResponse.json({ content });
  } catch (error) {
    console.error("Remake generation failed:", error);
    const message = error instanceof z.ZodError || error instanceof SyntaxError
      ? "La réponse de l'IA était invalide. Réessayez."
      : error instanceof GeminiError
        ? error.message
        : "Génération impossible. Réessayez.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
