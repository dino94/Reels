import Link from "next/link";
import { updatePassword } from "@/app/actions/auth";
import { Brand } from "@/components/brand";
import { createClient } from "@/lib/supabase/server";
import { SpotlightPanel } from "@/components/spotlight-panel";
import { authErrorMessage } from "@/lib/auth-messages";

export default async function ResetPassword({ searchParams }: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const error = authErrorMessage(params.error);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return <main className="grid min-h-screen place-items-center px-5 py-12">
    <div className="w-full max-w-md">
      <Brand />
      <SpotlightPanel className="mt-10 p-7 sm:p-9">
        <p className="text-xs font-semibold uppercase tracking-[.2em] text-accent">Sécurité du compte</p>
        <h1 className="mt-3 text-2xl font-semibold">Choisir un nouveau mot de passe</h1>
        {error && <p role="alert" className="mt-5 rounded-lg bg-red-500/10 p-3 text-sm text-red-300">{error}</p>}
        {user
          ? <form action={updatePassword} className="mt-7 space-y-4">
              <label className="block text-sm">Nouveau mot de passe<input className="form-input" name="password" type="password" required minLength={8} autoComplete="new-password" /></label>
              <label className="block text-sm">Confirmer le mot de passe<input className="form-input" name="confirmation" type="password" required minLength={8} autoComplete="new-password" /></label>
              <button className="w-full rounded-xl bg-accent py-3 text-sm font-bold text-ink hover:brightness-110">Mettre à jour le mot de passe</button>
            </form>
          : <div className="mt-5 space-y-4">
              <p className="text-sm text-muted">Le lien est invalide ou a expiré. Demandez-en un nouveau pour continuer.</p>
              <Link className="block text-center text-sm text-accent hover:underline" href="/forgot-password">Demander un nouveau lien</Link>
            </div>}
      </SpotlightPanel>
    </div>
  </main>;
}
