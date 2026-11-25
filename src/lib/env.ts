import "server-only";
import { z } from "zod";

// Alle Einstellungen aus der Umgebung (.env bzw. Compose), nie aus dem Code.
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1),
  APP_URL: z.string().url(),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET muss mindestens 32 Zeichen lang sein (openssl rand -base64 48)"),
  SESSION_TTL_HOURS: z.coerce.number().int().positive().default(12),
  TRUST_PROXY: z.enum(["true", "false"]).default("false").transform((v) => v === "true"),
  /** "microsoft" = Entra ID (Produktion). "development" = Anmeldung per Klick, nur lokal. */
  AUTH_MODE: z.enum(["microsoft", "development"]).default("microsoft"),
  MICROSOFT_CLIENT_ID: z.string().optional(),
  MICROSOFT_CLIENT_SECRET: z.string().optional(),
  MICROSOFT_TENANT_ID: z.string().optional(),
  MICROSOFT_REDIRECT_URI: z.string().url().optional(),
  /** Eingehender Webhook (Teams Workflows / Slack) für Warnungen. Leer = keine Benachrichtigung. */
  NOTIFY_WEBHOOK_URL: z.string().url().refine((u) => u.startsWith("https://"), "NOTIFY_WEBHOOK_URL muss https sein").optional().or(z.literal("").transform(() => undefined)),
  /** Geheimnis für POST /api/cron/alerts (Cron auf dem Server). Mindestens 24 Zeichen. */
  CRON_SECRET: z.string().min(24).optional().or(z.literal("").transform(() => undefined)),
});

export type Env = z.infer<typeof schema>;
let cached: Env | undefined;

export function env(): Env {
  if (!cached) {
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) {
      throw new Error("Ungültige Umgebung: " + parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
    }
    const e = parsed.data;
    // Der Klick-Login ohne Passwort darf es in Produktion niemals geben.
    if (e.NODE_ENV === "production" && e.AUTH_MODE !== "microsoft") throw new Error("AUTH_MODE=development ist in Produktion verboten.");
    if (e.NODE_ENV === "production" && !e.TRUST_PROXY) throw new Error("TRUST_PROXY=true ist in Produktion nötig (hinter dem Caddy), sonst teilen sich alle Anfragen ein gemeinsames Rate-Limit.");
    if (e.NODE_ENV === "production" && /dev-only|change-me|placeholder/i.test(e.SESSION_SECRET)) throw new Error("SESSION_SECRET ist ein Platzhalter – bitte ein eigenes Geheimnis setzen.");
    cached = e;
  }
  return cached;
}

/** Klick-Login (nur lokal, nie in Produktion). */
export function devLoginEnabled(): boolean {
  const e = env();
  return e.AUTH_MODE === "development" && e.NODE_ENV !== "production";
}
