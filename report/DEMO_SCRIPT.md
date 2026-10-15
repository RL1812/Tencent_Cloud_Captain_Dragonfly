# RydeResolve — demo video script (5–8 minutes)

Target length **6 min 30 s**. Narration below is ~1,000 words at a calm 150 wpm.
Times are cumulative and assume no re-takes.

Everything quoted here comes from the repository: the two sample datasets
(`frontend/public/samples/disp-002.json`, `disp-003.json`), `report/SUBMISSION.md`,
and the screenshots in `proof/screenshots/`.

---

## Before you record

1. `docker compose up -d` — PostgreSQL + pgvector.
2. `ollama pull bge-m3 && ollama pull qwen2.5:7b` (only needed for the knowledge base).
3. `backend/.env` — set `GEMINI_API_KEY` (free key: <https://aistudio.google.com/apikey>).
4. Backend: `cd backend && npm run dev`. Check `curl localhost:3000/api/health/ready` and
   confirm it reports the provider you expect.
5. Frontend: `cd frontend && npm run dev` → <http://localhost:5173>.
6. On the **Submit case** page, import `disp-003.json` and `disp-002.json` so both cases exist.
7. Browser at 100% zoom, notifications off, bookmarks bar hidden.

**Two things to know before you press record**

- A review makes **3 LLM calls** (Rider Advocate, Driver Advocate, Judge) and the Gemini free
  tier allows roughly 20 requests per model per day. Run each case **once** while rehearsing —
  not three times — or you will burn the quota before the real take.
- **DISP-002 may auto-resolve instead of escalating** on some runs. That is real behaviour, not
  a bug: the dataset deliberately leaves the wait-start basis ambiguous and the Judge's
  confidence varies run to run. The script has a branch for both outcomes (2:55). Do not fake
  the escalation — if it auto-resolves, use the branch and say so.

---

## 0:00 – 0:40 · Project overview

**[ON SCREEN]** Dashboard (`13-app-dashboard-overview.png`). The four stat cards, then the case
table. Do not click anything yet.

**[NARRATION]**

> "This is RydeResolve — an AI dispute-review system for Ryde, a ride-hailing platform in
> Singapore.
>
> Ride-hailing companies process thousands of dispute tickets a day. The handbook puts manual
> resolution at 24 to 72 hours per dispute, with millions spent annually on support hours, and
> rulings that differ between reviewers on similar cases.
>
> RydeResolve replaces that manual evidence-gathering with a multi-agent workflow. Two advocates
> argue each side in parallel, an impartial Judge weighs both against the original record, and a
> confidence threshold decides whether the case resolves itself or goes to a human.
>
> I'll show you two cases. One is clear-cut and resolves automatically. The other is genuinely
> ambiguous, and that's the point — it escalates instead of guessing."

---

## 0:40 – 1:10 · The dashboard

**[ON SCREEN]** Sort the table by priority (`11-app-dashboard-sorted-by-priority.png`). Point at
the priority and target-response columns.

**[NARRATION]**

> "The dashboard is the reviewer's queue. Every case carries a priority and a target response
> time — 15 minutes for urgent, up to 24 hours for low.
>
> That comes from the Prioritization Agent, and it's deliberate that it uses **no** model call.
> Safety, accident and fraud-flagged cases are elevated by deterministic rules, so queue order
> stays explainable even if the model provider is down."

---

## 1:10 – 2:55 · DISP-003 — route deviation, auto-resolved

**[ON SCREEN]** Open DISP-003 → **Overview** tab (`04-…case-overview-evidence.png`). Scroll the
trip data and fare breakdown slowly.

**[NARRATION]**

> "Case one. DISP-003, a route-deviation claim. The rider, Priya Nair, was going from Toa Payoh
> Hub to Raffles Place. The app quoted 19 dollars via the CTE — 9.8 kilometres, 18 minutes.
>
> The driver went via the PIE and ECP instead. The trip came out at 17.6 kilometres and 39
> minutes, and the fare was 31 dollars 40 — about 65 per cent above the quote."

**[ON SCREEN]** Scroll to the chat log, then the app events.

**[NARRATION]**

> "The chat log is where it gets interesting. The rider asks, 'Why are we not on the CTE?' The
> driver says, 'CTE jam, PIE faster.' The rider replies that the app shows the CTE is clear and
> asks him to go back. The driver says, 'Ok ok, after this exit.' He never did."

**[ON SCREEN]** Trigger the review. While it runs, keep the loading state on screen.

**[NARRATION]**

> "Before any model is called, the system computes the route deviation deterministically — no
> LLM involved. Haversine distance against the recommended route, GPS points more than 500
> metres off it, mid-trip stops, and whether the fare breakdown actually adds up. The agents
> cite those measured numbers rather than estimating from raw coordinates.
>
> Now the three agents. Rider Advocate and Driver Advocate run in parallel, then the Judge."

**[ON SCREEN]** **Agents** tab (`05-app-disp003-rider-vs-driver-advocates.png`). Expand one
advocate's supporting evidence and hover a citation.

**[NARRATION]**

> "Each advocate gathers evidence from the same record — neither has an information advantage —
> and every citation is a JSON pointer into that record. If an advocate cites a path that
> doesn't exist, the citation is rejected. The Judge is also told explicitly that advocate
> arguments are **not** additional evidence."

**[ON SCREEN]** **Ruling** tab (`06-app-disp003-resolution-and-party-messages.png`). Show the
checklist, then the resolution, then the party notices.

**[NARRATION]**

> "The Judge works through a mandatory checklist — for route deviation, that's the actual versus
> recommended route, unexpected stops, the fare arithmetic, whether the rider asked for or
> agreed to the change, and the refund calculation. A ruling that skips an item is rejected
> outright.
>
> The resolution is structured: an action, an amount, a currency, a recipient, and the basis.
> Here, the deviation was 79 per cent against a 15 per cent tolerance. None of the three
> exemptions apply — the rider didn't agree to the detour, the platform's suggested re-route was
> ignored, and no road incident was recorded. So: a partial refund of **S$12.40**, the difference
> between the 31.40 fare and the 19.00 estimate.
>
> Refunds are capped at the disputed charge. An inconclusive ruling can't move money at all.
>
> And both parties get a plain-language notice. No payment is executed and no message is sent —
> those are the reviewer's calls."

---

## 2:55 – 5:00 · DISP-002 — no-show charge, escalated

**[ON SCREEN]** Back to the dashboard, open DISP-002 → **Overview** tab
(`07-…case-overview-evidence.png`). Then scroll to the app events.

**[NARRATION]**

> "Case two. DISP-002, a five-dollar no-show cancellation fee. The rider says he was at Tiong
> Bahru Plaza on time and waited ten minutes, and the driver never showed.
>
> The driver's side is in the records. He arrived at 08:43 — two minutes **early** — and messaged
> that he was at the lobby. He called at 08:47, and it rang 22 seconds unanswered. At 08:49 he
> asked if the rider was coming down. At 08:50 he said he'd have to cancel. He cancelled at 08:51.
>
> So why is this case hard? Because the policy never says when the wait clock starts. The driver
> arrived at 08:43, the trip was scheduled for 08:45, and the app's own wait timer started at
> 08:43:10. The no-show threshold is eight minutes. Under one reading the fee is valid; under
> another it isn't."

**[ON SCREEN]** Trigger the review. Then **Agents** tab
(`08-…rider-vs-driver-advocates.png`).

**[NARRATION]**

> "This is the case the system is designed for. The prompts require the agents to surface the
> conflicting timestamps rather than silently pick one, and the checklist forces the wait-start
> question to be answered explicitly on every review — not by chance.
>
> There's a hard rule here too: the rider's fraud flag and his three rejected disputes are
> context, **not** proof of fault on this trip. Same for the driver's 4.9 rating. Ratings don't
> decide the case."

**[ON SCREEN]** **Ruling** tab (`09-…resolution-and-party-messages.png`). If escalated, the
notices are marked **held**.

**[NARRATION — escalation branch]**

> "And it escalated. The Judge's confidence came in below the 60 per cent threshold, so the case
> went to a human instead of guessing. The party notices are marked as held — nothing is sent
> while a person is still deciding.
>
> That's the design principle: **no fallback ever picks a winner.** If either advocate's output
> fails validation, the Judge is skipped entirely and the case escalates. The system never
> averages its way to a decision."

**[NARRATION — alternative, if DISP-002 auto-resolves]**

> "This run it resolved automatically — the Judge's confidence landed above the 60 per cent
> threshold. That's honest variation: the dataset leaves the wait-start basis deliberately
> ambiguous, so the confidence moves between runs. On other runs it escalates. Either way, the
> reasoning is on screen, and the threshold is a design choice we'd tune on real labelled cases."

---

## 5:00 – 5:45 · The human reviewer and the learning loop

**[ON SCREEN]** Open the **Human review** panel (`10-app-human-decision-form.png`). Enter a
reason, tick **use as precedent**, save.

**[NARRATION]**

> "A reviewer can decide any case at any time — whether or not the AI has reviewed it, and
> whether or not it escalated. The decision overrides the AI, needs a reason, and can be revised
> or withdrawn later.
>
> If the reviewer marks it as a precedent, that decision is saved. Next time the Judge sees a
> case of the same type, it's shown up to three recent human precedents to calibrate how it
> applies policy.
>
> Precedents are never treated as evidence, never cited as sources, and a case is never shown its
> own earlier decision. This is RAG feedback, not fine-tuning — no retraining, no model weights
> touched. The Precedents page lists them, and deleting one stops the AI using it."

---

## 5:45 – 6:30 · How we built it, and close

**[ON SCREEN]** Cut to the CodeBuddy / WorkBuddy session screenshots
(`01-codebuddy-write-report.png`, `02-codebuddy-fix-report.png`), then back to the dashboard.

**[NARRATION]**

> "On how we built it: this was built with CodeBuddy and WorkBuddy, alongside GPT, Gemini, Codex
> and Claude.
>
> The agents, the LangGraph workflow and the frontend were written and refactored in these
> sessions — including the route-deviation analysis, the structured resolutions and the
> checklist enforcement you just saw. The submission report itself was drafted and then
> corrected across two more sessions.
>
> Our proof of use is in the repository: the exported conversation logs under `proof/`, and the
> screenshots from those sessions.
>
> RydeResolve doesn't remove the human from dispute resolution. It removes the manual
> evidence-gathering — so the reviewer spends their time on the cases that genuinely need
> judgement, with every ruling grounded in cited evidence and explained to both parties in plain
> language."

---

## Recording checklist

- [ ] Both cases imported before recording, so no waiting on the Submit page.
- [ ] Each review run **once** in the final take — free-tier quota is ~20 requests per model per day.
- [ ] DISP-002 outcome noted honestly (escalated **or** auto-resolved) — use the matching branch.
- [ ] On-screen text legible: 100% zoom, no overlapping panels.
- [ ] Do not claim payment execution or message delivery — the system produces the decision, a human sends it.
- [ ] Final runtime between 5:00 and 8:00.
