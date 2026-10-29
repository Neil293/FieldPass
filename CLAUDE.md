# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

FieldPass is a mobile-first Progressive Web App (PWA) for managing backflow prevention device compliance testing. It allows field staff and administrators to record, track, and report on testing across a large device register. Live at neil293.github.io/FieldPass.

## Build & Deployment

There is **no build process**. The app is a static single-file PWA deployed via GitHub Pages:

- **Deploy:** Push to `main` branch → GitHub Pages updates automatically (~30 seconds)
- **No npm, no bundler, no compile step** — index.html is loaded directly
- **No automated tests** — manual testing in browser (Chrome, Safari, Firefox)

## Architecture

### Single-File Monolith

The entire application lives in `index.html` (~6,600 lines, ~280KB). This file contains all HTML structure, CSS styles, and JavaScript logic. Key supporting files:

- `data.js` — Seed data (`window.SEED_DATA`): 570+ devices across 58 suburbs, loaded once on first run
- `sw.js` — Service worker: offline-first caching for app shell and map tiles
- `manifest.json` — PWA manifest (standalone display, dark blue theme, PNG icons)
- `icon-192.png` / `icon-512.png` — PWA icons (dark navy background, green ring, white checkmark)

### Initialization Sequence

1. Firebase SDK loads asynchronously (ES module import)
2. Login screen shown until user authenticates against localStorage users
3. Device data loaded from localStorage (`fp_devices_v1`)
4. Firebase real-time listener attached for sync
5. Filter state restored from localStorage (`ct_filter_state_v1`)
6. Service worker registered for offline support

### Data Layer

**localStorage is the source of truth.** Firebase Firestore is an optional sync layer, not the primary store. All app data is stored locally under these keys:

| Key | Contents |
|-----|----------|
| `fp_devices_v1` | All backflow devices |
| `bf_clients_v1` | Client organisations |
| `scc_users_v1` | User accounts |
| `ct_settings_v1` | App settings |
| `ct_email_templates_v1` | Email report templates |
| `ct_filter_state_v1` | Persisted filter state (statuses, month, suburb) |

**Firebase strategy:** Single-document sync (`ct_sync/main` in project `complytrack-6ac7e`, region `australia-southeast1`). All app state serializes into one Firestore document, keeping usage within the free tier. ComplyTrack used to write the same document (each app's full `setDoc` replaced the other's data); since 29 Oct 2026 ComplyTrack uses `ct_sync/complytrack`, and the FieldPass listener (live and beta) ignores any record without a non-empty `devices` array.

### Key Data Models

**Device:**
```javascript
{
  id, suburb, complex, address,  // complex = property/building name; address = street address
  make, model, size, serial, location, lat, lng,
  scheduledMonth,  // month name, when annual test is due
  testDate,        // YYYY-MM-DD
  testResult,      // Pass | Fail | Repaired | Decommissioned
  notes, backflowId,
  testLog: [{ date, result, tester, notes, ts }]
}
```

**User:**
```javascript
{
  username, password,  // hashed (mix of legacy SHA + async)
  role,                // Admin | Supervisor | Tester
  permissions: {}      // per-user flags override role defaults
}
```

Default credentials: `admin` / `admin123`.

**Client (organisation):**
```javascript
{ id, name, abbr, colour, notes, contactName, contactPhone, contactEmail, contactAddress }
```

### Status System

Device compliance status is computed (not stored) from `scheduledMonth` + latest `testResult`. There are 9 statuses: Overdue, Due this month, Due next month, Upcoming, Complete, Failed, Repaired, Decommissioned, Pending. Status drives map pin colors (customizable in settings) and report filtering.

### Stat Cards (metrics bar)

The four metric tiles at the top of the device list are **clickable** — tapping a tile applies the matching status filter instantly. Three contexts:

- **Default (no active filter):** Total devices (clear all) / Overdue / Due this month / Complete
- **Status filter active:** Today / Total (current month) / Failed / Remaining
- **Month filter active:** Total due / Tested / Remaining / Failed — all keep the month filter and narrow by status

Helper function: `metricFilter(statusesArray, clearMonth)` — sets `_activeStatuses`, optionally clears the month dropdown, then calls `syncStatusPillStyles()` + `renderMonthPills()` + `render()`.

### Filter Persistence

Filter state (active status pills, selected month, suburb) is saved to localStorage at the end of every `render()` call and restored at startup via `restoreFilterState()`. The suburb dropdown is populated dynamically, so the suburb value is held in `window._restoredSuburb` and applied after `populateSuburbFilter()` runs.

Key: `ct_filter_state_v1` — `{ statuses: string[], month: string, suburb: string }`

