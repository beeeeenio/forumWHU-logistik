import Link from "next/link";
import { ImportUpload } from "@/components/import-upload";
import { requireWriter } from "@/lib/session";

export const metadata = { title: "Excel-Import" };

export default async function ImportPage() {
  await requireWriter();
  return (
    <div className="page max-w-3xl space-y-5">
      <div>
        <h1 className="h1">Excel-Import</h1>
        <p className="text-sm text-muted-foreground">Listen aus Excel oder CSV übernehmen: Bestand, Artikel, Lagerorte, Lieferanten. Danach ordnest du die Spalten der Datei den Feldern zu (wie bei Pipedrive). <strong>Es gibt keine Pflichtfelder</strong>: Was fehlt, bekommt einen Standardwert, und du siehst vor dem Import genau, was passiert.</p>
      </div>
      <ImportUpload />
      <p className="text-sm text-muted-foreground">Bestandsimporte kannst du später unter <Link href="/inventur/verlauf" className="underline">Inventur → Verlauf</Link> komplett zurücknehmen. Stammdaten-Importe (Artikel, Orte, Lieferanten) lassen sich nicht zurücknehmen, prüfe deshalb die Vorschau.</p>
    </div>
  );
}
