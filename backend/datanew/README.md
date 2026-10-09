# Workspace data (`datanew`)

JSON files here hold the Formula Insight **UI workspace** (formulas, runs, people, submissions, etc.).

Reference screening data (US/EU thresholds, packaged rules) stays in `backend/data/` via `BACKEND_DATA_DIR`.

## Populate from the demo seed

From `frontend/`:

```bash
npm run export-workspace
```

This writes all `*.json` files here and a copy under `_seed/` for **Settings → Reset demo data** (`POST /api/workspace/reset`).

## Local env (in `backend/.env`)

```env
WORKSPACE_DATA_DIR=./datanew
DOCUMENT_STORAGE_DIR=./datanew/user_uploads
```

## Frontend

Copy `frontend/.env.example` to `frontend/.env` and set `VITE_USE_WORKSPACE_API=true`.

With the backend on port 8000 and Vite on 5173, the app loads via `GET /api/workspace` and saves with debounced `PUT /api/workspace`.
