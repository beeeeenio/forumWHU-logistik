import Link from "next/link";
import { fmtDateTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { InventoryRun } from "@/services/inventory";
import { InventoryUndo } from "./inventory-undo";
import { VoidForm } from "./void-form";

/** Liste bisheriger Inventuren; zurückgenommene sind durchgestrichen. */
export function InventoryRuns({ runs, canWrite, showLocation = true }: { runs: InventoryRun[]; canWrite: boolean; showLocation?: boolean }) {
  if (!runs.length) return <p className="text-sm text-muted-foreground">Noch keine Inventur gebucht.</p>;
  return (
    <ul className="space-y-3">
      {runs.map((r) => (
        <li key={r.batchId} className={cn("card space-y-2 p-4", r.voided && "opacity-70")}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className={cn("font-medium text-heading", r.voided && "line-through")}>{r.imported ? "Excel-Import" : showLocation && r.locationId ? <Link href={`/inventur/${r.locationId}`} className="hover:underline">{r.locationName}</Link> : "Inventur"}{r.imported && r.locationName ? ` · ${r.locationName}` : ""} · {r.lines.length} Korrektur{r.lines.length === 1 ? "" : "en"}</span>
            <span className="text-xs text-muted-foreground">{fmtDateTime(r.at)} · {r.by}</span>
          </div>
          <ul className="space-y-1 text-sm">
            {r.lines.map((l) => (
              <li key={l.id} className="space-y-1">
                <span className={cn(l.voided && "text-muted-foreground line-through")}>{l.text}{l.voided && !r.voided && <span className="ml-2 chip-muted no-underline">zurückgenommen</span>}</span>
                {canWrite && !l.voided && r.lines.length > 1 && <div><VoidForm id={l.id} /></div>}
              </li>
            ))}
          </ul>
          {r.voided ? <p className="rounded-lg bg-danger/10 p-2 text-xs text-danger">Zurückgenommen: {r.voidReason}</p> : canWrite && <InventoryUndo batchId={r.batchId} />}
        </li>
      ))}
    </ul>
  );
}
