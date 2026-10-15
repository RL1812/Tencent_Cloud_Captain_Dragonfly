# RydeResolve backend

Express + TypeScript API for RydeResolve: dispute cases, the multi-agent AI review
(LangGraph), human decisions and precedents, evidence uploads, and the optional knowledge base.
Setup for the whole project is in the [project README](../README.md).

## Tech stack

- **Runtime:** Node.js 20.19+ or 22.12+
- **Framework:** Express 4, TypeScript, Zod validation
- **Agents:** LangGraph (`@langchain/langgraph`); model calls go to Google Gemini or Tencent
  TokenHub through `src/lib/llm-chat.ts`
- **Knowledge base (optional):** PostgreSQL + pgvector, Ollama
- **Tests:** Jest + Supertest

## Project structure

```
src/
├── __tests__/                 Jest tests and fixtures
├── config/                    env.ts (validated settings), database.ts, logger.ts
├── lib/llm-chat.ts            Gemini / TokenHub client with model fallback
├── middleware/                error handler, HTTP logging, validation
├── modules/
│   ├── system.ts              health and status routes
│   ├── dispute/               cases, review, human decisions, precedents, uploads
│   │   └── agents/            the review agents and the LangGraph orchestrator
│   └── knowledge/             parsing, OCR, embeddings, search and Q&A
├── app.ts                     Express app
└── index.ts                   server entry point
data/precedents.json           saved precedents (created on first use)
uploads/                       uploaded files (created on first use)
```

How the agents work, with their inputs and outputs: [`src/modules/dispute/agents/README.md`](src/modules/dispute/agents/README.md).

## Getting started

Create `.env` from the template (skip this if you already have one, because it replaces it),
then set `GEMINI_API_KEY` or `TOKENHUB_API_KEY` in it:

```bash
cp .env.example .env
```

Install and start the development server with hot reload:

```bash
npm install
npm run dev
```

The API runs at http://localhost:3000/api.

| Script | What it does |
|---|---|
| `npm run dev` | Development server with hot reload |
| `npm test` | Jest tests |
| `npm run lint` | ESLint |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run the compiled server |

## API endpoints

All routes are under `/api`.

### System

- `GET /api/health`: basic health check
- `GET /api/health/ready`: readiness, including the database and the LLM provider the agents will use
- `GET /api/health/live`, `GET /api/ping`, `GET /api/version`, `GET /api/status`

### Disputes (`/api/disputes`)

| Method | Path | Purpose |
|---|---|---|
| GET | `/` | List cases |
| GET | `/stats` | Case counts by status |
| GET | `/:id` | One case |
| POST | `/` | Create a case |
| POST | `/:id/evidence` | Add evidence to a case |
| POST | `/:id/review` | Run the AI review on a stored case |
| POST | `/:id/override` | Record, or revise, a human decision |
| DELETE | `/:id/override` | Withdraw the human decision |
| POST | `/import-dataset` | Create a case from a sample dataset |
| POST | `/dataset-review` | Review a dataset without storing a case |
| GET | `/precedents` | List precedents |
| DELETE | `/precedents/:caseNumber` | Delete a precedent |

Cases are kept in memory and reset when the server restarts. Precedents are saved to
`data/precedents.json`.

### Uploads (`/api/uploads`)

- `POST /api/uploads`: upload an evidence file (multipart field `file`)
- `GET /api/uploads/evidence/...`: serve a stored file

## Knowledge Base (uploads, vector search, Q&A)

`src/modules/knowledge/` stores uploaded evidence and company records, and answers
questions about them with retrieval-augmented generation (RAG). Everything is open
source, free, and runs locally — no API keys.

| Role | Tool | License |
|------|------|---------|
| Database + vector search | PostgreSQL + pgvector (HNSW, cosine) | PostgreSQL License |
| Model server | Ollama | MIT |
| Embeddings | `bge-m3` (1024-dim, multilingual) | MIT |
| Answers | `qwen2.5:7b` (or `qwen2.5:1.5b` on low-RAM machines) | Apache-2.0 |
| Photo descriptions (optional) | any Ollama vision model, e.g. `moondream` | Apache-2.0 |
| PDF text | unpdf | MIT |
| Screenshot/photo OCR | tesseract.js (`eng+chi_sim`) | Apache-2.0 |

> The AI case review (`/api/disputes/:id/review`) does not use these local models. Its three agents
> call Google Gemini (free tier, `GEMINI_API_KEY`) through `src/lib/llm-chat.ts`, with Tencent
> TokenHub as the alternative. Only the knowledge base uses the local models.

### Setup

1. Services: PostgreSQL in Docker, Ollama native (see [../README.md](../README.md)). From `dispute-review-agent/`:

```bash
docker compose up -d
ollama pull bge-m3
ollama pull qwen2.5:7b
```

2. Backend, from `dispute-review-agent/backend/` (skip the `cp` if you already have a `.env`). It creates the tables on first start:

```bash
cp .env.example .env
npm install
npm run dev
```

If the database is unreachable the server still starts; only `/api/knowledge/*` returns 503.
`GET /api/knowledge/health` shows what is connected.

### How it works

```
upload / paste / company API
  → original saved in UPLOAD_DIR, row in `documents` (status: processing)
  → background queue: extract text (PDF pages | OCR | text | rendered record)
  → chunk (~1000 chars, 150 overlap, page numbers kept)
  → embed with bge-m3 → `document_chunks` (vector(1024), HNSW index)
  → status: ready  (or failed + error; POST .../reprocess to retry)

question → embed → pgvector top-K (scoped to a case + global docs like policies)
         → numbered passages → qwen2.5 → answer citing [1], [2] + source list
```

