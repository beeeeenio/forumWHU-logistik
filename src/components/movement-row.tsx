import { ArrowRight } from "lucide-react";
import Link from "next/link";
import type { Article, Location, Movement, Supplier, User } from "@/generated/prisma/client";
import { KIND_LABEL, STATE_LABEL } from "@/lib/domain/rules";
import { pathName } from "@/lib/domain/tree";
import { fmtQty } from "@/lib/format";
import { fmtDateTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { Attachments, type AttachmentInfo } from "./attachments";
import { VoidForm } from "./void-form";

export type MovementFull = Movement & { article: Article; fromLocation: Location | null; toLocation: Location | null; supplier: Supplier | null; createdBy: User; voidedBy: User | null; attachments: AttachmentInfo[] };

/** Eine Buchung als Karte (Handy) bzw. Zeile (Desktop): was, wohin, wer, wann – storniert = durchgestrichen mit Grund. */
export function MovementRow({ m, locations, canWrite, copyHref }: { m: MovementFull; locations: Location[]; canWrite: boolean; copyHref?: string }) {
  const place = (l: Location | null, state: string | null) => (l ? `${pathName(locations, l.id)}${m.article.returnable && state ? ` (${STATE_LABEL[state as "FULL" | "EMPTY"]})` : ""}` : null);
  const from = place(m.fromLocation, m.fromState);
  const to = place(m.toLocation, m.toState);
  const voided = Boolean(m.voidedAt);
  return (
    <li className={cn("card p-4", voided && "opacity-70")}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className={cn("min-w-0", voided && "line-through decoration-danger/60")}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="chip-muted">{KIND_LABEL[m.kind]}</span>
            <Link href={`/artikel/${m.articleId}`} className="font-semibold text-heading hover:underline">{m.kind === "ADJUST" && !m.fromLocationId ? "+" : m.kind === "ADJUST" ? "−" : ""}{fmtQty(m.quantity, m.article.unit)} {m.article.name}</Link>
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
            {from && <span>{from}</span>}
            {from && to && <ArrowRight className="size-3.5" />}
            {to && <span>{to}</span>}
            {!to && from && m.kind !== "TRANSFER" && <span>({m.kind === "CONSUME" && m.article.returnable ? "wird Leergut" : "weg"})</span>}
            {m.supplier && <span>· von {m.supplier.name}</span>}
          </p>
          {m.note && <p className="mt-1 text-sm">{m.note}</p>}
        </div>
        <div className="text-right text-xs text-muted-foreground">
          <p>{fmtDateTime(m.occurredAt)}</p>
          <p>{m.createdBy.displayName}{m.source === "quick" ? " · Schnellerfassung" : m.source === "plan" ? " · aus Plan" : ""}</p>
        </div>
      </div>
      {voided && <p className="mt-2 rounded-lg bg-danger/10 p-2 text-xs text-danger">Storniert{m.voidedBy ? ` von ${m.voidedBy.displayName}` : ""}{m.voidedAt ? ` am ${fmtDateTime(m.voidedAt)}` : ""}: {m.voidReason}</p>}
      <Attachments movementId={m.id} items={m.attachments} canWrite={canWrite && !voided} />
      {canWrite && !voided && (
        <div className="mt-3 flex flex-wrap items-start gap-2">
          <VoidForm id={m.id} />
          {copyHref && <Link href={copyHref} className="btn-secondary btn-sm">Als Vorlage</Link>}
        </div>
      )}
    </li>
  );
}
