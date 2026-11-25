// Excel/CSV einlesen (Übernahme der bewährten Logik aus dem NFS-CRM): .xlsx und .csv/.txt, CSV als UTF-8 mit Windows-1252-Rückfall
// (deutsches Excel), Trennzeichen-Erkennung, echte Excel-Zeilennummern, versteckte Blätter markiert, Datumszellen als TT.MM.JJJJ.
// Grenzen gegen Missbrauch: 10 MB, 5000 Zeilen je Blatt, 200 Spalten, Zip-Bomben-Prüfung vor dem Entpacken.
import ExcelJS from "exceljs";
import Papa from "papaparse";

export const IMPORT_MAX_BYTES = 10 * 1024 * 1024;
export const IMPORT_MAX_ROWS = 5000;
export const IMPORT_MAX_COLUMNS = 200;
const IMPORT_MAX_UNCOMPRESSED_BYTES = 40 * 1024 * 1024;
/** Zellen je Blatt (Zeilen × Spalten): begrenzt den Speicherbedarf beim Einlesen, unabhängig von der Dateigröße. */
const IMPORT_MAX_CELLS = 250_000;
const HEADER_SCAN_ROWS = 20;
const MAX_COLLECTED_ROWS = IMPORT_MAX_ROWS + HEADER_SCAN_ROWS + 1;

export interface ParsedSheet { name: string; hidden: boolean; rows: string[][]; rowNumbers: number[] }
export interface ParsedWorkbook { fileName: string; sheets: ParsedSheet[] }
export class ImportFileError extends Error {}

const isBlankRow = (r: string[]) => r.every((c) => !c || !c.trim());

/** Zellwert als Text (Datum → TT.MM.JJJJ, Formel → Ergebnis, Rich-Text/Link → Text). */
export function cellToString(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? "" : `${String(v.getUTCDate()).padStart(2, "0")}.${String(v.getUTCMonth() + 1).padStart(2, "0")}.${v.getUTCFullYear()}`;
  if (typeof v === "object") {
    const o = v as { richText?: { text: string }[]; text?: unknown; result?: unknown; error?: unknown };
    if (Array.isArray(o.richText)) return o.richText.map((t) => t.text).join("").trim();
    if (o.result !== undefined) return cellToString(o.result);
    if (o.text !== undefined) return cellToString(o.text);
    if (o.error !== undefined) return "";
    return "";
  }
  return String(v).trim();
}

const CP1252: Record<number, number> = { 0x80: 0x20ac, 0x82: 0x201a, 0x83: 0x0192, 0x84: 0x201e, 0x85: 0x2026, 0x86: 0x2020, 0x87: 0x2021, 0x88: 0x02c6, 0x89: 0x2030, 0x8a: 0x0160, 0x8b: 0x2039, 0x8c: 0x0152, 0x8e: 0x017d, 0x91: 0x2018, 0x92: 0x2019, 0x93: 0x201c, 0x94: 0x201d, 0x95: 0x2022, 0x96: 0x2013, 0x97: 0x2014, 0x98: 0x02dc, 0x99: 0x2122, 0x9a: 0x0161, 0x9b: 0x203a, 0x9c: 0x0153, 0x9e: 0x017e, 0x9f: 0x0178 };

export function decodeText(buf: Uint8Array): string {
  try { return new TextDecoder("utf-8", { fatal: true }).decode(buf).replace(/^﻿/, ""); }
  catch { let out = ""; for (const b of buf) out += String.fromCharCode(b >= 0x80 && b <= 0x9f ? (CP1252[b] ?? b) : b); return out; }
}

function sheetFromGrid(name: string, hidden: boolean, grid: (string[] | undefined)[]): ParsedSheet {
  const rows: string[][] = [];
  const rowNumbers: number[] = [];
  grid.forEach((r, i) => { if (!r || isBlankRow(r)) return; rows.push(r); rowNumbers.push(i + 1); });
  return { name, hidden, rows, rowNumbers };
}

/** Summe der angegebenen entpackten Größen aus dem Zip-Verzeichnis, `null` bei ungewöhnlichem Zip. */
export function zipUncompressedSize(buf: Uint8Array): number | null {
  const b = Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength);
  const EOCD = 0x06054b50, CEN = 0x02014b50, minEocd = 22;
  if (b.length < minEocd) return null;
  let eocd = -1;
  for (let i = b.length - minEocd; i >= Math.max(0, b.length - minEocd - 0xffff); i--) if (b.readUInt32LE(i) === EOCD) { eocd = i; break; }
  if (eocd < 0) return null;
  const entries = b.readUInt16LE(eocd + 10);
  const cd = b.readUInt32LE(eocd + 16);
  if (entries === 0xffff || cd === 0xffffffff || cd >= b.length) return null;
  let total = 0, p = cd;
  for (let n = 0; n < entries; n++) {
    if (p + 46 > b.length || b.readUInt32LE(p) !== CEN) return null;
    const size = b.readUInt32LE(p + 24);
    if (size === 0xffffffff) return null;
    total += size;
    p += 46 + b.readUInt16LE(p + 28) + b.readUInt16LE(p + 30) + b.readUInt16LE(p + 32);
  }
  return total;
}

