"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";
import { THEME_KEY } from "@/lib/theme-script";

type Theme = "system" | "light" | "dark";

function read(): Theme {
  try { const v = localStorage.getItem(THEME_KEY); return v === "light" || v === "dark" ? v : "system"; } catch { return "system"; }
}
function apply(t: Theme) {
  const dark = t === "dark" || (t === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}
const listeners = new Set<() => void>();
const subscribe = (cb: () => void) => { listeners.add(cb); return () => listeners.delete(cb); };

/** Darstellung: System, Hell, Dunkel. Gespeichert nur im Browser. */
export function ThemeToggle({ className }: { className?: string }) {
  const theme = useSyncExternalStore(subscribe, read, () => "system" as Theme);
  const set = (t: Theme) => { try { localStorage.setItem(THEME_KEY, t); } catch { /* privater Modus */ } apply(t); listeners.forEach((l) => l()); };
  const items: { t: Theme; icon: typeof Sun; label: string }[] = [{ t: "system", icon: Monitor, label: "System" }, { t: "light", icon: Sun, label: "Hell" }, { t: "dark", icon: Moon, label: "Dunkel" }];
  return (
    <div role="radiogroup" aria-label="Darstellung" className={className ?? "inline-flex rounded-xl border bg-card p-1"}>
      {items.map(({ t, icon: Icon, label }) => (
        <button key={t} type="button" role="radio" aria-checked={theme === t} aria-label={label} onClick={() => set(t)}
          className={`flex min-h-9 min-w-9 items-center justify-center rounded-lg px-2 text-xs ${theme === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-heading"}`}>
          <Icon className="size-4" />
        </button>
      ))}
    </div>
  );
}
