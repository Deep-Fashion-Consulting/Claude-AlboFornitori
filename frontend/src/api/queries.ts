import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { api } from './client';
import type {
  Item,
  Lingua,
  MenuNode,
  SearchResult,
  Societa,
  SupplierGeneral,
  SupplierHeader,
  TipoCollegamento,
  UpdateGeneral,
} from './types';

export const keys = {
  menu: (fornitoreId: number | null) => ['menu', fornitoreId] as const,
  lookup: (nome: string) => ['lookup', nome] as const,
  geo: (livello: string, parent: Record<string, number | undefined>) => ['geo', livello, parent] as const,
  myEntities: ['me', 'enti'] as const,
  search: (params: Record<string, unknown>) => ['fornitori', 'ricerca', params] as const,
  header: (id: number) => ['fornitori', id, 'intestazione'] as const,
  general: (id: number) => ['fornitori', id, 'anagrafica'] as const,
};

export const useMenu = (fornitoreId: number | null) =>
  useQuery({
    queryKey: keys.menu(fornitoreId),
    queryFn: () => api<MenuNode[]>('/api/menu', { query: { fornitoreId } }),
    staleTime: 5 * 60_000,
  });

export const useLookup = (nome: string) =>
  useQuery({ queryKey: keys.lookup(nome), queryFn: () => api<Item[]>(`/api/lookups/${nome}`), staleTime: 30 * 60_000 });

export const useMyEntities = () =>
  useQuery({ queryKey: keys.myEntities, queryFn: () => api<Item[]>('/api/me/enti'), staleTime: 30 * 60_000 });

export function useGeo(
  livello: 'nazioni' | 'regioni' | 'province' | 'localita',
  parent: { nazioneId?: number; regioneId?: number; provinciaId?: number },
  enabled = true,
) {
  return useQuery({
    queryKey: keys.geo(livello, parent),
    queryFn: () => api<(Item & { capDefault?: string | null })[]>(`/api/geo/${livello}`, { query: parent }),
    enabled,
    staleTime: 30 * 60_000,
  });
}

export const useSupplierSearch = (params: Record<string, string | string[]>, enabled: boolean) =>
  useQuery({
    queryKey: keys.search(params),
    queryFn: () => api<SearchResult>('/api/fornitori', { query: params }),
    enabled,
    placeholderData: (prev) => prev,
  });

export const useSupplierHeader = (id: number | null) =>
  useQuery({
    queryKey: keys.header(id ?? 0),
    queryFn: () => api<SupplierHeader>(`/api/fornitori/${id}/intestazione`),
    enabled: id != null,
  });

export const useSupplierGeneral = (id: number) =>
  useQuery({ queryKey: keys.general(id), queryFn: () => api<SupplierGeneral>(`/api/fornitori/${id}`) });

/** Mutazione che, a buon fine, invalida i dati del fornitore (scheda, intestazione, ricerche). */
function useSupplierMutation<V>(id: number, fn: (v: V) => Promise<unknown>, extra: QueryKey[] = []) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['fornitori', id] }),
        qc.invalidateQueries({ queryKey: ['fornitori', 'ricerca'] }),
        ...extra.map((k) => qc.invalidateQueries({ queryKey: k })),
      ]);
    },
  });
}

export const useUpdateGeneral = (id: number) =>
  useSupplierMutation(id, (body: UpdateGeneral) => api<{ versione: string }>(`/api/fornitori/${id}`, { method: 'PUT', body }));

export const useAddState = (id: number) =>
  useSupplierMutation(id, (body: { statoId: number; dataDa: string }) =>
    api(`/api/fornitori/${id}/stati`, { method: 'POST', body }),
  );

export const useRemoveState = (id: number) =>
  useSupplierMutation(id, (statoRecordId: number) => api(`/api/fornitori/${id}/stati/${statoRecordId}`, { method: 'DELETE' }));

export interface NewAddress {
  tipoIndirizzoId: number;
  localitaId: number;
  indirizzo: string;
  cap: string;
  telefono: string;
  principale: boolean;
}
export const useAddAddress = (id: number) =>
  useSupplierMutation(id, (body: NewAddress) => api(`/api/fornitori/${id}/indirizzi`, { method: 'POST', body }));

export const useSetPrincipal = (id: number) =>
  useSupplierMutation(id, (addressId: number) =>
    api(`/api/fornitori/${id}/indirizzi/${addressId}/principale`, { method: 'PUT' }),
  );

export const useDeleteAddress = (id: number) =>
  useSupplierMutation(id, (addressId: number) => api(`/api/fornitori/${id}/indirizzi/${addressId}`, { method: 'DELETE' }));

export const useToggleFavourite = (id: number) =>
  useSupplierMutation(id, (enabled: boolean) =>
    api(`/api/fornitori/${id}/preferito`, { method: enabled ? 'PUT' : 'DELETE' }),
  );

export const setLanguage = (lingua: Lingua) => api('/api/me/lingua', { method: 'PUT', body: { lingua } });

// ------------------------------------------------------------ modulo 2: società
export const useSocieta = (id: number) =>
  useQuery({ queryKey: ['fornitori', id, 'societa'], queryFn: () => api<Societa>(`/api/fornitori/${id}/societa`) });

export type StrutturaInput = {
  versione: string | null;
  capitaleSociale: number | null;
  capitaleSocialeValutaId: number | null;
  numeroAddetti: number | null;
  notaNumeroAddetti: string;
  immobileMq: number | null;
  tipoImmobileId: number | null;
  tipologiaOfferta: string;
  quotaMercatoPrc: number | null;
  quotaMercatoDescrizione: string;
};
export const useSaveStruttura = (id: number) =>
  useSupplierMutation(id, (body: StrutturaInput) =>
    api<{ versione: string }>(`/api/fornitori/${id}/societa/struttura`, { method: 'PUT', body }),
  );

/** Aggiunta, modifica ed eliminazione per gli elenchi del fornitore (interlocutori, subfornitori). */
export function useChildList<T>(id: number, path: 'interlocutori' | 'subfornitori') {
  return {
    save: useSupplierMutation(id, ({ childId, body }: { childId: number | null; body: T }) =>
      childId
        ? api(`/api/fornitori/${id}/${path}/${childId}`, { method: 'PUT', body })
        : api(`/api/fornitori/${id}/${path}`, { method: 'POST', body }),
    ),
    remove: useSupplierMutation(id, (childId: number) => api(`/api/fornitori/${id}/${path}/${childId}`, { method: 'DELETE' })),
  };
}

export const useAddLink = (id: number) =>
  useSupplierMutation(id, (body: { tipo: TipoCollegamento; altroFornitoreId: number }) =>
    api(`/api/fornitori/${id}/collegamenti`, { method: 'POST', body }),
  );
export const useRemoveLink = (id: number) =>
  useSupplierMutation(id, (linkId: number) => api(`/api/fornitori/${id}/collegamenti/${linkId}`, { method: 'DELETE' }));

/** Ricerca rapida per scegliere un fornitore da collegare. */
export const useSupplierLookup = (nome: string) =>
  useQuery({
    queryKey: ['fornitori', 'ricerca', { nome, limite: '8' }],
    queryFn: () => api<SearchResult>('/api/fornitori', { query: { nome, limite: 8 } }),
    enabled: nome.trim().length >= 2,
    staleTime: 30_000,
  });
