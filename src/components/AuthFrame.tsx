import type {ReactNode} from 'react';
import {useTranslation} from 'react-i18next';
import logo from '../../assets/ripple.png';
import {LanguageMenu, ThemeButton} from './ThemeLangTools';

/** Two-column frame for the login and create screens: brand panel and a form panel. */
export function AuthFrame({children}: {children: ReactNode}) {
  const {t} = useTranslation();
  return (
    <div className="auth-shell">
      <section className="auth-hero">
        <div className="brand">
          <div className="brand-mark"><img src={logo} alt="" /></div>
          <div className="brand-name">XRP Wallet</div>
        </div>
        <div>
          <h1>{t('auth_hero_title')}</h1>
          <p className="mt-12">{t('auth_hero_sub')}</p>
          <ul className="auth-features">
            <li><i className="fa fa-lock" /><div><strong>{t('auth_feat_keys')}</strong><div className="text-sm">{t('auth_feat_keys_desc')}</div></div></li>
            <li><i className="fa fa-exchange" /><div><strong>{t('auth_feat_dex')}</strong><div className="text-sm">{t('auth_feat_dex_desc')}</div></div></li>
            <li><i className="fa fa-cubes" /><div><strong>{t('auth_feat_xrpl')}</strong><div className="text-sm">{t('auth_feat_xrpl_desc')}</div></div></li>
          </ul>
        </div>
        <div className="text-xs auth-version">{t('version')} {__APP_VERSION__}</div>
      </section>

      <section className="auth-panel">
        <div className="auth-tools">
          <ThemeButton />
          <LanguageMenu labelled />
        </div>
        {children}
      </section>
    </div>
  );
}
