import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import 'font-awesome/css/font-awesome.min.css';
import './styles/theme.css';
import './styles/pages.css';
import './i18n';
import './state/account';
import {App} from './App';
import {disablePasswordSaving, openExternal} from './platform/desktop';
import {connect} from './xrpl/connection';

disablePasswordSaving();

// Never navigate the app window to a web page: open http(s) links in the system browser.
document.addEventListener('click', e => {
  const link = (e.target as HTMLElement | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
  if (link && /^https?:/i.test(link.getAttribute('href') || '')) {
    e.preventDefault();
    openExternal(link.href);
  }
});

connect();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
