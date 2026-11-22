import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const next = request.nextUrl.searchParams.get("next");
  const redirectPath = next === "/reset-password" ? next : "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(redirectPath, request.url));
  }

  return NextResponse.redirect(
    new URL("/forgot-password?error=Le%20lien%20est%20invalide%20ou%20a%20expir%C3%A9.", request.url),
  );
}
