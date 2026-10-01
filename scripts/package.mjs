#!/usr/bin/env node
/*
 * Builds XRP Wallet with NW.js and wraps it in installers.
 *
 *   node scripts/package.mjs run [-- <NW.js args>]   Run the built app (app/) in the NW.js SDK build.
 *   node scripts/package.mjs [win|linux|mac]         Package for a platform (default: this one).
 *
 * Outputs go to dist/:
 *   Windows  XRP-Wallet-<version>-win-x64.msi, portable .zip             (on Windows)
 *   Linux    xrp-wallet_<version>_amd64.deb, .AppImage, .tar.gz          (on Linux)
 *   macOS    XRP-Wallet-<version>-mac-<x64|arm64>.dmg, .zip              (on macOS)
 * plus SHA256SUMS.txt. Each installer is built with its platform's own tools, so every
 * platform must be packaged on that operating system (see .github/workflows/release.yml).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import nwbuild from 'nw-builder';
import packager from '@nwutils/packager';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const cfg = pkg.build;
const NAME = pkg.productName;
const SLUG = cfg.linuxName;
const VERSION = pkg.version;
const FILE_BASE = `${NAME.replace(/\s+/g, '-')}-${VERSION}`;
const DOWNLOAD_URL = 'https://dl.nwjs.io';
const DIST = path.join(ROOT, 'dist');
// Linux packages need real Unix permissions and symlinks, which a Windows drive mounted
// in WSL (/mnt/c, /mnt/d, ...) doesn't keep, so build there under /tmp instead.
const WORK = process.platform === 'linux' && ROOT.startsWith('/mnt/')
  ? path.join(os.tmpdir(), `${SLUG}-build`)
  : path.join(ROOT, 'build');
const CACHE = path.join(WORK, 'cache');

// Everything the app needs at runtime; nothing else is packaged. app/ is the Vite build, which
// bundles all JavaScript dependencies, so no node_modules folder is shipped.
const APP_FILES = ['main.js', 'package.json', 'app', 'assets', 'LICENSE', 'README.md', 'PRIVACY.md', 'THIRD_PARTY_NOTICES.md'];

function run(cmd, args, options = {}) {
  console.log(`> ${cmd} ${args.join(' ')}`);
  execFileSync(cmd, args, {stdio: 'inherit', ...options});
}

// npm through Node itself: npm.cmd can't be spawned without a shell on Windows.
function npm(args, options) {
  const cli = process.env.npm_execpath;
  return cli && /\.c?js$/.test(cli) ? run(process.execPath, [cli, ...args], options)
    : run('npm', args, {shell: process.platform === 'win32', ...options});
}

// Windows' own tar.exe (bsdtar) reads and writes .zip; a GNU tar earlier on PATH (Git Bash) can't.
const TAR = process.platform === 'win32' ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe') : 'tar';

function fresh(dir) {
  fs.rmSync(dir, {recursive: true, force: true});
  fs.mkdirSync(dir, {recursive: true});
  return dir;
}

/* ---------------------------------------------------------------- verified downloads */

