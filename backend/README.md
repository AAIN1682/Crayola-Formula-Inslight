# Formula assessment service

The FastAPI app in `app/` reads the packaged reference data in `data/` and exposes the assessment routes. Set `BACKEND_DATA_DIR` to that folder if the process working directory is not the backend root. The server does not fall back to another sample folder. The Vite dev server proxies `/api` to `http://127.0.0.1:8000`.

```
cd backend
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

From the repository root, start the frontend with `npm --prefix frontend run dev`.

Azure OpenAI is called only on the server. Configure one of these names in `backend/.env`. Do not put them in frontend code.

```
AZURE_OPENAI_API_KEY or AZURE_OPENAI_KEY
AZURE_OPENAI_ENDPOINT
AZURE_OPENAI_DEPLOYMENT or AZURE_OPENAI_DEPLOYMENT_NAME
AZURE_OPENAI_API_VERSION or OPENAI_API_VERSION
```

Assessment history stays in the browser (`formula-insight.dataset`). It is not written back into the packaged JSON files.

Editing a packaged JSON file takes effect after the Python process is restarted. Rows in `regulatory_reference_rows.json` stay disabled for decisions.
