# RydeResolve frontend

The reviewer web app for RydeResolve: React 19, Vite 7, TanStack Query, shadcn/ui and
Tailwind CSS 4. Setup for the whole project, including the backend it needs, is in the
[project README](../README.md).

## Run

Needs Node.js 22.12+ or 20.19+, and the backend running on port 3000.

```bash
npm install
npm run dev
```

The app runs at http://localhost:5173. Vite proxies `/api` to `http://localhost:3000`; set
`API_TARGET` to use a backend elsewhere.

| Script | What it does |
|---|---|
| `npm run dev` | Development server with hot reload |
| `npm run build` | Type-check, then build to `dist/` |
| `npm run lint` | ESLint |
| `npm run preview` | Serve the production build locally |

## Pages

| Route | Page | What it shows |
|---|---|---|
| `/` | `pages/Dashboard.tsx` | Review-queue summary and a sortable list of cases |
| `/submit` | `pages/SubmitCase.tsx` | Case form with per-party evidence and file uploads, or import of a sample dataset |
| `/cases/:id` | `pages/CaseDetail.tsx` | Tabs for the case and its evidence, the agent process, and the ruling with the human decision panel |
| `/precedents` | `pages/Precedents.tsx` | Human decisions the AI Judge learns from; reviewers can delete any of them |

## Layout

- `src/components/AgentReview.tsx`: advocate submissions, fraud risk signals, the Judge's
  checklist and resolution, party notices and the human decision form
- `src/components/DatasetImport.tsx`: loads `public/samples/disp-002.json` or
  `disp-003.json`, or a dataset `.json` / `.md` file you choose
- `src/lib/dispute-api.ts`, `src/lib/knowledge-api.ts`: API clients
- `src/types/dispute.ts`: types shared with the backend's API responses
