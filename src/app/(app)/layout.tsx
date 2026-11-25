import { LogOut } from "lucide-react";
import { Brand } from "@/components/brand";
import { SideNav, TabBar, type NavItem } from "@/components/nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { ROLE_LABEL, canWrite, isAdmin } from "@/lib/roles";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  const writer = canWrite(user.role);
  const side: NavItem[] = [
    { href: "/", label: "Lage", icon: "lage" },
    ...(writer ? [{ href: "/buchen", label: "Buchen", icon: "buchen" }] : []),
    { href: "/plan", label: "Plan", icon: "plan" },
    { href: "/pfand", label: "Leergut & Pfand", icon: "pfand" },
    ...(writer ? [{ href: "/inventur", label: "Inventur", icon: "inventur" }] : []),
    { href: "/auswertung", label: "Auswertung", icon: "auswertung" },
    { href: "/journal", label: "Journal", icon: "journal" },
    ...(writer ? [{ href: "/stammdaten", label: "Stammdaten", icon: "stammdaten" }, { href: "/import", label: "Excel-Import", icon: "import" }] : []),
    ...(isAdmin(user.role) ? [{ href: "/admin", label: "Personen", icon: "admin" }] : []),
  ];
  const tabs: NavItem[] = [
    { href: "/", label: "Lage", icon: "lage" },
    writer ? { href: "/buchen", label: "Buchen", icon: "buchen" } : { href: "/journal", label: "Journal", icon: "journal" },
    { href: "/plan", label: "Plan", icon: "plan" },
    { href: "/pfand", label: "Leergut", icon: "pfand" },
    { href: "/mehr", label: "Mehr", icon: "mehr" },
  ];
  return (
    <div className="flex min-h-dvh flex-1 print:block">
      <a href="#inhalt" className="sr-only z-50 rounded-lg bg-card px-4 py-3 font-medium text-heading focus:not-sr-only focus:fixed focus:top-2 focus:left-2">Zum Inhalt springen</a>
      <aside className="print:hidden sticky top-0 hidden h-dvh w-60 shrink-0 flex-col justify-between bg-navy p-4 md:flex">
        <div className="space-y-8">
          <Brand tone="navy" height={42} className="px-2 pt-2" />
          <SideNav items={side} />
        </div>
        <div className="space-y-3">
          <ThemeToggle className="inline-flex rounded-xl border border-white/15 bg-white/5 p-1 text-sidebar-fg" />
          <div className="rounded-xl bg-white/5 p-3 text-sidebar-fg">
            <p className="truncate text-sm font-medium text-white">{user.displayName}</p>
            <p className="text-xs text-sidebar-fg/70">{ROLE_LABEL[user.role]}</p>
            <form action="/api/auth/logout" method="post" className="mt-2">
              <button className="flex items-center gap-2 text-xs text-sidebar-fg/80 hover:text-white"><LogOut className="size-4" />Abmelden</button>
            </form>
          </div>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="print:hidden sticky top-0 z-20 flex items-center justify-between bg-navy px-4 py-3 md:hidden">
          <Brand tone="navy" height={28} />
          <span className="text-xs text-sidebar-fg/80">{user.displayName.split(" ")[0]} · {ROLE_LABEL[user.role]}</span>
        </header>
        <main id="inhalt" tabIndex={-1} className="flex-1 outline-none pb-[calc(var(--tabbar-h)+env(safe-area-inset-bottom)+1rem)] md:pb-0">{children}</main>
      </div>
      <div className="print:hidden"><TabBar items={tabs} /></div>
    </div>
  );
}
