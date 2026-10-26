import { useMemo, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useGeo, useLookup, useMyEntities, useSupplierSearch } from '../api/queries';
import { ErrorMessage, Loading } from '../components/Feedback';
import { useMe } from '../auth/AuthProvider';
import { Field } from '../components/Field';

type Form = Record<string, string | string[]>;

const ADVANCED = [
  'partitaIvaCee', 'uf', 'applicativoId', 'marchioId', 'statoId', 'nazioneId', 'regioneId', 'provinciaId',
  'inizioRapportoDa', 'inizioRapportoA', 'fineRapportoDa', 'fineRapportoA', 'rapporto',
  'padriFigli', 'consolidati', 'ordinatoSap', 'ordinatoSt3', 'fatturatoAttivo', 'fatturatoPassivo',
  'enti', 'classiMerceologiche', 'soloPreferiti',
] as const;
const MULTI = new Set(['enti', 'classiMerceologiche']);
const PRESENCE = ['ordinatoSap', 'ordinatoSt3', 'fatturatoAttivo', 'fatturatoPassivo', 'padriFigli', 'consolidati'] as const;

function fromParams(sp: URLSearchParams): Form {
  const f: Form = { modoNome: 'contiene' };
  for (const key of new Set(sp.keys())) {
    if (key === 'cerca' || key === 'pagina') continue;
    f[key] = MULTI.has(key) ? sp.getAll(key) : (sp.get(key) ?? '');
  }
  return f;
}

function toParams(f: Form, pagina = 1): URLSearchParams {
  const sp = new URLSearchParams({ cerca: '1' });
  for (const [key, value] of Object.entries(f)) {
    if (Array.isArray(value)) value.forEach((v) => sp.append(key, v));
    else if (value !== '' && !(key === 'modoNome' && value === 'contiene')) sp.set(key, value);
  }
  if (pagina > 1) sp.set('pagina', String(pagina));
  return sp;
}

export function SearchPage() {
  const { t } = useTranslation();
  const me = useMe();
  const canCreate = me.permessi.scrittura && me.funzioni.includes('FORNITORE_ANAGRAFICA');
  const [searchParams, setSearchParams] = useSearchParams();
  const [form, setForm] = useState<Form>(() => fromParams(searchParams));
  const activeAdvanced = ADVANCED.filter((k) => {
    const v = form[k];
    return Array.isArray(v) ? v.length > 0 : Boolean(v);
  }).length;
  const [showAdvanced, setShowAdvanced] = useState(activeAdvanced > 0);

  const submitted = searchParams.has('cerca');
  const pagina = Number(searchParams.get('pagina') ?? '1');
  const apiParams = useMemo(() => {
    const p: Record<string, string | string[]> = {};
    for (const key of new Set(searchParams.keys())) {
      if (key === 'cerca') continue;
      p[key] = MULTI.has(key) ? searchParams.getAll(key) : searchParams.get(key)!;
    }
    return p;
  }, [searchParams]);
  const results = useSupplierSearch(apiParams, submitted);

  const set = (key: string, value: string | string[]) =>
    setForm((f) => {
      const next = { ...f, [key]: value };
      // la geografia è a cascata: cambiando un livello si azzerano quelli sotto
      if (key === 'nazioneId') next.regioneId = next.provinciaId = '';
      if (key === 'regioneId') next.provinciaId = '';
      return next;
    });
  const val = (key: string) => (form[key] as string | undefined) ?? '';
  const toggle = (key: string, id: string) => {
    const cur = (form[key] as string[] | undefined) ?? [];
    set(key, cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]);
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setSearchParams(toParams(form));
  };

  return (
    <>
      <div className="page__head">
        <h1 className="page__title">{t('search.title')}</h1>
        {canCreate && (
          <Link to="/fornitori/nuovo" className="btn btn--secondary">
            {t('newSupplier.button')}
          </Link>
        )}
      </div>

      <form className="searchform" onSubmit={onSubmit} role="search">
        <div className="searchform__primary">
          <Field label={t('search.name')} className="field--grow">
            {(p) => (
              <div className="inputgroup">
                <select
                  aria-label={t('search.nameMode')}
                  value={val('modoNome')}
                  onChange={(e) => set('modoNome', e.target.value)}
                >
                  {(['contiene', 'inizia', 'uguale', 'finisce'] as const).map((m) => (
                    <option key={m} value={m}>
                      {t(`search.modes.${m}`)}
                    </option>
                  ))}
                </select>
                <input {...p} type="search" value={val('nome')} onChange={(e) => set('nome', e.target.value)} autoFocus />
              </div>
            )}
          </Field>
          <TextFilter label={t('search.vat')} name="partitaIva" val={val} set={set} />
          <TextFilter label={t('search.taxCode')} name="codiceFiscale" val={val} set={set} />
          <TextFilter label={t('search.externalCode')} name="codiceEsterno" val={val} set={set} />
        </div>

        <button
          type="button"
          className="disclosure"
          aria-expanded={showAdvanced}
          aria-controls="filtri-avanzati"
          onClick={() => setShowAdvanced((s) => !s)}
        >
          {showAdvanced ? t('search.fewer') : t('search.more')}
          {!showAdvanced && activeAdvanced > 0 && (
            <span className="disclosure__count">{t('search.activeFilters', { count: activeAdvanced })}</span>
          )}
        </button>

        {showAdvanced && <AdvancedFilters id="filtri-avanzati" val={val} set={set} form={form} toggle={toggle} />}

        <div className="searchform__actions">
          <button type="submit" className="btn btn--primary">
            {t('search.submit')}
          </button>
          <button
            type="button"
            className="btn btn--quiet"
            onClick={() => {
              setForm({ modoNome: 'contiene' });
              setSearchParams(new URLSearchParams());
            }}
          >
            {t('search.reset')}
          </button>
        </div>
      </form>

      <section aria-live="polite" className="results">
        {!submitted && <p className="results__hint">{t('search.start')}</p>}
        {submitted && results.isPending && <Loading />}
        {results.isError && <ErrorMessage error={results.error} onRetry={() => void results.refetch()} />}
        {results.data && (
          <ResultsTable
            data={results.data}
            pagina={pagina}
            onPage={(p) => setSearchParams(toParams(fromParams(searchParams), p))}
          />
        )}
      </section>
    </>
  );
}

