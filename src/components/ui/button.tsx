import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" };

export function Button({ className, variant = "primary", ...props }: Props) {
  return <button className={cn(
    "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50",
    variant === "primary" && "bg-accent text-ink hover:brightness-110",
    variant === "secondary" && "border border-line bg-white/[0.03] text-white hover:bg-white/[0.07]",
    variant === "ghost" && "text-muted hover:bg-white/[0.06] hover:text-white",
    className,
  )} {...props} />;
}
