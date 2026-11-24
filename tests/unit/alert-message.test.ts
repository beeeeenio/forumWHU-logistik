import { test } from "node:test";
import assert from "node:assert/strict";
import { alertFingerprint, buildAlertMessage } from "../../src/lib/domain/alert-message.ts";

const a = (level: "error" | "warn" | "info", text: string) => ({ level, text });

test("Nachricht nur bei Fehlern/Warnungen, Infos zählen nicht", () => {
  assert.equal(buildAlertMessage([a("info", "bald fällig")], "https://x"), null);
  const m = buildAlertMessage([a("error", "Minus"), a("warn", "Kühlung"), a("info", "bald")], "https://x")!;
  assert.ok(m.includes("2 Hinweise") && m.includes("🔴 Minus") && m.includes("🟠 Kühlung") && !m.includes("bald") && m.endsWith("https://x"));
});

test("Kürzung bei vielen Hinweisen", () => {
  const many = Array.from({ length: 20 }, (_, i) => a("warn", `w${i}`));
  assert.ok(buildAlertMessage(many, "u", 15)!.includes("und 5 weitere"));
});

test("Fingerabdruck unabhängig von der Reihenfolge, Infos ignoriert", () => {
  assert.equal(alertFingerprint([a("warn", "x"), a("error", "y")]), alertFingerprint([a("error", "y"), a("warn", "x"), a("info", "z")]));
  assert.notEqual(alertFingerprint([a("warn", "x")]), alertFingerprint([a("warn", "x2")]));
});
