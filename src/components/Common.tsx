import {useTranslation} from 'react-i18next';
import {useAccount} from '../state/account';
import {useApp} from '../state/app';

/** A load error. 'NotFoundError' (unfunded account) shows as information. */
export function LoadError({error}: {error: string}) {
  const {t} = useTranslation();
  const coin = useApp(s => s.network.coin);
  if (!error) return null;
  const info = error === 'NotFoundError';
  return (
    <div className={`alert mb-16 ${info ? 'alert-info' : 'alert-error'}`}>
      <i className={`fa ${info ? 'fa-info-circle' : 'fa-exclamation-circle'}`} /><span>{t(error, coin)}</span>
    </div>
  );
}

/** Suggestions for an address field: the wallet's contacts. */
export function ContactList({id}: {id: string}) {
  const contacts = useAccount(s => s.contacts);
  return (
    <datalist id={id}>
      {contacts.map(c => <option key={c.name} value={c.address}>{c.name}</option>)}
    </datalist>
  );
}

/** Page title, subtitle and a refresh button. */
export function PageHeader({title, sub, loading, onRefresh, children}: {
  title: string; sub: string; loading?: boolean; onRefresh?: () => void; children?: React.ReactNode;
}) {
  const {t} = useTranslation();
  return (
    <div className="page-header">
      <div>
        <h1>{t(title)}</h1>
        <div className="page-sub">{t(sub)}</div>
      </div>
      {(onRefresh || children) && (
        <div className="page-actions">
          {children}
          {onRefresh && (
            <button type="button" className="btn btn-secondary" onClick={onRefresh} disabled={loading}>
              <i className={`fa fa-refresh ${loading ? 'fa-spin' : ''}`} /> {t('refresh')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
