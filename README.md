# FieldPass — Backflow Device Compliance Register

A progressive web app (PWA) for managing and tracking backflow prevention device compliance testing. Built for field staff and administrators to record, track and report on testing across a large device register.

**Live app:** [neil293.github.io/SCCBackflow](https://neil293.github.io/SCCBackflow)

---

## Overview

FieldPass is a mobile-first compliance management tool that works offline and syncs to Firebase when a connection is available. The entire app runs as a single HTML file with no build tools or frameworks required.

---

## Features

### Device Management
- Register of 570+ backflow devices across 58 suburbs
- Full device details: make, model, size, serial number, Backflow ID, location, GPS coordinates
- Add, edit and delete devices (admin only, password protected)
- Delete individual test history records (admin only)
- QR code generation for each device location (Google Maps link)
- Scan a Backflow ID QR code from the main screen to jump straight to that device

### Test Recording
- One-tap **Pass**, **Fail**, **Repaired** and **Decommissioned** action buttons
- Fail and Repaired actions prompt for fault/repair notes before saving
- Option to automatically follow the Backflow ID URL after recording a result
- Full test history log per device with tester name and timestamp
- Undo last result (tap the result banner to revert)

### Compliance Status
Each device is automatically assigned a status based on its scheduled month and test result:

| Status | Description |
|---|---|
| 🔴 Overdue | Scheduled month has passed with no recorded test |
| 🟠 Due this month | Testing due in the current month |
| 🔵 Due next month | Testing due next month |
| 🔷 Upcoming | Testing scheduled in a future month |
| 🟢 Complete | Tested and passed this year |
| 🔴 Failed | Tested and failed this year |
| 🔵 Repaired | Device has been repaired |
| ⬜ Decommissioned | Device no longer in use |
| ⚪ Pending | No test date recorded |

### Navigation & Filtering
- Hamburger menu with grouped sections: search, filters, location tools, actions
- Suburb and scheduled month dropdowns
- Multi-select status filter pills with colour coding
- Month quick-select pills bar (previous, current, next month)
- **Sort by nearest** — uses device GPS and your current location (Haversine distance)
- Save your phone's GPS location for use on desktop devices

### QR Code Scanning
- Scan a Backflow ID QR from the main screen to instantly open the matching device
- Duplicate Backflow ID detection — shows a warning listing all affected devices
- If not found, option to copy the scanned value to clipboard
- Scan QR or enter manually when editing a device's Backflow ID field
- **Go** button beside the Backflow ID field to open the URL directly

### Maps
- Full-screen map view with all devices plotted as colour-coded markers
- Filter map by status
- Pick-on-map GPS coordinate picker when adding or editing devices
- Direct link to Google Maps for each device

### Reports
Access via **☰ Menu → Reports** or the **Reports** button in the desktop nav bar.

| Tab | Contents |
|---|---|
| 📍 By Suburb | Total, complete and overdue counts per suburb with completion % |
| 📅 By Month | All 12 months with device counts, completion % and progress bars |
| 📊 By Status | Count and % breakdown for every status |
| ✗ Failed | All failed devices grouped by suburb — tap to open device |
| ⚠ Overdue | All overdue devices grouped by suburb — tap to open device |
| ✉️ Email Templates | Create and edit email templates for suburb reports |

### Email Reports
- Send a compliance report for any suburb via your mail app
- Reports use the active email template with `{{placeholder}}` substitution
- Available placeholders: `{{suburb}}` `{{client}}` `{{year}}` `{{date_completed}}` `{{total}}` `{{tested}}` `{{passed}}` `{{failed}}` `{{device_details}}` `{{tester_name}}` `{{tester_company}}` `{{tester_phone}}` `{{tester_email}}`
- Sign-off uses the logged-in user's company contact details
- Email history tracked per suburb

### Offline / PWA
- Installable as a home screen app on iOS and Android
- Service worker caches app shell and map tiles
- All data stored in browser localStorage as primary store
- Firebase Firestore for real-time sync across devices (single-document strategy)
- Sync error indicator in nav bar — tap for error details

### Multi-Client Support
- Multiple client organisations supported
- Each client has its own device list and contact information
- Switch between clients from the hamburger menu (when 2+ clients exist)
- Client contact info used in email report headers

---

## File Structure

```
/
├── index.html      # Entire app (single-file PWA, ~270KB)
├── data.js         # Seed device data (window.SEED_DATA)
├── sw.js           # Service worker for offline caching
├── manifest.json   # PWA manifest (icons, theme, display)
└── README.md       # This file
```

---

## User Roles & Permissions

| Permission | Admin | Supervisor | Tester |
|---|---|---|---|
| View devices | ✅ | ✅ | ✅ |
| Record test results | ✅ | ✅ | ✅ |
| Edit device details | ✅ | ✅ | ❌ |
| Add devices | ✅ | ❌ | ❌ |
| Delete devices | ✅ (password) | ❌ | ❌ |
| Delete test history | ✅ (password) | ❌ | ❌ |
| View test history | ✅ | ✅ | ❌ |
| Export CSV | ✅ | ✅ | ❌ |
| Manage users & clients | ✅ | ❌ | ❌ |
| Backup / Restore | ✅ | ✅ | ❌ |
| Sync settings | ✅ | ❌ | ❌ |

Default admin credentials: `admin` / `admin123` — **change this after first login.**

Each user can store their own company contact details (name, phone, mobile, email, address) used in email sign-offs.

---

## Settings

Found in **☰ Menu → Settings → ⚙️ Data**:

| Setting | Description |
|---|---|
| Prompt for missing data | Show a wizard popup when opening a device with incomplete fields |
| Show decommissioned devices | Include/exclude decommissioned devices in the main list |
| Follow Backflow ID link after recording | Automatically open the Backflow ID URL when recording Pass/Fail/Repaired/Decommissioned |
| Auto-sync frequency *(admin only)* | Manual, Every 10 min, Every hour, or On every save |
| Force sync | Immediately push all data to Firebase cloud |

---

## Firebase Sync

FieldPass uses a **single-document sync strategy** — all data is stored as one Firestore document (`ct_sync/main`) rather than individual records. This minimises Firebase write operations and stays well within the free tier limits.

**Synced data:** devices, users, clients, settings, email templates

**Sync modes** (admin only, per-user setting):
- **Manual only** — no automatic sync, use Force Sync button
- **Every 10 min** — timer-based background sync
- **Every hour** — timer-based background sync
- **On every save** — syncs automatically whenever data is saved (default)

The sync mode badge appears in the nav bar for non-default modes (MANUAL, 10 MIN, 1 HR).

**Firebase project:** `complytrack-6ac7e` (australia-southeast1)

---

## Data Storage Keys

| Key | Contents |
|---|---|
| `scc_backflow_v7` | SCC device data (localStorage cache) |
| `bf_clients_v1` | Client list |
| `bf_active_client_v1` | Currently active client ID |
| `scc_users_v1` | User accounts |
| `scc_session_v1` | Current session |
| `scc_email_log_v1` | Email send history |
| `ct_settings_v1` | App settings |
| `ct_saved_location_v1` | Saved GPS location |
| `ct_email_templates_v1` | Email templates |
| `ct_sync_interval_v1_{username}` | Per-user sync interval preference |
| `ct_sync_ts` | Last sync timestamp |

---

## Technology

- Vanilla HTML / CSS / JavaScript — no build tools or frameworks
- [Leaflet.js](https://leafletjs.com/) — interactive maps
- [OpenStreetMap](https://www.openstreetmap.org/) — map tiles
- [Firebase Firestore](https://firebase.google.com/) — real-time sync
- [BarcodeDetector API](https://developer.mozilla.org/en-US/docs/Web/API/BarcodeDetector) — QR code scanning
- Progressive Web App (PWA) with service worker

---

## Deployment

The app is deployed as a static site via **GitHub Pages**. Any push to the `main` branch automatically updates the live app within ~30 seconds.

To update:
1. Edit `index.html` or `data.js`
2. Commit and push to `main`
3. The live app updates automatically

---

## License

Internal use — FieldPass.
