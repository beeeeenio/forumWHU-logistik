import { NextResponse, type NextRequest } from "next/server";
import { safeEqual } from "@/lib/crypto";
import { env } from "@/lib/env";
import { rateLimit } from "@/lib/rate-limit";
import { notifyAlerts } from "@/services/notify";

export const dynamic = "force-dynamic";

/** Für Cron auf dem Server: `curl -X POST -H "Authorization: Bearer $CRON_SECRET" http://127.0.0.1:3200/api/cron/alerts`. Ohne CRON_SECRET gibt es den Endpunkt nicht. */
export async function POST(req: NextRequest) {
  const secret = env().CRON_SECRET;
  if (!secret) return new NextResponse(null, { status: 404 });
  // Erst das Geheimnis prüfen, dann begrenzen: sonst könnte jemand mit falschem Token den echten Aufruf aussperren
  const given = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!given || !safeEqual(given, secret)) return new NextResponse(null, { status: 401 });
  const rl = rateLimit("cron-alerts", 30, 60_000);
  if (!rl.ok) return new NextResponse("Zu viele Anfragen.", { status: 429 });
  return NextResponse.json(await notifyAlerts());
}
