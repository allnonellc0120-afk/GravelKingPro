---
name: Google Play TWA build + upload
description: How the GravelKing Pro TWA .aab is built non-interactively and uploaded to Play internal track
---
- Android SDK installed manually to /tmp/android-sdk (commandlinetools zip + `yes | sdkmanager --licenses`; nix android-sdk pkg doesn't exist). Bubblewrap needs a `tools -> cmdline-tools/latest` symlink or it rejects the SDK path.
- Bubblewrap run non-interactively: `~/.bubblewrap/config.json` {jdkPath, androidSdkPath}; passwords via BUBBLEWRAP_KEYSTORE_PASSWORD / BUBBLEWRAP_KEY_PASSWORD env vars (piped stdin crashes inquirer). Never pipe `yes y` into prompts — it sets versionName to "y".
- Project lives in `android-twa/` (twa-manifest.json committed; android.keystore + .keystore-pass gitignored — losing the keystore means losing Play update ability). iconUrl served from a local `python3 -m http.server` during update/build since prod isn't republished yet.
- Signing cert SHA-256: 5E:B5:8E:69:50:0E:E4:E1:B4:9E:4C:57:F0:89:9A:10:D3:6D:B6:69:64:22:B8:75:2F:8F:95:9F:8B:9F:B9:A4 — baked into artifacts/gravelkingpro/public/.well-known/assetlinks.json; that file (and icon-512.png) go live only after publishing the web artifact.
- Upload via artifacts/api-server/scripts/play-upload-internal.mjs (GCP_SERVICE_ACCOUNT, androidpublisher v3: edit → upload bundle → PUT tracks/internal → commit). versionCode 1 committed to internal track for com.gravelkingpro.app.
- Listing (text/images/contact) + production release staged via play-listing-and-release.mjs; a never-published ("draft") app only accepts production releases with status "draft" — status "completed" 400s until first Console publish.
- Console-only steps the API can't do: content rating questionnaire, data safety form, target audience, app access instructions, and the account owner's identity/payments verification — required before Google review and going live.
- **Why:** rebuilds/updates must reuse the same keystore and package id or Play rejects the upload.