### Fail Record Clipboard Copy

When "Save fail record" is pressed (`saveFailNotes()`), the app builds a clipboard string:

```
SUBURB - serial - location - notes
```

Written via `navigator.clipboard.writeText()`. The `_closeFailPopup()` helper blurs the active element first (80 ms delay) to ensure the Android keyboard dismisses before the modal reshapes.

### CSS Design System

All colors, spacing, and typography are defined as CSS custom properties in the `:root` block near the top of `index.html`. The UI is mobile-first with breakpoints at `max-width: 700px`. Font: DM Sans + DM Mono (Google Fonts via CDN).

Stat tiles have a hover/tap highlight: `.metric:hover { background: var(--surface2); border-color: var(--accent) }`.

### External Libraries (CDN only)

- **Leaflet.js 1.9.4** — interactive maps with OpenStreetMap tiles
- **Firebase Firestore 10.12.0** — real-time sync
- **BarcodeDetector API** — native browser QR code scanning (no library)

### Offline Strategy (sw.js)

- **Map tiles** (`complytrack-tiles-v1`): cache-first, persistent
- **CDN resources**: cache-first with network fallback
- **App files** (`fieldpass-v26`): network-first with cache fallback

When updating cached resources, bump the `CACHE_NAME` constant in `sw.js` (currently `fieldpass-v37`).

### PWA Install

The `beforeinstallprompt` event is captured in `_installPrompt`. A manual **Install app on this device** button in Settings calls `triggerInstall()`, which shows the native prompt on Android or a Share → Add to Home Screen instruction on iOS.

### By Month Report

Month cards in the report expand on tap to show a per-suburb breakdown: suburb name, mini progress bar, completion %, done/total count, failed badge, overdue badge.

### CSV Export

Columns (in order): Suburb, Complex / Property name, Street address, Latitude, Longitude, Make, Model, Size (mm), Serial No., Backflow ID, Location, Scheduled Month, Last Tested, Test Result, Tested By, Notes.

### Permissions Model

Permissions are stored as a flat object of flags per user (not purely role-based checks). The `Admin` role gets all permissions; `Supervisor` and `Tester` get subsets. Admins can grant individual flags to any user via the user management panel.

### Email Templates

Use `{{placeholder}}` syntax for dynamic values in suburb compliance report emails. Templates are stored in localStorage and rendered with simple string replacement.

## Beta copy (`beta/`)

`beta/` is a test copy of the app at neil293.github.io/FieldPass/beta/, used to build new features without touching the live app. New feature work goes in `beta/index.html` until Neil approves it; the live root files are not changed meanwhile.

Beta-only differences (all marked `BETA-ONLY` in `beta/index.html`) — remove these when promoting beta to live:
1. Storage shim at the top of `<head>`: every localStorage key is prefixed `fpbeta:`, and on first open the live `fp_ / bf_ / scc_ / ct_` keys are copied in. The live app and beta share the neil293.github.io origin, so without this they would share data.
2. ~~Firebase stub~~ — since 29 Oct 2026 the beta **syncs with live** through `ct_sync/main` (Neil wants to record in either). The beta listener (marked `// BETA:`) keeps beta-only info when live's data arrives: device `type`, test-log `readings` (matched by date + result), settings keys live lacks (testKits, readingDefaults…), users' `kitId`; then pushes so the cloud has them. Live passes unknown fields through untouched when it saves. One-off pre-sync copy of the beta's own data in `fpbeta:presync_snapshot_v1`. Keep the merge code when promoting to live.
3. Orange stripe and BETA badge (tap → info).
4. `beta/sw.js` uses cache names starting `fieldpass-beta-` and only deletes its own caches; `beta/manifest.json` is "FieldPass Beta" with an orange theme.

