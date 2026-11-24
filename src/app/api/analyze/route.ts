import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { analysisSchema } from "@/lib/analysis-schema";
import { GeminiError, analyzeFrames } from "@/lib/gemini";
import { createVideoReport } from "@/lib/report";
import { checkRateLimit } from "@/lib/rate-limit";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 300;
const requestSchema = z.object({
  videoId: z.string().uuid(),
  metadata: z.object({
    duration: z.number().positive(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  }),
  frames: z.array(z.object({
    second: z.number().int().nonnegative(),
    path: z.string(),
  })).min(1).max(60),
});

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non autorisé." }, { status: 401 });

  const rateLimit = checkRateLimit(user.id, "analyze");
  if (!rateLimit.allowed) return NextResponse.json({ error: rateLimit.message }, { status: 429 });

  let payload: unknown;
    try { payload = await request.json(); }
    catch { return NextResponse.json({ error: "Requête invalide." }, { status: 400 }); }
  const parsed = requestSchema.safeParse(payload);
    if (!parsed.success) return NextResponse.json({ error: "Métadonnées ou images vidéo invalides." }, { status: 400 });
  const { videoId, metadata, frames: submittedFrames } = parsed.data;
  const { data: video, error: lookupError } = await supabase.from("videos")
    .select("id,title,storage_path").eq("id", videoId).eq("user_id", user.id).single();
     if (lookupError || !video) return NextResponse.json({ error: "Vidéo introuvable." }, { status: 404 });

  const seenSeconds = new Set<number>();
     for (const frame of submittedFrames) {
    const expectedPath = `${user.id}/${videoId}/frames/second_${frame.second}.jpg`;
      if (frame.path !== expectedPath || frame.second >= Math.ceil(metadata.duration) || seenSeconds.has(frame.second)) {
      return NextResponse.json({ error: "Chemin ou horodatage d'image invalide." }, { status: 400 });
    }
    seenSeconds.add(frame.second);
  }

  const { data: locked, error: processingError } = await supabase.from("videos")
  .update({ status: "processing", error_message: null })
  .eq("id", videoId).eq("user_id", user.id).neq("status", "processing")
  .select("id");
if (processingError) {
  console.error("analyze: lock failed", processingError.message);
  return NextResponse.json({ error: "Impossible de démarrer l'analyse." }, { status: 500 });
  }
if (!locked?.length) return NextResponse.json({ error: "Analyse déjà en cours." }, { status: 409 });
  try {
    const frames = await Promise.all(submittedFrames.map(async (frame) => {
      const { data, error } = await supabase.storage.from("videos").download(frame.path);
      if (error || !data) throw new Error(error?.message || `Image à ${frame.second}s introuvable.`);
      return {
        second: frame.second,
        base64: Buffer.from(await data.arrayBuffer()).toString("base64"),
      };
    }));
    const raw = await analyzeFrames(frames);
    const result = analysisSchema.parse(JSON.parse(raw));
    const { data: analysis, error: analysisError } = await supabase.from("analyses")
      .insert({ video_id: videoId, user_id: user.id, result })
      .select("id").single();
    if (analysisError) throw new Error(analysisError.message);
    const report = createVideoReport(video.title, result);
    const reportPath = `${user.id}/${videoId}/VIDEO.md`;
    const { error: reportError } = await supabase.storage.from("reports").upload(
      reportPath, new Blob([report], { type: "text/markdown" }), { upsert: true },
    );
    if (reportError) throw new Error(reportError.message);
    const { error: recordError } = await supabase.from("reports").insert({
      video_id: videoId,
      user_id: user.id,
      analysis_id: analysis.id,
      storage_path: reportPath,
      content: report,
      kind: "analysis",
    });
    if (recordError) throw new Error(recordError.message);
    const { error: updateError } = await supabase.from("videos").update({
      status: "completed",
      duration_seconds: metadata.duration,
      width: metadata.width,
      height: metadata.height,
      fps: null,
      thumbnail_paths: submittedFrames.map((frame) => frame.path),
    }).eq("id", videoId);
    if (updateError) throw new Error(updateError.message);
    return NextResponse.json({ analysisId: analysis.id });
  } catch (error) {
  console.error("analyze failed:", error);
  const message = error instanceof GeminiError ? error.message : "L'analyse a échoué. Réessayez.";
  await supabase.from("videos").update({ status: "failed", error_message: message })
    .eq("id", videoId).eq("user_id", user.id);
  return NextResponse.json({ error: message }, { status: 500 });
  }
}
