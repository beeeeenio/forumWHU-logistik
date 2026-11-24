"use client";

import { Check, Trash2, X } from "lucide-react";
import { startTransition, useActionState } from "react";
import { planCancelAction, planDoneAction } from "@/app/actions/book";
import { Feedback } from "./action-form";

/** Erledigt (bucht die Umlagerung), Absagen oder Löschen. Reicht der Bestand nicht, kann man trotzdem erledigen. */
export function PlanActions({ id }: { id: string }) {
  const [done, doneAction, donePending] = useActionState(planDoneAction, null);
  const [other, otherAction, otherPending] = useActionState(planCancelAction, null);
  const run = (action: (fd: FormData) => void, extra: Record<string, string> = {}) => {
    const fd = new FormData();
    fd.set("id", id);
    for (const [k, v] of Object.entries(extra)) fd.set(k, v);
    startTransition(() => action(fd));
  };
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={donePending} onClick={() => run(doneAction)} className="btn-primary btn-sm"><Check className="size-4" />{donePending ? "Buche …" : "Erledigt – jetzt buchen"}</button>
        <button type="button" disabled={otherPending} onClick={() => run(otherAction)} className="btn-secondary btn-sm"><X className="size-4" />Absagen</button>
        <button type="button" disabled={otherPending} onClick={() => { if (window.confirm("Plan endgültig löschen?")) run(otherAction, { mode: "delete" }); }} className="btn-secondary btn-sm text-danger" aria-label="Plan löschen"><Trash2 className="size-4" /></button>
      </div>
      <Feedback result={done} />
      {done?.code === "INSUFFICIENT" && <button type="button" onClick={() => run(doneAction, { force: "1" })} className="btn-danger btn-sm">Trotzdem buchen</button>}
      <Feedback result={other} />
    </div>
  );
}