// SHA-256 of every third-party binary that goes into an installer. A download that doesn't match
// stops the build, so a tampered mirror or release can't end up in what users install.
// NW.js: https://dl.nwjs.io/v<version>/SHASUMS256.txt (update these when changing build.nwVersion).
const NW_SHA256 = {
  'nwjs-v0.117.0-win-x64.zip': '0d8356b4ac1550a72a58ec86a5aa44581ce08919617f8d593a3282a3cfa7e397',
  'nwjs-v0.117.0-linux-x64.tar.gz': '2881ed1f3a9031d58d8fa0f0714d0bdac7b45d52bdec095cd72aa4f31e08debf',
  'nwjs-v0.117.0-osx-x64.zip': '55362f8eb0c3e165c30eef41d1473bbb8cef1876d0ae0c4570200fd84361631d',
  'nwjs-v0.117.0-osx-arm64.zip': '5632dee65120283cace880bfdc76efdad2e6004b53ad2625b971de0c1a622693',
  'nwjs-sdk-v0.117.0-win-x64.zip': '3cc12096d6399ae20db68f23b316da677c0b6937d127e44599991ddfab4935be',
  'nwjs-sdk-v0.117.0-linux-x64.tar.gz': '66443b5a09ebb43a56f311e95fc178c01853506d7b72033605eaa6b1a1704eec',
  'nwjs-sdk-v0.117.0-osx-x64.zip': 'a558484cba4c97d190cb41c1e06eb379d239b6a9963b121e691ec8defc4e97b0',
  'nwjs-sdk-v0.117.0-osx-arm64.zip': 'f9d569bf3916c8504f9b61a1d15c0b50edf0df52945d4b8cc6523f8373c2753f'
};
// WiX: the SHA-512 NuGet publishes for wix 5.0.2 matches this file.
const WIX_SHA256 = 'f30ef0c74e2a986126539c5780be93ac24e8136eaf723b1937b26272703ae173';
// appimagetool: a fixed release (not the rolling "continuous" one), with GitHub's published digest.
const APPIMAGETOOL = {
  version: '1.9.1',
  sha256: 'ed4ce84f0d9caff66f50bcca6ff6f35aae54ce8135408b3fa33abfc3cb384eb0'
};

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function verify(file, expected) {
  const actual = sha256(file);
  if (actual !== expected) {
    fs.rmSync(file, {force: true});
    throw new Error(`Checksum mismatch for ${path.basename(file)}: expected ${expected}, got ${actual}. The file was deleted.`);
  }
}

async function download(url, file) {
  console.log(`Downloading ${url}`);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Download failed (${response.status}): ${url}`);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, Buffer.from(await response.arrayBuffer()));
}

// Downloads NW.js into the cache (if needed) and checks it before anything uses it.
async function getNw(platform, arch, flavor) {
  const file = `nwjs${flavor === 'sdk' ? '-sdk' : ''}-v${cfg.nwVersion}-${platform}-${arch}.${platform === 'linux' ? 'tar.gz' : 'zip'}`;
  const expected = NW_SHA256[file];
  if (!expected) {
    throw new Error(`No pinned SHA-256 for ${file}. Add it to NW_SHA256 from ${DOWNLOAD_URL}/v${cfg.nwVersion}/SHASUMS256.txt`);
  }
  // nw-builder reads the app manifest even when only downloading, so point it at package.json.
  await nwbuild({mode: 'get', srcDir: ROOT, glob: false, version: cfg.nwVersion, flavor, platform, arch, cacheDir: CACHE, cache: true, downloadUrl: DOWNLOAD_URL, logLevel: 'warn'});
  verify(path.join(CACHE, file), expected);
}

function copyright() {
  return `Copyright (c) ${new Date().getFullYear()} ${cfg.company}`;
}

/* ---------------------------------------------------------------- app sources */

// Build the web app, then copy it with the NW.js manifest (without build-only fields).
function stageApp() {
  npm(['run', 'build'], {cwd: ROOT});
  const dir = fresh(path.join(WORK, 'app'));
  for (const file of APP_FILES) {
    fs.cpSync(path.join(ROOT, file), path.join(dir, file), {recursive: true});
  }
  const manifest = {...pkg};
  for (const field of ['scripts', 'dependencies', 'devDependencies', 'build']) delete manifest[field];
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(manifest, null, 2) + '\n');
  return dir;
}

function appOptions(platform) {
  if (platform === 'win') {
    return {
      name: NAME,
      icon: path.join(ROOT, 'assets', 'ripple.ico'),
      company: cfg.company,
      fileDescription: NAME,
      fileVersion: VERSION,
      internalName: SLUG,
      originalFilename: `${NAME}.exe`,
      productName: NAME,
      productVersion: VERSION,
      legalCopyright: copyright(),
      comments: pkg.description
    };
  }
  if (platform === 'osx') {
    return {
      name: NAME,
      icon: path.join(ROOT, 'assets', 'ripple.icns'),
      CFBundleIdentifier: cfg.appId,
      CFBundleName: NAME,
      CFBundleDisplayName: NAME,
      CFBundleVersion: VERSION,
      CFBundleShortVersionString: VERSION,
      LSApplicationCategoryType: 'public.app-category.finance',
      NSHumanReadableCopyright: copyright()
    };
  }
  return {
    name: SLUG,
    genericName: 'Cryptocurrency Wallet',
    comment: pkg.description,
    icon: 'assets/ripple.png',
    categories: ['Office', 'Finance'],
    terminal: false
  };
}

// Build the NW.js app folder. `leaf` becomes the top-level folder name inside archives.
async function buildApp(appDir, platform, arch, leaf) {
  await getNw(platform, arch, 'normal');
  const outDir = path.join(fresh(path.join(WORK, `${platform}-${arch}`)), leaf);
  await nwbuild({
    mode: 'build',
    srcDir: appDir,
    glob: false,
    outDir,
    cacheDir: CACHE,
    cache: true,
    version: cfg.nwVersion,
    flavor: 'normal',
    platform,
    arch,
    downloadUrl: DOWNLOAD_URL,
    managedManifest: false,
    zip: false,
    logLevel: 'warn',
    app: appOptions(platform)
  });
  return outDir;
}

/* ---------------------------------------------------------------- Windows */

const WIX_VERSION = '5.0.2';

// WiX 5 (MS-RL licensed). Uses `wix` from PATH if present, otherwise downloads the WiX NuGet
// package and runs it on the installed .NET runtime, so no .NET SDK is required.
async function wix(args) {
  try {
    execFileSync('wix', ['--version'], {stdio: 'ignore'});
    return run('wix', args);
  } catch {
    // not on PATH
  }
  const dir = path.join(CACHE, `wix-${WIX_VERSION}`);
  const nupkg = path.join(dir, 'wix.nupkg');
  if (!fs.existsSync(nupkg)) {
    await download(`https://api.nuget.org/v3-flatcontainer/wix/${WIX_VERSION}/wix.${WIX_VERSION}.nupkg`, nupkg);
  }
  verify(nupkg, WIX_SHA256);
  // Always run WiX from files freshly extracted from the verified package.
  const tools = path.join(dir, 'tools');
  fs.rmSync(tools, {recursive: true, force: true});
  run(TAR, ['-xf', nupkg, '-C', dir]);
  const dll = path.join(tools, 'net6.0', 'any', 'wix.dll');
  return run('dotnet', [dll, ...args], {env: {...process.env, DOTNET_ROLL_FORWARD: 'Major'}});
}

