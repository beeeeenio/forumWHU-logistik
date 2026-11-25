import { ChevronRight, Snowflake, Truck } from "lucide-react";
import Link from "next/link";
import { isCooled } from "@/lib/domain/tree";
import type { Location } from "@/generated/prisma/client";
import type { LageNode } from "@/services/reports";
import { ArticleLink, Qty } from "./stock-ui";

function NodeBody({ node, locations }: { node: LageNode; locations: Location[] }) {
  const cold = isCooled(locations, node.loc.id);
  return (
    <>
      {node.items.length > 0 && (
        <ul className="divide-y">
          {node.items.map((it) => (
            <li key={it.article.id} className="flex items-center justify-between gap-3 py-2.5">
              <ArticleLink article={it.article} cold={cold} />
              <Qty article={it.article} full={it.full} empty={it.empty} />
            </li>
          ))}
        </ul>
      )}
      {node.children.filter((c) => c.positions > 0).map((c) => (
        <div key={c.loc.id} className="mt-3 border-l-2 border-primary/50 pl-3">
          <LocHeader node={c} locations={locations} small />
          <NodeBody node={c} locations={locations} />
        </div>
      ))}
    </>
  );
}

function LocHeader({ node, locations, small }: { node: LageNode; locations: Location[]; small?: boolean }) {
  const cold = isCooled(locations, node.loc.id);
  return (
    <Link href={`/orte/${node.loc.id}`} className="group flex min-h-11 items-center justify-between gap-2">
      <span className="flex min-w-0 items-center gap-2">
        {node.loc.kind === "TRAILER" ? <Truck className="size-4 shrink-0 text-muted-foreground" /> : cold ? <Snowflake className="size-4 shrink-0 text-sky-600 dark:text-sky-300" aria-label="gekühlt" /> : null}
        <span className={small ? "font-medium text-heading" : "font-heading text-lg text-heading"}>{node.loc.name}</span>
        {node.loc.code && node.loc.code !== node.loc.name && <span className="chip-muted">{node.loc.code}</span>}
        {node.loc.archivedAt && <span className="chip-warn">archiviert</span>}
      </span>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

/** Der Lagebericht als Baum: pro Ort, was gerade da ist. Leere Orte werden nur im Ortsbaum der Stammdaten gezeigt. */
export function LageTree({ nodes, locations }: { nodes: LageNode[]; locations: Location[] }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {nodes.filter((n) => n.positions > 0).map((n) => (
        <section key={n.loc.id} className="card p-4">
          <LocHeader node={n} locations={locations} />
          <div className="mt-2"><NodeBody node={n} locations={locations} /></div>
        </section>
      ))}
    </div>
  );
}
