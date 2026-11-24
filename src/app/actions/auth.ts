"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const passwordSchema = z.string().min(8);
const emailSchema = z.string().trim().email();

async function passwordResetRedirectUrl() {
  // En production, NEXT_PUBLIC_SITE_URL est obligatoire : on ne se rabat pas
  // sur l'en-tête Origin, qui peut être falsifié ou absent selon le proxy.
  if (process.env.NODE_ENV === "production") {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
    if (!siteUrl) return null;
    return buildRedirectUrl(siteUrl);
  }
  const origin = process.env.NEXT_PUBLIC_SITE_URL || (await headers()).get("origin");
  if (!origin) return null;
  return buildRedirectUrl(origin);
}

function buildRedirectUrl(rawUrl: string) {
  try {
    const url = new URL("/auth/callback?next=/reset-password", rawUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

export async function login(formData: FormData) {
  const supabase = await createClient();
  const email = emailSchema.safeParse(String(formData.get("email") || ""));
  const password = passwordSchema.safeParse(String(formData.get("password") || ""));
  if (!email.success || !password.success) {
    redirect("/login?error=invalid_credentials");
  }
  const { error } = await supabase.auth.signInWithPassword({ email: email.data, password: password.data });
  if (error) redirect("/login?error=invalid_credentials");
  redirect("/dashboard");
}

export async function register(formData: FormData) {
  const supabase = await createClient();
  const email = emailSchema.safeParse(String(formData.get("email") || ""));
  const password = passwordSchema.safeParse(String(formData.get("password") || ""));
  if (!email.success) redirect("/register?error=invalid_email");
  if (!password.success) redirect("/register?error=weak_password");
  const { error } = await supabase.auth.signUp({ email: email.data, password: password.data });
  if (error) redirect("/register?error=register_failed");
  redirect("/login?message=verify_email");
}

export async function requestPasswordReset(formData: FormData) {
  const email = emailSchema.safeParse(String(formData.get("email") || ""));
  if (!email.success) redirect("/forgot-password?error=invalid_email");

  const redirectTo = await passwordResetRedirectUrl();
  if (!redirectTo) redirect("/forgot-password?error=redirect_url_missing");

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email.data, { redirectTo });
  if (error) {
    console.error("Could not send password reset email:", error.message);
    redirect("/forgot-password?error=reset_send_failed");
  }
  redirect("/forgot-password?message=reset_sent");
}

export async function updatePassword(formData: FormData) {
  const password = String(formData.get("password") || "");
  const confirmation = String(formData.get("confirmation") || "");
  if (!passwordSchema.safeParse(password).success) redirect("/reset-password?error=weak_password");
  if (password !== confirmation) redirect("/reset-password?error=password_mismatch");

  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) redirect("/forgot-password?error=link_expired");

  const { error } = await supabase.auth.updateUser({ password });
  if (error) redirect("/reset-password?error=update_failed");
  redirect("/dashboard");
}

export async function updateProfileName(formData: FormData) {
  const displayName = z.string().trim().min(2).max(32).safeParse(String(formData.get("displayName") || ""));
  if (!displayName.success) redirect("/dashboard/settings?error=invalid_display_name");

  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) redirect("/login");

  const { error } = await supabase.from("profiles").upsert(
    { id: user.id, display_name: displayName.data },
    { onConflict: "id" },
  );
  if (error) {
    console.error("Could not update profile name:", error.message);
    redirect("/dashboard/settings?error=profile_update_failed");
  }
  redirect("/dashboard/settings?message=profile_updated");
}

export async function updateAccountPassword(formData: FormData) {
  const password = String(formData.get("password") || "");
  const confirmation = String(formData.get("confirmation") || "");
  if (!passwordSchema.safeParse(password).success) redirect("/dashboard/settings?error=weak_password");
  if (password !== confirmation) redirect("/dashboard/settings?error=password_mismatch");

  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) redirect("/login");

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    console.error("Could not update account password:", error.message);
    redirect("/dashboard/settings?error=password_update_failed");
  }
  redirect("/dashboard/settings?message=password_updated");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
