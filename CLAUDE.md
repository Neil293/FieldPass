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

The entire application lives in `index.html` (~6,500 lines, ~270KB). This file contains all HTML structure, CSS styles, and JavaScript logic. Key supporting files:

- `data.js` — Seed data (`window.SEED_DATA`): 570+ devices across 58 suburbs, loaded once on first run
- `sw.js` — Service worker: offline-first caching for app shell and map tiles
- `manifest.json` — PWA manifest (standalone display, dark blue theme, SVG icon)

### Initialization Sequence

1. Firebase SDK loads asynchronously (ES module import)
2. Login screen shown until user authenticates against localStorage users
3. Device data loaded from localStorage (`fp_devices_v1`)
4. Firebase real-time listener attached for sync
5. Service worker registered for offline support

### Data Layer

**localStorage is the source of truth.** Firebase Firestore is an optional sync layer, not the primary store. All app data is stored locally under these keys:

| Key | Contents |
|-----|----------|
| `fp_devices_v1` | All backflow devices |
| `bf_clients_v1` | Client organisations |
| `scc_users_v1` | User accounts |
| `ct_settings_v1` | App settings |
| `ct_email_templates_v1` | Email report templates |

**Firebase strategy:** Single-document sync (`ct_sync/main` in project `complytrack-6ac7e`, region `australia-southeast1`). All app state serializes into one Firestore document, keeping usage within the free tier.

### Key Data Models

**Device:**
```javascript
{
  id, suburb, make, model, size, serial, location, lat, lng,
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

### CSS Design System

All colors, spacing, and typography are defined as CSS custom properties in the `:root` block near the top of `index.html`. The UI is mobile-first with breakpoints at `max-width: 700px`. Font: DM Sans + DM Mono (Google Fonts via CDN).

### External Libraries (CDN only)

- **Leaflet.js 1.9.4** — interactive maps with OpenStreetMap tiles
- **Firebase Firestore 10.12.0** — real-time sync
- **BarcodeDetector API** — native browser QR code scanning (no library)

### Offline Strategy (sw.js)

- **Map tiles** (`complytrack-tiles-v1`): cache-first, persistent
- **CDN resources**: cache-first with network fallback
- **App files** (`fieldpass-v20`): network-first with cache fallback

When updating cached resources, bump the cache version constant in `sw.js`.

### Permissions Model

Permissions are stored as a flat object of flags per user (not purely role-based checks). The `Admin` role gets all permissions; `Supervisor` and `Tester` get subsets. Admins can grant individual flags to any user via the user management panel.

### Email Templates

Use `{{placeholder}}` syntax for dynamic values in suburb compliance report emails. Templates are stored in localStorage and rendered with simple string replacement.
