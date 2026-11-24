import { NextResponse, type NextRequest } from "next/server";
import { ATTACHMENT_MAX_BYTES } from "@/lib/domain/file-sniff";
import { actionUser } from "@/lib/session";
import { addAttachment } from "@/services/attachments";

export const dynamic = "force-dynamic";

/** Foto/PDF an eine Buchung hängen (multipart, Feld „file“). Nur Mitglieder/Admins, nur von der eigenen Seite. */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/movements/[id]/attachments">) {
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(process.env.APP_URL!).origin) return NextResponse.json({ error: "Nicht erlaubt." }, { status: 403 });
  const user = await actionUser("write");
  if (!user) return NextResponse.json({ error: "Nicht angemeldet oder keine Berechtigung." }, { status: 401 });
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return NextResponse.json({ error: "Buchung nicht gefunden." }, { status: 404 });
  if (Number(req.headers.get("content-length") ?? 0) > ATTACHMENT_MAX_BYTES + 100_000) return NextResponse.json({ error: "Die Datei ist zu groß." }, { status: 413 });
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Keine Datei erhalten." }, { status: 400 });
  const r = await addAttachment(user, id, { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) });
  return r.ok ? NextResponse.json({ ok: true, id: r.id }) : NextResponse.json({ error: r.error }, { status: 400 });
}
