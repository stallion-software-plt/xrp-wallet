import {useState, type FormEvent} from 'react';
import {useNavigate} from 'react-router';
import {useTranslation} from 'react-i18next';
import {AuthFrame} from '../components/AuthFrame';
import {MnemonicGrid} from '../components/MnemonicGrid';
import {isBackupWord, pickWordPositions} from '../core/backupCheck';
import {generateAccount, generateFilename, generateMnemonic, isValidMnemonic, isValidSecret, mnemonicInEnglish, mnemonicInLang} from '../core/id';
import {isGuessable, MIN_PASSWORD_LENGTH, passwordStrength} from '../core/password';
import * as session from '../core/session';
import type {WalletData} from '../core/walletFile';
import {useIdleTimer} from '../hooks/useAutoLock';
import {chooseFileToSave} from '../platform/files';
import {useApp} from '../state/app';
import {answerConfirm, askConfirm} from '../state/confirm';

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
  const [fileTaken, setFileTaken] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [quiz, setQuiz] = useState<number[]>([]);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [haveCopy, setHaveCopy] = useState(false);

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
    setFileTaken(false);
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
      setFileTaken((err as Error).message === 'wallet_file_exists');
      setSaveError(t((err as Error).message));
    } finally {
      setBusy(false);
    }
  };

  const reveal = async (show: (v: boolean) => void) => {
    if (await askConfirm(t('are_you_sure_secret'))) show(true);
  };

  // The password and keys are in this screen's state until the wallet opens, so it locks too.
  useIdleTimer(mode !== 'choose', minutes => {
    answerConfirm(false);
    useApp.setState({lockedAfter: minutes});
    navigate('/login', {replace: true});
  });

  const translatedPhrase = created?.mnemonic && (lang === 'cn' || lang === 'jp') ? mnemonicInLang(created.mnemonic, lang) : '';
  const phrases = created?.mnemonic ? [created.mnemonic, ...(translatedPhrase ? [translatedPhrase] : [])] : [];
  // A phrase must have been shown before it can be checked. An imported key is already in the user's hands.
  const canContinue = revealed || !created?.mnemonic;
  const backupConfirmed = created?.mnemonic
    ? quiz.length > 0 && quiz.every(p => isBackupWord(phrases, p, answers[p] ?? ''))
    : haveCopy;

  const startVerify = () => {
    if (!created || !canContinue) return;
    setShowSecret(false);
    setShowPassword(false);
    setAnswers({});
    setHaveCopy(false);
    setQuiz(created.mnemonic ? pickWordPositions(created.mnemonic.trim().split(/\s+/).length) : []);
    setVerifying(true);
  };

  const finish = () => {
    if (!created || !backupConfirmed) return;
    session.openCreated(created, password1, path);
    navigate('/balance');
  };

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
                {strength === 'weak' && <div className="form-error">{password1.length < MIN_PASSWORD_LENGTH ? t('pwd_too_short') : isGuessable(password1) ? t('pwd_common') : t('pwd_weak')}</div>}
              </div>
              <div className={`field ${mismatch ? 'has-error' : ''}`}>
                <label htmlFor="password2">{t('password_confirm')}</label>
                <input className="input" id="password2" type="password" autoComplete="off" value={password2} required
                  onChange={e => { setPassword2(e.target.value); setPassword2Touched(true); }} />
                {mismatch && <div className="form-error">{t('pwd_not_match')}</div>}
              </div>
              {saveError && <div className="alert alert-error"><i className="fa fa-exclamation-circle" /><span>{saveError}</span></div>}
              {fileTaken && <button type="button" className="btn btn-secondary btn-block" onClick={() => void chooseFile()}><i className="fa fa-file-text-o" /> {t('choose_other_file')}</button>}
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

      {mode === 'backup' && created && verifying && (
        <div className="card auth-card wide">
          <div className="card-body stack">
            <div>
              <h2 className="auth-title">{t('backup_verify_title')}</h2>
              {created.mnemonic && <p className="auth-sub mb-0">{t('backup_verify_desc')}</p>}
            </div>
            {created.mnemonic ? quiz.map(p => {
              const answer = answers[p] ?? '';
              const wrong = !!answer.trim() && !isBackupWord(phrases, p, answer);
              return (
                <div className={`field ${wrong ? 'has-error' : ''}`} key={p}>
                  <label htmlFor={`backup_word_${p}`}>{t('backup_word_n', {n: p + 1})}</label>
                  <input className="input mono" id={`backup_word_${p}`} type="text" autoComplete="off" spellCheck={false} value={answer}
                    onChange={e => setAnswers(a => ({...a, [p]: e.target.value}))} />
                  {wrong && <div className="form-error">{t('backup_word_wrong')}</div>}
                </div>
              );
            }) : (
              <label className="checkbox-row"><input type="checkbox" checked={haveCopy} onChange={e => setHaveCopy(e.target.checked)} /> {t('backup_have_secret')}</label>
            )}
            <div className="grid-2">
              <button type="button" className="btn btn-secondary btn-lg" onClick={() => setVerifying(false)}><i className="fa fa-arrow-left" /> {t('back')}</button>
              <button type="button" className="btn btn-primary btn-lg" onClick={finish} disabled={!backupConfirmed}><i className="fa fa-check" /> {t('yes_save')}</button>
            </div>
          </div>
        </div>
      )}

      {mode === 'backup' && created && !verifying && (
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
                  : <button type="button" className="btn btn-ghost btn-xs" onClick={() => void reveal(setShowPassword)}><i className="fa fa-eye" /> {t('show')}</button>}
              </div>
              <div className="mono break">{showPassword ? password1 : '*'.repeat(password1.length)}</div>
            </div>
            <div className="secret-box">
              <div className="between">
                <div className="secret-label">{t('secret_key')}</div>
                {showSecret
                  ? <button type="button" className="btn btn-ghost btn-xs" onClick={() => setShowSecret(false)}><i className="fa fa-eye-slash" /> {t('hide')}</button>
                  : <button type="button" className="btn btn-ghost btn-xs" onClick={() => void reveal(v => { setShowSecret(v); setRevealed(true); })}><i className="fa fa-eye" /> {t('show')}</button>}
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
            {!canContinue && <div className="hint">{t('backup_reveal_first')}</div>}
            <button type="button" className="btn btn-primary btn-lg btn-block" onClick={startVerify} disabled={!canContinue}><i className="fa fa-check" /> {t('backup_written')}</button>
          </div>
        </div>
      )}
    </AuthFrame>
  );
}
