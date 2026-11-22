import Link from "next/link";
import { requestPasswordReset } from "@/app/actions/auth";
import { Brand } from "@/components/brand";
import { SpotlightPanel } from "@/components/spotlight-panel";

export default async function ForgotPassword({ searchParams }: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const params = await searchParams;
  return <main className="grid min-h-screen place-items-center px-5 py-12">
    <div className="w-full max-w-md">
      <Brand />
      <SpotlightPanel className="mt-10 p-7 sm:p-9">
        <p className="text-xs font-semibold uppercase tracking-[.2em] text-accent">Récupération du compte</p>
        <h1 className="mt-3 text-2xl font-semibold">Mot de passe oublié ?</h1>
        <p className="mt-2 text-sm text-muted">Indiquez votre adresse email pour recevoir un lien de réinitialisation.</p>
        {params.error && <p role="alert" className="mt-5 rounded-lg bg-red-500/10 p-3 text-sm text-red-300">{params.error}</p>}
        {params.message && <p role="status" className="mt-5 rounded-lg bg-accent/10 p-3 text-sm text-accent">{params.message}</p>}
        <form action={requestPasswordReset} className="mt-7 space-y-4">
          <label className="block text-sm">Email<input className="form-input" name="email" type="email" required autoComplete="email" /></label>
          <button className="w-full rounded-xl bg-accent py-3 text-sm font-bold text-ink hover:brightness-110">Envoyer le lien</button>
        </form>
        <p className="mt-6 text-center text-sm text-muted"><Link className="text-accent hover:underline" href="/login">Retour à la connexion</Link></p>
      </SpotlightPanel>
    </div>
  </main>;
}
