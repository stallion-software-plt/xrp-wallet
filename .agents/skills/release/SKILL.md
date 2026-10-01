---
name: release
description: Use when preparing a new version of XRP Wallet for release, or a test build of the installers, including version numbers, tags and the "Build installers" GitHub workflow.
---

# Prepare a release

The "Build installers" workflow (`.github/workflows/release.yml`) builds the installers on Windows,
Linux and macOS. Pushing a `v*` tag also writes `SHA256SUMS.txt` and creates a **draft** GitHub
release; a maintainer publishes it.

Tagging, pushing and publishing are the maintainer's decisions: prepare everything, then give them
the commands instead of running them.

## Test build (no release)

Actions → Build installers → Run workflow. The installers are attached to the run as artifacts and
kept for one day. In a private repository, one full build uses about 100 to 150 of the 2,000 free
Actions minutes a month (macOS minutes count ten times).

## Release

1. Make sure `main` is clean and CI passes: `npm run lint`, `npm run typecheck`, `npm test`,
   `npm run build`.
2. Run `npm run check:nw`. If NW.js is out of date, update it first (see the `update-nwjs` skill).
3. Set `version` in `package.json` to the new `X.Y.Z`. Use plain numbers only: the Windows installer
   (WiX) rejects suffixes like `-beta`. Never change `build.winUpgradeCode`; Windows uses it to
   upgrade earlier installs.
4. Update the README if features or download steps changed.
5. `main` is protected: make the version change on a branch, open a pull request titled
   "chore(release): vX.Y.Z" and let the maintainer merge it once CI passes. Then give them:

   ```bash
   git checkout main
   git pull
   git tag vX.Y.Z
   git push origin vX.Y.Z
   ```

6. When the workflow finishes, the maintainer checks the draft release: the files for all three
   systems and `SHA256SUMS.txt` are there, the generated notes are right, and the installer opens a
   wallet on the Testnet. Then they publish it.

In a public repository each installer also gets a signed build provenance attestation, checked with
`gh attestation verify <file> --repo <owner>/<repo>`. Private repositories on GitHub's free plans
skip this step.