function xml(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Per-user MSI: installs to %LOCALAPPDATA%\Programs\XRP Wallet without asking for admin rights,
// adds Start menu and desktop shortcuts, and upgrades earlier versions in place.
function wixSource(appDir) {
  const exe = `${NAME}.exe`;
  return `<Wix xmlns="http://wixtoolset.org/schemas/v4/wxs">
  <Package Name="${xml(NAME)}" Manufacturer="${xml(cfg.company)}" Version="${xml(VERSION)}"
           UpgradeCode="${cfg.winUpgradeCode}" Scope="perUser" Compressed="yes">
    <MajorUpgrade DowngradeErrorMessage="A newer version of ${xml(NAME)} is already installed." />
    <MediaTemplate EmbedCab="yes" CompressionLevel="high" />
    <Icon Id="AppIcon" SourceFile="${xml(path.join(ROOT, 'assets', 'ripple.ico'))}" />
    <Property Id="ARPPRODUCTICON" Value="AppIcon" />
    <Property Id="ARPNOMODIFY" Value="1" />

    <StandardDirectory Id="LocalAppDataFolder">
      <Directory Id="ProgramsDir" Name="Programs">
        <Directory Id="INSTALLFOLDER" Name="${xml(NAME)}" />
      </Directory>
    </StandardDirectory>
    <StandardDirectory Id="ProgramMenuFolder" />
    <StandardDirectory Id="DesktopFolder" />

    <ComponentGroup Id="AppFiles" Directory="INSTALLFOLDER">
      <Files Include="${xml(appDir)}\\**" />
    </ComponentGroup>

    <Component Id="Shortcuts" Directory="ProgramMenuFolder">
      <Shortcut Id="StartMenuShortcut" Name="${xml(NAME)}" Target="[INSTALLFOLDER]${xml(exe)}"
                WorkingDirectory="INSTALLFOLDER" Icon="AppIcon" />
      <Shortcut Id="DesktopShortcut" Directory="DesktopFolder" Name="${xml(NAME)}"
                Target="[INSTALLFOLDER]${xml(exe)}" WorkingDirectory="INSTALLFOLDER" Icon="AppIcon" />
      <!-- NW.js may write debug.log next to the executable; it isn't an installed file. -->
      <RemoveFile Id="RemoveDebugLog" Directory="INSTALLFOLDER" Name="debug.log" On="uninstall" />
      <RemoveFolder Id="RemoveInstallFolder" Directory="INSTALLFOLDER" On="uninstall" />
      <RegistryValue Root="HKCU" Key="Software\\${xml(NAME)}" Name="installed" Type="integer" Value="1" KeyPath="yes" />
    </Component>

    <Feature Id="Main">
      <ComponentGroupRef Id="AppFiles" />
      <ComponentRef Id="Shortcuts" />
    </Feature>
  </Package>
</Wix>
`;
}

async function packageWindows(appSrc) {
  const arch = 'x64';
  const appDir = await buildApp(appSrc, 'win', arch, NAME);
  const outputs = [];

  const zip = path.join(DIST, `${FILE_BASE}-win-${arch}.zip`);
  run(TAR, ['-a', '-c', '-f', zip, '-C', path.dirname(appDir), path.basename(appDir)]);
  outputs.push(zip);

  const wxs = path.join(WORK, `${SLUG}.wxs`);
  fs.writeFileSync(wxs, wixSource(appDir));
  const msi = path.join(DIST, `${FILE_BASE}-win-${arch}.msi`);
  await wix(['build', wxs, '-arch', arch, '-o', msi, '-pdbtype', 'none']);
  outputs.push(msi);
  return outputs;
}

/* ---------------------------------------------------------------- Linux */

// Folders 755, files 644, and 755 only for real executables (ELF programs and scripts), so
// packages don't inherit whatever modes the checkout had (e.g. everything 777 on /mnt in WSL).
function normalizePermissions(dir) {
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    const file = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      fs.chmodSync(file, 0o755);
      normalizePermissions(file);
      continue;
    }
    const fd = fs.openSync(file, 'r');
    const head = Buffer.alloc(4);
    fs.readSync(fd, head, 0, 4, 0);
    fs.closeSync(fd);
    const elf = head[0] === 0x7f && head.toString('latin1', 1, 4) === 'ELF';
    const script = head.toString('latin1', 0, 2) === '#!';
    const library = /\.so(\.\d+)*$/.test(entry.name);
    fs.chmodSync(file, (elf && !library) || script ? 0o755 : 0o644);
  }
}

