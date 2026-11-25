"use client";

import { CalendarClock, ChartColumn, CirclePlus, FileUp, ClipboardCheck, Ellipsis, Recycle, ScrollText, Settings2, Users, Warehouse, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export interface NavItem { href: string; label: string; icon: string }
const ICONS: Record<string, LucideIcon> = { lage: Warehouse, buchen: CirclePlus, plan: CalendarClock, pfand: Recycle, journal: ScrollText, stammdaten: Settings2, admin: Users, mehr: Ellipsis, inventur: ClipboardCheck, auswertung: ChartColumn, import: FileUp };

const active = (path: string, href: string) => (href === "/" ? path === "/" || path.startsWith("/orte") || path.startsWith("/artikel") : path === href || path.startsWith(href + "/"));

/** Seitenleiste (ab Tablet-Breite) */
export function SideNav({ items }: { items: NavItem[] }) {
  const path = usePathname();
  return (
    <nav aria-label="Hauptmenü" className="flex flex-col gap-1">
      {items.map((i) => {
        const Icon = ICONS[i.icon] ?? Warehouse;
        const on = active(path, i.href);
        return (
          <Link key={i.href} href={i.href} aria-current={on ? "page" : undefined}
            className={cn("flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors", on ? "bg-white/10 text-white" : "text-sidebar-fg/80 hover:bg-white/5 hover:text-white")}>
            <Icon className={cn("size-5", on && "text-primary")} />{i.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Tab-Leiste am unteren Rand (Handy): die fünf wichtigsten Wege mit dem Daumen */
export function TabBar({ items }: { items: NavItem[] }) {
  const path = usePathname();
  return (
    <nav aria-label="Hauptmenü" className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-navy md:hidden">
      <ul className="mx-auto flex max-w-xl">
        {items.map((i) => {
          const Icon = ICONS[i.icon] ?? Warehouse;
          const on = active(path, i.href) || (i.href === "/mehr" && ["/journal", "/stammdaten", "/admin", "/inventur", "/qr", "/auswertung", "/import"].some((p) => path.startsWith(p)));
          const hot = i.icon === "buchen";
          return (
            <li key={i.href} className="flex-1">
              <Link href={i.href} aria-current={on ? "page" : undefined} className={cn("flex h-[var(--tabbar-h)] flex-col items-center justify-center gap-1 text-[11px] font-medium", on ? "text-white" : "text-sidebar-fg/70")}>
                <span className={cn("flex items-center justify-center", hot && "size-10 -translate-y-1 rounded-full bg-primary text-primary-foreground shadow-soft")}>
                  <Icon className={cn("size-6", on && !hot && "text-primary")} />
                </span>
                <span className={cn(hot && "-mt-2")}>{i.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