function TextFilter({
  label,
  name,
  val,
  set,
}: {
  label: string;
  name: string;
  val: (k: string) => string;
  set: (k: string, v: string) => void;
}) {
  return <Field label={label}>{(p) => <input {...p} value={val(name)} onChange={(e) => set(name, e.target.value)} />}</Field>;
}

function AdvancedFilters({
  id,
  val,
  set,
  form,
  toggle,
}: {
  id: string;
  val: (k: string) => string;
  set: (k: string, v: string) => void;
  form: Form;
  toggle: (k: string, id: string) => void;
}) {
  const { t } = useTranslation();
  const marchi = useLookup('marchi');
  const sistemi = useLookup('applicativi');
  const stati = useLookup('stati-fornitore');
  const classi = useLookup('classi-merceologiche');
  const enti = useMyEntities();
  const nazioni = useGeo('nazioni', {});
  const nazioneId = Number(val('nazioneId')) || undefined;
  const regioneId = Number(val('regioneId')) || undefined;
  const regioni = useGeo('regioni', { nazioneId }, Boolean(nazioneId));
  const province = useGeo('province', { regioneId }, Boolean(regioneId));

  const select = (name: string, label: string, items: { id: number; descrizione: string }[] | undefined, disabled = false) => (
    <Field label={label}>
      {(p) => (
        <select {...p} value={val(name)} onChange={(e) => set(name, e.target.value)} disabled={disabled}>
          <option value="">{t('search.any')}</option>
          {items?.map((i) => (
            <option key={i.id} value={i.id}>
              {i.descrizione}
            </option>
          ))}
        </select>
      )}
    </Field>
  );

  const checks = (name: string, items: { id: number; descrizione: string }[] | undefined) => {
    const selected = (form[name] as string[] | undefined) ?? [];
    return (
      <div className="checklist">
        {items?.map((i) => (
          <label key={i.id} className="check">
            <input type="checkbox" checked={selected.includes(String(i.id))} onChange={() => toggle(name, String(i.id))} />
            {i.descrizione}
          </label>
        ))}
      </div>
    );
  };

  return (
    <div id={id} className="searchform__advanced">
      <fieldset className="filtergroup">
        <legend>{t('codes.title')}</legend>
        <div className="grid grid--4">
          <TextFilter label={t('search.vatEu')} name="partitaIvaCee" val={val} set={set} />
          <TextFilter label={t('search.uf')} name="uf" val={val} set={set} />
          {select('applicativoId', t('search.externalSystem'), sistemi.data)}
          {select('marchioId', t('search.brand'), marchi.data)}
          {select('statoId', t('search.state'), stati.data)}
        </div>
      </fieldset>

      <fieldset className="filtergroup">
        <legend>{t('addresses.title')}</legend>
        <div className="grid grid--4">
          {select('nazioneId', t('search.country'), nazioni.data)}
          {select('regioneId', t('search.region'), regioni.data, !nazioneId)}
          {select('provinciaId', t('search.province'), province.data, !regioneId)}
        </div>
      </fieldset>

      <fieldset className="filtergroup">
        <legend>{t('search.relationship')}</legend>
        <div className="grid grid--4">
          <Field label={t('search.relStatus')}>
            {(p) => (
              <select {...p} value={val('rapporto')} onChange={(e) => set('rapporto', e.target.value)}>
                <option value="">{t('search.relAll')}</option>
                <option value="attivi">{t('search.relActive')}</option>
                <option value="cessati">{t('search.relEnded')}</option>
              </select>
            )}
          </Field>
          <DateRange label={t('search.relStart')} from="inizioRapportoDa" to="inizioRapportoA" val={val} set={set} />
          <DateRange label={t('search.relEnd')} from="fineRapportoDa" to="fineRapportoA" val={val} set={set} />
        </div>
        <div className="grid grid--3">
          {PRESENCE.map((k) => (
            <Field key={k} label={t(`search.${presenceLabel[k]}`)}>
              {(p) => (
                <select {...p} value={val(k)} onChange={(e) => set(k, e.target.value)}>
                  <option value="">{t('search.any')}</option>
                  <option value="si">{t('search.yes')}</option>
                  <option value="no">{t('search.no')}</option>
                </select>
              )}
            </Field>
          ))}
        </div>
      </fieldset>

      <fieldset className="filtergroup">
        <legend>{t('search.entities')}</legend>
        <p className="field__hint">{t('search.entitiesHint')}</p>
        {checks('enti', enti.data)}
      </fieldset>

      <fieldset className="filtergroup">
        <legend>{t('search.commodity')}</legend>
        {checks('classiMerceologiche', classi.data)}
      </fieldset>

      <label className="check check--standalone">
        <input
          type="checkbox"
          checked={val('soloPreferiti') === 'true'}
          onChange={(e) => set('soloPreferiti', e.target.checked ? 'true' : '')}
        />
        {t('search.favouritesOnly')}
      </label>
    </div>
  );
}

