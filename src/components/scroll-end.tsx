"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** Waagerecht scrollbarer Bereich, der beim Öffnen ganz nach rechts springt (neueste Tage zuerst sichtbar) und Wisch-Hinweis zeigt. */
export function ScrollEnd({ children, label }: { children: ReactNode; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { const el = ref.current; if (el) el.scrollLeft = el.scrollWidth; }, []);
  return (
    <div className="card overflow-hidden">
      <div ref={ref} className="overflow-x-auto" role="region" aria-label={label} tabIndex={0}>{children}</div>
      <p className="border-t px-3 py-1.5 text-center text-xs text-muted-foreground md:hidden">← nach links wischen für frühere Tage →</p>
    </div>
  );
}
