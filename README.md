# JITO Ladies Wing Bhavnagar · Ladies Cricket Tournament · Player Auction

Live auction web app. One Node server keeps everything in sync over WebSockets: the admin runs the auction, everyone else watches live.

## Run locally
    npm install
    ADMIN_PASSWORD=yourpassword npm start      # http://localhost:3000
Open `/#/admin` and sign in. Default password is `ladieswing2026` (change it before going live).

## Environment
- `ADMIN_PASSWORD`  admin login
- `PORT`            default 3000
- `DATABASE_URL`    Postgres connection string. When set, all state is saved to Postgres (survives restarts and redeploys)
- `DATA_DIR`        local files and uploaded photos (default ./data)
- `ALLOW_DEMO=1`    enables "Load demo data" for trying things out
- `STATE_EPOCH`     bump to ignore the state already stored in Postgres

## Auction day flow
1. Admin → **Settings**: squad size, purse, base price, bid slabs, event details, pinned players.
2. Admin → **Teams**: add teams, logos, owners, retained players.
3. Admin → **Players**: **Import from Google Sheet** (Share → Anyone with the link → Viewer).
4. Admin → **Auction**: Start → Next player → tap team tiles to bid → Sold / Unsold. Keys: 1-9 bid, S sold, U unsold, N next, Z undo.
5. Big screen: open `/` and press the fullscreen button.
6. After the auction: Admin → Data for squads, PDF/CSV, backups and snapshots.

`seed/import.json` holds the sheet link, retained players, owners, names to exclude and pinned auction positions.
