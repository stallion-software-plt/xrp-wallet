import {useTranslation} from 'react-i18next';
import type {TxStatusState} from '../hooks/useTx';
import {openExternal} from '../platform/desktop';
import {txUrl} from '../state/app';

/** Pending / validated / failed banner for a tracked transaction. */
export function TxStatus({state}: {state?: TxStatusState}) {
  const {t} = useTranslation();
  if (!state || !(state.state || state.working)) return null;
  const url = txUrl(state.hash);
  const link = url ? <a onClick={() => openExternal(url)}><i className="fa fa-external-link" /></a> : null;
  return (
    <div className="tx-status">
      {state.working && <div className="alert alert-info"><span className="spinner" /><span>{t('submitting')}</span></div>}
      {state.state === 'submitted' && <div className="alert alert-info"><span className="spinner" /><span className="grow">{t('tx_pending')}</span>{link}</div>}
      {state.state === 'success' && <div className="alert alert-success"><i className="fa fa-check-circle" /><span className="grow">{t('tx_success')}</span>{link}</div>}
      {(state.state === 'error' || state.state === 'fail') && (
        <div className="alert alert-error"><i className="fa fa-exclamation-circle" /><span className="grow break">{t(state.error || '')}</span></div>
      )}
    </div>
  );
}
