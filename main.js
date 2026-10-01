/* global nw */

// This runs in NW.js's background page, where the bare `localStorage` name can resolve to
// Node's (undefined in recent NW.js), so use the page's storage explicitly.
const store = (typeof window !== 'undefined' && window.localStorage) || {};

// The app is built by Vite into app/ (npm run build).
nw.Window.open('app/index.html', {position: 'center', width: 1024, height: 800, min_width: 800, min_height: 600}, function(win) {
  win.on('maximize', function () {
    store['windowState'] = 'maximized';
  });

  win.on('unmaximize', function () {
    store['windowState'] = 'normal';
  });

  win.on('restore', function () {
    store['windowState'] = 'normal';
  });

  if (store['windowState'] == 'maximized') {
    win.maximize();
  }

  // Keep the wallet window on the app: web links open in the system browser, and nothing can
  // open new NW.js windows or navigate this one away.
  const external = function(url) {
    if (/^https?:\/\//i.test(url)) nw.Shell.openExternal(url);
  };
  win.on('new-win-policy', function(frame, url, policy) {
    policy.ignore();
    external(url);
  });
  // The app's own pages share this background page's origin (chrome-extension://<app id>).
  const appOrigin = window.location.origin + '/';
  win.on('navigation', function(frame, url, policy) {
    if (url.indexOf(appOrigin) !== 0) {
      policy.ignore();
      external(url);
    }
  });
});

if (process.versions['nw-flavor'] === 'sdk') {
  nw.Window.get().showDevTools();
}
