// Rollen und Rechte. Reine Regeln ohne Datenbank, damit sie getestet werden können.
//
//  ADMIN   Verwaltet Personen (anlegen, Rolle ändern, sperren, abmelden) und darf alles andere auch.
//  MEMBER  Arbeitet mit den Daten: erfassen, umlagern, planen, Stammdaten pflegen, stornieren.
//  VIEWER  Betrachter: sieht Lagebericht, Journal und Auswertungen, kann nichts ändern.

export type Role = "ADMIN" | "MEMBER" | "VIEWER";

export const ROLES: Role[] = ["ADMIN", "MEMBER", "VIEWER"];
export const ROLE_LABEL: Record<Role, string> = { ADMIN: "Administrator", MEMBER: "Mitglied", VIEWER: "Betrachter" };
export const ROLE_HELP: Record<Role, string> = {
  ADMIN: "Alles, inklusive Personenverwaltung",
  MEMBER: "Erfassen, umlagern, planen, Stammdaten pflegen, stornieren",
  VIEWER: "Nur ansehen",
};

export const canWrite = (role: Role): boolean => role === "ADMIN" || role === "MEMBER";
export const isAdmin = (role: Role): boolean => role === "ADMIN";

export function isRole(value: unknown): value is Role {
  return value === "ADMIN" || value === "MEMBER" || value === "VIEWER";
}

/**
 * Darf `actor` die Person `target` verwalten (Rolle ändern, sperren, abmelden)? Nur Administratoren, nie sich selbst
 * (sonst sperrt sich der letzte Admin aus). Dass immer ein aktiver Admin übrig bleibt, prüft zusätzlich der Service.
 */
export function canManageUser(actor: { id: string; role: Role }, target: { id: string }): boolean {
  return actor.role === "ADMIN" && actor.id !== target.id;
}