Beta features not yet in live:
- **Device type** — `type: 'RPZD' | 'DCV' | ''` on each device. Set once on load from make/model by `guessDeviceType()` ('' when unsure), editable in Device details and Add Device, shown in the info grid, exported/imported as the last CSV column "Device Type".
- **Test readings** — Pass / Fail / Repaired open a readings sheet (`showReadingsSheet`) before the existing flow. Fields per type in `READING_FIELDS` (step + default per field: valves step 2, defaults RPZD 50/20/20, DCV 20/20; main pressure step 50, default 500; defaults editable in Settings → "Test reading defaults" (setting `readingDefaults`, read via `readingDefault()`); +/− snaps to multiples of the step) (provisional until BackFlowID/Tradehack forms are mapped). Pre-filled from the device's last readings of the same type, shown yellow until adjusted (+/−, typing, or "Same as last"); saving with yellow values asks for confirmation. Saved on the test log entry as `readings: {type, cv1, rv, cv2, line, kit}` (kPa). Last test kit remembered in `fp_last_test_kit_v1`. Readings shown in Test history.
- **Tradehack on/off** — Settings → Recording → "Send results to Tradehack" (`tradehackEnabled`, default on). Any Tradehack hand-off must check `tradehackEnabled()`; when off, FieldPass hands off to BackFlowID only.
- **Test kits** — Settings → "🧪 Test kits" tab. Kits stored in settings as `testKits: [{id, make, serial, calDate, dueDate, range, reportNo, calibratedBy}]` (so they sync with settings). Each user's current kit is `user.kitId` (Users → Edit → Current test kit, or chosen on the readings sheet, which updates it). Readings store `kit` (label) plus a `kitInfo` snapshot. Readings sheet shows a banner: amber "Test kit requires testing before …" from 4 weeks before due, red "Test kit overdue" after; overdue also asks before saving.
- **Directions QR toggle** — Settings → Device list → "Show 'Scan for directions' QR code" (`showDirectionsQr`, default on). When off, `openDevice` hides `#m-qr-block` and skips `generateQR`.
- **Status carry-over at new year** — in `getStatusForYear`, for the current year only: a device whose latest result is Fail stays `failed` until a new result is recorded; a scheduled device that has test records but none in the previous year stays `overdue` (devices with no records at all stay on the normal cycle — Neil lost records in 2026) (applies from 2027, `STATUS_CARRY_FROM_YEAR = 2026`). A Pass/Repaired from last year still resets to the normal due cycle on 1 January.
- **Hand-off to BackFlowID / Tradehack** — after readings are saved, `copyHandoff()` puts `FPBF1 {json}` on the clipboard (setting `handoffCopy`, default on; replaces the serial / fail-note copy). Packet: serial, make, model, size, type, result (Repaired→Pass), date, time, cv1, rv, cv2, main, kit {serial,…}, remarks (notes unless Pass), location, lat, lng, bfid, tradehack. "📋 Copy for BackFlowID" in Test history re-copies the latest readings. Settings has "Copy BF Fill bookmark".
- **Open Backflow ID in Chrome** — `openBackflowLink(url)` (used by the Backflow ID go button and "Follow Backflow ID link"). On Android with setting `bfidInChrome` (default on) it navigates to an `intent://…#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=…;end` link so the page opens in full Chrome, not the installed app's built-in viewer (custom tab), where bookmarks can't run.

## BF Fill bookmark (`tools/bffill.js`)

Served at neil293.github.io/FieldPass/tools/bffill.js (live path, not beta — the bookmark loads it with a cache-buster). Reads the `FPBF1` packet (clipboard, or paste box; kept per site in localStorage `fpbf_packet_v1` for 18 h). Detects the page by DOM:
- **BackFlowID test form** (`form-input` elements with `<p>` labels, Riot.js): fills by label — upstream/downstream isolating valve tight, second check valve tight, installation complies, permission, cleaned strainer = Yes; CV1, relief valve (RPZD), CV2, mains pressure; result; test kit by serial; comments. Warns if the page doesn't show the serial. **Labels guessed from the test results page — the real form hasn't been captured yet; if fields are reported "Not found", ask Neil for the 🗺 Map output.**
- **BackFlowID tag form** (`form [name=manufacturer]` + `[name=type_code]`): fills only empty fields (type_code, manufacturer, model, size "NN mm", serial, location_description, lat/lng); warns on serial mismatch.
- **BackFlowID result page** ("Result (provided by tester)"): "Tradehack →" re-copies the packet and opens `my.tradehack.com.au/search/?q=<serial>` (search-by-serial not yet confirmed).
- **Tradehack lists** (links `/clients/retest/<uuid>`): finds the row by `td[data-title="Serial"]`, highlights, "Open test →".
- **Tradehack test page** (`/clients/retest/<device-uuid>`, `form.form9_qld`, jQuery): device_type radio, mains_pressure_kpa/time/date, device_check_valve_1/2, device_differential_pressure (RPZD), upstream/downstream `tight`, strainer_fitted yes (if unset), strainer_cleaned yes, `test_kits` option by serial in its text, appendix E (RPZD) / F (DCV), test_result, test_remarks. Confirms if `device_serial_number` differs.
Never presses Submit / Complete Test. Saved copies of all pages were used for testing (not in repo).

## Android app (`android/`)

