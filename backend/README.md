# Assessment service

Reference data lives in `data/` and is read by `server/` when an assessment runs. The Vite dev server exposes `/api/assess`, `/api/examples`, and `/api/ingredients`. Deployed environments use the `api/` functions.

Azure OpenAI is called only on the server. Configure these variables locally in `backend/.env` and again in the host project settings for a deployment. A local file does not configure the deployed environment.

```
AZURE_OPENAI_API_KEY=
AZURE_OPENAI_ENDPOINT=
AZURE_OPENAI_DEPLOYMENT=
AZURE_OPENAI_API_VERSION=
```

Assessment history for this version stays in the browser. It is not written back into the JSON files and it is not shared server-side storage.

Editing a packaged JSON file takes effect after the app is restarted or redeployed.
