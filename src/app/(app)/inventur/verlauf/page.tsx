import Link from "next/link";
import { InventoryRuns } from "@/components/inventory-runs";
import { canWrite } from "@/lib/roles";
import { requireUser } from "@/lib/session";
import { listInventories } from "@/services/inventory";

export const metadata = { title: "Inventur-Verlauf" };

export default async function VerlaufPage() {
  const user = await requireUser();
  const runs = await listInventories();
  return (
    <div className="page max-w-3xl space-y-5">
      <div><h1 className="h1">Inventur-Verlauf</h1><p className="text-sm text-muted-foreground">Jede Zählung mit ihren Korrekturen. Falsch gezählt? „Zählung zurücknehmen“ macht alle Korrekturen der Zählung rückgängig, danach kannst du neu zählen.</p></div>
      <InventoryRuns runs={runs} canWrite={canWrite(user.role)} />
      <p className="text-sm"><Link href="/inventur" className="underline">← Zurück zur Inventur</Link></p>
    </div>
  );
}
