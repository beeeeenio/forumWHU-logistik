import { prisma } from "@/db/prisma";
import { UserCreateForm, UserRow } from "@/components/user-forms";
import { ROLE_LABEL } from "@/lib/roles";
import { requireAdminPage } from "@/lib/session";
import { fmtDateTime } from "@/lib/time";

export const metadata = { title: "Personen" };

export default async function AdminPage() {
  const me = await requireAdminPage();
  const [users, events] = await Promise.all([
    prisma.user.findMany({ orderBy: [{ status: "asc" }, { displayName: "asc" }] }),
    prisma.auditEvent.findMany({ orderBy: { createdAt: "desc" }, take: 25, include: { user: true } }),
  ]);
  return (
    <div className="page space-y-6">
      <div><h1 className="h1">Personen</h1><p className="text-sm text-muted-foreground">Wer darf die Logistik sehen oder bearbeiten? Es gibt keine Selbstregistrierung: Personen werden hier mit ihrer Microsoft-Adresse eingetragen und melden sich dann mit Microsoft an.</p></div>
      <details className="card p-4" open={users.length <= 1}><summary className="font-medium text-heading">Person eintragen</summary><div className="mt-4"><UserCreateForm /></div></details>
      <ul className="space-y-3">
        {users.map((u) => (
          <li key={u.id} className="card space-y-3 p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div><p className="font-medium text-heading">{u.displayName}</p><p className="text-sm text-muted-foreground">{u.email}</p></div>
              <div className="flex flex-wrap gap-2"><span className="chip-muted">{ROLE_LABEL[u.role]}</span>
                {u.status === "PENDING" && <span className="chip-warn">hat sich noch nie angemeldet</span>}
                {u.status === "DEACTIVATED" && <span className="chip-danger">gesperrt</span>}
                {u.status === "ACTIVE" && <span className="chip-ok">aktiv</span>}</div>
            </div>
            {u.lastLoginAt && <p className="text-xs text-muted-foreground">Letzte Anmeldung {fmtDateTime(u.lastLoginAt)}</p>}
            <UserRow id={u.id} role={u.role} deactivated={u.status === "DEACTIVATED"} self={u.id === me.id} />
          </li>
        ))}
      </ul>
      <details className="card p-4"><summary className="font-medium text-heading">Protokoll (letzte 25 Ereignisse)</summary>
        <ul className="mt-3 divide-y text-sm">{events.map((e) => <li key={e.id} className="flex flex-wrap justify-between gap-2 py-2"><span><code className="text-xs">{e.action}</code>{e.user ? ` · ${e.user.displayName}` : ""}{e.detail && typeof e.detail === "object" && "email" in e.detail ? ` · ${String((e.detail as { email?: unknown }).email)}` : ""}</span><span className="text-muted-foreground">{fmtDateTime(e.createdAt)}</span></li>)}</ul></details>
    </div>
  );
}
