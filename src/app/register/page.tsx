import Link from "next/link";
import { register } from "@/app/actions/auth";
import { Brand } from "@/components/brand";
import { SpotlightPanel } from "@/components/spotlight-panel";

export default async function Register({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;
  return <main className="grid min-h-screen place-items-center px-5 py-12">
    <div className="w-full max-w-md">
      <Brand />
      <SpotlightPanel className="mt-10 p-7 sm:p-9">
        <p className="text-xs font-semibold uppercase tracking-[.2em] text-accent">Commencer</p>
        <h1 className="mt-3 text-2xl font-semibold">Créez votre compte</h1>
        <p className="mt-2 text-sm text-muted">Votre prochain format football commence ici.</p>
        {params.error && <p role="alert" className="mt-5 rounded-lg bg-red-500/10 p-3 text-sm text-red-300">{params.error}</p>}
        <form action={register} className="mt-7 space-y-4">
          <label className="block text-sm">Email<input className="form-input" name="email" type="email" required autoComplete="email" /></label>
          <label className="block text-sm">Mot de passe<input className="form-input" name="password" type="password" required minLength={8} autoComplete="new-password" /></label>
          <button className="w-full rounded-xl bg-accent py-3 text-sm font-bold text-ink hover:brightness-110">Créer un compte</button>
        </form>
        <p className="mt-6 text-center text-sm text-muted">Déjà inscrit ? <Link className="text-accent hover:underline" href="/login">Se connecter</Link></p>
      </SpotlightPanel>
    </div>
  </main>;
}
