import { ClipboardCheck } from "lucide-react";
import Link from "next/link";
import { prisma } from "@/db/prisma";
import { Empty } from "@/components/stock-ui";
import { buildTree, flatten, pathName } from "@/lib/domain/tree";
import { requireWriter } from "@/lib/session";
import { stockRows } from "@/services/stock";

export const metadata = { title: "Inventur" };

export default async function InventurPage() {
  await requireWriter();
  const [locations, rows] = await Promise.all([prisma.location.findMany(), stockRows(prisma)]);
  const nodes = flatten(buildTree(locations.filter((l) => !l.archivedAt)));
  const positions = (id: string) => rows.filter((r) => r.locationId === id && r.quantity !== 0).length;
  return (
    <div className="page max-w-3xl space-y-5">
      <div><h1 className="h1">Inventur</h1><p className="text-sm text-muted-foreground">Raum wählen, alles zählen, Zahlen eintragen. Gebucht werden nur die Abweichungen – am Ende stimmt die Lage mit dem Regal überein. Tipp: Der QR-Code an der Tür öffnet den Raum direkt.</p></div>
      {nodes.length === 0 ? <Empty title="Noch keine Lagerorte" /> : (
        <ul className="space-y-2">
          {nodes.map((n) => (
            <li key={n.loc.id} style={{ marginLeft: `${Math.min(n.depth, 4) * 1.25}rem` }}>
              <Link href={`/inventur/${n.loc.id}`} className="card flex items-center justify-between gap-3 p-3 hover:bg-muted">
                <span><span className="font-medium text-heading">{n.loc.name}</span>{n.loc.code && n.loc.code !== n.loc.name && <span className="ml-2 chip-muted">{n.loc.code}</span>}<span className="block text-xs text-muted-foreground">{pathName(locations, n.loc.id)} · {positions(n.loc.id)} Positionen gebucht</span></span>
                <ClipboardCheck className="size-5 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
