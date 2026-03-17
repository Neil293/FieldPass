# ComplyTrack — Backflow Device Compliance Register

A progressive web app (PWA) for managing and tracking backflow prevention device compliance testing across Shoalhaven City Council's water infrastructure.

**Live app:** [neil293.github.io/SCCBackflow](https://neil293.github.io/SCCBackflow)

---

## Overview

ComplyTrack provides field staff and administrators with a mobile-first interface to record, track and manage compliance testing of backflow prevention devices. The app works offline and syncs to Firebase when a connection is available.

---

## Features

### Device Management
- Register of 570+ backflow devices across 58 suburbs
- Full device details: make, model, size, serial number, Backflow ID, location, GPS coordinates
- Add, edit and delete devices (admin only)
- QR code generation for each device location
- Map view with all devices plotted (OpenStreetMap via Leaflet)

### Test Recording
- One-tap **Pass**, **Fail**, **Repaired** and **Decommissioned** status buttons
- Fail and Repaired actions prompt for notes before saving
- Full test history log per device
- Test date, result and tester name recorded on each entry

### Compliance Status
Each device is automatically assigned a status based on its scheduled month and test result:

| Status | Description |
|---|---|
| 🔴 Overdue | Scheduled month has passed with no recorded test |
| 🟠 Due this month | Testing due in the current month |
| 🔵 Due next month | Testing due next month |
| 🔷 Upcoming | Testing scheduled in a future month |
| 🟢 Complete | Tested and passed this year |
| 🔴 Failed | Tested and failed |
| 🔵 Repaired | Device has been repaired |
| ⬜ Decommissioned | Device no longer in use |
| ⚪ Pending | No test date recorded |

### Navigation & Filtering
- Hamburger menu with search, suburb filter, status filter, and month filter
- Month quick-select pills (previous, current, next month)
- Multi-select status filter pills with colour coding
- **Sort by nearest** — uses device GPS and your current location (Haversine distance)
- Save phone GPS location for use on desktop devices

### Maps
- Full-screen map view with all devices as markers
- Filter map by status
- Pick-on-map GPS coordinate picker when adding/editing devices
- Direct link to Google Maps for each device

### Offline / PWA
- Installable as a home screen app on iOS and Android
- Service worker caches app shell and map tiles
- All data stored in browser localStorage as primary store
- Firebase Firestore for real-time sync across devices
- Offline banner shown when connection is lost

### Multi-Client Support
- Multiple client registers supported (e.g. different councils)
- Each client has its own device list and contact information
- Switch between clients from the nav bar

---

## File Structure

```
/
├── index.html      # Main app (single-file PWA)
├── data.js         # Seed device data (window.SEED_DATA)
├── sw.js           # Service worker for offline caching
├── manifest.json   # PWA manifest (icons, theme, display)
└── README.md       # This file
```

---

## Data Storage

| Key | Contents |
|---|---|
| `scc_backflow_v7` | SCC device data |
| `bf_devices_{clientId}_v1` | Device data for other clients |
| `bf_clients_v1` | Client list |
| `bf_active_client_v1` | Currently active client ID |
| `scc_users_v1` | User accounts |
| `scc_session_v1` | Current session |
| `scc_email_log_v1` | Email send history |
| `ct_settings_v1` | App settings |
| `ct_saved_location_v1` | Saved GPS location |

Data is also synced to **Firebase Firestore** (project: `complytrack-6ac7e`, region: `australia-southeast1`) when online.

---

## User Roles

| Permission | Admin | Standard User |
|---|---|---|
| View devices | ✅ | ✅ |
| Record test results | ✅ | ✅ |
| Edit device details | ✅ | ✅ |
| Add devices | ✅ | ✅ |
| Delete devices | ✅ (password) | ❌ |
| Manage users | ✅ | ❌ |
| Manage clients | ✅ | ❌ |
| Export CSV | ✅ | ✅ |
| Backup / Restore | ✅ | ✅ |
| Restore default devices | ✅ (password) | ❌ |

Default admin credentials: `admin` / `admin123`

---

## Settings

Found in **☰ Menu → Settings → ⚙️ Data**:

- **Prompt for missing data** — show popup when opening a device with incomplete fields
- **Show decommissioned devices** — include/exclude decommissioned devices from the list

---

## Technology

- Vanilla HTML/CSS/JavaScript — no build tools or frameworks required
- [Leaflet.js](https://leafletjs.com/) — interactive maps
- [OpenStreetMap](https://www.openstreetmap.org/) — map tiles
- [Firebase Firestore](https://firebase.google.com/) — real-time sync and offline persistence
- Progressive Web App (PWA) with service worker

---

## Deployment

The app is deployed as a static site via **GitHub Pages**. Any push to the `main` branch automatically updates the live app.

To update:
1. Edit `index.html` or `data.js` locally
2. Commit and push to `main`
3. GitHub Pages serves the updated files within ~30 seconds

---

## License

Internal use — ComplyTrack.
