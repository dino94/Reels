import Link from "next/link";
import { Clapperboard, LayoutDashboard, LogOut, Settings2 } from "lucide-react";
import { Brand } from "@/components/brand";
import { logout } from "@/app/actions/auth";

export function DashboardShell({ children, email }: { children: React.ReactNode; email: string }) {
  return <div className="min-h-screen bg-ink text-white md:flex">
    <aside className="flex w-full flex-col border-b border-line bg-panel/95 px-5 py-5 backdrop-blur-xl md:fixed md:inset-y-0 md:w-64 md:border-b-0 md:border-r md:px-6">
      <Brand />
      <nav className="mt-9 flex gap-2 md:flex-col">
        <Link href="/dashboard" className="nav-item"><LayoutDashboard size={17} /> Dashboard</Link>
        <Link href="/dashboard/analyses" className="nav-item"><Clapperboard size={17} /> Mes analyses</Link>
        <Link href="/dashboard/settings" className="nav-item"><Settings2 size={17} /> Paramètres</Link>
      </nav>
      <form action={logout} className="mt-2 md:hidden"><button className="nav-item w-full"><LogOut size={17} /> Déconnexion</button></form>
      <div className="mt-auto hidden border-t border-line pt-5 md:block">
        <div className="mb-3 truncate text-xs text-muted">{email}</div>
        <form action={logout}><button className="nav-item w-full"><LogOut size={17} /> Déconnexion</button></form>
      </div>
    </aside>
    <main className="min-w-0 flex-1 md:ml-64">{children}</main>
  </div>;
}
