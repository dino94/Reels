import Link from "next/link";
import { Activity } from "lucide-react";

export function Brand({ compact = false }: { compact?: boolean }) {
  return <Link href="/dashboard" className="flex items-center gap-3">
    <span className="grid size-10 place-items-center rounded-xl bg-accent text-ink"><Activity size={21} strokeWidth={2.6} /></span>
    {!compact && <span className="text-sm font-bold tracking-tight text-white">FOOTBALL<span className="text-signal">.VIRAL</span></span>}
  </Link>;
}
