# Reference data

Read-only catalog for Affine Formula Intelligence assessments. These files are not served from the frontend `public` directory and are not imported by browser components.

| File | Contents |
| --- | --- |
| `ingredients.json` | Reference catalog names. Not a verified Crayola ingredient list. |
| `rules.json` | Illustrative concentration ranges by product category. Not regulatory limits. |
| `evidence_requirements.json` | Document requirements, separate from concentration rules. |
| `documents.json` | Inline illustrative evidence excerpts. Unverified records do not satisfy a verified-evidence requirement. |
| `historical_cases.json` | Fictional internal cases. `synthetic: true`. |
| `example_formulas.json` | Three loadable compositions. Not Crayola recipes. |

## Editing a threshold

Change `minimum_pct` or `maximum_pct` for the relevant `rule_id` in `rules.json`. Keep `minimum_pct` less than or equal to `maximum_pct`, and keep both between 0 and 100. Restart or redeploy so the server reads the file again.

Packaged JSON is not edited at runtime. A change is included only when the application is redeployed, unless durable editable storage is added later.

Assessment history is kept in this browser for the current version. It is not shared server-side storage.

## Local start

From the repository root:

```
npm install
npm run dev
```

The frontend dev server serves the assessment routes. Do not start a separate API process.

## Deployment

Set `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_DEPLOYMENT`, and `AZURE_OPENAI_API_VERSION` in the host project’s environment settings. A local `.env` file does not configure that environment.

Editing these JSON files requires a restart locally and a redeployment for a hosted build, unless durable editable storage is added later.

Server environment variables, also required in the host project settings for a deployed environment:

```
AZURE_OPENAI_API_KEY=
AZURE_OPENAI_ENDPOINT=
AZURE_OPENAI_DEPLOYMENT=
AZURE_OPENAI_API_VERSION=
```

A local `.env` does not configure the deployed environment. Do not put these values in frontend `VITE_` variables.
