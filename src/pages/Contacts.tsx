import {useState, type FormEvent} from 'react';
import {useNavigate} from 'react-router';
import {useTranslation} from 'react-i18next';
import {isValidAddress} from '../core/id';
import * as session from '../core/session';
import type {Contact} from '../core/walletFile';
import {useAccount} from '../state/account';
import {copy} from '../state/toasts';

const EMAIL = /^[^\s@<>()[\]\\,;:"]+@([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}$/;

interface Draft {
  name: string;
  address: string;
  tag: string;
}

/** Errors for a contact form; `original` is the name being edited, if any. */
function validate(draft: Draft, contacts: Contact[], original?: string) {
  return {
    exists: !!draft.name && draft.name !== original && contacts.some(c => c.name === draft.name),
    address: !!draft.address && !isValidAddress(draft.address) && !EMAIL.test(draft.address),
    tag: !!draft.tag && !/^[1-9]\d*$/.test(draft.tag)
  };
}

function toContact(draft: Draft, previous?: Contact): Contact {
  const contact: Contact = {...previous, name: draft.name.trim(), address: draft.address.trim()};
  delete contact.dt;
  if (draft.tag) contact.dt = draft.tag;
  return contact;
}

function Fields({draft, set, errors, nameError}: {draft: Draft; set: (d: Draft) => void; errors: ReturnType<typeof validate>; nameError: string}) {
  const {t} = useTranslation();
  return (
    <>
      <div className="field">
        <label>{t('contact')}</label>
        <input type="text" maxLength={70} className="input" value={draft.name} required onChange={e => set({...draft, name: e.target.value})} />
        {errors.exists && <div className="form-error">{t(nameError)}</div>}
      </div>
      <div className="field">
        <label>{t('address')}</label>
        <input type="text" className="input mono" value={draft.address} required placeholder="r..." onChange={e => set({...draft, address: e.target.value})} />
        {errors.address && <div className="form-error">{t('error_invalid_address')}</div>}
      </div>
      <div className="field">
        <label>{t('dest_tag')}</label>
        <input type="text" className="input" value={draft.tag} placeholder={t('leave_blank')} onChange={e => set({...draft, tag: e.target.value.trim()})} />
        {errors.tag && <div className="form-error">{t('error_invalid_tag')}</div>}
      </div>
    </>
  );
}

function ContactRow({entry, contacts, onSave, onRemove}: {
  entry: Contact; contacts: Contact[];
  onSave: (name: string, contact: Contact) => void; onRemove: (name: string) => void;
}) {
  const {t} = useTranslation();
  const navigate = useNavigate();
  const readOnly = useAccount(s => s.readOnly);
  const [draft, setDraft] = useState<Draft | null>(null);

  if (draft) {
    const errors = validate(draft, contacts, entry.name);
    const invalid = !draft.name || !draft.address || errors.exists || errors.address || errors.tag;
    return (
      <div className="list-item editing-row">
        <div className="grow grid-3">
          <Fields draft={draft} set={setDraft} errors={errors} nameError="error_already_name" />
        </div>
        <div className="stack-sm edit-actions">
          <button type="button" disabled={invalid} onClick={() => { onSave(entry.name, toContact(draft, entry)); setDraft(null); }} className="btn btn-primary btn-sm"><i className="fa fa-check" /> {t('save')}</button>
          <button type="button" className="btn btn-danger-soft btn-sm" onClick={() => window.confirm(t('are_you_sure')) && onRemove(entry.name)}><i className="fa fa-trash-o" /> {t('Delete')}</button>
          <button type="button" onClick={() => setDraft(null)} className="btn btn-ghost btn-sm">{t('cancel')}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="list-item">
      <div className="avatar">{entry.name.charAt(0).toUpperCase()}</div>
      <div className="li-main">
        <div className="li-title">{entry.name} {entry.dt ? <span className="badge"><i className="fa fa-tag" /> {entry.dt}</span> : null}</div>
        <div className="li-sub mono truncate">{entry.address}</div>
      </div>
      <div className="cluster">
        <button type="button" className="icon-btn" onClick={() => copy(entry.address)} title={t('copy_address')}><i className="fa fa-clone" /></button>
        <button type="button" className="icon-btn" onClick={() => setDraft({name: entry.name, address: entry.address, tag: entry.dt ? String(entry.dt) : ''})} title={t('edit')}><i className="fa fa-pencil" /></button>
        <button type="button" className="btn btn-soft btn-sm" onClick={() => navigate(`/send?name=${encodeURIComponent(entry.name)}`)} disabled={readOnly}><i className="fa fa-paper-plane" /> {t('send')}</button>
      </div>
    </div>
  );
}

export function Contacts() {
  const {t} = useTranslation();
  const contacts = useAccount(s => s.contacts);
  const readOnly = useAccount(s => s.readOnly);
  const [adding, setAdding] = useState<Draft | null>(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');

  const save = async (list: Contact[]) => {
    try {
      await session.saveContacts(list);
      setError('');
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const errors = adding ? validate(adding, contacts) : null;
  const create = (e: FormEvent) => {
    e.preventDefault();
    if (!adding || !errors || errors.exists || errors.address || errors.tag) return;
    void save([toContact(adding), ...contacts]);
    setAdding(null);
  };

  const q = query.toLowerCase();
  const shown = contacts.filter(c => !q || c.name.toLowerCase().includes(q) || c.address.toLowerCase().includes(q) || String(c.dt ?? '').includes(q));

  return (
    <>
      <div className="page-header">
        <div>
          <h1>{t('contacts')}</h1>
          <div className="page-sub">{t('contacts_sub')}</div>
        </div>
        <div className="page-actions">
          <button type="button" className="btn btn-primary" onClick={() => setAdding({name: '', address: '', tag: ''})} disabled={!!adding || readOnly}>
            <i className="fa fa-user-plus" /> {t('add_contact')}
          </button>
        </div>
      </div>

      {error && <div className="alert alert-error mb-16"><i className="fa fa-exclamation-circle" /><span>{error}</span></div>}

      {adding && errors && (
        <div className="card mb-16">
          <div className="card-header"><div className="card-title">{t('add_contact')}</div></div>
          <form onSubmit={create}>
            <div className="card-body grid-3">
              <Fields draft={adding} set={setAdding} errors={errors} nameError="error_same_contact" />
            </div>
            <div className="card-footer">
              <span className="spacer" />
              <button type="button" onClick={() => setAdding(null)} className="btn btn-ghost">{t('cancel')}</button>
              <button type="submit" disabled={!adding.name || !adding.address || errors.exists || errors.address || errors.tag} className="btn btn-primary">
                <i className="fa fa-check" /> {t('add_contact')}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="card">
        {contacts.length > 5 && (
          <div className="field search-field">
            <div className="input-icon"><i className="fa fa-search" /><input className="input" value={query} onChange={e => setQuery(e.target.value)} placeholder={t('search')} /></div>
          </div>
        )}
        <div className="list">
          {shown.map(entry => (
            <ContactRow key={entry.name} entry={entry} contacts={contacts}
              onSave={(name, contact) => void save(contacts.map(c => (c.name === name ? contact : c)))}
              onRemove={name => void save(contacts.filter(c => c.name !== name))} />
          ))}
        </div>
        {!contacts.length && (
          <div className="empty">
            <div className="empty-icon"><i className="fa fa-address-book-o" /></div>
            <div className="empty-title">{t('no_contacts_title')}</div>
            <div>{t('no_contact')}</div>
          </div>
        )}
      </div>
    </>
  );
}
