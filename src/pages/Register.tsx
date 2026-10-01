import {useState, type FormEvent} from 'react';
import {useNavigate} from 'react-router';
import {useTranslation} from 'react-i18next';
import {AuthFrame} from '../components/AuthFrame';
import {MnemonicGrid} from '../components/MnemonicGrid';
import {generateAccount, generateFilename, generateMnemonic, isValidMnemonic, isValidSecret, mnemonicInEnglish, mnemonicInLang} from '../core/id';
import {MIN_PASSWORD_LENGTH, passwordStrength} from '../core/password';
import * as session from '../core/session';
import type {WalletData} from '../core/walletFile';
import {chooseFileToSave} from '../platform/files';
import {useApp} from '../state/app';

type Mode = 'choose' | 'password' | 'secret' | 'mnemonic' | 'backup';

export function Register() {
  const {t} = useTranslation();
  const navigate = useNavigate();
  const lang = useApp(s => s.lang);
  const [mode, setMode] = useState<Mode>('choose');
  const [path, setPath] = useState('');
  // An imported secret (and its phrase). Empty for a brand-new wallet.
  const [imported, setImported] = useState<{secret: string; mnemonic: string} | null>(null);
  const [password1, setPassword1] = useState('');
  const [password2, setPassword2] = useState('');
  const [password2Touched, setPassword2Touched] = useState(false);
  const [secretInput, setSecretInput] = useState('');
  const [secretTouched, setSecretTouched] = useState(false);
  const [words, setWords] = useState('');
  const [wordsTouched, setWordsTouched] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<WalletData | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showSecret, setShowSecret] = useState(false);

  const strength = passwordStrength(password1);
  const mismatch = password2Touched && password1 !== password2;

  const reset = () => {
    setMode('choose');
    setPath('');
    setImported(null);
    setPassword1('');
    setPassword2('');
    setPassword2Touched(false);
    setSecretInput('');
    setSecretTouched(false);
    setWords('');
    setWordsTouched(false);
    setSaveError('');
    setBusy(false);
  };

  const chooseFile = async () => {
    const file = await chooseFileToSave(generateFilename());
    if (!file) return false;
    setPath(file.path);
    setSaveError('');
    setMode('password');
    return true;
  };

  const startNew = async () => {
    setImported(null);
    await chooseFile();
  };

  const submitSecret = async (e: FormEvent) => {
    e.preventDefault();
    if (!isValidSecret(secretInput)) return;
    setImported({secret: secretInput.trim(), mnemonic: ''});
    await chooseFile();
  };

  const submitWords = async (e: FormEvent) => {
    e.preventDefault();
    if (!isValidMnemonic(words)) return;
    const mnemonic = mnemonicInEnglish(words);
    setImported({secret: generateAccount(mnemonic).secret, mnemonic});
    await chooseFile();
  };

  const submitPassword = async (e: FormEvent) => {
    e.preventDefault();
    if (strength === 'weak' || !password1 || password1 !== password2) return;
    setBusy(true);
    setSaveError('');
    try {
      let keys = imported;
      if (!keys) {
        const mnemonic = generateMnemonic();
        keys = {secret: generateAccount(mnemonic).secret, mnemonic};
      }
      setCreated(await session.createFile(path, password1, keys.secret, keys.mnemonic));
      setMode('backup');
    } catch (err) {
      console.error('Wallet creation failed', err);
      setSaveError(t((err as Error).message));
    } finally {
      setBusy(false);
    }
  };

  const reveal = (show: (v: boolean) => void) => {
    if (window.confirm(t('are_you_sure_secret'))) show(true);
  };

  const finish = () => {
    if (!created) return;
    session.openCreated(created, password1, path);
    navigate('/balance');
  };

  const translatedPhrase = created?.mnemonic && (lang === 'cn' || lang === 'jp') ? mnemonicInLang(created.mnemonic, lang) : '';

  return (
    <AuthFrame>
      {mode === 'choose' && (
        <div className="card auth-card">
          <div className="card-body">
            <h2 className="auth-title">{t('create_new_account')}</h2>
            <p className="auth-sub">{t('create_new_account_info')}</p>
            <div className="stack-sm">
              <a className="choice" onClick={startNew}>
                <span className="choice-icon"><i className="fa fa-magic" /></span>
                <span className="grow"><strong>{t('create_blank')}</strong><span className="choice-sub">{t('create_blank_desc')}</span></span>
                <i className="fa fa-angle-right" />
              </a>
              <a className="choice" onClick={() => setMode('mnemonic')}>
                <span className="choice-icon"><i className="fa fa-list-ol" /></span>
                <span className="grow"><strong>{t('create_by_mnemonic')}</strong><span className="choice-sub">{t('import_mnemonic_desc')}</span></span>
                <i className="fa fa-angle-right" />
              </a>
              <a className="choice" onClick={() => setMode('secret')}>
                <span className="choice-icon"><i className="fa fa-key" /></span>
                <span className="grow"><strong>{t('create_by_secret')}</strong><span className="choice-sub">{t('import_secret_desc')}</span></span>
                <i className="fa fa-angle-right" />
              </a>
            </div>
            <button type="button" className="btn btn-ghost btn-block mt-16" onClick={() => navigate('/login')}><i className="fa fa-arrow-left" /> {t('back')}</button>
          </div>
        </div>
      )}

      {mode === 'password' && (
        <div className="card auth-card">
          <div className="card-body">
            <h2 className="auth-title">{t('encrypt_account')}</h2>
            <p className="auth-sub">{t('encrypt_new_file')}</p>
            <div className="file-pick picked mb-16"><i className="fa fa-file-text-o" /><span className="truncate">{path.replace(/^browser:/, '')}</span></div>
            <form onSubmit={submitPassword} className="stack">
              <div className={`field ${strength === 'weak' ? 'has-error' : ''}`}>
                <div className="label-row">
                  <label htmlFor="password1">{t('password')}</label>
                  {strength && <span className={`strength-pill ${strength}`}>{t(`strength_${strength}`)}</span>}
                </div>
                <input className="input" id="password1" type="password" autoComplete="off" value={password1} onChange={e => setPassword1(e.target.value)} required />
                <div className={`strength-bar ${strength}`}><span /></div>
                {strength === 'weak' && <div className="form-error">{t(password1.length < MIN_PASSWORD_LENGTH ? 'pwd_too_short' : 'pwd_weak')}</div>}
              </div>
              <div className={`field ${mismatch ? 'has-error' : ''}`}>
                <label htmlFor="password2">{t('password_confirm')}</label>
                <input className="input" id="password2" type="password" autoComplete="off" value={password2} required
                  onChange={e => { setPassword2(e.target.value); setPassword2Touched(true); }} />
                {mismatch && <div className="form-error">{t('pwd_not_match')}</div>}
              </div>
              {saveError && <div className="alert alert-error"><i className="fa fa-exclamation-circle" /><span>{saveError}</span></div>}
              <button className="btn btn-primary btn-lg btn-block" type="submit" disabled={busy || !password1 || strength === 'weak' || password1 !== password2}>
                <i className={`fa ${busy ? 'fa-spinner fa-pulse' : 'fa-lock'}`} /> {t('encrypt_account')}
              </button>
              <button type="button" className="btn btn-ghost btn-block" onClick={reset}>{t('cancel')}</button>
            </form>
          </div>
        </div>
      )}

      {mode === 'secret' && (
        <div className="card auth-card">
          <div className="card-body">
            <h2 className="auth-title">{t('create_secret')}</h2>
            <p className="auth-sub">{t('import_secret_desc')}</p>
            <form onSubmit={submitSecret} className="stack">
              <div className={`field ${secretTouched && !isValidSecret(secretInput) ? 'has-error' : ''}`}>
                <label htmlFor="secretKey">{t('enter_secret')}</label>
                <input className="input mono" id="secretKey" type="password" value={secretInput} required autoComplete="off"
                  onChange={e => { setSecretInput(e.target.value); setSecretTouched(true); }} />
                {secretTouched && !isValidSecret(secretInput) && <div className="form-error">{t('invalid_secret')}</div>}
              </div>
              <button className="btn btn-primary btn-lg btn-block" type="submit" disabled={!isValidSecret(secretInput)}>{t('continue')}</button>
              <button type="button" className="btn btn-ghost btn-block" onClick={reset}>{t('cancel')}</button>
            </form>
          </div>
        </div>
      )}

      {mode === 'mnemonic' && (
        <div className="card auth-card">
          <div className="card-body">
            <h2 className="auth-title">{t('create_by_mnemonic')}</h2>
            <p className="auth-sub">{t('import_mnemonic_desc')}</p>
            <form onSubmit={submitWords} className="stack">
              <div className={`field ${wordsTouched && !isValidMnemonic(words) ? 'has-error' : ''}`}>
                <label htmlFor="words">{t('enter_mnemonic')}</label>
                <textarea className="input mono" id="words" rows={3} value={words} required autoComplete="off" spellCheck={false}
                  onChange={e => { setWords(e.target.value); setWordsTouched(true); }} />
                {wordsTouched && !isValidMnemonic(words) && <div className="form-error">{t('invalid_mnemonic')}</div>}
              </div>
              <button className="btn btn-primary btn-lg btn-block" type="submit" disabled={!isValidMnemonic(words)}>{t('continue')}</button>
              <button type="button" className="btn btn-ghost btn-block" onClick={reset}>{t('cancel')}</button>
            </form>
          </div>
        </div>
      )}

      {mode === 'backup' && created && (
        <div className="card auth-card wide">
          <div className="card-body stack">
            <div>
              <h2 className="auth-title">{t('backup_title')}</h2>
              <p className="auth-sub mb-0">{t('security_notice')}</p>
            </div>
            <div className="alert alert-warning"><i className="fa fa-exclamation-triangle" /><span>{t('backup_warning')}</span></div>

            <div className="secret-box">
              <div className="secret-label">{t('public_address')}</div>
              <div className="mono break">{created.address}</div>
            </div>
            <div className="secret-box">
              <div className="between">
                <div className="secret-label">{t('password')}</div>
                {showPassword
                  ? <button type="button" className="btn btn-ghost btn-xs" onClick={() => setShowPassword(false)}><i className="fa fa-eye-slash" /> {t('hide')}</button>
                  : <button type="button" className="btn btn-ghost btn-xs" onClick={() => reveal(setShowPassword)}><i className="fa fa-eye" /> {t('show')}</button>}
              </div>
              <div className="mono break">{showPassword ? password1 : '*'.repeat(password1.length)}</div>
            </div>
            <div className="secret-box">
              <div className="between">
                <div className="secret-label">{t('secret_key')}</div>
                {showSecret
                  ? <button type="button" className="btn btn-ghost btn-xs" onClick={() => setShowSecret(false)}><i className="fa fa-eye-slash" /> {t('hide')}</button>
                  : <button type="button" className="btn btn-ghost btn-xs" onClick={() => reveal(setShowSecret)}><i className="fa fa-eye" /> {t('show')}</button>}
              </div>
              <div className="mono break">{showSecret ? created.secret : '*'.repeat(55)}</div>
              {showSecret && created.mnemonic && (
                <div className="mt-12">
                  <div className="secret-label">{t('mnemonic')}</div>
                  <MnemonicGrid phrase={created.mnemonic} />
                  {translatedPhrase && (
                    <div className="mt-8">
                      <div className="secret-label">{t('or')}</div>
                      <div className="mono">{translatedPhrase}</div>
                    </div>
                  )}
                </div>
              )}
            </div>
            <button type="button" className="btn btn-primary btn-lg btn-block" onClick={finish}><i className="fa fa-check" /> {t('yes_save')}</button>
          </div>
        </div>
      )}
    </AuthFrame>
  );
}
