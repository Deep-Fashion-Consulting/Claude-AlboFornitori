/**
 * Controlli formali sui codici fiscali italiani ed europei.
 * Verificano che il codice sia scritto correttamente, non che esista.
 */

/** Toglie spazi e punti e porta in maiuscolo: "it 0123 456.7890" -> "IT01234567890" */
export const normalizeCode = (s: string) => s.replace(/[\s.]/g, '').toUpperCase();

/** Partita IVA italiana: 11 cifre con cifra di controllo (algoritmo di Luhn). */
export function isValidPartitaIva(piva: string): boolean {
  if (!/^\d{11}$/.test(piva) || /^0{11}$/.test(piva)) return false;
  let sum = 0;
  for (let i = 0; i < 11; i++) {
    let d = Number(piva[i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

// Valori dei caratteri in posizione dispari (1ª, 3ª, ...) per il carattere di controllo del codice fiscale
const ODD: Record<string, number> = Object.fromEntries(
  [1, 0, 5, 7, 9, 13, 15, 17, 19, 21, 2, 4, 18, 20, 11, 3, 6, 8, 12, 14, 16, 10, 22, 25, 24, 23].flatMap((v, i) => [
    [String.fromCharCode(65 + i), v],
    ...(i < 10 ? [[String(i), v]] : []),
  ]),
);

/**
 * Codice fiscale italiano: 16 caratteri per le persone fisiche (con carattere di controllo,
 * omocodie comprese) oppure 11 cifre per le società (stesso controllo della partita IVA).
 */
export function isValidCodiceFiscale(cf: string): boolean {
  if (/^\d{11}$/.test(cf)) return isValidPartitaIva(cf);
  if (!/^[A-Z]{6}[0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]$/.test(cf)) return false;
  let sum = 0;
  for (let i = 0; i < 15; i++) {
    const c = cf[i]!;
    if (i % 2 === 0) sum += ODD[c]!;
    else sum += /\d/.test(c) ? Number(c) : c.charCodeAt(0) - 65;
  }
  return String.fromCharCode(65 + (sum % 26)) === cf[15];
}

/** Partita IVA comunitaria (VIES): prefisso del paese e da 2 a 13 caratteri. Per l'Italia, P.IVA valida. */
export function isValidPartitaIvaCee(code: string): boolean {
  const m = /^([A-Z]{2})([0-9A-Z+*]{2,13})$/.exec(code);
  if (!m) return false;
  return m[1] === 'IT' ? isValidPartitaIva(m[2]!) : true;
}
