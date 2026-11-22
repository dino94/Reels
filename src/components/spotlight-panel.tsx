import type { CSSProperties, HTMLAttributes } from "react";
import SpotlightCard from "@/components/SpotlightCard";
import { cn } from "@/lib/utils";

type SpotlightPanelProps = HTMLAttributes<HTMLDivElement> & { surface?: string };

export function SpotlightPanel({ children, className, style, surface = "#0c1a2a", ...props }: SpotlightPanelProps) {
  return <SpotlightCard
    data-gsap-reveal=""
    className={cn("rounded-2xl border border-line bg-panel p-5 sm:p-7", className)}
    style={{ ...style, "--spotlight-card-surface": surface } as CSSProperties}
    spotlightColor="#3bd4ff"
    intensity={0.14}
    spotlightSize={260}
    proximity={0}
    borderGlow={0.3}
    flare={false}
    grain={0}
    {...props}
  >
    {children}
  </SpotlightCard>;
}
