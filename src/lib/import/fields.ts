// Felder je Importart und automatische Spaltenerkennung (wie die Zuordnung „Spalte → Feld“ bei Pipedrive). Rein, getestet.
export type ImportKind = "locations" | "articles" | "suppliers" | "stock";
export const IMPORT_KIND_LIST: ImportKind[] = ["stock", "articles", "locations", "suppliers"];

export interface FieldDef { key: string; label: string; hint?: string; synonyms: string[] }
export interface KindDef { label: string; help: string; /** Das eine Feld, ohne das eine Zeile nicht angelegt werden kann (kein Pflichtfeld bei der Zuordnung) */ identity: string[]; fields: FieldDef[]; example: string[][] }

export const IMPORT_KINDS: Record<ImportKind, KindDef> = {
  stock: {
    label: "Bestand",
    help: "Anfangsbestand oder Inventurliste: Artikel, Ort und Menge. Fehlende Artikel und Orte werden angelegt.",
    identity: ["article"],
    fields: [
      { key: "article", label: "Artikel", hint: "Name des Artikels", synonyms: ["artikel", "produkt", "bezeichnung", "name", "article", "item", "ware"] },
      { key: "location", label: "Lagerort", hint: "Name oder Kurzcode des Ortes", synonyms: ["lagerort", "ort", "raum", "lager", "standort", "location", "room", "code"] },
      { key: "quantity", label: "Menge", synonyms: ["menge", "anzahl", "bestand", "stück", "stueck", "quantity", "qty", "count", "gezählt"] },
      { key: "state", label: "Zustand (voll/leer)", hint: "voll oder leer; leer = Leergut", synonyms: ["zustand", "status", "voll leer", "state", "leergut"] },
      { key: "unit", label: "Einheit", hint: "nur für neu angelegte Artikel", synonyms: ["einheit", "unit", "gebinde", "verpackung"] },
      { key: "category", label: "Kategorie", hint: "nur für neu angelegte Artikel", synonyms: ["kategorie", "gruppe", "category", "typ"] },
    ],
    example: [["Artikel", "Lagerort", "Menge", "Zustand", "Einheit"], ["Mineralwasser", "L004", "46", "voll", "Kiste"], ["Mineralwasser", "Kühlanhänger", "20", "leer", "Kiste"]],
  },
  articles: {
    label: "Artikel",
    help: "Artikelstamm: Name, Einheit, Pfand, Kühlung, Mindestbestand.",
    identity: ["name"],
    fields: [
      { key: "name", label: "Name", synonyms: ["name", "artikel", "produkt", "bezeichnung", "article", "item"] },
      { key: "category", label: "Kategorie", synonyms: ["kategorie", "gruppe", "category", "typ"] },
      { key: "unit", label: "Einheit", hint: "Einzahl, z. B. Kiste", synonyms: ["einheit", "unit", "gebinde", "verpackung"] },
      { key: "returnable", label: "Pfandartikel", hint: "ja/nein", synonyms: ["pfandartikel", "pfand artikel", "leergut", "mehrweg", "returnable"] },
      { key: "deposit", label: "Pfand je Einheit (€)", synonyms: ["pfand", "pfandbetrag", "deposit", "pfand eur"] },
      { key: "needsCooling", label: "Kühlpflichtig", hint: "ja/nein", synonyms: ["kühlpflichtig", "kuehlpflichtig", "kühlung", "kuehlung", "gekühlt", "cooling", "kühlen"] },
      { key: "minStock", label: "Mindestbestand", synonyms: ["mindestbestand", "min bestand", "minimum", "mindestmenge", "min"] },
      { key: "aliases", label: "Andere Schreibweisen", hint: "mit Komma getrennt", synonyms: ["schreibweisen", "alias", "aliase", "synonyme", "andere namen"] },
      { key: "note", label: "Notiz", synonyms: ["notiz", "bemerkung", "kommentar", "note", "hinweis"] },
    ],
    example: [["Name", "Kategorie", "Einheit", "Pfandartikel", "Pfand", "Kühlpflichtig", "Mindestbestand"], ["Mineralwasser", "Getränke", "Kiste", "ja", "4,50", "nein", "20"], ["Butter", "Lebensmittel", "Karton", "nein", "", "ja", "10"]],
  },
  locations: {
    label: "Lagerorte",
    help: "Orte mit Hierarchie (Gebäude → Raum), Kurzcode und Kühlung.",
    identity: ["name"],
    fields: [
      { key: "name", label: "Name", synonyms: ["name", "lagerort", "ort", "raum", "bezeichnung", "location"] },
      { key: "code", label: "Kurzcode", hint: "z. B. L004", synonyms: ["kurzcode", "code", "raumnummer", "nummer", "kürzel", "kuerzel", "nr"] },
      { key: "parent", label: "Liegt in (Oberort)", hint: "Name oder Kurzcode des Oberorts", synonyms: ["liegt in", "oberort", "gebäude", "gebaeude", "übergeordnet", "uebergeordnet", "parent", "standort"] },
      { key: "kind", label: "Art", hint: "Gebäude, Raum, Kühlraum, Kühlanhänger", synonyms: ["art", "typ", "kind", "type"] },
      { key: "cooled", label: "Gekühlt", hint: "ja/nein", synonyms: ["gekühlt", "gekuehlt", "kühlung", "kuehlung", "cooled", "kühl"] },
      { key: "sortOrder", label: "Reihenfolge", synonyms: ["reihenfolge", "sortierung", "sort", "order", "position"] },
      { key: "note", label: "Notiz", synonyms: ["notiz", "bemerkung", "kommentar", "note", "hinweis"] },
    ],
    example: [["Name", "Kurzcode", "Liegt in", "Art", "Gekühlt"], ["Stadthalle", "", "", "Gebäude", "nein"], ["Kühllager 1", "KL1", "Stadthalle", "Kühlraum", "ja"]],
  },
  suppliers: {
    label: "Lieferanten",
    help: "Lieferanten und Sponsoren, die Ware liefern.",
    identity: ["name"],
    fields: [
      { key: "name", label: "Name", synonyms: ["name", "lieferant", "sponsor", "firma", "unternehmen", "supplier", "partner"] },
      { key: "note", label: "Notiz", synonyms: ["notiz", "bemerkung", "kommentar", "note", "kontakt", "ansprechpartner", "telefon"] },
    ],
    example: [["Name", "Notiz"], ["Staatlich Fachingen", "Ansprechperson: …"]],
  },
};