const presenceLabel: Record<(typeof PRESENCE)[number], string> = {
  padriFigli: 'fatherSon',
  consolidati: 'consolidated',
  ordinatoSap: 'ordersSap',
  ordinatoSt3: 'ordersSt3',
  fatturatoAttivo: 'turnoverActive',
  fatturatoPassivo: 'turnoverPassive',
};

function DateRange({
  label,
  from,
  to,
  val,
  set,
}: {
  label: string;
  from: string;
  to: string;
  val: (k: string) => string;
  set: (k: string, v: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <fieldset className="daterange">
      <legend className="field__label">{label}</legend>
      <div className="daterange__inputs">
        <input type="date" aria-label={`${label} ${t('search.from')}`} value={val(from)} onChange={(e) => set(from, e.target.value)} />
        <span aria-hidden="true">–</span>
        <input type="date" aria-label={`${label} ${t('search.to')}`} value={val(to)} onChange={(e) => set(to, e.target.value)} />
      </div>
    </fieldset>
  );
}

function ResultsTable({
  data,
  pagina,
  onPage,
}: {
  data: NonNullable<ReturnType<typeof useSupplierSearch>['data']>;
  pagina: number;
  onPage: (p: number) => void;
}) {
  const { t } = useTranslation();
  if (data.totale === 0) return <p className="results__hint">{t('search.none')}</p>;
  const from = (pagina - 1) * data.limite + 1;
  const to = Math.min(pagina * data.limite, data.totale);
  const pages = Math.ceil(data.totale / data.limite);

  return (
    <>
      <div className="results__bar">
        <p className="results__count">{t('search.results', { from, to, total: data.totale })}</p>
        {pages > 1 && (
          <div className="pager">
            <button type="button" className="btn btn--quiet btn--small" disabled={pagina <= 1} onClick={() => onPage(pagina - 1)}>
              {t('search.prev')}
            </button>
            <button type="button" className="btn btn--quiet btn--small" disabled={pagina >= pages} onClick={() => onPage(pagina + 1)}>
              {t('search.next')}
            </button>
          </div>
        )}
      </div>
      <div className="tablewrap">
        <table className="table">
          <thead>
            <tr>
              <th scope="col">{t('search.col.name')}</th>
              <th scope="col">{t('search.col.vat')}</th>
              <th scope="col">{t('search.col.taxCode')}</th>
              <th scope="col">{t('search.col.codes')}</th>
              <th scope="col">{t('search.col.state')}</th>
            </tr>
          </thead>
          <tbody>
            {data.risultati.map((r) => (
              <tr key={r.id} className={r.attivo ? undefined : 'is-ended'}>
                <td>
                  <Link to={`/fornitori/${r.id}/anagrafica`} className="table__primary">
                    {r.ragioneSociale}
                  </Link>
                  {r.preferito && (
                    <svg className="table__star" viewBox="0 0 24 24" width="14" height="14" role="img" aria-label={t('search.favourite')}>
                      <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" />
                    </svg>
                  )}
                </td>
                <td className="num">{r.partitaIva ?? r.partitaIvaCee ?? '—'}</td>
                <td className="num">{r.codiceFiscale ?? '—'}</td>
                <td className="num">{r.codiciEsterni ?? '—'}</td>
                <td>
                  {r.stato ?? '—'}
                  {!r.attivo && <span className="tag tag--muted">{t('search.endedTag')}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
