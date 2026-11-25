import { Snowflake } from "lucide-react";
import Link from "next/link";
import type { Article } from "@/generated/prisma/client";
import { fmtQty } from "@/lib/format";
import { cn } from "@/lib/utils";

/** „46 Kisten“ (rot bei Minus) + „20 leer“ bei Pfandartikeln. Nullwerte werden ausgeblendet. */
export function Qty({ article, full, empty }: { article: Pick<Article, "unit" | "returnable">; full: number; empty: number }) {
  return (
    <span className="flex flex-wrap items-center justify-end gap-1.5">
      {(full !== 0 || empty === 0) && <span className={cn("font-semibold tabular-nums", full < 0 ? "text-danger" : "text-heading")}>{fmtQty(full, article.unit)}{article.returnable && <span className="ml-1 text-xs font-normal text-muted-foreground">voll</span>}</span>}
      {empty !== 0 && <span className={cn("chip", empty < 0 ? "border-danger/40 bg-danger/10 text-danger" : "bg-muted text-muted-foreground")}>{empty.toLocaleString("de-DE")} leer</span>}
    </span>
  );
}

export function ArticleLink({ article, cold }: { article: Pick<Article, "id" | "name" | "needsCooling">; cold?: boolean }) {
  return (
    <Link href={`/artikel/${article.id}`} className="inline-flex min-h-11 items-center gap-1.5 font-medium text-heading hover:underline">
      {article.name}
      {article.needsCooling && <Snowflake className={cn("size-3.5", cold === false ? "text-warn" : "text-muted-foreground")} aria-label="kühlpflichtig" />}
    </Link>
  );
}

export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="card border-dashed p-6 text-center">
      <p className="font-medium text-heading">{title}</p>
      {children && <div className="mt-2 text-sm text-muted-foreground">{children}</div>}
    </div>
  );
}
