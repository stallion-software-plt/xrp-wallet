import {useTranslation} from 'react-i18next';
import {openExternal} from '../platform/desktop';
import {txUrl} from '../state/app';
import {dismiss, useToasts} from '../state/toasts';

const ICONS = {success: 'fa-check', error: 'fa-exclamation-triangle', info: 'fa-paper-plane', copy: 'fa-clipboard'};

export function ToastStack() {
  const {t} = useTranslation();
  const toasts = useToasts(s => s.toasts);
  return (
    <div className="toast-stack">
      {toasts.map(toast => {
        const url = txUrl(toast.hash);
        return (
          <div key={toast.id} className={`toast ${toast.type}`}>
            <div className="toast-icon"><i className={`fa ${ICONS[toast.type]}`} /></div>
            <div className="grow">
              <div className="toast-title">{t(toast.title)}</div>
              {toast.message && <div className="toast-msg">{t(toast.message)}</div>}
              {url && <a className="text-xs" onClick={() => openExternal(url)}>{t('view_explorer')} <i className="fa fa-external-link" /></a>}
            </div>
            <a className="toast-close" onClick={() => dismiss(toast.id)}><i className="fa fa-times" /></a>
          </div>
        );
      })}
    </div>
  );
}
