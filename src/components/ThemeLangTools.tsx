import {useTranslation} from 'react-i18next';
import {LANGUAGES} from '../i18n';
import {useApp} from '../state/app';
import {Dropdown} from './Dropdown';

export function ThemeButton() {
  const {t} = useTranslation();
  const theme = useApp(s => s.theme);
  const toggleTheme = useApp(s => s.toggleTheme);
  return (
    <button type="button" className="icon-btn" onClick={toggleTheme} title={t('toggle_theme')}>
      <i className={`fa ${theme === 'dark' ? 'fa-sun-o' : 'fa-moon-o'}`} />
    </button>
  );
}

/** Language menu. `labelled` shows the current language next to the icon. */
export function LanguageMenu({labelled = false}: {labelled?: boolean}) {
  const {t} = useTranslation();
  const lang = useApp(s => s.lang);
  const setLang = useApp(s => s.setLang);
  const current = LANGUAGES.find(l => l.key === lang)?.label ?? lang;
  return (
    <Dropdown
      trigger={toggle => labelled
        ? <button type="button" className="btn btn-ghost btn-sm" onClick={toggle}><i className="fa fa-globe" /> {current}</button>
        : <button type="button" className="icon-btn" onClick={toggle} title={t('language')}><i className="fa fa-globe" /></button>}
    >
      {close => (
        <>
          {!labelled && <li className="dd-label">{t('language')}</li>}
          {LANGUAGES.map(l => (
            <li key={l.key}>
              <a onClick={() => { setLang(l.key); close(); }}>
                <i className={`fa ${lang === l.key ? 'fa-check text-accent' : ''}`} /> {l.label}
              </a>
            </li>
          ))}
        </>
      )}
    </Dropdown>
  );
}