- Documents with a `caseId` belong to one dispute; documents without one (policies, handbooks) are
  searched for every case unless `includeGlobal: false`.
- Re-uploading identical content to the same case returns the existing document (`duplicate: true`).
- Company records come from a **mock** of the internal API (`company-api.mock-data.ts`, based on the
  DISP-002 sample dataset, plus DISP-003). Set `COMPANY_API_BASE_URL` to use the real API; adjust
  the paths in `HttpCompanyRecordsClient` once its spec is known.
- Scanned PDFs without a text layer are not OCR'd; upload page screenshots instead.

### Endpoints (`/api/knowledge`)

| Method | Path | Body / query | Notes |
|--------|------|--------------|-------|
| GET | `/health` | | DB, Ollama and model availability |
| POST | `/documents` | multipart `files` (≤10), `caseId?`, `title?` | pdf, txt, md, csv, json, png, jpg, webp, bmp, gif |
| POST | `/documents/text` | `{ text, title, caseId? }` | pasted notes or statements |
| GET | `/documents` | `?caseId=&sourceType=&status=` | |
| GET | `/documents/:id` | | includes `extractedText` |
| GET | `/documents/:id/file` | | original file |
| POST | `/documents/:id/reprocess` | | re-extract and re-embed |
| DELETE | `/documents/:id` | | removes chunks and file |
| GET | `/company-records` | `?caseId=` | records already imported |
| GET | `/company-records/:type/:id` | | preview from company API (dispute, trip, rider, driver) |
| POST | `/company-records/import` | `{ disputeId, caseId? }` or `{ type, id, caseId? }` | dispute import also pulls its trip, rider and driver; `caseId` defaults to the dispute ID |
| POST | `/search` | `{ query, caseId?, includeGlobal?, sourceTypes?, topK?, minScore? }` | vector search only |
| POST | `/ask` | `{ question, ...same options }` | RAG answer + `sources` |

Ingestion endpoints return `202` with `status: "processing"`; add `?wait=true` to get `201` after
processing finishes. If the LLM fails, `/ask` still returns the retrieved `sources` with
`answer: null` and `llmError`.

```bash
curl -X POST 'localhost:3000/api/knowledge/company-records/import?wait=true' \
  -H 'Content-Type: application/json' -d '{"disputeId":"DISP-002"}'
curl -X POST 'localhost:3000/api/knowledge/documents?wait=true' \
  -F 'files=@screenshot.png' -F 'caseId=DISP-002'
curl -X POST localhost:3000/api/knowledge/ask -H 'Content-Type: application/json' \
  -d '{"question":"Did the driver try to contact the rider?","caseId":"DISP-002"}'
```

The frontend client is in `frontend/src/lib/knowledge-api.ts`.

**Changing the embedding model:** `EMBED_DIM` is fixed into the `document_chunks` table on first
start. To switch to a model with a different size, drop `document_chunks`, restart, and reprocess
documents.

## Environment variables

`.env.example` lists every setting with comments. The main ones:

| Variable | Description | Default |
|---|---|---|
| `PORT` / `API_PREFIX` | Server port / route prefix | `3000` / `/api` |
| `CORS_ORIGIN` | Allowed origin (`*` for all) | `*` |
| `LLM_PROVIDER` | `auto` (Gemini when a key is set, else TokenHub), `gemini` or `tokenhub` | `auto` |
| `GEMINI_API_KEY` | Google Gemini key (free tier: https://aistudio.google.com/apikey) | — |
| `GEMINI_MODEL` / `GEMINI_FALLBACK_MODELS` | First model / models tried after it, in order | `gemini-3.8-flash` / `gemini-3.1-flash-lite,gemini-3.5-flash` |
| `GEMINI_REASONING_EFFORT` | `low`, `medium` or `high` | `low` |
| `TOKENHUB_API_KEY` / `TOKENHUB_MODEL` | Tencent TokenHub key / model | — / `hy3` |
| `LLM_TIMEOUT_MS` / `LLM_IDLE_TIMEOUT_MS` | Per-call total / no-output time limit | `240000` / `90000` |
| `PRECEDENTS_FILE` / `PRECEDENT_EXAMPLES` | Where precedents are saved / how many the Judge is shown | `data/precedents.json` / `3` |
| `DATABASE_URL` | PostgreSQL with pgvector | `postgres://dispute:dispute@localhost:5432/dispute_review` |
| `OLLAMA_BASE_URL` | Ollama server | `http://localhost:11434` |
| `EMBED_MODEL` / `EMBED_DIM` | Embedding model and its vector size | `bge-m3` / `1024` |
| `LLM_MODEL` | Model that writes knowledge-base answers | `qwen2.5:7b` |
| `VISION_MODEL` | Optional model that describes photos | — |
| `UPLOAD_DIR` / `MAX_UPLOAD_MB` | Where originals are kept / size limit per file | `uploads` / `25` |
| `OCR_LANGS` | tesseract languages | `eng+chi_sim` |
| `COMPANY_API_BASE_URL` / `COMPANY_API_TOKEN` | Real company API; empty = mock | — |

**Note on CORS:** `*` disables credentials (cookies, authorization headers). For production, set
the exact origin.

## Errors

Errors use one format:

```json
{ "status": "error", "message": "Error description", "errors": [] }
```

`errors` lists the failing fields for validation errors (400). Other codes: 404 not found,
409 conflict, 413 file too large, 500 internal error, 503 knowledge base unavailable.

## License

MIT
