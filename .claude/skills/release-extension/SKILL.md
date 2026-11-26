---
name: release-extension
description: Release gitlab-extended. Builds the Firefox .xpi and source zip for AMO upload, watches ~/Downloads in the background for the signed .xpi and ends the turn, then publishes the GitHub release with the signed Firefox build and a Chrome zip as soon as the file lands. Use when the user runs /release-extension, asks to build or release the extension, or says the signed .xpi is downloaded.
---

# Release gitlab-extended

AMO has to sign the .xpi in between, so a release spans two turns:

1. **Build.** Build the .xpi and the source zip, start a background watcher on `~/Downloads`, and end the turn. The user uploads both files to AMO and downloads the signed .xpi.
2. **Publish.** The watcher exits when the signed file lands, which wakes you up. Then publish the GitHub release. If the user says it's downloaded before that, publish right away.

## Which phase?

Read the version from `package.json` (e.g. `1.16.0`, tag `v1.16.0`). `manifest.json` has the short form (`1.16`).

- No release `v<version>` yet (`gh release view v<version>` fails) and the user hasn't said the signed file is downloaded → **Phase 1**.
- The Downloads watcher finished, or the user says it's downloaded or signed, or invokes the skill again after phase 1 → **Phase 2**.
- Release `v<version>` already exists → stop and tell the user. The version probably hasn't been bumped since the last release.

## Phase 1: Build

1. `git checkout main && git pull`. Stop if the working tree is dirty or you're not on `main`.
2. Check that `manifest.json` `version` matches `package.json` (`1.16` ↔ `1.16.0`). If it doesn't, stop and ask. AMO rejects a version that it has already seen.
3. Build:
   ```sh
   pnpm build && pnpm package
   git archive --format=zip -o packages/gitlab-extended-source.zip HEAD
   ```
4. Report the version, the commit and the merged PRs since the last tag (`git log --oneline v<prev>..HEAD`), plus both absolute paths:
   - `/Users/robinheidenis/dev/gitlab-extended/packages/gitlab-extended.xpi`
   - `/Users/robinheidenis/dev/gitlab-extended/packages/gitlab-extended-source.zip`
5. Start the Downloads watcher with the Bash tool, `run_in_background: true` and `timeout: 7200000`. It exits once a signed .xpi for this version shows up that is newer than the build. AMO's file is matched exactly, so Firefox's `.part` and Chrome's `.crdownload` files are skipped. `unzip -t` makes sure the download is complete:
   ```sh
   v=<manifest version>; ref=/Users/robinheidenis/dev/gitlab-extended/packages/gitlab-extended.xpi
   until f=$(find ~/Downloads -maxdepth 1 -name "*-$v.xpi" -newer "$ref" | head -1); [ -n "$f" ] && unzip -tq "$f" >/dev/null 2>&1; do sleep 2; done; echo "$f"
   ```
6. Tell the user to upload both files to AMO and download the signed .xpi to `~/Downloads`, and that you'll publish the release on your own once it lands. **End the turn here.** Don't wait for the watcher in the foreground, and don't create a release yet.
7. If the watcher times out after 2 hours without output, start it again and tell the user in one line. If the user says it's downloaded while the watcher is still running, stop it with TaskStop and go to phase 2.

## Phase 2: Publish

1. Find the signed .xpi. The watcher prints its path. Otherwise: AMO names the download `<hash>-<manifest version>.xpi`, e.g. `b216bd0b2d7b4e1eba91-1.16.xpi`. Use the newest `~/Downloads/*-<manifest version>.xpi`:
   ```sh
   find ~/Downloads -maxdepth 1 -name '*-<manifest version>.xpi' -print0 | xargs -0 ls -t | head -1
   ```
   If nothing matches, tell the user and stop.
2. Verify it before you use it:
   - `unzip -l` shows `META-INF/mozilla.rsa` and `META-INF/cose.sig`. Without them, it isn't signed.
   - `unzip -p <file> manifest.json` has the expected `version`.
   - `unzip -p <file> scripts/content.js` is identical to `dist/scripts/content.js`. If it isn't, rebuild with `pnpm build` and compare again. If they still differ, stop and tell the user.
3. Stage the assets in `packages/`:
   - `cp <signed> packages/gitlab-extended-<version>-firefox.xpi`
   - `cp packages/gitlab-extended.xpi packages/gitlab-extended-<version>-chrome.zip` (Chrome gets the unsigned build)
   - `mv packages/gitlab-extended-source.zip packages/gitlab-extended-<version>-source.zip` (archive only, don't upload)
4. Write the release notes to a file in the scratchpad. Read the merged PRs since the previous tag (`gh pr view <n> --json title,body,author`) and follow the format of the previous release (`gh release view v<prev> --json body -q .body`):
   ```markdown
   ## v<version>
   <One sentence on what this release does.>

   ### <Feature heading>
   <What changes for the user, in plain language. One section per notable change.>

   ## What's Changed
   * <PR title> by @<author> in <PR url>

   **Full Changelog**: https://github.com/RobinHeidenis/gitlab-extended/compare/v<prev>...v<version>

   ## Install instructions
   ### Chrome
   1. Download gitlab-extended-<version>-chrome.zip and unzip the file
   2. Go to `about://extensions`
   3. Click on Load unpacked
   4. Point to the folder you just unzipped
   5. Enjoy gitlab-extended v<version>

   ### Firefox
   1. Download gitlab-extended-<version>-firefox.xpi
   2. If firefox prompts you to allow github.com to install extensions, click yes. The extension should now be installed. Go to step 7. If not, continue to step 3
   3. Go to about:addons
   4. Click on the gear icon
   5. Click on Install Add-on from file
   6. Select the xpi file you downloaded
   7. Enjoy gitlab-extended v<version>
   ```
   Copy the install instructions word for word. Only the version changes.
5. Create the release on the commit that you built:
   ```sh
   gh release create v<version> --target <commit sha> --title "Gitlab Extended - v<version>" --notes-file <notes> \
     packages/gitlab-extended-<version>-chrome.zip packages/gitlab-extended-<version>-firefox.xpi
   ```
6. Report the release URL and run `git fetch --tags`.