const DEB_DEPENDS = ['libnss3', 'libgtk-3-0 | libgtk-3-0t64', 'libasound2 | libasound2t64', 'libgbm1',
  'libxkbcommon0', 'libdrm2', 'libxcomposite1', 'libxdamage1', 'libxrandr2', 'libcups2 | libcups2t64'];

function desktopEntry(exec, icon) {
  return ['[Desktop Entry]', 'Type=Application', `Name=${NAME}`, 'GenericName=Cryptocurrency Wallet',
    `Comment=${pkg.description}`, `Exec=${exec}`, `Icon=${icon}`, 'Terminal=false',
    'Categories=Office;Finance;', `StartupWMClass=${SLUG}`, ''].join('\n');
}

// Ubuntu 24.04+ only lets profiled apps create the user namespaces Chromium's sandbox needs.
// The profile is written at install time only where AppArmor 4 is present.
function postinst() {
  return `#!/bin/sh
set -e
if [ -f /etc/apparmor.d/abi/4.0 ]; then
  cat > /etc/apparmor.d/${SLUG} <<'EOF'
abi <abi/4.0>,
include <tunables/global>

profile ${SLUG} /opt/${SLUG}/${SLUG} flags=(unconfined) {
  userns,
  include if exists <local/${SLUG}>
}
EOF
  if command -v apparmor_parser >/dev/null 2>&1; then
    apparmor_parser -r /etc/apparmor.d/${SLUG} || true
  fi
fi
exit 0
`;
}

