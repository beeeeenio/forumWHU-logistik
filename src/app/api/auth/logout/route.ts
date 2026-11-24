import { NextResponse, type NextRequest } from "next/server";
import { destroySession, getSessionUser } from "@/lib/session";
import { audit } from "@/services/audit";
import { appUrl } from "@/lib/url";

/** Abmelden: nur per POST und nur von der eigenen Seite (Same-Origin). */
export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(process.env.APP_URL!).origin) return new NextResponse(null, { status: 403 });
  const user = await getSessionUser();
  if (user) await audit("auth.logout", { userId: user.id });
  await destroySession();
  return NextResponse.redirect(appUrl("/login"), 303);
}
