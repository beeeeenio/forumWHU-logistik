import { notFound } from "next/navigation";
import { ImportWizard } from "@/components/import-wizard";
import { guessColumns, IMPORT_KINDS } from "@/lib/import/fields";
import { detectHeaderRow } from "@/lib/import/parse";
import { requireWriter } from "@/lib/session";
import { getDraft } from "@/services/import";

export const metadata = { title: "Import zuordnen" };

export default async function ImportDraftPage({ params }: PageProps<"/import/[id]">) {
  const user = await requireWriter();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const draft = await getDraft(user, id);
  if (!draft) notFound();
  // Zum Anzeigen reichen die ersten Zeilen; die komplette Datei bleibt auf dem Server
  const sheets = draft.sheets.map((s) => {
    const headerRow = detectHeaderRow(s.rows);
    return { name: s.name, hidden: s.hidden, total: s.rows.length, rows: s.rows.slice(0, 40), rowNumbers: s.rowNumbers.slice(0, 40), headerRow, guess: guessColumns(draft.kind, s.rows[headerRow] ?? []) };
  });
  return (
    <div className="page max-w-4xl space-y-5">
      <div>
        <p className="text-sm text-muted-foreground">Excel-Import · {IMPORT_KINDS[draft.kind].label}</p>
        <h1 className="h1">Spalten zuordnen</h1>
        <p className="text-sm text-muted-foreground">Datei: {draft.fileName}</p>
      </div>
      <ImportWizard draftId={draft.id} kind={draft.kind} sheets={sheets} />
    </div>
  );
}
