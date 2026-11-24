/* eslint-disable @next/next/no-img-element -- Microsoft-Logo als statische Datei */
import { redirect } from "next/navigation";
import { prisma } from "@/db/prisma";
import { Brand } from "@/components/brand";
import { devLoginEnabled } from "@/lib/env";
import { LOGIN_ERRORS } from "@/lib/login-errors";
import { ROLE_LABEL } from "@/lib/roles";
import { getSessionUser } from "@/lib/session";

export const metadata = { title: "Anmelden" };
export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  if (await getSessionUser()) redirect("/");
  const { error, returnTo } = await searchParams;
  const code = typeof error === "string" ? error : undefined;
  const text = code ? (LOGIN_ERRORS[code] ?? LOGIN_ERRORS.unknown) : undefined;
  const href = `/api/auth/microsoft/login${typeof returnTo === "string" ? `?returnTo=${encodeURIComponent(returnTo)}` : ""}`;
  const devUsers = devLoginEnabled() ? await prisma.user.findMany({ where: { status: { not: "DEACTIVATED" } }, orderBy: { displayName: "asc" } }) : [];
  return (
    <main className="flex min-h-dvh flex-1 items-center justify-center bg-navy p-5">
      <div className="card w-full max-w-sm p-7">
        <Brand tone="surface" height={40} className="mb-7" />
        <h1 className="mb-1 text-2xl">Willkommen</h1>
        <p className="mb-6 text-sm text-muted-foreground">Melde dich mit deinem Microsoft-Konto an.</p>
        {text && <div role="alert" className="mb-5 rounded-xl bg-danger/10 p-4 text-sm text-danger">{text}</div>}
        <a href={href} className="btn-primary w-full gap-3">
          <span className="flex size-6 items-center justify-center rounded bg-white"><img src="/brand/microsoft-logo.svg" alt="" width={16} height={16} /></span>
          Mit Microsoft anmelden
        </a>
        {devUsers.length > 0 && (
          <div className="mt-6 rounded-xl border border-dashed border-warn/60 p-3">
            <p className="mb-2 text-xs font-medium text-warn">Nur lokale Entwicklung: Anmeldung per Klick</p>
            <div className="flex flex-col gap-2">
              {devUsers.map((u) => (
                <form key={u.id} action="/api/auth/dev-login" method="post">
                  <input type="hidden" name="userId" value={u.id} />
                  <button className="btn-secondary w-full justify-between text-left"><span>{u.displayName}</span><span className="chip-muted">{ROLE_LABEL[u.role]}</span></button>
                </form>
              ))}
            </div>
          </div>
        )}
        <p className="mt-6 text-xs text-muted-foreground">Zugang nur für eingetragene Teammitglieder. Fehlt dein Zugang, wende dich an das Logistik-Team.</p>
      </div>
    </main>
  );
}
