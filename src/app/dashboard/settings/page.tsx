import { redirect } from "next/navigation";
import { updateAccountPassword, updateProfileName } from "@/app/actions/auth";
import { DashboardShell } from "@/components/dashboard-shell";
import { SpotlightPanel } from "@/components/spotlight-panel";
import { createClient } from "@/lib/supabase/server";
import { authErrorMessage, authInfoMessage } from "@/lib/auth-messages";

export default async function SettingsPage({ searchParams }: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const params = await searchParams;
  const error = authErrorMessage(params.error);
  const message = authInfoMessage(params.message);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile, error: profileError } = await supabase.from("profiles")
    .select("display_name").eq("id", user.id).maybeSingle();
  if (profileError) console.error("Could not load profile:", profileError.message);

  const initialName = profile?.display_name || user.user_metadata?.display_name || user.email?.split("@")[0] || "";

  return <DashboardShell email={user.email || ""}>
    <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8">
      <header className="mb-8">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[.2em] text-accent">Votre compte</p>
        <h1 className="text-3xl font-semibold tracking-tight">Paramètres</h1>
        <p className="mt-2 text-sm text-muted">Modifiez votre pseudo et sécurisez votre compte.</p>
      </header>

      {error && <p role="alert" className="mb-5 rounded-lg bg-red-500/10 p-3 text-sm text-red-300">{error}</p>}
      {message && <p role="status" className="mb-5 rounded-lg bg-accent/10 p-3 text-sm text-accent">{message}</p>}
      {profileError && <p role="alert" className="mb-5 rounded-lg bg-red-500/10 p-3 text-sm text-red-300">Le pseudo actuel n&apos;a pas pu être chargé.</p>}

      <SpotlightPanel className="p-5 sm:p-7">
        <section>
          <div className="mb-5">
            <h2 className="font-semibold">Profil</h2>
            <p className="mt-1 text-sm text-muted">Votre adresse email : {user.email}</p>
          </div>
          <form action={updateProfileName} className="space-y-4">
            <label className="block text-sm">
              Pseudo
              <input className="form-input" name="displayName" type="text" required minLength={2} maxLength={32} defaultValue={initialName} autoComplete="nickname" />
            </label>
            <button className="rounded-xl bg-accent px-5 py-3 text-sm font-bold text-ink hover:brightness-110">Enregistrer le pseudo</button>
          </form>
        </section>
      </SpotlightPanel>

      <SpotlightPanel className="mt-5 p-5 sm:p-7">
        <section>
          <div className="mb-5">
            <h2 className="font-semibold">Sécurité</h2>
            <p className="mt-1 text-sm text-muted">Choisissez un nouveau mot de passe d&apos;au moins 8 caractères.</p>
          </div>
          <form action={updateAccountPassword} className="space-y-4">
            <label className="block text-sm">
              Nouveau mot de passe
              <input className="form-input" name="password" type="password" required minLength={8} autoComplete="new-password" />
            </label>
            <label className="block text-sm">
              Confirmer le mot de passe
              <input className="form-input" name="confirmation" type="password" required minLength={8} autoComplete="new-password" />
            </label>
            <button className="rounded-xl bg-accent px-5 py-3 text-sm font-bold text-ink hover:brightness-110">Mettre à jour le mot de passe</button>
          </form>
        </section>
      </SpotlightPanel>
    </div>
  </DashboardShell>;
}
