export interface ActionResult {
  ok: boolean;
  error?: string;
  message?: string;
  /** Zeilen einer erfolgreichen Buchung („Eingang: 46 Kisten Mineralwasser → L004“) */
  lines?: string[];
  warnings?: string[];
  /** INSUFFICIENT: Bestand reicht nicht – die Oberfläche bietet „Trotzdem buchen“ an */
  code?: "INSUFFICIENT" | "INVALID" | "FORBIDDEN";
  /** Zeile (0-basiert), auf die sich der Fehler bezieht */
  index?: number;
  /** Gebuchte Bewegungen (für „Rückgängig machen“) */
  ids?: string[];
  /** Diese Erfassung war schon gespeichert – nichts doppelt gebucht */
  duplicate?: boolean;
  /** Inventur: Kennung der gebuchten Zählung (zum Zurücknehmen) */
  batchId?: string;
  /** Zählt bei jedem Erfolg hoch – damit Formulare sich zurücksetzen */
  nonce?: number;
}

export const NOT_ALLOWED: ActionResult = { ok: false, code: "FORBIDDEN", error: "Dafür fehlt dir die Berechtigung (Betrachter können nur ansehen) – oder du bist nicht mehr angemeldet." };
export const fail = (error: string): ActionResult => ({ ok: false, error });
