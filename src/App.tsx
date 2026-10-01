import {HashRouter, Navigate, Route, Routes} from 'react-router';
import {AuthLayout, Shell} from './components/Shell';
import {ToastStack} from './components/ToastStack';
import {Account} from './pages/Account';
import {Amm} from './pages/Amm';
import {Balance} from './pages/Balance';
import {Channels} from './pages/Channels';
import {Checks} from './pages/Checks';
import {Contacts} from './pages/Contacts';
import {Escrow} from './pages/Escrow';
import {History} from './pages/History';
import {Login} from './pages/Login';
import {Nfts} from './pages/Nfts';
import {Receive} from './pages/Receive';
import {Register} from './pages/Register';
import {Security} from './pages/Security';
import {Send} from './pages/Send';
import {Settings} from './pages/Settings';
import {Swap} from './pages/Swap';
import {Tokens} from './pages/Tokens';
import {Trade} from './pages/Trade';

// Screens of an open wallet, by path (the sidebar is defined in nav.ts).
const PAGES: Record<string, () => React.JSX.Element> = {
  '/balance': Balance,
  '/send': Send,
  '/receive': Receive,
  '/history': History,
  '/contact': Contacts,
  '/trade': Trade,
  '/convert': Swap,
  '/amm': Amm,
  '/trust': Tokens,
  '/nft': Nfts,
  '/escrow': Escrow,
  '/checks': Checks,
  '/channels': Channels,
  '/account': Account,
  '/security': Security,
  '/settings': Settings
};

export function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<AuthLayout />}>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
        </Route>
        <Route element={<Shell />}>
          <Route path="/" element={<Navigate to="/balance" replace />} />
          {Object.entries(PAGES).map(([path, Page]) => <Route key={path} path={path} element={<Page />} />)}
        </Route>
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
      <ToastStack />
    </HashRouter>
  );
}
