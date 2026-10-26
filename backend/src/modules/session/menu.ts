export interface FunzioneRow {
  id: number;
  parentId: number | null;
  codice: string;
  livello: 'AREA' | 'MODULO' | 'FUNZIONE';
  route: string | null;
  ordine: number;
  richiedeFornitore: boolean;
  richiedeEnteAutorizzato: boolean;
  descrizione: string;
}

export interface MenuNode {
  codice: string;
  descrizione: string;
  route: string | null;
  figli: MenuNode[];
}

export interface MenuContext {
  /** Codici delle funzioni abilitate all'utente */
  funzioniAbilitate: ReadonlySet<string>;
  /** È selezionato un fornitore corrente */
  hasSupplier: boolean;
  /** L'utente ha almeno un ente autorizzato sul fornitore corrente */
  hasAuthorizedEntity: boolean;
}

/**
 * Costruisce il menu (GetApplicationMenu, spec. cap. 5):
 * - una funzione compare se è abilitata all'utente;
 * - se richiede un fornitore, solo con fornitore selezionato;
 * - se richiede un ente autorizzato, solo se l'utente ne ha almeno uno sul fornitore;
 * - aree e moduli compaiono solo se hanno almeno una voce visibile.
 */
export function buildMenu(rows: FunzioneRow[], ctx: MenuContext): MenuNode[] {
  const children = new Map<number | null, FunzioneRow[]>();
  for (const r of rows) {
    const list = children.get(r.parentId) ?? [];
    list.push(r);
    children.set(r.parentId, list);
  }
  for (const list of children.values()) list.sort((a, b) => a.ordine - b.ordine || a.id - b.id);

  const isVisibleLeaf = (r: FunzioneRow) =>
    ctx.funzioniAbilitate.has(r.codice) &&
    (!r.richiedeFornitore || ctx.hasSupplier) &&
    (!r.richiedeEnteAutorizzato || ctx.hasAuthorizedEntity);

  const build = (parentId: number | null): MenuNode[] =>
    (children.get(parentId) ?? []).flatMap((r): MenuNode[] => {
      if (r.livello === 'FUNZIONE') {
        return isVisibleLeaf(r) ? [{ codice: r.codice, descrizione: r.descrizione, route: r.route, figli: [] }] : [];
      }
      const figli = build(r.id);
      return figli.length > 0 ? [{ codice: r.codice, descrizione: r.descrizione, route: r.route, figli }] : [];
    });

  return build(null);
}
