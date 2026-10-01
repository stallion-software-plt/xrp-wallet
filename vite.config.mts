import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {defineConfig, type Plugin} from 'vite';
import react from '@vitejs/plugin-react';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const xrplPkg = JSON.parse(readFileSync(new URL('./node_modules/xrpl/package.json', import.meta.url), 'utf8'));

// Content Security Policy for the packaged app. Scripts only come from the app itself; network
// access is limited to the XRPL websocket servers and the https requests the user asks for
// (federation, issuer lookups, faucets, NFT media). Dev mode skips it because Vite's hot
// reload injects inline scripts.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "img-src 'self' data: blob: https:",
  "media-src 'self' https:",
  // Unencrypted websockets only to a node on this computer; remote servers must use wss.
  "connect-src 'self' https: wss: ws://localhost:* ws://127.0.0.1:*",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-src 'none'"
].join('; ');

function contentSecurityPolicy(): Plugin {
  return {
    name: 'content-security-policy',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}">`);
    }
  };
}

export default defineConfig({
  // NW.js loads the build from disk (chrome-extension://…/app/index.html), so use relative URLs.
  base: './',
  plugins: [react(), contentSecurityPolicy()],
  // Some CommonJS dependencies reference Node's `global`. Point it at the page's own global,
  // in NW.js too, where `global` would otherwise be Node's context.
  define: {global: 'globalThis', __APP_VERSION__: JSON.stringify(pkg.version), __XRPL_VERSION__: JSON.stringify(xrplPkg.version)},
  resolve: {
    alias: [{find: /^assert$/, replacement: fileURLToPath(new URL('./src/shims/assert.cjs', import.meta.url))}]
  },
  build: {
    outDir: 'app',
    emptyOutDir: true,
    target: 'chrome120',
    chunkSizeWarningLimit: 4000,
    sourcemap: false,
    // The licences of every bundled library, shipped with the app.
    license: {fileName: 'THIRD_PARTY_LICENSES.md'}
  },
  server: {port: 5173, strictPort: true}
});
