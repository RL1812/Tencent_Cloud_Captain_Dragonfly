# Backend API Template

Modern REST API template built with Express.js and TypeScript.

## Tech Stack

- **Runtime**: Node.js
- **Framework**: Express.js 4.21+
- **Language**: TypeScript 5.9+
- **Database**: TCB managed PostgreSQL (via CloudBase JS SDK)
- **Validation**: Zod
- **Testing**: Jest + Supertest

## Project Structure

```
backend/
├── src/
│   ├── __tests__/             # Test files
│   ├── config/                # Configuration
│   │   ├── database.ts        # Database client
│   │   ├── env.ts             # Environment validation
│   │   └── logger.ts          # Pino logger setup
│   ├── middleware/            # Express middleware
│   │   ├── errorHandler.ts   # Error handling
│   │   ├── logger.ts          # HTTP logging
│   │   └── validation.ts     # Zod validation
│   ├── modules/               # Feature modules (routes + handlers)
│   │   └── system.ts          # System & health checks
│   ├── types/                 # TypeScript types & Zod schemas
│   ├── app.ts                 # Express app setup
│   └── index.ts               # Server entry point
├── .env.example               # Environment template
├── package.json
└── tsconfig.json
```

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

1. Install dependencies:
```bash
cd backend
npm install
```

2. Set up environment variables:
```bash
cp .env.example .env
# Edit .env with your configuration
```

### Development

Start the development server with hot reload:
```bash
npm run dev
```

Server will start at `http://localhost:3000`

### Testing

Run tests:
```bash
npm test
```

Run tests in watch mode:
```bash
npm run test:watch
```

### Production Build

Build the project:
```bash
npm run build
```

Start production server:
```bash
npm start
```

## API Endpoints

### System Routes

- `GET /api/v1/` - API welcome message
- `GET /api/v1/health` - Basic health check
- `GET /api/v1/health/ready` - Readiness check (includes database connection)
- `GET /api/v1/health/live` - Liveness check
- `GET /api/v1/version` - API version information
- `GET /api/v1/ping` - Simple ping endpoint
- `GET /api/v1/status` - System status (uptime, memory, etc.)

### Your Domain Routes

Add your business logic as new modules in `src/modules/`. Each module combines routes and handlers in a single file for simplicity. See `src/modules/README.md` for detailed examples and best practices.

#### Quick Example

Create a new module `src/modules/user.ts`:

```typescript
import { Router } from 'express'
import { db } from '../config/database.js'

export const userRouter = Router()

userRouter.get('/', async (_req, res) => {
  const users = await db.collection('users').get()
  res.json(users.data)
})

userRouter.post('/', async (req, res) => {
  const result = await db.collection('users').add(req.body)
  res.status(201).json(result)
})
```

Register it in `src/app.ts`:

```typescript
import { userRouter } from './modules/user.js'
app.use(`${env.API_PREFIX}/users`, userRouter)
```

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

> The existing `/api/disputes/:id/review` still uses Tencent TokenHub (`src/lib/hunyuan-chat.ts`).
> Only the knowledge base uses the local models.

### Setup

```bash
# 1. Services (or install PostgreSQL + pgvector and Ollama natively)
docker compose up -d                                   # from dispute-review-agent/
docker compose exec ollama ollama pull bge-m3
docker compose exec ollama ollama pull qwen2.5:7b

# 2. Backend
cp .env.example .env
npm install
npm run dev     # creates the tables on first start
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

## API Examples

### Health Check
```bash
curl http://localhost:3000/api/v1/health
```

### Readiness Check
```bash
curl http://localhost:3000/api/v1/health/ready
```

### System Status
```bash
curl http://localhost:3000/api/v1/status
```

## Security Features

- **CORS**: Configured cross-origin resource sharing
- **Input Validation**: Zod schema validation
- **Error Handling**: Centralized error management

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Environment mode | `development` |
| `PORT` | Server port | `3000` |
| `API_PREFIX` | API route prefix | `/api/v1` |
| `CLOUDBASE_ENV_ID` | CloudBase environment ID | - |
| `CLOUDBASE_SECRET_ID` | CloudBase secret ID | - |
| `CLOUDBASE_SECRET_KEY` | CloudBase secret key | - |
| `CORS_ORIGIN` | Allowed CORS origin (URL or `*` for all) | `*` |
| `DATABASE_URL` | PostgreSQL with pgvector | `postgres://dispute:dispute@localhost:5432/dispute_review` |
| `OLLAMA_BASE_URL` | Ollama server | `http://localhost:11434` |
| `EMBED_MODEL` / `EMBED_DIM` | Embedding model and its vector size | `bge-m3` / `1024` |
| `LLM_MODEL` | Model that writes answers | `qwen2.5:7b` |
| `VISION_MODEL` | Optional model that describes photos | — |
| `UPLOAD_DIR` / `MAX_UPLOAD_MB` | Where originals are kept / size limit per file | `uploads` / `25` |
| `OCR_LANGS` | tesseract languages | `eng+chi_sim` |
| `COMPANY_API_BASE_URL` / `COMPANY_API_TOKEN` | Real company API; empty = mock | — |

**Note on CORS:** Default is `*` (allow all origins). This disables credentials (cookies, authorization headers). For production, specify exact origins.

## Performance Optimizations

- Response compression
- Pagination for large datasets

## Error Handling

The API uses consistent error responses:

```json
{
  "status": "error",
  "message": "Error description",
  "errors": [] // Optional validation errors
}
```

HTTP Status Codes:
- `200` - Success
- `201` - Created
- `204` - No Content
- `400` - Bad Request
- `404` - Not Found
- `409` - Conflict
- `500` - Internal Server Error

## License

MIT
