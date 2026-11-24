import { env } from "@/lib/env";

/** Client-IP nur hinter einem vertrauenswürdigen Proxy (TRUST_PROXY=true); der rechteste X-Forwarded-For-Eintrag zählt. */
export function clientIp(h: Headers): string | null {
  if (!env().TRUST_PROXY) return null;
  const parts = (h.get("x-forwarded-for") ?? "").split(",").map((p) => p.trim()).filter(Boolean);
  return parts.at(-1)?.slice(0, 64) ?? h.get("x-real-ip")?.trim().slice(0, 64) ?? null;
}
