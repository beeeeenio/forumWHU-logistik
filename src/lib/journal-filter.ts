import { MOVEMENT_KINDS } from "./domain/rules";
import { fromBerlinInput } from "./time";
import type { JournalFilter } from "@/services/reports";

const UUID = /^[0-9a-f-]{36}$/;
type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

/** Journal-Filter aus der Adresse (Seite und CSV-Export nutzen dasselbe). Ungültiges wird ignoriert. */
export function parseJournalFilter(sp: SP): JournalFilter & { fromStr: string; toStr: string } {
  const articleId = one(sp.article);
  const locationId = one(sp.location);
  const kind = one(sp.kind);
  const userId = one(sp.user);
  const fromStr = /^\d{4}-\d{2}-\d{2}$/.test(one(sp.from) ?? "") ? one(sp.from)! : "";
  const toStr = /^\d{4}-\d{2}-\d{2}$/.test(one(sp.to) ?? "") ? one(sp.to)! : "";
  const from = fromStr ? fromBerlinInput(`${fromStr}T00:00`) : null;
  // „bis“ ist inklusiv: bis zum Ende dieses Tages = Beginn des nächsten Kalendertags (Berliner Zeit)
  const to = toStr ? fromBerlinInput(`${nextDay(toStr)}T00:00`) : null;
  return {
    articleId: articleId && UUID.test(articleId) ? articleId : undefined,
    locationId: locationId && UUID.test(locationId) ? locationId : undefined,
    kind: kind && (MOVEMENT_KINDS as string[]).includes(kind) ? kind : undefined,
    userId: userId && UUID.test(userId) ? userId : undefined,
    from,
    to,
    includeVoided: one(sp.voided) === "1",
    page: Math.max(1, parseInt(one(sp.page) ?? "1", 10) || 1),
    fromStr,
    toStr,
  };
}

function nextDay(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}
