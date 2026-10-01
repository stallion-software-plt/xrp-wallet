import {useState, type FormEvent} from 'react';
import {useNavigate} from 'react-router';
import {useTranslation} from 'react-i18next';
import {AuthFrame} from '../components/AuthFrame';
import {isValidAddress} from '../core/id';
import * as session from '../core/session';
import {chooseFileToOpen, type FileRef} from '../platform/files';
import {useApp} from '../state/app';

export function Login() {
  const {t} = useTranslation();
  const navigate = useNavigate();
  const lockedAfter = useApp(s => s.lockedAfter);
  const [watchOnly, setWatchOnly] = useState(false);
  const [file, setFile] = useState<FileRef | null>(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [address, setAddress] = useState('');
  const [invalidAddress, setInvalidAddress] = useState(false);

  const pickFile = async () => {
    const picked = await chooseFileToOpen();
    if (picked) {
      setFile(picked);
      setError('');
    }
  };

  const open = async (e: FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError(t('select_file'));
      return;
    }
    setBusy(true);
    setError('');
    try {
      await session.openFile(file, password);
      navigate('/balance');
    } catch (err) {
      setError(`${t('login_failed')}: ${t((err as Error).message)}`);
    } finally {
      setBusy(false);
      setPassword('');
    }
  };

  const watch = (e: FormEvent) => {
    e.preventDefault();
    if (!isValidAddress(address)) {
      setInvalidAddress(true);
      return;
    }
    session.openWatchOnly(address);
    navigate('/balance');
  };

  return (
    <AuthFrame>
      {!watchOnly ? (
        <div className="card auth-card">
          <div className="card-body">
            <h2 className="auth-title">{t('open_wallet')}</h2>
            <p className="auth-sub">{t('login_sub')}</p>
            {lockedAfter > 0 && <div className="alert alert-info mb-16"><i className="fa fa-lock" /><span>{t('locked_inactive', {minutes: lockedAfter})}</span></div>}

            <form onSubmit={open} className="stack">
              <div className="field">
                <label>{t('select_file')}</label>
                <button type="button" className={`file-pick ${file ? 'picked' : ''}`} onClick={pickFile}>
                  <i className={`fa ${file ? 'fa-file-text-o' : 'fa-folder-open-o'}`} />
                  <span className="truncate">{file ? file.path.replace(/^browser:/, '') : t('choose_wallet_file')}</span>
                </button>
              </div>
              <div className="field">
                <label htmlFor="login_password">{t('account_password')}</label>
                <input className="input" id="login_password" type="password" value={password} onChange={e => setPassword(e.target.value)} required autoComplete="off" />
              </div>
              {error && <div className="alert alert-error"><i className="fa fa-exclamation-circle" /><span>{error}</span></div>}
              <button className="btn btn-primary btn-lg btn-block" type="submit" disabled={!password || busy}>
                <i className={`fa ${busy ? 'fa-spinner fa-pulse' : 'fa-unlock-alt'}`} /> <span>{t('open_account')}</span>
              </button>
            </form>

            <div className="auth-divider"><span>{t('or')}</span></div>

            <div className="grid-2">
              <button type="button" className="btn btn-secondary" onClick={() => navigate('/register')}><i className="fa fa-plus" /> {t('create_new_account')}</button>
              <button type="button" className="btn btn-secondary" onClick={() => setWatchOnly(true)}><i className="fa fa-eye" /> {t('open_temp_act')}</button>
            </div>

            <p className="text-xs text-faint mt-16">{t('login_desc')}</p>
          </div>
        </div>
      ) : (
        <div className="card auth-card">
          <div className="card-body">
            <h2 className="auth-title">{t('open_temp_act')}</h2>
            <p className="auth-sub">{t('watch_only_desc')}</p>
            <form onSubmit={watch} className="stack">
              <div className="field">
                <label htmlFor="address">{t('address')}</label>
                <input className="input mono" id="address" type="text" value={address} required autoComplete="off" placeholder="r..."
                  onChange={e => { setAddress(e.target.value); setInvalidAddress(false); }} />
                {invalidAddress && <div className="form-error">{t('invalid_account')}</div>}
              </div>
              <button className="btn btn-primary btn-lg btn-block" type="submit"><i className="fa fa-eye" /> <span>{t('open_account')}</span></button>
              <button type="button" className="btn btn-ghost btn-block" onClick={() => setWatchOnly(false)}><i className="fa fa-arrow-left" /> {t('back')}</button>
            </form>
          </div>
        </div>
      )}
    </AuthFrame>
  );
}