async function parseXlsx(buf: Buffer): Promise<ParsedSheet[]> {
  const unpacked = zipUncompressedSize(buf);
  if (unpacked === null) throw new ImportFileError("Die Datei konnte nicht gelesen werden – ist es wirklich eine .xlsx-Datei?");
  if (unpacked > IMPORT_MAX_UNCOMPRESSED_BYTES) throw new ImportFileError("Die Datei ist entpackt zu groß – bitte nur die benötigten Tabellenblätter speichern.");
  const wb = new ExcelJS.Workbook();
  try { await wb.xlsx.load(buf as unknown as ArrayBuffer); } catch { throw new ImportFileError("Die Datei konnte nicht gelesen werden – ist es wirklich eine .xlsx-Datei?"); }
  const sheets: ParsedSheet[] = [];
  wb.eachSheet((ws) => {
    if (ws.rowCount * Math.min(ws.columnCount, IMPORT_MAX_COLUMNS) > IMPORT_MAX_CELLS) throw new ImportFileError(`Das Blatt „${ws.name}“ ist zu groß (mehr als ${IMPORT_MAX_CELLS.toLocaleString("de-DE")} Zellen) – bitte nur die benötigten Zeilen und Spalten speichern.`);
    const grid: (string[] | undefined)[] = [];
    let collected = 0;
    ws.eachRow({ includeEmpty: false }, (row, n) => {
      if (collected >= MAX_COLLECTED_ROWS) return;
      const vals: string[] = [];
      row.eachCell({ includeEmpty: false }, (cell, c) => {
        if (c > IMPORT_MAX_COLUMNS) return;
        const v = cellToString(cell.value);
        if (v === "") return;
        while (vals.length < c - 1) vals.push("");
        vals[c - 1] = v;
      });
      if (!vals.length) return;
      grid[n - 1] = vals;
      collected++;
    });
    sheets.push(sheetFromGrid(ws.name, ws.state === "hidden" || ws.state === "veryHidden", grid));
  });
  return sheets;
}

export function detectDelimiter(text: string): string {
  const lines = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 20);
  let best = { d: ",", score: -1 };
  for (const d of [";", ",", "\t", "|"]) {
    const counts = lines.map((l) => Papa.parse<string[]>(l, { delimiter: d }).data[0]?.length ?? 1);
    if (!counts.length || counts[0] < 2) continue;
    const score = counts.filter((c) => c === counts[0]).length * 100 + counts[0];
    if (score > best.score) best = { d, score };
  }
  return best.d;
}

function parseCsv(buf: Buffer): ParsedSheet[] {
  const text = decodeText(buf);
  const parsed = Papa.parse<string[]>(text, { skipEmptyLines: false, delimiter: detectDelimiter(text) });
  const grid: string[][] = [];
  let collected = 0;
  for (const r of parsed.data) {
    if (collected >= MAX_COLLECTED_ROWS) break;
    const cells = Array.isArray(r) ? r.slice(0, IMPORT_MAX_COLUMNS).map((c) => cellToString(c)) : [];
    grid.push(cells);
    if (!isBlankRow(cells)) collected++;
  }
  return [sheetFromGrid("CSV", false, grid)];
}

export async function parseFile(input: { name: string; data: Buffer }): Promise<ParsedWorkbook> {
  if (input.data.length > IMPORT_MAX_BYTES) throw new ImportFileError("Die Datei ist zu groß (höchstens 10 MB).");
  const lower = input.name.toLowerCase();
  let sheets: ParsedSheet[];
  if (lower.endsWith(".csv") || lower.endsWith(".txt")) sheets = parseCsv(input.data);
  else if (lower.endsWith(".xlsx")) sheets = await parseXlsx(input.data);
  else throw new ImportFileError("Nicht unterstütztes Format – bitte .xlsx oder .csv (alte .xls-Dateien in Excel als .xlsx speichern).");
  sheets = sheets.filter((s) => s.rows.length > 0);
  if (!sheets.length) throw new ImportFileError("Die Datei enthält keine Daten.");
  for (const s of sheets) if (s.rows.length > IMPORT_MAX_ROWS + HEADER_SCAN_ROWS) throw new ImportFileError(`Das Blatt „${s.name}“ hat mehr als ${IMPORT_MAX_ROWS} Zeilen – bitte die Liste aufteilen.`);
  return { fileName: input.name.slice(0, 200), sheets };
}

/** Index der wahrscheinlichsten Kopfzeile: erste Zeile mit ≥ 2 nicht-leeren, nicht-numerischen Zellen. */
export function detectHeaderRow(rows: string[][]): number {
  for (let i = 0; i < Math.min(rows.length, HEADER_SCAN_ROWS); i++) {
    const cells = rows[i].filter((c) => c.trim() !== "");
    if (cells.length >= 2 && cells.every((c) => Number.isNaN(Number(c.replace(",", "."))) && !/^\d{1,2}\.\d{1,2}\.\d{2,4}$/.test(c.trim()))) return i;
  }
  return 0;
}
