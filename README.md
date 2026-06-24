# Acurion Dashboard — Prototype

Monochrome, real-time AML intelligence dashboard. Vite + vanilla JS + Tailwind v4 + anime.js + Cytoscape.js. Mock data shaped to mirror the planned Firebase Realtime Database schema, so swapping to live Firebase later is a one-file change (`src/lib/dataService.js`).

## Setup

```bash
tar -xzf acurion-dashboard.tar.gz
cd acurion-dashboard
npm install
npm run dev
```

Open the printed local URL (default http://localhost:5173).

## Build for production

```bash
npm run build
npm run preview
```

## Pages

- `index.html` — Overview: live stat cards, risk trend chart, severity breakdown, recent alerts
- `alerts.html` — Alerts table with filters + SHAP/GNN explanation detail panel
- `transactions.html` — Full transaction stream with search/sort/filter
- `graph.html` — Cytoscape.js multi-layer account graph (transactions, shared device, shared IP) with node inspection
- `reports.html` — Audit log, CSV export, mock report/SAR generation
- `login.html` — Standalone login (mocked auth, redirects to Overview)

## Switching to Firebase later

Everything reads through `src/lib/dataService.js`. To go live:

1. `npm install firebase` (already in package.json)
2. Uncomment the Firebase init block at the top of `dataService.js` and fill in your config
3. Set `USE_FIREBASE = true`
4. Uncomment the `fetchFromFirebase` calls in each getter — no page-level code needs to change, since `src/data/mockData.js` is shaped exactly like the planned `/alerts`, `/transactions`, `/graphData`, `/auditLogs` schema from the team guidance doc

## Notes

- All styling is in `src/styles/main.css` (Tailwind v4 `@theme` tokens — edit colors/fonts there)
- Shared sidebar/topbar: `src/components/layout.js`
- Mock data generator: `src/data/mockData.js` (regenerates random but consistent data on each load)
- `subscribeToUpdates('alerts', cb)` simulates a live alert arriving every 15s via toast — replace with Firebase `onValue` listener for real-time
