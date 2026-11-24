"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { NOT_ALLOWED, fail, type ActionResult } from "@/lib/action-result";
import { ROLES } from "@/lib/roles";
import type { Role } from "@/lib/roles";
import { actionUser } from "@/lib/session";
import { createUser, setActive, setRole, signOutEverywhere } from "@/services/users";

const id = z.uuid();
const done = (message: string): ActionResult => { revalidatePath("/admin"); return { ok: true, message, nonce: Date.now() }; };

export async function userCreateAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const admin = await actionUser("admin");
  if (!admin) return NOT_ALLOWED;
  const p = z.object({ displayName: z.string().max(120), email: z.string().max(200), role: z.enum(ROLES as [string, ...string[]]) }).safeParse(Object.fromEntries(fd));
  if (!p.success) return fail("Bitte Name, E-Mail und Rolle angeben.");
  const r = await createUser(admin, { displayName: p.data.displayName, email: p.data.email, role: p.data.role as Role });
  return r.ok ? done("Person eingetragen. Beim ersten Microsoft-Login wird sie automatisch verknüpft.") : fail(r.error);
}

export async function userUpdateAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const admin = await actionUser("admin");
  if (!admin) return NOT_ALLOWED;
  const uid = id.safeParse(fd.get("id"));
  if (!uid.success) return fail("Person nicht gefunden.");
  const op = String(fd.get("op"));
  const r =
    op === "role" ? await setRole(admin, uid.data, String(fd.get("role")) as Role)
    : op === "deactivate" ? await setActive(admin, uid.data, false)
    : op === "activate" ? await setActive(admin, uid.data, true)
    : op === "signout" ? await signOutEverywhere(admin, uid.data)
    : ({ ok: false, error: "Unbekannte Aktion." } as const);
  return r.ok ? done("Gespeichert.") : fail(r.error);
}
