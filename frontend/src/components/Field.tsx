import { useId, type ReactNode } from 'react';

interface FieldProps {
  label: string;
  hint?: string;
  error?: string;
  className?: string;
  children: (props: { id: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean }) => ReactNode;
}

/** Etichetta, controllo, suggerimento ed errore collegati per l'accessibilità. */
export function Field({ label, hint, error, className, children }: FieldProps) {
  const id = useId();
  const describedBy = [hint && `${id}-hint`, error && `${id}-err`].filter(Boolean).join(' ') || undefined;
  return (
    <div className={`field ${error ? 'field--error' : ''} ${className ?? ''}`}>
      <label htmlFor={id} className="field__label">
        {label}
      </label>
      {children({ id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined })}
      {hint && (
        <p id={`${id}-hint`} className="field__hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-err`} className="field__error">
          {error}
        </p>
      )}
    </div>
  );
}

/** Coppia etichetta/valore in sola lettura */
export function ReadValue({ label, children }: { label: string; children: ReactNode }) {
  const empty = children === null || children === undefined || children === '';
  return (
    <div className="readvalue">
      <dt>{label}</dt>
      <dd className={empty ? 'readvalue--empty' : undefined}>{empty ? '—' : children}</dd>
    </div>
  );
}
