#!/usr/bin/env node
/*
 * Fails when a newer NW.js release than package.json's build.nwVersion exists. NW.js bundles
 * Chromium, so staying current is how the app gets browser security fixes, and Dependabot doesn't
 * track it. Run weekly by .github/workflows/nwjs-update.yml, or by hand: npm run check:nw
 */
import fs from 'node:fs';

const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const ours = pkg.build.nwVersion;

const parts = v => v.replace(/^v/, '').split('.').map(Number);
function newer(a, b) {
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < 3; i++) {
    if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
  }
  return false;
}

const response = await fetch('https://nwjs.io/versions.json');
if (!response.ok) throw new Error(`Could not read https://nwjs.io/versions.json (${response.status})`);
const {latest} = await response.json();

if (newer(latest, ours)) {
  const message = `NW.js ${latest} is available; this app uses v${ours}. Update build.nwVersion in package.json and ` +
    `the NW_SHA256 checksums in scripts/package.mjs from https://dl.nwjs.io/${latest}/SHASUMS256.txt, then test and release.`;
  console.log(process.env.GITHUB_ACTIONS ? `::error::${message}` : message);
  process.exitCode = 1;
} else {
  console.log(`NW.js v${ours} is the latest release.`);
}