export const fold = (s: string) => s.toLowerCase().replace(/ä/g, "a").replace(/ö/g, "o").replace(/ü/g, "u").replace(/ß/g, "ss").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

/**
 * Schlägt für jede Spalte der Datei ein Feld vor: erst exakter Treffer auf Feldname/Synonym, dann Teiltreffer. Jedes Feld und jede
 * Spalte höchstens einmal. Ergebnis: je Spalte der Feldschlüssel oder null („nicht importieren“).
 */
export function guessColumns(kind: ImportKind, headers: string[]): (string | null)[] {
  const fields = IMPORT_KINDS[kind].fields;
  const result: (string | null)[] = headers.map(() => null);
  const taken = new Set<string>();
  const norm = headers.map((h) => fold(h));
  const exact = (h: string, f: FieldDef) => [fold(f.label), fold(f.key), ...f.synonyms.map(fold)].includes(h);
  const loose = (h: string, f: FieldDef) => h.length >= 3 && f.synonyms.map(fold).some((s) => s.length >= 4 && (h.includes(s) || (h.length >= 4 && s.includes(h))));
  for (const pass of [exact, loose]) {
    norm.forEach((h, i) => {
      if (result[i] || !h) return;
      const f = fields.find((x) => !taken.has(x.key) && pass(h, x));
      if (f) { result[i] = f.key; taken.add(f.key); }
    });
  }
  return result;
}
