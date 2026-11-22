import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  const body = await request.json();
  if (typeof body.storagePath !== "string" || typeof body.title !== "string") {
    return NextResponse.json({ error: "Fichier ou titre manquant." }, { status: 400 });
  }
  if (!body.storagePath.startsWith(`${user.id}/`)) {
    return NextResponse.json({ error: "Chemin de stockage invalide." }, { status: 400 });
  }
  const { data, error } = await supabase.from("videos").insert({
    user_id: user.id,
    title: body.title.slice(0, 200),
    storage_path: body.storagePath,
    status: "uploaded",
  }).select("id").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: data.id }, { status: 201 });
}
