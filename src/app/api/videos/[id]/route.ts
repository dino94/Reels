import { NextResponse } from "next/server";
import { z } from "zod";
import { isStoragePathAllowed } from "@/lib/storage-path";
import { createClient } from "@/lib/supabase/server";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Identifiant vidéo invalide." }, { status: 400 });
  }

  // 1. Supprimer d'abord la ligne : la cascade nettoie analyses et reports.
  const { error: deleteError } = await supabase.from("videos")
    .delete().eq("id", id).eq("user_id", user.id);
  if (deleteError) {
    console.error("Could not delete video row:", deleteError.message);
    return NextResponse.json({ error: "Impossible de supprimer la vidéo." }, { status: 500 });
  }

  // 2. Supprimer ensuite les fichiers de stockage, en best-effort.
  const warning = await removeStorageObjects(supabase, user.id, id);
  return NextResponse.json(warning ? { success: true, warning } : { success: true });
}

const bodySchema = z.object({
  storagePath: z.string().min(1).max(500),
  title: z.string().trim().min(1).max(120),
});

// Même limite pour PATCH (renommage) et POST (création) : 1 à 120 caractères après trim.
const titleSchema = z.string().trim().min(1).max(120);

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Identifiant vidéo invalide." }, { status: 400 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  const parsed = z.object({ title: titleSchema }).safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Le titre doit contenir entre 1 et 120 caractères." }, { status: 400 });
  }

  const { data, error } = await supabase.from("videos")
    .update({ title: parsed.data.title })
    .eq("id", id).eq("user_id", user.id)
    .select("title").single();
  if (error || !data) {
    console.error("Could not rename video:", error?.message);
    return NextResponse.json({ error: "Impossible de modifier le titre." }, { status: 500 });
  }
  return NextResponse.json({ title: data.title });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non autorisé." }, { status: 401 });

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Fichier ou titre manquant ou invalide." }, { status: 400 });
  }
  const { storagePath, title } = parsed.data;

  if (!isStoragePathAllowed(storagePath, user.id)) {
    return NextResponse.json({ error: "Chemin de stockage invalide." }, { status: 400 });
  }

  const { data, error } = await supabase.from("videos").insert({
    user_id: user.id,
    title,
    storage_path: storagePath,
    status: "uploaded",
  }).select("id").single();
  if (error) {
    console.error("Could not create video:", error.message);
    return NextResponse.json({ error: "Impossible d'enregistrer la vidéo." }, { status: 500 });
  }
  return NextResponse.json({ id: data.id }, { status: 201 });
}

/** Best-effort : supprime les fichiers storage de la vidéo et renvoie un message d'avertissement si échec. */
async function removeStorageObjects(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, videoId: string) {
  const prefixes = ["", "frames/"];
  const files: string[] = [];
  for (const prefix of prefixes) {
    const { data, error } = await supabase.storage.from("videos").list(`${userId}/${videoId}/${prefix}`);
    if (error) {
      console.error("Could not list storage objects:", error.message);
      return "La vidéo a été supprimée, mais certains fichiers n’ont pas pu être retirés du stockage.";
    }
    for (const file of data || []) {
      if (file.name) files.push(`${userId}/${videoId}/${prefix}${file.name}`);
    }
  }
  if (!files.length) return null;
  const { error } = await supabase.storage.from("videos").remove(files);
  if (error) {
    console.error("Could not remove storage objects:", error.message);
    return "La vidéo a été supprimée, mais certains fichiers n’ont pas pu être retirés du stockage.";
  }
  return null;
}
