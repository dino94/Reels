"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import { ReactLenis } from "lenis/react";

gsap.registerPlugin(useGSAP);

const LENIS_OPTIONS = {
  autoRaf: true,
  smoothWheel: true,
  syncTouch: false,
  lerp: 0.1,
  wheelMultiplier: 0.9,
  anchors: true,
};

export function PageAnimations({ children }: { children: React.ReactNode }) {
  const container = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const [reducedMotion, setReducedMotion] = useState(true);

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => setReducedMotion(preference.matches);
    updatePreference();
    preference.addEventListener("change", updatePreference);
    return () => preference.removeEventListener("change", updatePreference);
  }, []);

  useGSAP(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const panels = gsap.utils.toArray<HTMLElement>("[data-gsap-reveal]", container.current);
    if (!panels.length) return;

    gsap.from(panels, {
      y: 10,
      duration: 0.38,
      stagger: 0.05,
      ease: "power2.out",
      clearProps: "transform",
    });
  }, { scope: container, dependencies: [pathname], revertOnUpdate: true });

  return <>
    {!reducedMotion && <ReactLenis root options={LENIS_OPTIONS} />}
    <div ref={container}>{children}</div>
  </>;
}
