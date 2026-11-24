import "server-only";
import QRCode from "qrcode";
import { env } from "@/lib/env";

/** Adresse, die der QR-Code eines Lagerorts öffnet (Anmeldung wird bei Bedarf vorgeschaltet und führt danach hierher zurück). */
export function locationUrl(id: string): string {
  return new URL(`/orte/${id}`, env().APP_URL).toString();
}

/** Eigener QR als SVG (vom Server erzeugt, kein fremder Dienst; Fehlerkorrektur M, damit auch zerknitterte Etiketten gehen). */
export function qrSvg(text: string): Promise<string> {
  return QRCode.toString(text, { type: "svg", errorCorrectionLevel: "M", margin: 1, color: { dark: "#061638", light: "#ffffff" } });
}
