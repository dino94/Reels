"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

async function passwordResetRedirectUrl() {
  const origin = process.env.NEXT_PUBLIC_SITE_URL || (await headers()).get("origin");
  if (!origin) return null;
  try {
    const url = new URL("/auth/callback?next=/reset-password", origin);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

export async function login(formData: FormData) {
  const supabase = await createClient();
  const email = String(formData.get("email") || "");
  const password = String(formData.get("password") || "");
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) redirect(`/login?error=${encodeURIComponent(error.message)}`);
  redirect("/dashboard");
}

export async function register(formData: FormData) {
  const supabase = await createClient();
  const email = String(formData.get("email") || "");
  const password = String(formData.get("password") || "");
  const { error } = await supabase.auth.signUp({ email, password });
  if (error) redirect(`/register?error=${encodeURIComponent(error.message)}`);
  redirect(`/login?message=${encodeURIComponent("Vérifiez votre email pour confirmer votre compte.")}`);
}

export async function requestPasswordReset(formData: FormData) {
  const email = z.string().trim().email().safeParse(String(formData.get("email") || ""));
  if (!email.success) redirect("/forgot-password?error=Adresse%20email%20invalide.");

  const redirectTo = await passwordResetRedirectUrl();
  if (!redirectTo) {
    redirect("/forgot-password?error=URL%20de%20retour%20non%20configur%C3%A9e.");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email.data, { redirectTo });
  if (error) {
    redirect("/forgot-password?error=Impossible%20d’envoyer%20le%20lien.%20R%C3%A9essayez%20plus%20tard.");
  }
  redirect("/forgot-password?message=Si%20un%20compte%20correspond%20%C3%A0%20cette%20adresse%2C%20un%20lien%20de%20r%C3%A9initialisation%20a%20%C3%A9t%C3%A9%20envoy%C3%A9.");
}

export async function updatePassword(formData: FormData) {
  const password = String(formData.get("password") || "");
  const confirmation = String(formData.get("confirmation") || "");
  if (password.length < 8) redirect("/reset-password?error=Le%20mot%20de%20passe%20doit%20contenir%20au%20moins%208%20caract%C3%A8res.");
  if (password !== confirmation) redirect("/reset-password?error=Les%20mots%20de%20passe%20ne%20correspondent%20pas.");

  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) redirect("/forgot-password?error=Le%20lien%20a%20expir%C3%A9.%20Demandez-en%20un%20nouveau.");

  const { error } = await supabase.auth.updateUser({ password });
  if (error) redirect("/reset-password?error=La%20mise%20%C3%A0%20jour%20a%20%C3%A9chou%C3%A9.%20R%C3%A9essayez.");
  redirect("/dashboard");
}

export async function updateProfileName(formData: FormData) {
  const displayName = z.string().trim().min(2).max(32).safeParse(String(formData.get("displayName") || ""));
  if (!displayName.success) {
    redirect(`/dashboard/settings?error=${encodeURIComponent("Le pseudo doit contenir entre 2 et 32 caractères.")}`);
  }

  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) redirect("/login");

  const { error } = await supabase.from("profiles").upsert(
    { id: user.id, display_name: displayName.data },
    { onConflict: "id" },
  );
  if (error) {
    console.error("Could not update profile name:", error.message);
    redirect(`/dashboard/settings?error=${encodeURIComponent("Impossible de modifier le pseudo. Réessayez.")}`);
  }
  redirect(`/dashboard/settings?message=${encodeURIComponent("Votre pseudo a été mis à jour.")}`);
}

export async function updateAccountPassword(formData: FormData) {
  const password = String(formData.get("password") || "");
  const confirmation = String(formData.get("confirmation") || "");
  if (password.length < 8) {
    redirect(`/dashboard/settings?error=${encodeURIComponent("Le mot de passe doit contenir au moins 8 caractères.")}`);
  }
  if (password !== confirmation) {
    redirect(`/dashboard/settings?error=${encodeURIComponent("Les mots de passe ne correspondent pas.")}`);
  }

  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) redirect("/login");

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    console.error("Could not update account password:", error.message);
    redirect(`/dashboard/settings?error=${encodeURIComponent("Impossible de modifier le mot de passe. Réessayez.")}`);
  }
  redirect(`/dashboard/settings?message=${encodeURIComponent("Votre mot de passe a été mis à jour.")}`);
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
