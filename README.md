# Wheel of Fate

A no-build progressive web app, hosted on GitHub Pages and installable on iPhone.

Live: https://chiyun-lee.github.io/wheel-of-fate/

## Layout

| File | Purpose |
| --- | --- |
| `index.html` | App shell + iOS home-screen meta tags |
| `app.js` | UI logic |
| `db.js` | IndexedDB wrapper — the app's persistent store, plus JSON export/import |
| `sw.js` | Service worker: offline caching |
| `manifest.webmanifest` | Install metadata (name, icons, standalone display) |
| `.github/workflows/pages.yml` | Deploys to GitHub Pages on every push to `main` |

All paths are relative, so the app works under the `/wheel-of-fate/` subpath.

## Run locally

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

Service workers need `localhost` or HTTPS. To test on a phone, use the deployed Pages URL.

## Deploy

1. Push to `main`.
2. One-time: GitHub repo → **Settings → Pages → Source: GitHub Actions**.

When you change any cached file, bump `CACHE` in `sw.js` so installed apps refresh.

## Install on iPhone

Open the Pages URL in Safari → **Share → Add to Home Screen**. It launches full-screen, works offline, and has its own storage.

## About the data store

- Data lives in **IndexedDB** on the device. Nothing is sent to a server.
- The installed home-screen app has a storage partition **separate from Safari** — data added in a Safari tab won't appear in the installed app, and vice versa.
- Home-screen apps are exempt from Safari's 7-day eviction of script-written storage, and `navigator.storage.persist()` is requested on launch.
- **Removing the app from the home screen deletes its data.** Use *Export backup* (share sheet → Save to Files) to keep a copy, and *Import backup* to restore.
- To add stores, edit `onupgradeneeded` and `STORES` in `db.js` and bump `DB_VERSION`.
