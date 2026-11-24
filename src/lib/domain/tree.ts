// Orte bilden einen Baum (Gebäude → Raum, Stadthalle → Kühllager). Reine Funktionen (getestet).
export interface TreeLoc { id: string; name: string; code: string | null; parentId: string | null; sortOrder: number; cooled: boolean }

export interface TreeNode<T extends TreeLoc> { loc: T; children: TreeNode<T>[]; depth: number }

const byOrder = <T extends TreeLoc>(a: T, b: T) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "de");

/** Baum aus einer flachen Liste. Orte, deren Eltern fehlen (z. B. archiviert), werden zu Wurzeln. */
export function buildTree<T extends TreeLoc>(locs: T[]): TreeNode<T>[] {
  const ids = new Set(locs.map((l) => l.id));
  const children = new Map<string | null, T[]>();
  for (const l of locs) {
    const key = l.parentId && ids.has(l.parentId) ? l.parentId : null;
    (children.get(key) ?? children.set(key, []).get(key)!).push(l);
  }
  const make = (l: T, depth: number): TreeNode<T> => ({ loc: l, depth, children: (children.get(l.id) ?? []).sort(byOrder).map((c) => make(c, depth + 1)) });
  return (children.get(null) ?? []).sort(byOrder).map((l) => make(l, 0));
}

export function flatten<T extends TreeLoc>(nodes: TreeNode<T>[]): TreeNode<T>[] {
  return nodes.flatMap((n) => [n, ...flatten(n.children)]);
}

/** „Stadthalle › Kühllager 2“ */
export function pathName(locs: TreeLoc[], id: string): string {
  const byId = new Map(locs.map((l) => [l.id, l]));
  const parts: string[] = [];
  for (let cur = byId.get(id), i = 0; cur && i < 20; i++) { parts.unshift(cur.name); cur = cur.parentId ? byId.get(cur.parentId) : undefined; }
  return parts.join(" › ");
}

/** Gekühlt ist ein Ort, wenn er selbst oder einer seiner Oberorte gekühlt ist. */
export function isCooled(locs: TreeLoc[], id: string): boolean {
  const byId = new Map(locs.map((l) => [l.id, l]));
  for (let cur = byId.get(id), i = 0; cur && i < 20; i++) { if (cur.cooled) return true; cur = cur.parentId ? byId.get(cur.parentId) : undefined; }
  return false;
}

/** Ort und alle Unterorte (für „alles, was in L liegt“). */
export function descendantIds(locs: TreeLoc[], id: string): string[] {
  const out = [id];
  for (let i = 0; i < out.length; i++) for (const l of locs) if (l.parentId === out[i] && !out.includes(l.id)) out.push(l.id);
  return out;
}
