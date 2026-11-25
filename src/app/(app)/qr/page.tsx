import { Printer } from "lucide-react";
import Link from "next/link";
import { prisma } from "@/db/prisma";
import { PrintButton } from "@/components/print-button";
import { buildTree, flatten, pathName } from "@/lib/domain/tree";
import { requireUser } from "@/lib/session";
import { locationUrl, qrSvg } from "@/services/qr";

export const metadata = { title: "QR-Etiketten" };

/** Druckseite: ein Etikett je Lagerort (QR öffnet den Ort in der App). `?ids=a,b` oder `?sites=1` (nur Räume) schränkt ein. */
export default async function QrPage({ searchParams }: PageProps<"/qr">) {
  await requireUser();
  const sp = await searchParams;
  const locations = await prisma.location.findMany();
  const idsParam = typeof sp.ids === "string" ? sp.ids.split(",").filter((x) => /^[0-9a-f-]{36}$/.test(x)) : [];
  const all = flatten(buildTree(locations.filter((l) => !l.archivedAt))).map((n) => n.loc);
  const chosen = idsParam.length ? all.filter((l) => idsParam.includes(l.id)) : all;
  const labels = await Promise.all(chosen.map(async (l) => ({ loc: l, svg: await qrSvg(locationUrl(l.id)) })));
  return (
    <div className="page space-y-5 overflow-x-clip">
      <div className="flex flex-wrap items-end justify-between gap-3 print:hidden">
        <div><h1 className="h1">QR-Etiketten</h1><p className="text-sm text-muted-foreground">Ausdrucken, laminieren, an die Tür oder das Regal kleben. Scannen öffnet den Ort: Inhalt sehen, Eingang buchen, umlagern, Inventur. Nur eingeloggte Teammitglieder sehen etwas.</p></div>
        <PrintButton><Printer className="size-4" />Drucken</PrintButton>
      </div>
      {labels.length === 0 ? <p>Keine Lagerorte.</p> : (
        <ul className="grid grid-cols-2 gap-4 print:grid-cols-2 print:gap-3 lg:grid-cols-3">
          {labels.map(({ loc, svg }) => (
            <li key={loc.id} className="break-inside-avoid rounded-2xl border bg-white p-4 text-center text-[#061638] print:rounded-none print:border-black">
              <div className="mx-auto w-full max-w-[220px]" dangerouslySetInnerHTML={{ __html: svg }} />
              <p className="mt-2 font-heading text-2xl leading-tight">{loc.name}</p>
              {loc.code && loc.code !== loc.name && <p className="text-lg font-semibold">{loc.code}</p>}
              <p className="text-xs text-[#666]">{pathName(locations, loc.id)}</p>
              <p className="mt-1 text-[10px] tracking-widest text-[#666] uppercase">forumWHU Logistik · scannen</p>
            </li>
          ))}
        </ul>
      )}
      <p className="text-sm print:hidden"><Link href="/stammdaten" className="underline">Zurück zu Stammdaten</Link></p>
    </div>
  );
}
