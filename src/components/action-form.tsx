"use client";

import { createContext, startTransition, useContext, useActionState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { ActionResult } from "@/lib/action-result";

const PendingCtx = createContext(false);

/**
 * Formular für Server-Aktionen mit Rückmeldung. Eingaben bleiben bei einem Fehler stehen (React würde sie sonst zurücksetzen);
 * nach einem Erfolg wird das Formular geleert. Optional mit Rückfrage (`confirm`) vor dem Absenden.
 */
export function ActionForm({ action, children, className, confirm, keepOnSuccess = false, hideMessage = false }: {
  action: (prev: ActionResult | null, fd: FormData) => Promise<ActionResult>;
  children: ReactNode;
  className?: string;
  confirm?: string;
  keepOnSuccess?: boolean;
  hideMessage?: boolean;
}) {
  const [result, formAction, pending] = useActionState(action, null);
  return (
    <PendingCtx.Provider value={pending}>
      <form
        key={keepOnSuccess ? undefined : (result?.ok ? result.nonce : undefined)}
        className={className}
        onSubmit={(e) => {
          e.preventDefault();
          if (confirm && !window.confirm(confirm)) return;
          const fd = new FormData(e.currentTarget);
          const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
          if (submitter?.name) fd.set(submitter.name, submitter.value);
          startTransition(() => formAction(fd));
        }}
      >
        {children}
        {!hideMessage && <Feedback result={result} />}
      </form>
    </PendingCtx.Provider>
  );
}

export function Feedback({ result, className }: { result: ActionResult | null; className?: string }) {
  if (!result) return null;
  return (
    <div className={cn("mt-3 space-y-2", className)} role={result.ok ? "status" : "alert"} aria-live="polite">
      {result.error && <p className="rounded-xl bg-danger/10 p-3 text-sm text-danger">{result.error}</p>}
      {result.ok && result.message && <p className="rounded-xl bg-ok/10 p-3 text-sm text-ok">{result.message}</p>}
      {result.warnings?.map((w, i) => <p key={i} className="rounded-xl bg-warn/10 p-3 text-sm text-warn">{w}</p>)}
    </div>
  );
}

export function SubmitButton({ children, className = "btn-primary", pendingText = "Einen Moment …", name, value }: { children: ReactNode; className?: string; pendingText?: string; name?: string; value?: string }) {
  const pending = useContext(PendingCtx);
  return <button type="submit" name={name} value={value} disabled={pending} className={className}>{pending ? pendingText : children}</button>;
}
