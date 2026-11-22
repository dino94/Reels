import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

async function removeStorageFiles(
  supabase: Awaited<ReturnType<typeof createClient>>,
  bucket: "videos" | "reports",
  paths: string[],
) {
  for (let index = 0; index < paths.length; index += 100) {
    const { error } = await supabase.storage.from(bucket).remove(paths.slice(index, index + 100));
    if (error) return error;
  }
  return null;
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non autorisé." }, { status: 401 });

  const { id } = await params;
  const parsedId = z.string().uuid().safeParse(id);
  if (!parsedId.success) return NextResponse.json({ error: "Identifiant vidéo invalide." }, { status: 400 });

  const { data: video, error: videoError } = await supabase.from("videos")
    .select("id,storage_path,thumbnail_paths")
    .eq("id", parsedId.data)
    .eq("user_id", user.id)
    .single();
  if (videoError || !video) return NextResponse.json({ error: "Vidéo introuvable." }, { status: 404 });

  const { data: reports, error: reportsError } = await supabase.from("reports")
    .select("storage_path")
    .eq("video_id", video.id)
    .eq("user_id", user.id);
  if (reportsError) {
    return NextResponse.json({ error: "Impossible de préparer la suppression des rapports." }, { status: 500 });
  }

  const videoPaths = [...new Set([video.storage_path, ...(video.thumbnail_paths || [])])];
  const reportPaths = [...new Set((reports || []).map((report) => report.storage_path))];
  const videoStorageError = await removeStorageFiles(supabase, "videos", videoPaths);
  if (videoStorageError) {
    return NextResponse.json({ error: `Impossible de supprimer les fichiers vidéo : ${videoStorageError.message}` }, { status: 500 });
  }
  const reportStorageError = await removeStorageFiles(supabase, "reports", reportPaths);
  if (reportStorageError) {
    return NextResponse.json({ error: `Impossible de supprimer les rapports : ${reportStorageError.message}` }, { status: 500 });
  }

  const { error: deleteError } = await supabase.from("videos")
    .delete()
    .eq("id", video.id)
    .eq("user_id", user.id);
  if (deleteError) {
    return NextResponse.json({ error: `Les fichiers ont été supprimés, mais la vidéo n’a pas pu être retirée de la bibliothèque : ${deleteError.message}` }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non autorisé." }, { status: 401 });

  const { id } = await params;
  const parsedId = z.string().uuid().safeParse(id);
  if (!parsedId.success) return NextResponse.json({ error: "Identifiant vidéo invalide." }, { status: 400 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  const parsedBody = z.object({ title: z.string().trim().min(1).max(120) }).safeParse(body);
  if (!parsedBody.success) {
    return NextResponse.json({ error: "Le nom doit contenir entre 1 et 120 caractères." }, { status: 400 });
  }

  const { data, error } = await supabase.from("videos")
    .update({ title: parsedBody.data.title })
    .eq("id", parsedId.data)
    .eq("user_id", user.id)
    .select("id,title")
    .single();
  if (error?.code === "PGRST116") {
    return NextResponse.json({ error: "Vidéo introuvable." }, { status: 404 });
  }
  if (error) {
    console.error("Could not rename video:", error.message);
    return NextResponse.json({ error: "Impossible de modifier le nom de la vidéo." }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "Impossible de modifier le nom de la vidéo." }, { status: 500 });

  return NextResponse.json({ title: data.title });
}
