# WorkBuddy session plan (hackathon proof of use)

Use WorkBuddy for real remaining work, not staged chats. The handbook wants proof that the
project was "built on" WorkBuddy or CodeBuddy, so the strongest evidence is several sessions
across the last four days. Each should show a prompt, WorkBuddy doing the work, and a result
you actually kept.

Credits are limited, so sessions are listed most important first. Each prompt is ready to paste.

## 1. Code review of today's changes (cheap, high value)

> Review the recent changes in `dispute-review-agent/backend/src/modules/dispute/agents/` (route-analysis.ts, judge.ts, dataset.ts) and `frontend/src/components/AgentReview.tsx`. Check for bugs, edge cases in the route-deviation analysis and the resolution validation, and suggest improvements. Run the backend tests.

This shows WorkBuddy is part of how the code was built, and it may catch bugs.

## 2. Remove the Chinese/Didi leftovers (needed for the Ryde judges)

> Rewrite the seed cases in `backend/src/modules/dispute/store.ts` (DR-2024-001 to 003) as Singapore Ryde cases in English with SGD fares and Singapore locations. Translate `docs/product/features.md` to English, and replace Didi with Ryde. Keep the tests passing.

Story for the development note: WorkBuddy built a generic skeleton, then adapted it for Ryde.

## 3. Update the architecture diagram (required deliverable)

> Update the mermaid architecture diagram in `dispute-review-agent/README.md` to show the full LangGraph workflow: prioritization → evidence validation → rider and driver advocates in parallel → Judge (checklist, precedents, structured resolution, party notices) → confidence-based escalation → human decision → learning feedback. Include the route-analysis step for route-deviation cases.

## 4. Write the submission text

> Based on this repo and the Ryde challenge statement, draft the hackathon submission: a project title, a blurb under 10 words, and a project description covering target scenarios and users, pain points, solution design (business and technical architecture, and how prompts drive the agents), and business value with measurable metrics.

## 5. Demo video script

> Write a 5–8 minute demo script: project overview, then live walkthrough of DISP-003 (route deviation, auto-resolved with a S$12.40 refund) and DISP-002 (no-show, ambiguous, escalated to a human), showing the agent transcript, checklist, resolution and party messages, then a short reflection on how we built it with WorkBuddy.

## 6. If credits remain: one stretch goal

> Add a Fraud & Bad-Faith Detection agent that runs in parallel with the advocates, assesses dispute-abuse patterns from rider and driver profiles and dispute history, and passes risk signals to the Judge as context, not evidence. Show it in the agent transcript UI. Add tests.

Adds bonus points, and a new agent is very visible in screenshots.

## Collecting the proof

- Screenshot each session: the prompt, WorkBuddy working, and the result. Then export or save the full chat history. Aim for 5 or more screenshots across different days (minimum is 3).
- Keep a short log (date, what you asked, what you kept). It becomes the written development-process description.
- Commit current changes before each WorkBuddy session, so its edits show up as a clean diff and don't conflict with uncommitted work.
