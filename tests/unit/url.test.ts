import { test } from "node:test";
import assert from "node:assert/strict";
import { safeReturnTo } from "../../src/lib/url.ts";

test("Rücksprungziel: nur interne Pfade", () => {
  assert.equal(safeReturnTo("/orte/123"), "/orte/123");
  assert.equal(safeReturnTo("/journal?article=1&page=2"), "/journal?article=1&page=2");
  assert.equal(safeReturnTo("/"), "/");
});

test("Rücksprungziel: Umgehungsversuche werden abgelehnt (Open Redirect)", () => {
  for (const bad of ["//evil.com", "/\\evil.com", "/\t/evil.com", "/\n/evil.com", "/\r/evil.com", "/ /evil.com", "https://evil.com", "evil.com", "", "javascript:alert(1)", "/ /evil.com", "/" + "a".repeat(400)]) {
    assert.equal(safeReturnTo(bad), null, JSON.stringify(bad));
  }
  assert.equal(safeReturnTo(null), null);
  assert.equal(safeReturnTo(undefined), null);
});
