"use client";

import { useState, useTransition } from "react";
import { seedLocationsAction } from "@/app/actions/setup";
import type { ActionResult } from "@/lib/action-result";
import { Feedback } from "./action-form";

export function SeedButton() {
  const [pending, start] = useTransition();
  const [res, setRes] = useState<ActionResult | null>(null);
  return (
    <div>
      <button className="btn-primary" disabled={pending} onClick={() => start(async () => setRes(await seedLocationsAction()))}>{pending ? "Lege an …" : "Start-Lagerorte anlegen"}</button>
      <Feedback result={res} />
    </div>
  );
}
