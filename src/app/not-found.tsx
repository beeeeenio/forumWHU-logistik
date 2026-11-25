import Link from "next/link";

export const metadata = { title: "Nicht gefunden" };

export default function NotFound() {
  return (
    <div className="page max-w-xl space-y-4">
      <h1 className="h1">Seite nicht gefunden</h1>
      <p>Diese Seite oder dieser Eintrag existiert nicht (mehr). Vielleicht wurde der Ort oder Artikel archiviert oder gelöscht.</p>
      <Link href="/" className="btn-primary">Zur Lage</Link>
    </div>
  );
}