function postrm() {
  return `#!/bin/sh
set -e
if [ "$1" = "remove" ] || [ "$1" = "purge" ]; then
  rm -f /etc/apparmor.d/${SLUG}
fi
exit 0
`;
}

function buildDeb(appDir) {
  const root = fresh(path.join(WORK, 'deb'));
  const opt = path.join(root, 'opt', SLUG);
  fs.mkdirSync(path.dirname(opt), {recursive: true});
  run('cp', ['-a', appDir, opt]);
  fs.rmSync(path.join(opt, `${SLUG}.desktop`), {force: true});

  fs.mkdirSync(path.join(root, 'usr', 'bin'), {recursive: true});
  fs.symlinkSync(`/opt/${SLUG}/${SLUG}`, path.join(root, 'usr', 'bin', SLUG));
  const apps = path.join(root, 'usr', 'share', 'applications');
  fs.mkdirSync(apps, {recursive: true});
  fs.writeFileSync(path.join(apps, `${SLUG}.desktop`), desktopEntry(`/opt/${SLUG}/${SLUG} %U`, SLUG));
  const icons = path.join(root, 'usr', 'share', 'icons', 'hicolor', '512x512', 'apps');
  fs.mkdirSync(icons, {recursive: true});
  fs.copyFileSync(path.join(ROOT, 'assets', 'ripple.png'), path.join(icons, `${SLUG}.png`));

  const debian = path.join(root, 'DEBIAN');
  fs.mkdirSync(debian);
  const sizeKb = execFileSync('du', ['-sk', path.join(root, 'opt')], {encoding: 'utf8'}).split(/\s/)[0];
  fs.writeFileSync(path.join(debian, 'control'), [
    `Package: ${SLUG}`,
    `Version: ${VERSION}`,
    'Section: utils',
    'Priority: optional',
    'Architecture: amd64',
    `Maintainer: ${cfg.maintainer}`,
    `Installed-Size: ${sizeKb}`,
    `Depends: ${DEB_DEPENDS.join(', ')}`,
    `Description: ${pkg.description}`,
    ' Send, receive and trade on the XRP Ledger. Keys are encrypted and stay on this computer.',
    ''].join('\n'));
  for (const [name, body] of [['postinst', postinst()], ['postrm', postrm()]]) {
    fs.writeFileSync(path.join(debian, name), body);
    fs.chmodSync(path.join(debian, name), 0o755);
  }
  normalizePermissions(path.join(root, 'usr'));
  fs.chmodSync(root, 0o755);

  const deb = path.join(DIST, `${SLUG}_${VERSION}_amd64.deb`);
  run('dpkg-deb', ['--root-owner-group', '--build', root, deb]);
  return deb;
}

async function packageLinux(appSrc) {
  const arch = 'x64';
  const appDir = await buildApp(appSrc, 'linux', arch, SLUG);
  // nw-builder joins Categories with commas and points Icon at the build machine; replace its
  // entry with a valid one (the AppImage packager reads it).
  fs.writeFileSync(path.join(appDir, `${SLUG}.desktop`), desktopEntry(SLUG, SLUG));
  normalizePermissions(appDir);
  const outputs = [];

  const tgz = path.join(DIST, `${SLUG}-${VERSION}-linux-${arch}.tar.gz`);
  run(TAR, ['-czf', tgz, '-C', path.dirname(appDir), path.basename(appDir)]);
  outputs.push(tgz);

  outputs.push(buildDeb(appDir));

  // The packager reuses appimagetool from the cache, so put the pinned, verified release there first.
  const toolBase = `https://github.com/AppImage/appimagetool/releases/download/${APPIMAGETOOL.version}`;
  const tool = path.join(CACHE, 'appimagetool-x86_64.AppImage');
  if (!fs.existsSync(tool) || sha256(tool) !== APPIMAGETOOL.sha256) {
    await download(`${toolBase}/appimagetool-x86_64.AppImage`, tool);
  }
  verify(tool, APPIMAGETOOL.sha256);
  fs.chmodSync(tool, 0o755);
  const appImage = await packager({
    format: 'AppImage',
    appDir,
    appName: SLUG,
    icon: path.join(ROOT, 'assets', 'ripple.png'),
    arch,
    outDir: path.join(WORK, 'appimage'),
    cacheDir: CACHE,
    cache: true,
    appImageToolUrl: toolBase
  });
  const target = path.join(DIST, `${FILE_BASE}-x86_64.AppImage`);
  fs.copyFileSync(appImage, target);
  fs.chmodSync(target, 0o755);
  outputs.push(target);
  return outputs;
}

