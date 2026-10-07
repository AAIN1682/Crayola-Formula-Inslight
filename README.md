# Crayola Product Screening

Monorepo for Formula Insight (React) and the FastAPI screening API (Azure OpenAI).

| Folder | Description |
| --- | --- |
| [`frontend/`](frontend/) | Formula Insight React app (Vite, TypeScript, Tailwind). See [frontend/README.md](frontend/README.md). |
| [`backend/`](backend/) | FastAPI + Azure OpenAI screening. See [backend/README.md](backend/README.md). |

## Quick start (frontend only — mock, no LLM)

Runs entirely in the browser with synthetic data. Do **not** set `VITE_API_BASE_URL`.

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173

## Quick start (frontend + backend + Azure OpenAI)

Use this for **New Formula**, **Run Screening** (LLM), and **Overview** backed by the API.

### 1. Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate          # Windows
# source .venv/bin/activate     # macOS/Linux
pip install -r requirements.txt
```

Create `backend/.env` (copy from [backend/.env.example](backend/.env.example)). Required:

- `AZURE_OPENAI_API_KEY`
- `AZURE_OPENAI_ENDPOINT`
- `AZURE_OPENAI_DEPLOYMENT`
- `AZURE_OPENAI_API_VERSION`

Start the API:

```bash
uvicorn app.main:app --reload --port 8000
```

Check: http://127.0.0.1:8000/api/health — expect `{"status":"ok","azureConfigured":"true"}`.

Dataset state is stored in `backend/data/state.json` (gitignored). Reset via **Settings → Reset demo data** in the UI, or `POST /api/dataset/reset`.

### 2. Frontend

Create `frontend/.env.local` (see [frontend/.env.example](frontend/.env.example)):

```env
VITE_API_BASE_URL=http://127.0.0.1:8000
```

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173.

The UI is unchanged. Create/update formula, screening runs, and demo reset call the backend; the app syncs the full dataset for library and Overview views. Other actions still update the in-browser store only until more API routes are added — details in [backend/README.md](backend/README.md).

### Frontend scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run build` | Type-check and production build |
| `npm run test` | Vitest suite |

## Security

Do not commit `backend/.env` or API keys. Keep Azure credentials on the backend only — the frontend needs `VITE_API_BASE_URL`, not OpenAI keys.
