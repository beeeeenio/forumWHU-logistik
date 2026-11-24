/* eslint-disable @next/next/no-img-element -- offizielle SVG-Logos werden als statische Dateien geladen */
import Link from "next/link";
import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";

// forumWHU-Logo. tone="navy": auf Navy (weißes „WHU“); tone="surface": auf heller Karte.
export function Brand({ tone = "navy", height = 40, className }: { tone?: "navy" | "surface"; height?: number; className?: string }) {
  const logo = tone === "navy" ? BRAND.logo.dark : BRAND.logo.light;
  const width = Math.round((height * logo.width) / logo.height);
  return (
    <Link href="/" aria-label={`${BRAND.productName} – Start`} className={cn("flex flex-col items-start gap-1.5 rounded-md", className)}>
      <img src={logo.src} alt="" width={width} height={height} style={{ height, width }} className="shrink-0" />
      <span className={cn("pl-0.5 text-[11px] leading-none font-medium tracking-[0.18em] uppercase", tone === "navy" ? "text-sidebar-fg/70" : "text-muted-foreground")}>{BRAND.productSuffix}</span>
    </Link>
  );
}