/* ---------------------------------------------------------------- macOS */

async function packageMac(appSrc) {
  const outputs = [];
  for (const arch of ['x64', 'arm64']) {
    const outDir = await buildApp(appSrc, 'osx', arch, NAME);
    const app = path.join(outDir, `${NAME}.app`);
    // Renaming the bundle invalidates NW.js's signature; Apple Silicon refuses unsigned code,
    // so re-sign ad hoc. Distributing outside the App Store without warnings needs a
    // Developer ID signature and notarization on top of this.
    run('codesign', ['--force', '--deep', '--sign', '-', app]);

    const zip = path.join(DIST, `${FILE_BASE}-mac-${arch}.zip`);
    run('ditto', ['-c', '-k', '--keepParent', app, zip]);
    outputs.push(zip);

    const dmgRoot = fresh(path.join(WORK, `dmg-${arch}`));
    run('cp', ['-R', app, dmgRoot]);
    fs.symlinkSync('/Applications', path.join(dmgRoot, 'Applications'));
    const dmg = path.join(DIST, `${FILE_BASE}-mac-${arch}.dmg`);
    run('hdiutil', ['create', '-volname', NAME, '-srcfolder', dmgRoot, '-ov', '-format', 'UDZO', dmg]);
    outputs.push(dmg);
  }
  return outputs;
}

/* ---------------------------------------------------------------- main */

function writeChecksums() {
  const lines = fs.readdirSync(DIST)
    .filter(f => f !== 'SHA256SUMS.txt' && fs.statSync(path.join(DIST, f)).isFile())
    .sort()
    .map(f => `${crypto.createHash('sha256').update(fs.readFileSync(path.join(DIST, f))).digest('hex')}  ${f}`);
  fs.writeFileSync(path.join(DIST, 'SHA256SUMS.txt'), lines.join('\n') + '\n');
}

async function main() {
  const [command = {win32: 'win', darwin: 'mac', linux: 'linux'}[process.platform], ...rest] = process.argv.slice(2);

  if (command === 'run') {
    const host = {win32: 'win', darwin: 'osx', linux: 'linux'}[process.platform];
    await getNw(host, process.arch, 'sdk');
    await nwbuild({
      mode: 'run',
      srcDir: ROOT,
      glob: false,
      version: cfg.nwVersion,
      flavor: 'sdk',
      cacheDir: CACHE,
      downloadUrl: DOWNLOAD_URL,
      argv: rest.filter(a => a !== '--')
    });
    return;
  }

  const hosts = {win: 'win32', linux: 'linux', mac: 'darwin'};
  if (!hosts[command]) {
    throw new Error(`Unknown command "${command}". Use run, win, linux or mac.`);
  }
  if (process.platform !== hosts[command]) {
    throw new Error(`Packaging for ${command} must run on ${hosts[command]}; this is ${process.platform}.`);
  }

  fs.mkdirSync(DIST, {recursive: true});
  const appSrc = stageApp();
  const outputs = command === 'win' ? await packageWindows(appSrc)
    : command === 'linux' ? await packageLinux(appSrc)
    : await packageMac(appSrc);
  writeChecksums();
  console.log('\nBuilt:');
  outputs.forEach(f => console.log(`  ${path.relative(ROOT, f)}  (${(fs.statSync(f).size / 1048576).toFixed(1)} MB)`));
}

main().catch(err => {
  console.error(err.message || err);
  process.exit(1);
});
