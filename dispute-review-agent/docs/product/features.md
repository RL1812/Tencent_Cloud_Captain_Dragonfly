# RydeResolve — Product Features

## Core Positioning

An AI-assisted dispute review system for Ryde, the Singapore ride-hailing platform. A team of
agents builds the rider's and the driver's case from the trip record, a Judge rules against Ryde
Dispute Resolution Policy v2.1 with cited evidence, and the case is either resolved automatically
or sent to a human reviewer, who always has the final say.

## Feature List

### 1. Dispute Dashboard
- **Review queue**: a banner with the number of cases waiting for review and a button to open the most urgent one
- **Summary tiles**: total cases, cases under review, and resolved cases
- **Case list**: case number, title, creation time, type, priority and status; every column can be sorted
- **Quick actions**: open any case, or submit a new one

### 2. Case Submission
- **Case information**: title, dispute type (route deviation / fare and surge pricing / no-show charge / property damage / safety incident) and priority (low / medium / high / urgent)
- **Driver and passenger information**: name, ID, rating and statement for each party
- **Trip details**: pickup and drop-off locations and times, fare, distance, vehicle model and licence plate
- **Evidence by party**: evidence items attributed to the driver, the passenger or the platform, with optional photo or PDF uploads
- **Dataset import**: load the DISP-002 (no-show) or DISP-003 (route deviation) sample, or a dataset `.json` / `.md` file, as a ready-made case
- **Form validation**: required-field checks in the browser plus Zod schema validation on the server

### 3. AI Agent Review
- **Prioritization**: a queue level and target response time (15 minutes to 24 hours), with safety, accident and fraud-flag cases moved up; no model call
- **Evidence validation**: checks the record before the review and computes route measurements (extra distance, off-route GPS points, unexpected stops, fare arithmetic); no model call
- **Rider Advocate and Driver Advocate**: each builds the strongest honest case for one party from the same record, citing exact record paths
- **Fraud and bad-faith detection**: risk signals from account flags, dispute history and account age, given to the Judge as context, never as evidence; no model call
- **Judge**: answers a mandatory checklist for the dispute type, then issues a ruling (driver / passenger / shared / inconclusive), a confidence score, a structured resolution (action, amount, recipient and calculation, capped at the disputed charge) and plain-language notices for both parties
- **Escalation under Policy v2.1**: safety incidents, disputes over SGD 50 and route deviations over 2 km always go to a human; otherwise the Judge needs 80% confidence (no minimum under SGD 10), or 95% when a party has a fraud flag; inconclusive rulings also go to a human
- **Safe failure**: if the model is unavailable or its output is invalid, the review is marked inconclusive, no winner is picked, and the case stays pending for a retry

### 4. Case Detail
- **Case header**: number, status, priority and type badges, and creation time
- **Case and evidence tab**: both parties side by side, trip information, and evidence grouped by party
- **Agent process tab**: each step of the review, both advocates' submissions and the fraud risk signals
- **Ruling tab**: the Judge's checklist with conflicts flagged, cited sources, the resolution, party notices and the confidence reasoning, plus the human decision panel

### 5. Human Review and Precedents
- **Human decision**: a reviewer can decide any case at any time, whether or not the AI has reviewed or escalated it; the decision needs a reason, can be revised or withdrawn, and is not overturned by a re-review
- **Notices held for a human**: on escalated cases the party notices are marked as drafts until a reviewer decides
- **Precedent learning**: decisions kept as precedents are shown to the Judge (up to 3 recent ones of the same dispute type) to calibrate how it applies policy; they are never evidence, and a case never sees its own earlier decision
- **Precedents page**: lists every precedent and lets reviewers delete any of them

### 6. Evidence Knowledge Base and Q&A (optional)
- **Evidence upload**: PDF, text (txt/md/csv/json), screenshots and photos, linked to a case or stored as shared material such as policies and handbooks
- **Automatic parsing**: PDF text extracted per page; screenshots and photos read with OCR for English and Chinese text (an optional vision model can describe images)
- **Internal company records**: dispute tickets, trips (GPS traces, chat logs, app events) and rider/driver profiles from the company API (a mock for now)
- **Vector retrieval**: text is chunked and embedded into pgvector for semantic search, filterable by case and material type
- **Q&A**: ask a question, retrieve the relevant evidence, and get an answer from a local model with sources cited as [1][2]
- **Deduplication and retry**: duplicate files for the same case are stored once; failed files can be reprocessed
- **Human decisions**: each decision is also indexed here so it can be searched

The knowledge base is available through the API only. The review agents do not read it.

## Technical Architecture
- **Front end**: React 19 + Vite + TanStack Query + shadcn/ui + Tailwind CSS 4
- **Back end**: Express + TypeScript + Zod validation; the review runs as a LangGraph workflow
- **Models**: Google Gemini free tier (gemini-3.8-flash, falling back to gemini-3.1-flash-lite and gemini-3.5-flash) or Tencent TokenHub; a review makes three model calls (both advocates and the Judge)
- **Knowledge base** (open source, free, runs locally): PostgreSQL + pgvector, Ollama, bge-m3 embeddings, Qwen2.5 answers, unpdf for PDFs, tesseract.js for OCR
- **Design**: Ryde branding, a light sidebar with a pink accent, and a light main content area
