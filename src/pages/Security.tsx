import {useEffect, useState} from 'react';
import {useNavigate} from 'react-router';
import {useTranslation} from 'react-i18next';
import {PageHeader} from '../components/Common';
import {MnemonicGrid} from '../components/MnemonicGrid';
import {Qr} from '../components/Qr';
import {mnemonicInLang} from '../core/id';
import * as session from '../core/session';
import {openExternal} from '../platform/desktop';
import {useAccount} from '../state/account';
import {accountUrl, useApp} from '../state/app';
import {copy} from '../state/toasts';

export function Security() {
  const {t} = useTranslation();
  const navigate = useNavigate();
  const lang = useApp(s => s.lang);
  const address = useAccount(s => s.address)!;
  const readOnly = useAccount(s => s.readOnly);
  // Shown secrets live in this component only and are cleared when hidden or when leaving the page.
  const [secrets, setSecrets] = useState<{secret: string; mnemonic: string} | null>(null);
  const [showQr, setShowQr] = useState(false);
  const explorer = accountUrl(address);

  useEffect(() => () => setSecrets(null), []);

  const show = () => {
    if (window.confirm(t('are_you_sure_secret'))) setSecrets(session.revealSecrets());
  };
  const hide = () => {
    setSecrets(null);
    setShowQr(false);
  };

  const translated = secrets?.mnemonic && (lang === 'cn' || lang === 'jp') ? mnemonicInLang(secrets.mnemonic, lang) : '';

  return (
    <>
      <PageHeader title="security_backup" sub="security_sub" />

      <div className="grid-main-r">
        <div className="card">
          <div className="card-header"><div className="card-title">{t('public_address')}</div></div>
          <div className="card-body text-center stack">
            <div><Qr value={address} size={200} /></div>
            <div className="mono break fw-600">{address}</div>
            <div className="cluster justify-center">
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => copy(address)}><i className="fa fa-clone" /> {t('copy_address')}</button>
              {explorer && <button type="button" className="btn btn-secondary btn-sm" onClick={() => openExternal(explorer)}><i className="fa fa-external-link" /> {t('view_explorer')}</button>}
            </div>
          </div>
        </div>

        <div className="stack">
          {!readOnly && (
            <div className="card">
              <div className="card-header">
                <div><div className="card-title">{t('secret_key')}</div><div className="card-sub">{t('security_notice')}</div></div>
              </div>
              <div className="card-body stack">
                <div className="alert alert-warning"><i className="fa fa-exclamation-triangle" /><span>{t('backup_warning')}</span></div>

                <div className="secret-box">
                  <div className="between">
                    <div className="secret-label">{t('secret_key_only')}</div>
                    {secrets && (
                      <div className="cluster">
                        <button type="button" className="btn btn-ghost btn-xs" onClick={() => copy(secrets.secret, {secret: true})}><i className="fa fa-clone" /> {t('copy')}</button>
                        <button type="button" className="btn btn-ghost btn-xs" onClick={() => setShowQr(q => !q)}><i className="fa fa-qrcode" /> QR</button>
                      </div>
                    )}
                  </div>
                  <div className={`mono break fw-600 ${secrets ? '' : 'blurred'}`}>{secrets ? secrets.secret : '•'.repeat(29)}</div>
                  {secrets && showQr && <div className="text-center mt-12"><Qr value={secrets.secret} size={180} /></div>}
                </div>

                {secrets?.mnemonic && (
                  <div className="secret-box">
                    <div className="secret-label">{t('mnemonic')}</div>
                    <MnemonicGrid phrase={secrets.mnemonic} />
                    {translated && (
                      <div className="mt-12">
                        <div className="secret-label">{t('or')}</div>
                        <div className="mono">{translated}</div>
                      </div>
                    )}
                  </div>
                )}

                <div className="cluster">
                  {secrets
                    ? <button type="button" className="btn btn-secondary" onClick={hide}><i className="fa fa-eye-slash" /> {t('hide_secret')}</button>
                    : <button type="button" className="btn btn-primary" onClick={show}><i className="fa fa-eye" /> {t('show_secret')}</button>}
                </div>
              </div>
            </div>
          )}

          <div className="card card-muted">
            <div className="card-body stack-sm text-sm text-muted">
              <div className="fw-600 text-lg text-strong"><i className="fa fa-shield text-accent" /> {t('security_tips')}</div>
              <p>{t('security_tip_1')}</p>
              <p>{t('security_tip_2')}</p>
              <a className="btn btn-secondary btn-sm align-self-start" onClick={() => navigate('/account')}><i className="fa fa-sliders" /> {t('account_settings')}</a>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
