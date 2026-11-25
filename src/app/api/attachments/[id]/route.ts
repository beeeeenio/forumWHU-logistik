import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/db/prisma";
import { actionUser, getSessionUser } from "@/lib/session";
import { removeAttachment } from "@/services/attachments";

export const dynamic = "force-dynamic";

/** Anhang ansehen/herunterladen: nur angemeldete Personen; Typ aus den geprüften Bytes, nie ausführbar (nosniff + sandbox). */
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/attachments/[id]">) {
  if (!(await getSessionUser())) return new NextResponse("Nicht angemeldet", { status: 401 });
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new NextResponse("Nicht gefunden", { status: 404 });
  const a = await prisma.movementAttachment.findUnique({ where: { id } });
  if (!a) return new NextResponse("Nicht gefunden", { status: 404 });
  return new NextResponse(new Uint8Array(a.data), {
    headers: {
      "Content-Type": a.mime,
      "Content-Length": String(a.size),
      "Content-Disposition": `${a.mime === "application/pdf" ? "attachment" : "inline"}; filename="${a.filename.replace(/[^\w.\- ]/g, "_")}"`,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox; default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'",
      "Cache-Control": "private, no-store",
    },
  });
}

export async function DELETE(req: NextRequest, ctx: RouteContext<"/api/attachments/[id]">) {
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(process.env.APP_URL!).origin) return NextResponse.json({ error: "Nicht erlaubt." }, { status: 403 });
  const user = await actionUser("write");
  if (!user) return NextResponse.json({ error: "Keine Berechtigung." }, { status: 401 });
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return NextResponse.json({ error: "Nicht gefunden." }, { status: 404 });
  const r = await removeAttachment(user, id);
  return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: 404 });
}
