"use server";

import { revalidatePath } from "next/cache";
import { NOT_ALLOWED, fail, type ActionResult } from "@/lib/action-result";
import { actionUser } from "@/lib/session";
import { seedDefaultLocations } from "@/services/setup";

export async function seedLocationsAction(): Promise<ActionResult> {
  const user = await actionUser("write");
  if (!user) return NOT_ALLOWED;
  const r = await seedDefaultLocations(user.id);
  if (!r.created) return fail("Es gibt schon Lagerorte.");
  revalidatePath("/", "layout");
  return { ok: true, message: `${r.created} Lagerorte angelegt.`, nonce: Date.now() };
}
