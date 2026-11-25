import { NextResponse, type NextRequest } from "next/server";
import { IMPORT_KIND_LIST, type ImportKind } from "@/lib/import/fields";
import { IMPORT_MAX_BYTES, ImportFileError, parseFile } from "@/lib/import/parse";
import { rateLimit } from "@/lib/rate-limit";
import { actionUser } from "@/lib/session";
import { createDraft } from "@/services/import";

export const dynamic = "force-dynamic";

/** Datei hochladen (multipart: file, kind). Es wird nur gelesen und als Entwurf zwischengespeichert – nichts angelegt. */
export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(process.env.APP_URL!).origin) return NextResponse.json({ error: "Nicht erlaubt." }, { status: 403 });
  const user = await actionUser("write");
  if (!user) return NextResponse.json({ error: "Nicht angemeldet oder keine Berechtigung." }, { status: 401 });
  const rl = rateLimit(`import-upload:${user.id}`, 10, 60_000);
  if (!rl.ok) return NextResponse.json({ error: `Zu viele Uploads – bitte ${rl.retryAfterSec} Sekunden warten.` }, { status: 429 });
  if (Number(req.headers.get("content-length") ?? 0) > IMPORT_MAX_BYTES + 200_000) return NextResponse.json({ error: "Die Datei ist zu groß (höchstens 10 MB)." }, { status: 413 });
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const kind = String(form?.get("kind") ?? "");
  if (!(file instanceof File)) return NextResponse.json({ error: "Keine Datei erhalten." }, { status: 400 });
  if (!(IMPORT_KIND_LIST as string[]).includes(kind)) return NextResponse.json({ error: "Bitte zuerst die Art des Imports wählen." }, { status: 400 });
  try {
    const wb = await parseFile({ name: file.name, data: Buffer.from(await file.arrayBuffer()) });
    return NextResponse.json({ id: await createDraft(user, kind as ImportKind, wb) });
  } catch (e) {
    if (e instanceof ImportFileError) return NextResponse.json({ error: e.message }, { status: 400 });
    console.error("import upload failed:", e instanceof Error ? e.name : "unknown");
    return NextResponse.json({ error: "Die Datei konnte nicht gelesen werden." }, { status: 400 });
  }
}
