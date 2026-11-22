import { NextResponse } from "next/server";

export function POST() {
  return NextResponse.json(
    { error: "La génération vidéo par API est temporairement suspendue." },
    { status: 410 },
  );
}
