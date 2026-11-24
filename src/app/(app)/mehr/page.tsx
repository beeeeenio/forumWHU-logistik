import { ClipboardCheck, LogOut, QrCode, ScrollText, Settings2, Users } from "lucide-react";
import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";
import { ROLE_LABEL, canWrite, isAdmin } from "@/lib/roles";
import { requireUser } from "@/lib/session";

export const metadata = { title: "Mehr" };

export default async function MehrPage() {
  const user = await requireUser();
  const links = [
    { href: "/inventur", label: "Inventur", help: "Raum zählen, Abweichungen buchen", icon: ClipboardCheck, show: canWrite(user.role) },
    { href: "/qr", label: "QR-Etiketten", help: "Für Türen und Regale ausdrucken", icon: QrCode, show: true },
    { href: "/journal", label: "Journal", help: "Alle Buchungen, filtern, stornieren, Excel-Export", icon: ScrollText, show: true },
    { href: "/stammdaten", label: "Stammdaten", help: "Lagerorte, Artikel, Lieferanten", icon: Settings2, show: canWrite(user.role) },
    { href: "/admin", label: "Personen", help: "Zugänge und Rollen verwalten", icon: Users, show: isAdmin(user.role) },
  ].filter((l) => l.show);
  return (
    <div className="page space-y-6">
      <h1 className="h1">Mehr</h1>
      <div className="grid gap-3">
        {links.map(({ href, label, help, icon: Icon }) => (
          <Link key={href} href={href} className="card flex items-center gap-4 p-4">
            <Icon className="size-6 text-heading" />
            <span><span className="block font-medium text-heading">{label}</span><span className="text-sm text-muted-foreground">{help}</span></span>
          </Link>
        ))}
      </div>
      <div className="card flex items-center justify-between p-4">
        <span><span className="block font-medium text-heading">{user.displayName}</span><span className="text-sm text-muted-foreground">{ROLE_LABEL[user.role]}</span></span>
        <ThemeToggle />
      </div>
      <form action="/api/auth/logout" method="post"><button className="btn-secondary w-full"><LogOut className="size-4" />Abmelden</button></form>
    </div>
  );
}
