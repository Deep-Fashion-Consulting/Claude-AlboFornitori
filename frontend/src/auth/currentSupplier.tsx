import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

const KEY = 'albo.fornitoreCorrente';

interface CurrentSupplier {
  /** Fornitore corrente: contesto globale delle sezioni (ex Session("IDFornitore")) */
  supplierId: number | null;
  select(id: number): void;
  clear(): void;
}

const Ctx = createContext<CurrentSupplier | null>(null);

export function CurrentSupplierProvider({ children }: { children: ReactNode }) {
  const [supplierId, setId] = useState<number | null>(() => {
    const v = Number(sessionStorage.getItem(KEY));
    return Number.isInteger(v) && v > 0 ? v : null;
  });
  const select = useCallback((id: number) => {
    sessionStorage.setItem(KEY, String(id));
    setId(id);
  }, []);
  const clear = useCallback(() => {
    sessionStorage.removeItem(KEY);
    setId(null);
  }, []);
  return <Ctx.Provider value={{ supplierId, select, clear }}>{children}</Ctx.Provider>;
}

export function useCurrentSupplier() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useCurrentSupplier va usato dentro CurrentSupplierProvider');
  return ctx;
}