Small native wrapper (plain Java, no AndroidX), package `au.com.fairymeadowplumbing.fieldpass`, minSdk 29. Built by `.github/workflows/android.yml` on pushes touching `android/**` (or manually); signed with `android/fieldpass.jks` (committed so every build installs over the last and keeps app data — password in `app/build.gradle`); published to release **android-latest** as `FieldPass.apk` (https://github.com/Neil293/FieldPass/releases/download/android-latest/FieldPass.apk). versionCode = run number.
- Loads `https://neil293.github.io/FieldPass/app/` — `app/index.html` redirects to the version the app should run (`../beta/` now; change to `../` when beta goes live — no new APK needed). The app's WebView has its **own storage**, separate from Chrome: data gets in by Settings → Data → restore a backup (or Firebase sync once live).
- Links from FieldPass to other sites open in an **in-app browser** (second WebView with a top bar: ‹ FieldPass, title, ⚡ BF Fill, ↻, ⇱ open in Chrome). Google Maps, mailto, tel go to other apps. Cookies persist, so BackFlowID/Tradehack logins are kept.
- On every page load on backflowid.com / qr2id.net / qr2id.com / tradehack.com.au it injects the BF Fill loader (sets `window.__BFFILL_APP`).
- JS bridge `window.FieldPassApp`: `setPacket(text)` (FieldPass screen only) / `getPacket()`, `saveFile(name, mime, base64)` (FieldPass downloads → Downloads/FieldPass, via an injected shim for blob links), `openInApp(url)`, `isApp()`, `version()`. FieldPass's `copyHandoff` and `openBackflowLink` use it when present; BF Fill prefers the bridge packet and re-detects the page every second (BackFlowID changes screens without reloading).
- Handles camera (getUserMedia + photo upload with camera option), GPS prompts, file chooser, window.open, back button.
- **Update check**: on launch the app reads `version.json` from the android-latest release (the workflow writes `{versionCode, versionName, notes}` — notes = the commit subject, so write a clear one) and, if newer than the installed versionCode, offers Download (opens the APK link in Chrome) / Later (12 h snooze). Only shell changes in `android/` need a new APK; FieldPass and BF Fill load from the web.

## Switching beta to live (checklist)

Only when Neil asks ("switch FieldPass to the beta version"). Work on `main`, run `git fetch` first, and confirm each step before the next.

1. **Neil backs up first.** Ask him to download a backup from live FieldPass → Settings → Data before anything changes. Don't continue until he confirms.
2. **Tag the current live version** so it can be restored in one step:
   `git tag live-before-beta-YYYYMMDD && git push origin live-before-beta-YYYYMMDD`
3. **Keep the old version online at `previous/`** (copy root `index.html`, `data.js`, `manifest.json`, icons, `sw.js`). It shares data with live, which is fine — it only ignores the new fields. In `previous/`: title "FieldPass (previous)", manifest name/short_name "FieldPass (previous)", and change `previous/sw.js` so its cache names start `fieldpass-previous-` and its activate step only deletes caches with that prefix (otherwise it wipes the live app's cache).
4. **Build the new live `index.html` from `beta/index.html`**, removing every `BETA-ONLY` block:
   - the storage shim `<script>` at the top of `<head>` (live must use the plain keys);
   - (Firebase block is already the real one — keep it);
   - the orange stripe, BETA badge and `fpBetaMenu` at the end of `<body>`;
   - `<title>` back to `FieldPass`, `theme-color` back to `#1a4d6e`.
   Keep everything else (device type, readings, test kits, `SEED_KITS`, status carry-over, settings).
   Check: `grep -n "BETA-ONLY\|fpbeta\|FP_BETA\|fp-beta" index.html` returns nothing.
5. **Root `sw.js`**: bump `CACHE_NAME` by one from its current value, and limit the activate clean-up to caches starting `fieldpass-v` plus `complytrack-tiles-v1`, so it no longer deletes the `beta/` and `previous/` caches. Root `manifest.json` stays as it is.
6. **Test before pushing** (headless Chromium, phone size, serving the repo under `/FieldPass/`): log in, device counts by status match the old live version, Pass → readings sheet → save works, Test kits tab shows the two Dura kits, sync label is not "beta", no page errors.
7. **Push, wait for the Pages deploy** (`gh run list -R Neil293/FieldPass -L 1`), then tell Neil to fully close and reopen FieldPass. Remind him: tests he recorded in the beta stay in the beta and do not move to live.
8. **Afterwards:** update the "Beta features not yet in live" list above (they're now live), update the Device model / CSV sections, and reset the beta for future work with `python3 tools/make_beta.py .` (Neil then taps BETA → copy live data).

**To revert:** `git checkout live-before-beta-YYYYMMDD -- index.html sw.js manifest.json data.js`, bump `CACHE_NAME` above the newest value used, commit, push, wait for deploy. Neil's data keeps working in the old version (new fields are ignored). Meanwhile he can use `/FieldPass/previous/`.
