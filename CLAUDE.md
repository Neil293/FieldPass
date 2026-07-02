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

**Firebase strategy:** Single-document sync (`ct_sync/main` in project `complytrack-6ac7e`, region `australia-southeast1`). All app state serializes into one Firestore document, keeping usage within the free tier.

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
- **App files** (`fieldpass-v25`): network-first with cache fallback

When updating cached resources, bump the `CACHE_NAME` constant in `sw.js` (currently `fieldpass-v25`).

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
