import Link from "next/link";
import { requireUser } from "@/lib/session";

export const metadata = { title: "Keine Berechtigung" };

export default async function Page() {
  await requireUser();
  return (
    <div className="page max-w-xl space-y-4">
      <h1 className="h1">Das darfst du hier nicht</h1>
      <p>Mit deiner Rolle (Betrachter) kannst du alles ansehen, aber nichts ändern. Wenn du Ware erfassen oder umlagern sollst, bitte eine Administratorin oder einen Administrator, deine Rolle auf „Mitglied“ zu setzen.</p>
      <Link href="/" className="btn-primary">Zurück zur Lage</Link>
    </div>
  );
}
