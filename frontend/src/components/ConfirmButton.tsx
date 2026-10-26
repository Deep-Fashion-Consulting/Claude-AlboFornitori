import { useEffect, useRef, useState } from 'react';

/**
 * Azione distruttiva in due passi: il primo clic chiede conferma sul posto,
 * il secondo esegue. Torna allo stato iniziale dopo qualche secondo.
 */
export function ConfirmButton({
  label,
  confirmLabel,
  onConfirm,
  disabled,
  ariaLabel,
}: {
  label: string;
  /** Testo per gli screen reader quando l'etichetta visibile è un simbolo */
  ariaLabel?: string;
  confirmLabel: string;
  onConfirm: () => void;
  disabled?: boolean;
}) {
  const [armed, setArmed] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!armed) return;
    const timer = window.setTimeout(() => setArmed(false), 4000);
    return () => window.clearTimeout(timer);
  }, [armed]);

  return (
    <button
      ref={ref}
      type="button"
      className={`btn btn--small ${armed ? 'btn--danger' : 'btn--quiet'}`}
      disabled={disabled}
      onClick={() => {
        if (armed) {
          setArmed(false);
          onConfirm();
        } else {
          setArmed(true);
        }
      }}
      onBlur={() => setArmed(false)}
      aria-label={armed ? undefined : ariaLabel}
    >
      {armed ? confirmLabel : label}
    </button>
  );
}
