# Formula Insight API (FastAPI + Azure OpenAI)

Backend for formula create/update, LLM screening runs, and shared dataset sync with the React app.

## Setup

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

Copy Azure settings into `backend/.env` (see `.env.example` — never commit real keys).

## Run

```bash
uvicorn app.main:app --reload --port 8000
```

Health: `GET http://127.0.0.1:8000/api/health`

## Frontend

In `frontend/.env.local`:

```env
VITE_API_BASE_URL=http://127.0.0.1:8000
```

Restart `npm run dev`. The UI is unchanged; create formula and run screening call this API, then sync the dataset for Overview and the library.

State is persisted in `backend/data/state.json` (gitignored). `POST /api/dataset/reset` restores the seed.
