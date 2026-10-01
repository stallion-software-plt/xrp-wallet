import {useState} from 'react';
import {useTranslation} from 'react-i18next';
import {TxItem} from '../components/TxItem';
import {useActivity} from '../hooks/useActivity';
import {openExternal} from '../platform/desktop';
import {useAccount} from '../state/account';
import {accountUrl, useApp} from '../state/app';
import {CATEGORIES, type Category} from '../xrpl/txformat';

export function History() {
  const {t} = useTranslation();
  const coin = useApp(s => s.network.coin);
  const address = useAccount(s => s.address);
  const activity = useActivity(30);
  const [filter, setFilter] = useState<Category>('all');
  const shown = activity.rows.filter(tx => filter === 'all' || tx.category === filter);
  const explorer = accountUrl(address || undefined);

  return (
    <>
      <div className="page-header">
        <div>
          <h1>{t('activity')}</h1>
          <div className="page-sub">{t('activity_sub')}</div>
        </div>
        <div className="page-actions">
          <button type="button" className="btn btn-secondary" onClick={activity.refresh} disabled={activity.loading}>
            <i className={`fa fa-refresh ${activity.loading ? 'fa-spin' : ''}`} /> {t('refresh')}
          </button>
          {explorer && <button type="button" className="btn btn-secondary" onClick={() => openExternal(explorer)}><i className="fa fa-external-link" /> {t('view_explorer')}</button>}
        </div>
      </div>

      <div className="cluster mb-16">
        {CATEGORIES.map(c => (
          <span key={c} className={`chip ${filter === c ? 'active' : ''}`} onClick={() => setFilter(c)}>
            {t('cat_' + c)} {c !== 'all' && <span className="text-faint">{activity.rows.filter(tx => tx.category === c).length}</span>}
          </span>
        ))}
      </div>

      {activity.error && <div className="alert alert-error mb-16"><i className="fa fa-exclamation-circle" /><span>{t(activity.error, coin)}</span></div>}

      <div className="card">
        <div className="tx-list">
          {shown.map(tx => <TxItem key={tx.hash} tx={tx} />)}
        </div>
        {!activity.loading && !shown.length && (
          <div className="empty">
            <div className="empty-icon"><i className="fa fa-history" /></div>
            <div className="empty-title">{t('no_activity')}</div>
          </div>
        )}
        <div className="card-footer justify-center">
          {activity.loading && <span className="text-muted"><span className="spinner" /> {t('loading')}</span>}
          {activity.hasMore && !activity.loading && <button type="button" className="btn btn-secondary btn-sm" onClick={activity.loadMore}>{t('load_more')}</button>}
          {!activity.hasMore && !activity.loading && activity.rows.length > 0 && <span className="text-faint text-sm">{t('no_more')}</span>}
        </div>
      </div>
    </>
  );
}
