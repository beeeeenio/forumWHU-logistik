import { test } from "node:test";
import assert from "node:assert/strict";
import { safeFilename, sniffMime } from "../../src/lib/domain/file-sniff.ts";

const pad = (b: number[]) => Uint8Array.from([...b, ...new Array(16).fill(0)]);

test("Dateityp wird an den Bytes erkannt", () => {
  assert.equal(sniffMime(pad([0xff, 0xd8, 0xff, 0xe0])), "image/jpeg");
  assert.equal(sniffMime(pad([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), "image/png");
  assert.equal(sniffMime(Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0, 0])), "image/webp");
  assert.equal(sniffMime(pad([0x25, 0x50, 0x44, 0x46, 0x2d])), "application/pdf");
});

test("HTML, SVG und Unbekanntes werden abgelehnt", () => {
  const enc = (s: string) => new TextEncoder().encode(s.padEnd(20));
  assert.equal(sniffMime(enc("<html><script>alert(1)</script>")), null);
  assert.equal(sniffMime(enc("<svg xmlns='http://www.w3.org/2000/svg'>")), null);
  assert.equal(sniffMime(new Uint8Array(3)), null);
});

test("Dateiname: harmlos, Endung passend zum erkannten Typ", () => {
  assert.equal(safeFilename("../../Liefer schein.html", "application/pdf"), "Liefer schein.pdf");
  assert.equal(safeFilename("???", "image/jpeg"), "beleg.jpg");
});
