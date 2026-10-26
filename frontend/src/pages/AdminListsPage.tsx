import { Fragment, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useAdminList, useAdminLists, useSaveListItem } from '../api/queries';
import type { VoceLista } from '../api/types';
import { useMe } from '../auth/AuthProvider';
import { ErrorMessage, fieldErrors, Flash, Loading, useFlash } from '../components/Feedback';
import { Field } from '../components/Field';

type Draft = { codice: string; descrizioneIt: string; descrizioneEn: string; ordine: string; attivo: boolean };
const empty: Draft = { codice: '', descrizioneIt: '', descrizioneEn: '', ordine: '0', attivo: true };
const toDraft = (v: VoceLista): Draft => ({
  codice: v.codice ?? '',
  descrizioneIt: v.descrizioneIt,
  descrizioneEn: v.descrizioneEn ?? '',
  ordine: String(v.ordine),
  attivo: v.attivo,
});
const toBody = (d: Draft) => ({ ...d, codice: d.codice || null, descrizioneEn: d.descrizioneEn || null, ordine: Number(d.ordine) || 0 });

/** Liste di valori: sistemi esterni, marchi, enti, stati e tipi usati in tutto l'Albo. */
export function AdminListsPage() {
  const { t } = useTranslation();
  const me = useMe();
  const canWrite = me.permessi.scrittura;
  const lists = useAdminLists();
  const [nome, setNome] = useState<string | null>(null);
  const current = nome ?? lists.data?.[0]?.nome ?? null;
  const items = useAdminList(current);
  const save = useSaveListItem(current ?? '');
  const [editing, setEditing] = useState<number | 'new' | null>(null);
  const [draft, setDraft] = useState<Draft>(empty);
  const [flash, setFlash] = useFlash();
  const errors = fieldErrors(save.error);

  const open = (v: VoceLista | null) => {
    save.reset();
    setDraft(v ? toDraft(v) : empty);
    setEditing(v ? v.id : 'new');
  };
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate(
      { id: editing === 'new' ? null : editing, body: toBody(draft) },
      {
        onSuccess: () => {
          setEditing(null);
          setFlash(t('lists.saved'));
        },
      },
    );
  };

  const editor = (
    <tr className="table__editrow">
      <td colSpan={6}>
        <form className="inlineform inlineform--tight" onSubmit={onSubmit} noValidate>
          <Field label={t('lists.code')} error={errors.codice}>
            {(p) => <input {...p} value={draft.codice} onChange={(e) => setDraft({ ...draft, codice: e.target.value })} />}
          </Field>
          <Field label={t('lists.descIt')} error={errors.descrizioneIt} className="field--grow">
            {(p) => <input {...p} value={draft.descrizioneIt} onChange={(e) => setDraft({ ...draft, descrizioneIt: e.target.value })} autoFocus />}
          </Field>
          <Field label={t('lists.descEn')} error={errors.descrizioneEn} className="field--grow">
            {(p) => <input {...p} value={draft.descrizioneEn} onChange={(e) => setDraft({ ...draft, descrizioneEn: e.target.value })} />}
          </Field>
          <Field label={t('lists.order')} error={errors.ordine} className="field--narrow">
            {(p) => <input {...p} inputMode="numeric" value={draft.ordine} onChange={(e) => setDraft({ ...draft, ordine: e.target.value })} />}
          </Field>
          <label className="check">
            <input type="checkbox" checked={draft.attivo} onChange={(e) => setDraft({ ...draft, attivo: e.target.checked })} />
            {t('lists.active')}
          </label>
          <button type="submit" className="btn btn--primary btn--small" disabled={save.isPending || !draft.descrizioneIt.trim()}>
            {t('general.save')}
          </button>
          <button type="button" className="btn btn--quiet btn--small" onClick={() => setEditing(null)}>
            {t('general.cancel')}
          </button>
        </form>
        {save.isError && <ErrorMessage error={save.error} />}
      </td>
    </tr>
  );

  if (lists.isPending) return <Loading />;
  if (lists.isError) return <ErrorMessage error={lists.error} />;

  return (
    <>
      <h1 className="page__title">{t('lists.title')}</h1>
      <Flash message={flash} />
      <div className="listpicker">
        <Field label={t('lists.pick')}>
          {(p) => (
            <select
              {...p}
              value={current ?? ''}
              onChange={(e) => {
                setNome(e.target.value);
                setEditing(null);
              }}
            >
              {lists.data.map((l) => (
                <option key={l.nome} value={l.nome}>
                  {l.descrizione}
                </option>
              ))}
            </select>
          )}
        </Field>
        <p className="field__hint">{t('lists.hint')}</p>
      </div>

      <div className="tablewrap">
        <table className="table">
          <thead>
            <tr>
              <th scope="col">{t('lists.code')}</th>
              <th scope="col">{t('lists.descIt')}</th>
              <th scope="col">{t('lists.descEn')}</th>
              <th scope="col" className="num">{t('lists.order')}</th>
              <th scope="col">{t('lists.state')}</th>
              <th scope="col"><span className="visually-hidden">{t('common.actions')}</span></th>
            </tr>
          </thead>
          <tbody>
            {items.data?.map((v) =>
              editing === v.id ? (
                <Fragment key={v.id}>{editor}</Fragment>
              ) : (
                <tr key={v.id} className={v.attivo ? undefined : 'is-ended'}>
                  <td className="num">{v.codice ?? '—'}</td>
                  <td className="strong">{v.descrizioneIt}</td>
                  <td>{v.descrizioneEn ?? '—'}</td>
                  <td className="num">{v.ordine}</td>
                  <td>{v.attivo ? t('lists.activeShort') : <span className="tag tag--muted">{t('lists.inactive')}</span>}</td>
                  <td className="table__actions">
                    {canWrite && (
                      <button type="button" className="btn btn--quiet btn--small" disabled={editing !== null} onClick={() => open(v)}>
                        {t('general.edit')}
                      </button>
                    )}
                  </td>
                </tr>
              ),
            )}
            {items.data?.length === 0 && editing !== 'new' && (
              <tr>
                <td colSpan={6} className="muted">
                  {t('lists.empty')}
                </td>
              </tr>
            )}
            {editing === 'new' && editor}
          </tbody>
        </table>
      </div>
      {canWrite && editing === null && (
        <div className="formactions">
          <button type="button" className="btn btn--secondary" onClick={() => open(null)}>
            {t('lists.add')}
          </button>
        </div>
      )}
    </>
  );
}
