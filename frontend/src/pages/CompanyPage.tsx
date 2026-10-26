import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../api/client';
import {
  useAddLink,
  useChildList,
  useGeo,
  useLookup,
  useRemoveLink,
  useSaveStruttura,
  useSocieta,
  useSupplierLookup,
  type StrutturaInput,
} from '../api/queries';
import type { Collegamento, Interlocutore, Relazione, Societa, Subfornitore, TipoCollegamento } from '../api/types';
import { useMe } from '../auth/AuthProvider';
import { ConfirmButton } from '../components/ConfirmButton';
import { ErrorMessage, fieldErrors, Flash, Loading, useFlash } from '../components/Feedback';
import { Field, ReadValue } from '../components/Field';

/** Pagina "Struttura societaria" (ex Anagrafica_SOC / Anagrafica_SOC_Update). */
export function CompanyPage() {
  const { t } = useTranslation();
  const id = Number(useParams().id);
  const me = useMe();
  const canWrite = me.permessi.scrittura && me.funzioni.includes('FORNITORE_SOCIETA');
  const q = useSocieta(id);
  const [flash, setFlash] = useFlash();

  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorMessage error={q.error} onRetry={() => void q.refetch()} />;
  const s = q.data;

  return (
    <>
      <h1 className="page__title">{t('company.title')}</h1>
      <Flash message={flash} />
      <div className="sheet">
        <StructureSection id={id} s={s} canWrite={canWrite} onDone={setFlash} onReload={() => void q.refetch()} />
        <ContactsSection id={id} items={s.interlocutori} canWrite={canWrite} onDone={setFlash} />
        <SubsSection id={id} items={s.subfornitori} canWrite={canWrite} onDone={setFlash} />
        <LinksSection id={id} links={s.collegamenti} canWrite={canWrite} onDone={setFlash} />
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Utilità per i form
// ---------------------------------------------------------------------------
const toNum = (v: string) => (v.trim() === '' ? null : Number(v.replace(',', '.')));
const toStr = (v: number | null | undefined) => (v == null ? '' : String(v));

function useNumberFormat() {
  const { i18n } = useTranslation();
  const locale = i18n.language === 'en' ? 'en-GB' : 'it-IT';
  return (v: number | null, digits = 0) =>
    v == null ? null : new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(v);
}

/** Select di una lista di valori, con voce vuota iniziale */
function LookupSelect({
  nome,
  value,
  onChange,
  fieldProps,
}: {
  nome: string;
  value: number | null;
  onChange: (v: number | null) => void;
  fieldProps: object;
}) {
  const { t } = useTranslation();
  const items = useLookup(nome);
  return (
    <select {...fieldProps} value={value ?? ''} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}>
      <option value="">{t('common.select')}</option>
      {items.data?.map((i) => (
        <option key={i.id} value={i.id}>
          {i.descrizione}
        </option>
      ))}
    </select>
  );
}

function SectionHead({ id, title, action }: { id: string; title: string; action?: ReactNode }) {
  return (
    <header className="block__head">
      <h2 id={id}>{title}</h2>
      {action}
    </header>
  );
}

// ---------------------------------------------------------------------------
// Struttura
// ---------------------------------------------------------------------------
type StrutturaForm = Record<
  | 'capitaleSociale'
  | 'capitaleSocialeValutaId'
  | 'numeroAddetti'
  | 'notaNumeroAddetti'
  | 'immobileMq'
  | 'tipoImmobileId'
  | 'tipologiaOfferta'
  | 'quotaMercatoPrc'
  | 'quotaMercatoDescrizione',
  string
>;

function StructureSection({
  id,
  s,
  canWrite,
  onDone,
  onReload,
}: {
  id: number;
  s: Societa;
  canWrite: boolean;
  onDone: (m: string) => void;
  onReload: () => void;
}) {
  const { t } = useTranslation();
  const fmt = useNumberFormat();
  const st = s.struttura;
  const save = useSaveStruttura(id);
  const [editing, setEditing] = useState(false);
  const initial = (): StrutturaForm => ({
    capitaleSociale: toStr(st.capitaleSociale),
    capitaleSocialeValutaId: toStr(st.capitaleSocialeValuta?.id),
    numeroAddetti: toStr(st.numeroAddetti),
    notaNumeroAddetti: st.notaNumeroAddetti ?? '',
    immobileMq: toStr(st.immobileMq),
    tipoImmobileId: toStr(st.tipoImmobile?.id),
    tipologiaOfferta: st.tipologiaOfferta ?? '',
    quotaMercatoPrc: toStr(st.quotaMercatoPrc),
    quotaMercatoDescrizione: st.quotaMercatoDescrizione ?? '',
  });
  const [form, setForm] = useState<StrutturaForm>(initial);
  const errors = fieldErrors(save.error);
  const conflict = save.error instanceof ApiError && save.error.code === 'MODIFICATO_DA_ALTRI';
  const set = (k: keyof StrutturaForm) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const empty = st.versione === null;

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const body: StrutturaInput = {
      versione: st.versione,
      capitaleSociale: toNum(form.capitaleSociale),
      capitaleSocialeValutaId: toNum(form.capitaleSocialeValutaId),
      numeroAddetti: toNum(form.numeroAddetti),
      notaNumeroAddetti: form.notaNumeroAddetti,
      immobileMq: toNum(form.immobileMq),
      tipoImmobileId: toNum(form.tipoImmobileId),
      tipologiaOfferta: form.tipologiaOfferta,
      quotaMercatoPrc: toNum(form.quotaMercatoPrc),
      quotaMercatoDescrizione: form.quotaMercatoDescrizione,
    };
    save.mutate(body, {
      onSuccess: () => {
        setEditing(false);
        onDone(t('company.saved'));
      },
    });
  };

  const money = (v: number | null, cur: { descrizione: string } | null) => (v == null ? null : `${fmt(v, 2)} ${cur?.descrizione ?? ''}`.trim());

  return (
    <section className="block" aria-labelledby="sez-struttura">
      <SectionHead
        id="sez-struttura"
        title={t('company.structure')}
        action={
          canWrite &&
          !editing && (
            <button
              type="button"
              className="btn btn--quiet btn--small"
              onClick={() => {
                setForm(initial());
                save.reset();
                setEditing(true);
              }}
            >
              {empty ? t('company.fill') : t('company.edit')}
            </button>
          )
        }
      />
      {!editing ? (
        empty ? (
          <p className="block__empty">{t('company.structureEmpty')}</p>
        ) : (
          <dl className="readgrid">
            <ReadValue label={t('company.f.capitaleSociale')}>{money(st.capitaleSociale, st.capitaleSocialeValuta)}</ReadValue>
            <ReadValue label={t('company.f.capitaleVersato')}>{money(st.capitaleVersato, st.capitaleVersatoValuta)}</ReadValue>
            <ReadValue label={t('company.f.numeroAddetti')}>{fmt(st.numeroAddetti)}</ReadValue>
            <ReadValue label={t('company.f.notaNumeroAddetti')}>{st.notaNumeroAddetti}</ReadValue>
            <ReadValue label={t('company.f.immobileMq')}>{fmt(st.immobileMq, 2)}</ReadValue>
            <ReadValue label={t('company.f.tipoImmobile')}>{st.tipoImmobile?.descrizione}</ReadValue>
            <ReadValue label={t('company.f.quotaMercatoPrc')}>{st.quotaMercatoPrc != null && `${fmt(st.quotaMercatoPrc, 2)}%`}</ReadValue>
            <ReadValue label={t('company.f.quotaMercatoDescrizione')}>{st.quotaMercatoDescrizione}</ReadValue>
            <div className="readvalue readvalue--wide">
              <dt>{t('company.f.tipologiaOfferta')}</dt>
              <dd className={st.tipologiaOfferta ? undefined : 'readvalue--empty'}>{st.tipologiaOfferta ?? '—'}</dd>
            </div>
          </dl>
        )
      ) : (
        <form onSubmit={onSubmit} noValidate>
          {save.isError && (
            <ErrorMessage
              error={save.error}
              action={
                conflict && (
                  <button type="button" className="btn btn--quiet" onClick={() => { setEditing(false); onReload(); }}>
                    {t('general.reload')}
                  </button>
                )
              }
            />
          )}
          <div className="grid grid--4">
            <Field label={t('company.f.capitaleSociale')} error={errors.capitaleSociale}>
              {(p) => <input {...p} inputMode="decimal" value={form.capitaleSociale} onChange={(e) => set('capitaleSociale')(e.target.value)} />}
            </Field>
            <Field label={t('company.f.valuta')} error={errors.capitaleSocialeValutaId}>
              {(p) => (
                <LookupSelect nome="valute" fieldProps={p} value={toNum(form.capitaleSocialeValutaId)} onChange={(v) => set('capitaleSocialeValutaId')(toStr(v))} />
              )}
            </Field>
            <Field label={t('company.f.capitaleVersato')} hint={t('company.f.capitaleVersatoNote')}>
              {(p) => <input {...p} value={money(st.capitaleVersato, st.capitaleVersatoValuta) ?? '—'} disabled />}
            </Field>
            <Field label={t('company.f.numeroAddetti')} error={errors.numeroAddetti}>
              {(p) => <input {...p} inputMode="numeric" value={form.numeroAddetti} onChange={(e) => set('numeroAddetti')(e.target.value)} />}
            </Field>
            <Field label={t('company.f.notaNumeroAddetti')} error={errors.notaNumeroAddetti} className="field--wide">
              {(p) => <input {...p} value={form.notaNumeroAddetti} onChange={(e) => set('notaNumeroAddetti')(e.target.value)} />}
            </Field>
            <Field label={t('company.f.immobileMq')} error={errors.immobileMq}>
              {(p) => <input {...p} inputMode="decimal" value={form.immobileMq} onChange={(e) => set('immobileMq')(e.target.value)} />}
            </Field>
            <Field label={t('company.f.tipoImmobile')} error={errors.tipoImmobileId}>
              {(p) => <LookupSelect nome="tipi-immobile" fieldProps={p} value={toNum(form.tipoImmobileId)} onChange={(v) => set('tipoImmobileId')(toStr(v))} />}
            </Field>
            <Field label={t('company.f.quotaMercatoPrc')} error={errors.quotaMercatoPrc}>
              {(p) => <input {...p} inputMode="decimal" value={form.quotaMercatoPrc} onChange={(e) => set('quotaMercatoPrc')(e.target.value)} />}
            </Field>
            <Field label={t('company.f.quotaMercatoDescrizione')} error={errors.quotaMercatoDescrizione}>
              {(p) => <input {...p} value={form.quotaMercatoDescrizione} onChange={(e) => set('quotaMercatoDescrizione')(e.target.value)} />}
            </Field>
            <Field label={t('company.f.tipologiaOfferta')} error={errors.tipologiaOfferta} className="field--full">
              {(p) => <textarea {...p} rows={2} value={form.tipologiaOfferta} onChange={(e) => set('tipologiaOfferta')(e.target.value)} />}
            </Field>
          </div>
          <div className="formactions">
            <button type="submit" className="btn btn--primary" disabled={save.isPending}>
              {save.isPending ? t('general.saving') : t('general.save')}
            </button>
            <button type="button" className="btn btn--quiet" onClick={() => setEditing(false)}>
              {t('general.cancel')}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Interlocutori
// ---------------------------------------------------------------------------
type ContactForm = { tipoInterlocutoreId: number | null; nominativo: string; email: string; telefono: string; cellulare: string };

function ContactsSection({ id, items, canWrite, onDone }: { id: number; items: Interlocutore[]; canWrite: boolean; onDone: (m: string) => void }) {
  const { t } = useTranslation();
  const { save, remove } = useChildList<ContactForm>(id, 'interlocutori');
  /** id dell'interlocutore in modifica, 'new' per uno nuovo, null se nessun form è aperto */
  const [editing, setEditing] = useState<number | 'new' | null>(null);
  const open = (v: number | 'new') => {
    save.reset();
    setEditing(v);
  };

  return (
    <section className="block" aria-labelledby="sez-interlocutori">
      <SectionHead
        id="sez-interlocutori"
        title={t('company.contacts')}
        action={canWrite && editing === null && (
          <button type="button" className="btn btn--quiet btn--small" onClick={() => open('new')}>
            {t('company.contactAdd')}
          </button>
        )}
      />
      {items.length === 0 ? (
        <p className="block__empty">{t('company.contactsEmpty')}</p>
      ) : (
        <div className="tablewrap tablewrap--plain">
          <table className="table table--compact">
            <thead>
              <tr>
                <th scope="col">{t('company.c.nominativo')}</th>
                <th scope="col">{t('company.c.tipo')}</th>
                <th scope="col">{t('company.c.email')}</th>
                <th scope="col">{t('company.c.telefono')}</th>
                <th scope="col">{t('company.c.cellulare')}</th>
                {canWrite && <th scope="col"><span className="visually-hidden">{t('common.actions')}</span></th>}
              </tr>
            </thead>
            <tbody>
              {items.map((c) => (
                <tr key={c.id}>
                  <td className="strong">{c.nominativo}</td>
                  <td>{c.tipoInterlocutore?.descrizione ?? '—'}</td>
                  <td>{c.email ? <a href={`mailto:${c.email}`}>{c.email}</a> : '—'}</td>
                  <td className="num">{c.telefono ?? '—'}</td>
                  <td className="num">{c.cellulare ?? '—'}</td>
                  {canWrite && (
                    <td className="table__actions">
                      <button type="button" className="btn btn--quiet btn--small" onClick={() => open(c.id)} disabled={editing !== null}>
                        {t('company.edit')}
                      </button>{' '}
                      <ConfirmButton
                        label={t('company.remove')}
                        confirmLabel={t('company.confirmRemove')}
                        disabled={remove.isPending || editing !== null}
                        onConfirm={() => remove.mutate(c.id, { onSuccess: () => onDone(t('company.removed')) })}
                      />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {remove.isError && <ErrorMessage error={remove.error} />}
      {editing !== null && (
        <ContactEditor
          initial={editing === 'new' ? null : (items.find((c) => c.id === editing) ?? null)}
          pending={save.isPending}
          error={save.error}
          onCancel={() => setEditing(null)}
          onSubmit={(body) =>
            save.mutate(
              { childId: editing === 'new' ? null : editing, body },
              { onSuccess: () => { setEditing(null); onDone(t('company.saved')); } },
            )
          }
        />
      )}
    </section>
  );
}

function ContactEditor({
  initial,
  pending,
  error,
  onCancel,
  onSubmit,
}: {
  initial: Interlocutore | null;
  pending: boolean;
  error: unknown;
  onCancel: () => void;
  onSubmit: (b: ContactForm) => void;
}) {
  const { t } = useTranslation();
  const [f, setF] = useState<ContactForm>({
    tipoInterlocutoreId: initial?.tipoInterlocutore?.id ?? null,
    nominativo: initial?.nominativo ?? '',
    email: initial?.email ?? '',
    telefono: initial?.telefono ?? '',
    cellulare: initial?.cellulare ?? '',
  });
  const errors = fieldErrors(error);
  const text = (k: 'nominativo' | 'email' | 'telefono' | 'cellulare', type = 'text') => (
    <Field label={t(`company.c.${k}`)} error={errors[k]}>
      {(p) => <input {...p} type={type} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />}
    </Field>
  );
  return (
    <form className="subform" onSubmit={(e) => { e.preventDefault(); onSubmit(f); }} noValidate>
      <h3 className="subform__title">{initial ? t('company.contactEdit') : t('company.contactNew')}</h3>
      {error != null && <ErrorMessage error={error} />}
      <div className="grid grid--3">
        {text('nominativo')}
        <Field label={t('company.c.tipo')} error={errors.tipoInterlocutoreId}>
          {(p) => <LookupSelect nome="tipi-interlocutore" fieldProps={p} value={f.tipoInterlocutoreId} onChange={(v) => setF({ ...f, tipoInterlocutoreId: v })} />}
        </Field>
        {text('email', 'email')}
        {text('telefono', 'tel')}
        {text('cellulare', 'tel')}
      </div>
      <div className="formactions">
        <button type="submit" className="btn btn--primary" disabled={pending || !f.nominativo.trim()}>
          {t('general.save')}
        </button>
        <button type="button" className="btn btn--quiet" onClick={onCancel}>
          {t('general.cancel')}
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Subfornitori
// ---------------------------------------------------------------------------
type SubForm = {
  ragioneSociale: string;
  partitaIva: string;
  partitaIvaCee: string;
  codiceFiscale: string;
  nazioneId: number | null;
  provinciaId: number | null;
  localita: string;
  indirizzo: string;
  cap: string;
  telefono: string;
  numeroAddetti: number | null;
  referenti: string;
  enteId: number | null;
  fornitoreAlboId: number | null;
};

function SubsSection({ id, items, canWrite, onDone }: { id: number; items: Subfornitore[]; canWrite: boolean; onDone: (m: string) => void }) {
  const { t } = useTranslation();
  const { save, remove } = useChildList<SubForm>(id, 'subfornitori');
  const [editing, setEditing] = useState<number | 'new' | null>(null);
  const open = (v: number | 'new') => {
    save.reset();
    setEditing(v);
  };

  return (
    <section className="block" aria-labelledby="sez-sub">
      <SectionHead
        id="sez-sub"
        title={t('company.subs')}
        action={canWrite && editing === null && (
          <button type="button" className="btn btn--quiet btn--small" onClick={() => open('new')}>
            {t('company.subAdd')}
          </button>
        )}
      />
      {items.length === 0 ? (
        <p className="block__empty">{t('company.subsEmpty')}</p>
      ) : (
        <ul className="cards">
          {items.map((s) => (
            <li key={s.id} className="card">
              <div>
                <p className="card__title">
                  {s.fornitoreAlbo ? <Link to={`/fornitori/${s.fornitoreAlbo.id}/anagrafica`}>{s.ragioneSociale}</Link> : s.ragioneSociale}
                </p>
                <p className="card__line">
                  {[s.indirizzo, [s.cap, s.localita, s.provincia?.sigla && `(${s.provincia.sigla})`].filter(Boolean).join(' '), s.nazione?.descrizione]
                    .filter(Boolean)
                    .join(', ') || '—'}
                </p>
                <p className="card__line card__muted">
                  {[s.partitaIva ?? s.partitaIvaCee ?? s.codiceFiscale, s.numeroAddetti != null && t('company.s.addetti', { count: s.numeroAddetti }), s.ente?.descrizione]
                    .filter(Boolean)
                    .join(', ')}
                </p>
                {s.referenti && <p className="card__line card__muted">{s.referenti}</p>}
              </div>
              {canWrite && (
                <div className="card__actions">
                  <button type="button" className="btn btn--quiet btn--small" onClick={() => open(s.id)} disabled={editing !== null}>
                    {t('company.edit')}
                  </button>
                  <ConfirmButton
                    label={t('company.remove')}
                    confirmLabel={t('company.confirmRemove')}
                    disabled={remove.isPending || editing !== null}
                    onConfirm={() => remove.mutate(s.id, { onSuccess: () => onDone(t('company.removed')) })}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {remove.isError && <ErrorMessage error={remove.error} />}
      {editing !== null && (
        <SubEditor
          initial={editing === 'new' ? null : (items.find((s) => s.id === editing) ?? null)}
          pending={save.isPending}
          error={save.error}
          onCancel={() => setEditing(null)}
          onSubmit={(body) =>
            save.mutate(
              { childId: editing === 'new' ? null : editing, body },
              { onSuccess: () => { setEditing(null); onDone(t('company.saved')); } },
            )
          }
        />
      )}
    </section>
  );
}

function SubEditor({
  initial,
  pending,
  error,
  onCancel,
  onSubmit,
}: {
  initial: Subfornitore | null;
  pending: boolean;
  error: unknown;
  onCancel: () => void;
  onSubmit: (b: SubForm) => void;
}) {
  const { t } = useTranslation();
  const [f, setF] = useState<SubForm>({
    ragioneSociale: initial?.ragioneSociale ?? '',
    partitaIva: initial?.partitaIva ?? '',
    partitaIvaCee: initial?.partitaIvaCee ?? '',
    codiceFiscale: initial?.codiceFiscale ?? '',
    nazioneId: initial?.nazione?.id ?? null,
    provinciaId: initial?.provincia?.id ?? null,
    localita: initial?.localita ?? '',
    indirizzo: initial?.indirizzo ?? '',
    cap: initial?.cap ?? '',
    telefono: initial?.telefono ?? '',
    numeroAddetti: initial?.numeroAddetti ?? null,
    referenti: initial?.referenti ?? '',
    enteId: initial?.ente?.id ?? null,
    fornitoreAlboId: initial?.fornitoreAlbo?.id ?? null,
  });
  const errors = fieldErrors(error);
  const nazioni = useGeo('nazioni', {});
  const province = useGeo('province', { nazioneId: f.nazioneId ?? undefined }, f.nazioneId != null);
  const enti = useLookup('enti');

  type TextKey = 'ragioneSociale' | 'partitaIva' | 'partitaIvaCee' | 'codiceFiscale' | 'localita' | 'indirizzo' | 'cap' | 'telefono' | 'referenti';
  const text = (k: TextKey, className?: string) => (
    <Field label={t(`company.s.${k}`)} error={errors[k]} className={className}>
      {(p) => <input {...p} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />}
    </Field>
  );
  const select = (label: string, value: number | null, items: { id: number; descrizione: string }[] | undefined, onChange: (v: number | null) => void, disabled = false) => (
    <Field label={label}>
      {(p) => (
        <select {...p} disabled={disabled} value={value ?? ''} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}>
          <option value="">{t('common.select')}</option>
          {items?.map((i) => (
            <option key={i.id} value={i.id}>
              {i.descrizione}
            </option>
          ))}
        </select>
      )}
    </Field>
  );

  return (
    <form className="subform" onSubmit={(e) => { e.preventDefault(); onSubmit(f); }} noValidate>
      <h3 className="subform__title">{initial ? t('company.subEdit') : t('company.subNew')}</h3>
      {error != null && <ErrorMessage error={error} />}
      <div className="grid grid--4">
        {text('ragioneSociale', 'field--wide')}
        {text('partitaIva')}
        {text('codiceFiscale')}
        {text('partitaIvaCee')}
        {select(t('company.s.nazione'), f.nazioneId, nazioni.data, (v) => setF({ ...f, nazioneId: v, provinciaId: null }))}
        {select(t('company.s.provincia'), f.provinciaId, province.data, (v) => setF({ ...f, provinciaId: v }), !province.data?.length)}
        {text('localita')}
        {text('indirizzo', 'field--wide')}
        {text('cap')}
        {text('telefono')}
        <Field label={t('company.s.numeroAddetti')} error={errors.numeroAddetti}>
          {(p) => (
            <input {...p} inputMode="numeric" value={toStr(f.numeroAddetti)} onChange={(e) => setF({ ...f, numeroAddetti: toNum(e.target.value) })} />
          )}
        </Field>
        {select(t('company.s.ente'), f.enteId, enti.data, (v) => setF({ ...f, enteId: v }))}
        {text('referenti', 'field--wide')}
      </div>
      <div className="formactions">
        <button type="submit" className="btn btn--primary" disabled={pending || !f.ragioneSociale.trim()}>
          {t('general.save')}
        </button>
        <button type="button" className="btn btn--quiet" onClick={onCancel}>
          {t('general.cancel')}
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Collegamenti
// ---------------------------------------------------------------------------
const LINK_TYPES: { tipo: TipoCollegamento; relazioni: Relazione[] }[] = [
  { tipo: 'CONSOLIDATO', relazioni: ['CONSOLIDA', 'CONSOLIDATO_IN'] },
  { tipo: 'ALTERNATIVO', relazioni: ['HA_ALTERNATIVO', 'ALTERNATIVO_DI'] },
  { tipo: 'PADRE_FIGLIO', relazioni: ['STESSA_AZIENDA'] },
];

function LinksSection({ id, links, canWrite, onDone }: { id: number; links: Collegamento[]; canWrite: boolean; onDone: (m: string) => void }) {
  const { t } = useTranslation();
  const add = useAddLink(id);
  const remove = useRemoveLink(id);
  const [adding, setAdding] = useState<TipoCollegamento | null>(null);

  return (
    <section className="block" aria-labelledby="sez-collegamenti">
      <SectionHead id="sez-collegamenti" title={t('company.links')} />
      <div className="linkgroups">
        {LINK_TYPES.map(({ tipo, relazioni }) => (
          <div key={tipo} className="linkgroup">
            {relazioni.map((rel, i) => {
              const list = links.filter((l) => l.relazione === rel);
              // la relazione "inversa" vuota non aggiunge informazioni: si mostra solo se ha elementi
              if (rel !== relazioni[0] && list.length === 0) return null;
              return (
                <div key={rel} className="linkgroup__list">
                  <h3 className="linkgroup__title">{t(`company.linkGroups.${rel}`)}</h3>
                  {i === 0 && <p className="linkgroup__help">{t(`company.linkHelp.${tipo}`)}</p>}
                  {list.length === 0 ? (
                    <p className="muted">{t('company.linkNone')}</p>
                  ) : (
                    <ul className="links">
                      {list.map((l) => (
                        <li key={l.id}>
                          <span>
                            <Link to={`/fornitori/${l.fornitore.id}/anagrafica`} className={l.fornitore.attivo ? undefined : 'is-ended'}>
                              {l.fornitore.ragioneSociale}
                            </Link>
                            {l.fornitore.stato && <span className="tag">{l.fornitore.stato}</span>}
                          </span>
                          {canWrite && (
                            <ConfirmButton
                              label={t('company.remove')}
                              confirmLabel={t('company.confirmRemove')}
                              disabled={remove.isPending}
                              onConfirm={() => remove.mutate(l.id, { onSuccess: () => onDone(t('company.linkRemoved')) })}
                            />
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
            {canWrite &&
              (adding === tipo ? (
                <SupplierPicker
                  selfId={id}
                  linkedIds={links.filter((l) => l.tipo === tipo).map((l) => l.fornitore.id)}
                  pending={add.isPending}
                  error={add.error}
                  onCancel={() => setAdding(null)}
                  onPick={(altroFornitoreId) =>
                    add.mutate(
                      { tipo, altroFornitoreId },
                      { onSuccess: () => { setAdding(null); onDone(t('company.linkAdded')); } },
                    )
                  }
                />
              ) : (
                <button
                  type="button"
                  className="btn btn--quiet btn--small"
                  disabled={adding !== null}
                  onClick={() => {
                    add.reset();
                    setAdding(tipo);
                  }}
                >
                  {t('company.linkAdd')}
                </button>
              ))}
          </div>
        ))}
      </div>
      {remove.isError && <ErrorMessage error={remove.error} />}
    </section>
  );
}

/** Ricerca di un fornitore da collegare, con risultati mentre si scrive. */
function SupplierPicker({
  selfId,
  linkedIds,
  pending,
  error,
  onCancel,
  onPick,
}: {
  selfId: number;
  /** Fornitori già collegati con questo tipo: compaiono ma non si possono scegliere */
  linkedIds: number[];
  pending: boolean;
  error: unknown;
  onCancel: () => void;
  onPick: (id: number) => void;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const query = useDebounced(text, 250);
  const results = useSupplierLookup(query);
  const candidates = results.data?.risultati.filter((r) => r.id !== selfId) ?? [];

  return (
    <div className="picker">
      {error != null && <ErrorMessage error={error} />}
      <Field label={t('company.linkSearch')} hint={t('company.linkSearchHint')}>
        {(p) => (
          <input
            {...p}
            type="search"
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        )}
      </Field>
      {query.trim().length >= 2 && results.isSuccess && (
        candidates.length === 0 ? (
          <p className="muted">{t('company.linkNoResults')}</p>
        ) : (
          <ul className="picker__results">
            {candidates.map((r) => (
              <li key={r.id}>
                <span>
                  {r.ragioneSociale}
                  {r.stato && <span className="tag">{r.stato}</span>}
                </span>
                {linkedIds.includes(r.id) ? (
                  <span className="muted">{t('company.linkAlready')}</span>
                ) : (
                  <button type="button" className="btn btn--secondary btn--small" disabled={pending} onClick={() => onPick(r.id)}>
                    {t('company.linkConfirm')}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )
      )}
      <button type="button" className="btn btn--quiet btn--small" onClick={onCancel}>
        {t('general.cancel')}
      </button>
    </div>
  );
}

/** Valore che si aggiorna solo dopo una pausa nella digitazione: evita una richiesta per ogni tasto. */
function useDebounced(value: string, ms: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), ms);
    return () => window.clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}
