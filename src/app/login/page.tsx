import Link from "next/link";
import { login } from "@/app/actions/auth";
import { Brand } from "@/components/brand";
import { SpotlightPanel } from "@/components/spotlight-panel";
import { authErrorMessage, authInfoMessage } from "@/lib/auth-messages";

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string; message?: string }> }) {
  const params = await searchParams;
  const error = authErrorMessage(params.error);
  const message = authInfoMessage(params.message);
  return <main className="grid min-h-screen place-items-center px-5 py-12">
    <div className="w-full max-w-md">
      <Brand />
      <SpotlightPanel className="mt-10 p-7 sm:p-9">
        <p className="text-xs font-semibold uppercase tracking-[.2em] text-accent">Bienvenue</p>
        <h1 className="mt-3 text-2xl font-semibold">Connexion à votre espace</h1>
        <p className="mt-2 text-sm text-muted">Analysez vos vidéos football, sans perdre le fil.</p>
        {error && <p role="alert" className="mt-5 rounded-lg bg-red-500/10 p-3 text-sm text-red-300">{error}</p>}
        {message && <p className="mt-5 rounded-lg bg-accent/10 p-3 text-sm text-accent">{message}</p>}
        <form action={login} className="mt-7 space-y-4">
          <label className="block text-sm">Email<input className="form-input" name="email" type="email" required autoComplete="email" /></label>
          <label className="block text-sm">Mot de passe<input className="form-input" name="password" type="password" required minLength={8} autoComplete="current-password" /></label>
          <div className="-mt-1 text-right"><Link className="text-xs text-accent hover:underline" href="/forgot-password">Mot de passe oublié ?</Link></div>
          <button className="w-full rounded-xl bg-accent py-3 text-sm font-bold text-ink hover:brightness-110">Se connecter</button>
        </form>
        <p className="mt-6 text-center text-sm text-muted">Nouveau ici ? <Link className="text-accent hover:underline" href="/register">Créer un compte</Link></p>
      </SpotlightPanel>
    </div>
  </main>;
}
