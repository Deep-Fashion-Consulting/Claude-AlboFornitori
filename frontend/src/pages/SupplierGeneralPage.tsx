import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../api/client';
import {
  useAddAddress,
  useAddBrand,
  useAddCode,
  useAddEntity,
  useAddState,
  useMyEntities,
  useRemoveBrand,
  useRemoveCode,
  useRemoveEntity,
  useDeleteAddress,
  useGeo,
  useLookup,
  useRemoveState,
  useSetPrincipal,
  useSupplierGeneral,
  useUpdateGeneral,
  type NewAddress,
} from '../api/queries';
import type { GeneralData, SupplierGeneral, UpdateGeneral } from '../api/types';
import { useMe } from '../auth/AuthProvider';
import { ConfirmButton } from '../components/ConfirmButton';
import { DuplicateWarning, duplicatesOf } from '../components/DuplicateWarning';
import { ErrorMessage, fieldErrors, Flash, Loading, useFlash } from '../components/Feedback';
import { Field, ReadValue } from '../components/Field';
import { formatDate } from '../i18n';

export function SupplierGeneralPage() {
  const { t } = useTranslation();
  const id = Number(useParams().id);
  const me = useMe();
  const canWrite = me.permessi.scrittura && me.funzioni.includes('FORNITORE_ANAGRAFICA');
  const q = useSupplierGeneral(id);
  const [flash, setFlash] = useFlash();

  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorMessage error={q.error} onRetry={() => void q.refetch()} />;
  const s = q.data;

  return (
    <>
      <h1 className="page__title">{t('general.title')}</h1>
      <Flash message={flash} />
      <div className="sheet">
        <IdentitySection s={s} canWrite={canWrite} onSaved={() => setFlash(t('general.saved'))} onReload={() => void q.refetch()} />
        <RelationshipSection s={s} canWrite={canWrite} onSaved={() => setFlash(t('general.saved'))} onReload={() => void q.refetch()} />
        <StatesSection s={s} canWrite={canWrite} onDone={setFlash} />
        <AddressesSection s={s} canWrite={canWrite} onDone={setFlash} />
        <div className="sheet__pair">
          <EntitiesSection s={s} canWrite={canWrite} onDone={setFlash} />
          <CodesSection s={s} canWrite={canWrite} onDone={setFlash} />
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
/** Corpo completo del salvataggio a partire dai dati attuali: ogni sezione ne sovrascrive solo una parte. */
function currentBody(s: SupplierGeneral): UpdateGeneral {
  const { responsabileCodice: _ignored, ...dati } = s.dati;
  const m = s.master;
  return {
    ...dati,
    ragioneSociale: m.ragioneSociale,
    partitaIva: m.partitaIva,
    partitaIvaCee: m.partitaIvaCee,
    codiceFiscale: m.codiceFiscale,
    telefono: m.telefono,
    fax: m.fax,
    versione: s.versione,
  };
}

const ID_FIELDS = ['ragioneSociale', 'partitaIva', 'codiceFiscale', 'partitaIvaCee', 'telefono', 'fax'] as const;
type IdForm = Record<(typeof ID_FIELDS)[number], string>;

function IdentitySection({
  s,
  canWrite,
  onSaved,
  onReload,
}: {
  s: SupplierGeneral;
  canWrite: boolean;
  onSaved: () => void;
  onReload: () => void;
}) {
  const { t } = useTranslation();
  const m = s.master;
  const [editing, setEditing] = useState(false);
  const initial = (): IdForm => Object.fromEntries(ID_FIELDS.map((k) => [k, m[k] ?? ''])) as IdForm;
  const [form, setForm] = useState<IdForm>(initial);
  const update = useUpdateGeneral(s.id);
  const errors = fieldErrors(update.error);
  const duplicates = duplicatesOf(update.error);
  const conflict = update.error instanceof ApiError && update.error.code === 'MODIFICATO_DA_ALTRI';

  const save = (confermaDuplicato = false) =>
    update.mutate(
      { ...currentBody(s), ...form, confermaDuplicato },
      {
        onSuccess: () => {
          setEditing(false);
          onSaved();
        },
      },
    );

  return (
    <section className="block" aria-labelledby="sez-identita">
      <header className="block__head">
        <h2 id="sez-identita">{t('general.identity')}</h2>
        {canWrite && !editing && (
          <button
            type="button"
            className="btn btn--quiet btn--small"
            onClick={() => {
              setForm(initial());
              update.reset();
              setEditing(true);
            }}
          >
            {t('general.edit')}
          </button>
        )}
      </header>
      {!editing ? (
        <dl className="readgrid">
          <ReadValue label={t('general.f.ragioneSociale')}>{m.ragioneSociale}</ReadValue>
          <ReadValue label={t('general.f.partitaIva')}>{m.partitaIva}</ReadValue>
          <ReadValue label={t('general.f.codiceFiscale')}>{m.codiceFiscale}</ReadValue>
          <ReadValue label={t('general.f.partitaIvaCee')}>{m.partitaIvaCee}</ReadValue>
          <ReadValue label={t('general.f.telefono')}>{m.telefono}</ReadValue>
          <ReadValue label={t('general.f.fax')}>{m.fax}</ReadValue>
          {m.sostituitoDa && (
            <ReadValue label={t('general.f.sostituitoDa')}>
              <Link to={`/fornitori/${m.sostituitoDa.id}/anagrafica`}>{m.sostituitoDa.ragioneSociale}</Link>
            </ReadValue>
          )}
        </dl>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save(false);
          }}
          noValidate
        >
          {duplicates ? (
            <DuplicateWarning fornitori={duplicates} pending={update.isPending} onConfirm={() => save(true)} />
          ) : (
            update.isError && (
              <ErrorMessage
                error={update.error}
                action={
                  conflict && (
                    <button type="button" className="btn btn--quiet" onClick={() => { setEditing(false); onReload(); }}>
                      {t('general.reload')}
                    </button>
                  )
                }
              />
            )
          )}
          <div className="grid grid--3">
            {ID_FIELDS.map((k) => (
              <Field key={k} label={t(`general.f.${k}`)} error={errors[k]} className={k === 'ragioneSociale' ? 'field--wide' : undefined}>
                {(p) => (
                  <input
                    {...p}
                    type={k === 'telefono' || k === 'fax' ? 'tel' : 'text'}
                    value={form[k]}
                    onChange={(e) => {
                      setForm({ ...form, [k]: e.target.value });
                      if (duplicates) update.reset();
                    }}
                  />
                )}
              </Field>
            ))}
          </div>
          <div className="formactions">
            <button type="submit" className="btn btn--primary" disabled={update.isPending || !form.ragioneSociale.trim()}>
              {update.isPending ? t('general.saving') : t('general.save')}
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
const TEXT_FIELDS = ['denominazioneSociale', 'sedeLegale', 'uf', 'numeroRea', 'email', 'emailPec', 'sitoWeb'] as const;
const DATE_FIELDS = ['dataInizioAttivita', 'dataInizioRapporto', 'dataFineRapporto'] as const;
type EditForm = Record<(typeof TEXT_FIELDS)[number] | (typeof DATE_FIELDS)[number], string>;

const toForm = (d: GeneralData): EditForm =>
  Object.fromEntries([...TEXT_FIELDS, ...DATE_FIELDS].map((k) => [k, d[k] ?? ''])) as EditForm;

function RelationshipSection({
  s,
  canWrite,
  onSaved,
  onReload,
}: {
  s: SupplierGeneral;
  canWrite: boolean;
  onSaved: () => void;
  onReload: () => void;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<EditForm>(() => toForm(s.dati));
  const update = useUpdateGeneral(s.id);
  const errors = fieldErrors(update.error);
  const conflict = update.error instanceof ApiError && update.error.code === 'MODIFICATO_DA_ALTRI';

  const start = () => {
    setForm(toForm(s.dati));
    update.reset();
    setEditing(true);
  };
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    update.mutate(
      { ...currentBody(s), ...form },
      {
        onSuccess: () => {
          setEditing(false);
          onSaved();
        },
      },
    );
  };

  const d = s.dati;
  return (
    <section className="block" aria-labelledby="sez-rapporto">
      <header className="block__head">
        <h2 id="sez-rapporto">{t('general.relationship')}</h2>
        {canWrite && !editing && (
          <button type="button" className="btn btn--quiet btn--small" onClick={start}>
            {t('general.edit')}
          </button>
        )}
      </header>

      {!editing ? (
        <dl className="readgrid">
          <ReadValue label={t('general.f.denominazioneSociale')}>{d.denominazioneSociale}</ReadValue>
          <ReadValue label={t('general.f.sedeLegale')}>{d.sedeLegale}</ReadValue>
          <ReadValue label={t('general.f.dataInizioAttivita')}>{d.dataInizioAttivita && formatDate(d.dataInizioAttivita)}</ReadValue>
          <ReadValue label={t('general.f.dataInizioRapporto')}>{d.dataInizioRapporto && formatDate(d.dataInizioRapporto)}</ReadValue>
          <ReadValue label={t('general.f.dataFineRapporto')}>{d.dataFineRapporto && formatDate(d.dataFineRapporto)}</ReadValue>
          <ReadValue label={t('general.f.uf')}>{d.uf}</ReadValue>
          <ReadValue label={t('general.f.numeroRea')}>{d.numeroRea}</ReadValue>
          <ReadValue label={t('general.f.responsabileCodice')}>{d.responsabileCodice}</ReadValue>
          <ReadValue label={t('general.f.email')}>{d.email && <a href={`mailto:${d.email}`}>{d.email}</a>}</ReadValue>
          <ReadValue label={t('general.f.emailPec')}>{d.emailPec}</ReadValue>
          <ReadValue label={t('general.f.sitoWeb')}>
            {d.sitoWeb && (
              <a href={/^https?:\/\//.test(d.sitoWeb) ? d.sitoWeb : `https://${d.sitoWeb}`} target="_blank" rel="noreferrer">
                {d.sitoWeb}
              </a>
            )}
          </ReadValue>
          <ReadValue label={t('general.f.operaConSubfornitori')}>{s.operaConSubfornitori ? t('common.yes') : t('common.no')}</ReadValue>
        </dl>
      ) : (
        <form onSubmit={onSubmit} noValidate>
          {update.isError && (
            <ErrorMessage
              error={update.error}
              action={
                conflict && (
                  <button
                    type="button"
                    className="btn btn--quiet"
                    onClick={() => {
                      setEditing(false);
                      onReload();
                    }}
                  >
                    {t('general.reload')}
                  </button>
                )
              }
            />
          )}
          <div className="grid grid--3">
            {(['denominazioneSociale', 'sedeLegale', 'uf', 'numeroRea'] as const).map((k) => (
              <Field key={k} label={t(`general.f.${k}`)} error={errors[k]} className={k === 'sedeLegale' ? 'field--wide' : undefined}>
                {(p) => <input {...p} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />}
              </Field>
            ))}
            {DATE_FIELDS.map((k) => (
              <Field key={k} label={t(`general.f.${k}`)} error={errors[k]}>
                {(p) => <input {...p} type="date" value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />}
              </Field>
            ))}
            {(['email', 'emailPec'] as const).map((k) => (
              <Field key={k} label={t(`general.f.${k}`)} error={errors[k]}>
                {(p) => <input {...p} type="email" value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />}
              </Field>
            ))}
            <Field label={t('general.f.sitoWeb')} error={errors.sitoWeb}>
              {(p) => <input {...p} value={form.sitoWeb} onChange={(e) => setForm({ ...form, sitoWeb: e.target.value })} />}
            </Field>
          </div>
          <div className="formactions">
            <button type="submit" className="btn btn--primary" disabled={update.isPending}>
              {update.isPending ? t('general.saving') : t('general.save')}
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
function StatesSection({ s, canWrite, onDone }: { s: SupplierGeneral; canWrite: boolean; onDone: (m: string) => void }) {
  const { t } = useTranslation();
  const stati = useLookup('stati-fornitore');
  const add = useAddState(s.id);
  const remove = useRemoveState(s.id);
  const [statoId, setStatoId] = useState('');
  const [dataDa, setDataDa] = useState(() => new Date().toISOString().slice(0, 10));

  return (
    <section className="block" aria-labelledby="sez-stati">
      <header className="block__head">
        <h2 id="sez-stati">{t('states.title')}</h2>
      </header>
      {s.stati.length === 0 ? (
        <p className="block__empty">{t('states.empty')}</p>
      ) : (
        <table className="table table--compact">
          <thead>
            <tr>
              <th scope="col">{t('states.state')}</th>
              <th scope="col">{t('states.from')}</th>
              {canWrite && <th scope="col"><span className="visually-hidden">{t('common.actions')}</span></th>}
            </tr>
          </thead>
          <tbody>
            {s.stati.map((st) => (
              <tr key={st.id}>
                <td>
                  {st.descrizione}
                  {st.corrente && <span className="tag">{t('states.current')}</span>}
                </td>
                <td className="num">{formatDate(st.dataDa)}</td>
                {canWrite && (
                  <td className="table__actions">
                    <ConfirmButton
                      label={t('states.remove')}
                      confirmLabel={t('states.confirmRemove')}
                      disabled={remove.isPending}
                      onConfirm={() => remove.mutate(st.id, { onSuccess: () => onDone(t('states.removed')) })}
                    />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {remove.isError && <ErrorMessage error={remove.error} />}

      {canWrite && (
        <form
          className="inlineform"
          onSubmit={(e) => {
            e.preventDefault();
            add.mutate(
              { statoId: Number(statoId), dataDa },
              {
                onSuccess: () => {
                  setStatoId('');
                  onDone(t('states.added'));
                },
              },
            );
          }}
        >
          <Field label={t('states.state')}>
            {(p) => (
              <select {...p} value={statoId} onChange={(e) => setStatoId(e.target.value)} required>
                <option value="">{t('common.select')}</option>
                {stati.data?.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.descrizione}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label={t('states.from')}>
            {(p) => <input {...p} type="date" value={dataDa} onChange={(e) => setDataDa(e.target.value)} required />}
          </Field>
          <button type="submit" className="btn btn--secondary" disabled={!statoId || !dataDa || add.isPending}>
            {t('states.add')}
          </button>
        </form>
      )}
      {add.isError && <ErrorMessage error={add.error} />}
    </section>
  );
}

// ---------------------------------------------------------------------------
function AddressesSection({ s, canWrite, onDone }: { s: SupplierGeneral; canWrite: boolean; onDone: (m: string) => void }) {
  const { t } = useTranslation();
  const setPrincipal = useSetPrincipal(s.id);
  const remove = useDeleteAddress(s.id);
  const [adding, setAdding] = useState(false);
  const error = setPrincipal.error ?? remove.error;

  return (
    <section className="block" aria-labelledby="sez-indirizzi">
      <header className="block__head">
        <h2 id="sez-indirizzi">{t('addresses.title')}</h2>
        {canWrite && !adding && (
          <button type="button" className="btn btn--quiet btn--small" onClick={() => setAdding(true)}>
            {t('addresses.add')}
          </button>
        )}
      </header>

      {s.indirizzi.length === 0 ? (
        <p className="block__empty">{t('addresses.empty')}</p>
      ) : (
        <ul className="addresses">
          {s.indirizzi.map((a) => (
            <li key={a.id} className={`address ${a.principale ? 'address--main' : ''}`}>
              <div>
                <p className="address__type">
                  {a.tipoIndirizzo.descrizione}
                  {a.principale && <span className="tag">{t('addresses.main')}</span>}
                </p>
                <p className="address__line">{a.indirizzo}</p>
                <p className="address__line">
                  {[a.cap, a.localita.descrizione, a.provincia?.sigla && `(${a.provincia.sigla})`].filter(Boolean).join(' ')},{' '}
                  {a.nazione.descrizione}
                </p>
                {a.telefono && <p className="address__line address__muted">{a.telefono}</p>}
                {a.latitudine != null && a.longitudine != null && (
                  <a
                    className="address__map"
                    href={`https://www.openstreetmap.org/?mlat=${a.latitudine}&mlon=${a.longitudine}#map=16/${a.latitudine}/${a.longitudine}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {t('addresses.map')}
                  </a>
                )}
              </div>
              {canWrite && (
                <div className="address__actions">
                  {!a.principale && (
                    <button
                      type="button"
                      className="btn btn--quiet btn--small"
                      disabled={setPrincipal.isPending}
                      onClick={() => setPrincipal.mutate(a.id, { onSuccess: () => onDone(t('addresses.mainSet')) })}
                    >
                      {t('addresses.makeMain')}
                    </button>
                  )}
                  <ConfirmButton
                    label={t('addresses.remove')}
                    confirmLabel={t('addresses.confirmRemove')}
                    disabled={remove.isPending}
                    onConfirm={() => remove.mutate(a.id, { onSuccess: () => onDone(t('addresses.removed')) })}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {error && <ErrorMessage error={error} />}

      {adding && (
        <NewAddressForm
          supplierId={s.id}
          onClose={() => setAdding(false)}
          onAdded={() => {
            setAdding(false);
            onDone(t('addresses.added'));
          }}
        />
      )}
    </section>
  );
}

function NewAddressForm({ supplierId, onClose, onAdded }: { supplierId: number; onClose: () => void; onAdded: () => void }) {
  const { t } = useTranslation();
  const add = useAddAddress(supplierId);
  const tipi = useLookup('tipi-indirizzo');
  const [geo, setGeo] = useState({ nazioneId: 0, regioneId: 0, provinciaId: 0 });
  const [a, setA] = useState<NewAddress>({ tipoIndirizzoId: 0, localitaId: 0, indirizzo: '', cap: '', telefono: '', principale: false });
  const [localitaEstera, setLocalitaEstera] = useState('');
  const errors = fieldErrors(add.error);

  const nazioni = useGeo('nazioni', {});
  const regioni = useGeo('regioni', { nazioneId: geo.nazioneId }, geo.nazioneId > 0);
  // In Italia il comune si sceglie dall'elenco ISTAT; per le nazioni estere la località si scrive,
  // con i suggerimenti di quelle già usate
  const hasRegions = (regioni.data?.length ?? 0) > 0;
  const foreign = geo.nazioneId > 0 && regioni.isSuccess && !hasRegions;
  const province = useGeo('province', { regioneId: geo.regioneId }, geo.regioneId > 0);
  const localita = useGeo(
    'localita',
    hasRegions ? { provinciaId: geo.provinciaId } : { nazioneId: geo.nazioneId },
    hasRegions ? geo.provinciaId > 0 : geo.nazioneId > 0 && regioni.isSuccess,
  );

  const options = (items: { id: number; descrizione: string }[] | undefined) => (
    <>
      <option value="0">{t('common.select')}</option>
      {items?.map((i) => (
        <option key={i.id} value={i.id}>
          {i.descrizione}
        </option>
      ))}
    </>
  );

  return (
    <form
      className="subform"
      aria-label={t('addresses.newTitle')}
      onSubmit={(e) => {
        e.preventDefault();
        const body: NewAddress = foreign
          ? { ...a, localitaId: undefined, nazioneId: geo.nazioneId, localitaNome: localitaEstera }
          : a;
        add.mutate(body, { onSuccess: onAdded });
      }}
    >
      <h3 className="subform__title">{t('addresses.newTitle')}</h3>
      {add.isError && <ErrorMessage error={add.error} />}
      <div className="grid grid--4">
        <Field label={t('addresses.type')} error={errors.tipoIndirizzoId}>
          {(p) => (
            <select {...p} value={a.tipoIndirizzoId} onChange={(e) => setA({ ...a, tipoIndirizzoId: Number(e.target.value) })}>
              {options(tipi.data)}
            </select>
          )}
        </Field>
        <Field label={t('addresses.country')}>
          {(p) => (
            <select
              {...p}
              value={geo.nazioneId}
              onChange={(e) => {
                setGeo({ nazioneId: Number(e.target.value), regioneId: 0, provinciaId: 0 });
                setA({ ...a, localitaId: 0 });
              }}
            >
              {options(nazioni.data)}
            </select>
          )}
        </Field>
        {hasRegions && (
          <>
            <Field label={t('addresses.region')}>
              {(p) => (
                <select
                  {...p}
                  value={geo.regioneId}
                  onChange={(e) => {
                    setGeo({ ...geo, regioneId: Number(e.target.value), provinciaId: 0 });
                    setA({ ...a, localitaId: 0 });
                  }}
                >
                  {options(regioni.data)}
                </select>
              )}
            </Field>
            <Field label={t('addresses.province')}>
              {(p) => (
                <select
                  {...p}
                  value={geo.provinciaId}
                  disabled={!geo.regioneId}
                  onChange={(e) => {
                    setGeo({ ...geo, provinciaId: Number(e.target.value) });
                    setA({ ...a, localitaId: 0 });
                  }}
                >
                  {options(province.data)}
                </select>
              )}
            </Field>
          </>
        )}
        {foreign ? (
          <Field label={t('addresses.locality')} error={errors.localitaNome ?? errors.localitaId}>
            {(p) => (
              <>
                <input {...p} list="localita-estere" value={localitaEstera} onChange={(e) => setLocalitaEstera(e.target.value)} />
                <datalist id="localita-estere">
                  {localita.data?.map((l) => <option key={l.id} value={l.descrizione} />)}
                </datalist>
              </>
            )}
          </Field>
        ) : (
          <Field label={t('addresses.locality')} error={errors.localitaId}>
            {(p) => (
              <select
                {...p}
                value={a.localitaId}
                disabled={!localita.data}
                onChange={(e) => {
                  const id = Number(e.target.value);
                  const cap = localita.data?.find((l) => l.id === id)?.capDefault;
                  setA({ ...a, localitaId: id, cap: a.cap || cap || '' });
                }}
              >
                {options(localita.data)}
              </select>
            )}
          </Field>
        )}
        <Field label={t('addresses.address')} error={errors.indirizzo} className="field--wide">
          {(p) => <input {...p} value={a.indirizzo} onChange={(e) => setA({ ...a, indirizzo: e.target.value })} />}
        </Field>
        <Field label={t('addresses.cap')} error={errors.cap}>
          {(p) => <input {...p} value={a.cap} onChange={(e) => setA({ ...a, cap: e.target.value })} inputMode="numeric" />}
        </Field>
        <Field label={t('addresses.phone')} error={errors.telefono}>
          {(p) => <input {...p} type="tel" value={a.telefono} onChange={(e) => setA({ ...a, telefono: e.target.value })} />}
        </Field>
      </div>
      <label className="check check--standalone">
        <input type="checkbox" checked={a.principale} onChange={(e) => setA({ ...a, principale: e.target.checked })} />
        {t('addresses.setAsMain')}
      </label>
      <div className="formactions">
        <button
          type="submit"
          className="btn btn--primary"
          disabled={!a.tipoIndirizzoId || (foreign ? !localitaEstera.trim() : !a.localitaId) || !a.indirizzo.trim() || add.isPending}
        >
          {t('addresses.add')}
        </button>
        <button type="button" className="btn btn--quiet" onClick={onClose}>
          {t('general.cancel')}
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
/** Select + pulsante "Aggiungi" per le piccole associazioni della scheda (enti, marchi). */
function AddPicker({
  label,
  items,
  pending,
  onAdd,
}: {
  label: string;
  items: { id: number; descrizione: string }[];
  pending: boolean;
  onAdd: (id: number) => void;
}) {
  const { t } = useTranslation();
  const [value, setValue] = useState('');
  if (items.length === 0) return null;
  return (
    <form
      className="inlineform inlineform--tight"
      onSubmit={(e) => {
        e.preventDefault();
        onAdd(Number(value));
        setValue('');
      }}
    >
      <Field label={label}>
        {(p) => (
          <select {...p} value={value} onChange={(e) => setValue(e.target.value)}>
            <option value="">{t('common.select')}</option>
            {items.map((i) => (
              <option key={i.id} value={i.id}>
                {i.descrizione}
              </option>
            ))}
          </select>
        )}
      </Field>
      <button type="submit" className="btn btn--secondary btn--small" disabled={!value || pending}>
        {t('classification.add')}
      </button>
    </form>
  );
}

function EntitiesSection({ s, canWrite, onDone }: { s: SupplierGeneral; canWrite: boolean; onDone: (m: string) => void }) {
  const { t } = useTranslation();
  const mine = useMyEntities();
  const add = useAddEntity(s.id);
  const remove = useRemoveEntity(s.id);
  const linked = new Set(s.enti.map((e) => e.enteId));
  const available = (mine.data ?? []).filter((e) => !linked.has(e.id));
  const myIds = new Set((mine.data ?? []).map((e) => e.id));

  return (
    <section className="block" aria-labelledby="sez-enti">
      <header className="block__head">
        <h2 id="sez-enti">{t('entities.title')}</h2>
      </header>
      {s.enti.length === 0 ? (
        <p className="block__empty">{t('entities.empty')}</p>
      ) : (
        <ul className="entities">
          {s.enti.map((e) => (
            <li key={e.enteId}>
              <span>{e.descrizione}</span>
              <span className="entities__right">
                {e.autorizzato ? (
                  e.valutazioneGenerale != null ? (
                    <span className="rating" title={t('entities.rating')}>
                      <span className="visually-hidden">{t('entities.rating')}: </span>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <span key={n} className={`rating__dot ${n <= e.valutazioneGenerale! ? 'is-on' : ''}`} aria-hidden="true" />
                      ))}
                      <span className="rating__num">{e.valutazioneGenerale}/5</span>
                    </span>
                  ) : (
                    <span className="muted">{t('entities.notRated')}</span>
                  )
                ) : (
                  <span className="muted">{t('entities.notAuthorized')}</span>
                )}
                {canWrite && myIds.has(e.enteId) && (
                  <ConfirmButton
                    label={t('classification.remove')}
                    confirmLabel={t('classification.confirmRemove')}
                    disabled={remove.isPending}
                    onConfirm={() => remove.mutate(e.enteId, { onSuccess: () => onDone(t('classification.removed')) })}
                  />
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      {remove.isError && <ErrorMessage error={remove.error} />}
      {canWrite && (
        <AddPicker
          label={t('entities.add')}
          items={available}
          pending={add.isPending}
          onAdd={(id) => add.mutate(id, { onSuccess: () => onDone(t('classification.added')) })}
        />
      )}
      {add.isError && <ErrorMessage error={add.error} />}
    </section>
  );
}

function CodesSection({ s, canWrite, onDone }: { s: SupplierGeneral; canWrite: boolean; onDone: (m: string) => void }) {
  const { t } = useTranslation();
  const sistemi = useLookup('applicativi');
  const marchi = useLookup('marchi');
  const addCode = useAddCode(s.id);
  const removeCode = useRemoveCode(s.id);
  const addBrand = useAddBrand(s.id);
  const removeBrand = useRemoveBrand(s.id);
  const [sistema, setSistema] = useState('');
  const [codice, setCodice] = useState('');
  const usedBrands = new Set(s.marchi.map((m) => m.marchioId));

  const chips = <T extends { id: number }>(items: T[], text: (i: T) => ReactNode, onRemove: (i: T) => void, pending: boolean) => (
    <ul className="chips">
      {items.map((i) => (
        <li key={i.id} className="chip">
          <span>{text(i)}</span>
          {canWrite && (
            <ConfirmButton
              label="×"
              ariaLabel={t('classification.remove')}
              confirmLabel={t('classification.confirmRemove')}
              disabled={pending}
              onConfirm={() => onRemove(i)}
            />
          )}
        </li>
      ))}
    </ul>
  );

  return (
    <section className="block" aria-labelledby="sez-codici">
      <header className="block__head">
        <h2 id="sez-codici">{t('codes.title')}</h2>
      </header>

      <h3 className="subhead">{t('codes.applicationCodes')}</h3>
      {s.codiciApplicativi.length === 0 ? (
        <p className="block__empty">{t('codes.noCodes')}</p>
      ) : (
        chips(
          s.codiciApplicativi,
          (c) => (
            <>
              <span className="code__system">{c.applicativo}</span> <strong>{c.codice}</strong>
            </>
          ),
          (c) => removeCode.mutate(c.id, { onSuccess: () => onDone(t('classification.removed')) }),
          removeCode.isPending,
        )
      )}
      {canWrite && (sistemi.data?.length ?? 0) > 0 && (
        <form
          className="inlineform inlineform--tight"
          onSubmit={(e) => {
            e.preventDefault();
            addCode.mutate(
              { applicativoId: Number(sistema), codice },
              {
                onSuccess: () => {
                  setCodice('');
                  onDone(t('classification.added'));
                },
              },
            );
          }}
        >
          <Field label={t('codes.system')}>
            {(p) => (
              <select {...p} value={sistema} onChange={(e) => setSistema(e.target.value)}>
                <option value="">{t('common.select')}</option>
                {sistemi.data?.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.descrizione}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label={t('codes.code')}>{(p) => <input {...p} value={codice} onChange={(e) => setCodice(e.target.value)} />}</Field>
          <button type="submit" className="btn btn--secondary btn--small" disabled={!sistema || !codice.trim() || addCode.isPending}>
            {t('classification.add')}
          </button>
        </form>
      )}
      {(addCode.error ?? removeCode.error) != null && <ErrorMessage error={addCode.error ?? removeCode.error} />}

      <h3 className="subhead">{t('codes.brands')}</h3>
      {s.marchi.length === 0 ? (
        <p className="block__empty">{t('codes.noBrands')}</p>
      ) : (
        chips(
          s.marchi,
          (m) => [m.marchio, m.divisione].filter(Boolean).join(' / '),
          (m) => removeBrand.mutate(m.id, { onSuccess: () => onDone(t('classification.removed')) }),
          removeBrand.isPending,
        )
      )}
      {canWrite && (
        <AddPicker
          label={t('codes.brand')}
          items={(marchi.data ?? []).filter((m) => !usedBrands.has(m.id))}
          pending={addBrand.isPending}
          onAdd={(id) => addBrand.mutate(id, { onSuccess: () => onDone(t('classification.added')) })}
        />
      )}
      {(addBrand.error ?? removeBrand.error) != null && <ErrorMessage error={addBrand.error ?? removeBrand.error} />}
    </section>
  );
}
