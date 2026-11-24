import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/db/prisma";
import { devLoginEnabled } from "@/lib/env";
import { createSession } from "@/lib/session";
import { appUrl } from "@/lib/url";
import { audit } from "@/services/audit";

/** Nur lokal (AUTH_MODE=development, nie in Produktion): Anmeldung als eingetragene Person per Klick. */
export async function POST(req: NextRequest) {
  if (!devLoginEnabled()) return new NextResponse(null, { status: 404 });
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(process.env.APP_URL!).origin) return new NextResponse(null, { status: 403 });
  const form = await req.formData();
  const id = String(form.get("userId") ?? "");
  const user = await prisma.user.findUnique({ where: { id } }).catch(() => null);
  if (!user || user.status === "DEACTIVATED") return NextResponse.redirect(appUrl("/login?error=not_provisioned"), 303);
  const now = new Date();
  await prisma.user.update({ where: { id: user.id }, data: { status: "ACTIVE", lastLoginAt: now, lastSeenAt: now } });
  await createSession(user.id);
  await audit("auth.login", { userId: user.id, detail: { mode: "development" } });
  return NextResponse.redirect(appUrl("/"), 303);
}
