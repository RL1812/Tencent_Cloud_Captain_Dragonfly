# Core-agent input and output

The Rider Advocate and Driver Advocate independently receive the validated case
record. Any `recommended_ruling` supplied inside a sample document is stripped
before the agents run; it is an evaluation answer key, not evidence. Existing
web-app DisputeCase inputs remain supported.

dataset.ts validates timestamps, coordinate ranges, numeric fields and matching IDs
for three structured dispute types (other legacy case categories remain available):

- no_show_charge (DISP-002, frontend/public/samples/disp-002.json): dispute_ticket,
  rider_profile, driver_profile, trip_data, gps_telemetry, chat_logs, app_events,
  cancellation_policy.
- route_deviation (DISP-003, frontend/public/samples/disp-003.json): the same shared
  sections, with trip_data holding the upfront estimate, metered distance and
  fare_breakdown, plus recommended_route and fare_policy.
- route_deviation (new DISP-001 document): optimal_route, aggregate fare breakdown,
  traffic conditions and route-notification analysis.
- fare_dispute (new DISP-003 document): upfront quote, actual fare, quote-time and
  trip-start surge multipliers, and the notification record.

For route deviations, route-analysis.ts computes, without a model call, the extra
distance against the recommended route, GPS points more than 500 m off it, mid-trip
stops, duration against the estimate, and whether the fare breakdown adds up. The
agents receive it as computed_route_analysis and can cite /computed_route_analysis/...;
it is kept separate from originalRecord. Ryde Dispute Resolution Policy v2.1 is
provided separately as `/applicable_policy/...` and controls over historical policy
fields embedded in a dataset. Deterministic applications of fully structured rules
appear under `/computed_policy_assessment/...`.

## Calls

    const rider = await runRiderAdvocate(dataset);
    const driver = await runDriverAdvocate(dataset);
    const ruling = await runJudge(dataset, rider, driver);

Normally call reviewDispute(dataset). A compiled LangGraph runs prioritization,
evidence validation, both advocates in parallel, the Judge, and confidence-based
routing. It returns the ruling, advocateSubmissions.rider/driver,
priorityAssessment, evidenceValidation, escalation, and workflowStatus.
All model calls go through src/lib/llm-chat.ts: Google Gemini (free tier) when
GEMINI_API_KEY is set — gemini-3.8-flash first, then GEMINI_FALLBACK_MODELS —
otherwise Tencent TokenHub (hy3).

POST /api/disputes/dataset-review accepts the JSON block as the body and returns
{ data: MultiAgentReview }. It does not persist a case or populate the dashboard.
POST /api/disputes/:id/review continues to review existing stored cases.

## Advocate output

- agent, disputeId and mode (llm or fallback), assigned by code
- positionSummary, claims, requestedOutcome and confidenceScore (0-100)
- supportingEvidence and adverseEvidence: arrays of { evidence, relevance, sourceRefs }
- policyArguments: arrays of { argument, sourceRefs }
- missingEvidence: gaps, conflicts and unresolved assumptions

sourceRefs are JSON pointers, for example /gps_telemetry/4, /chat_logs/2, or
/applicable_policy/no_show/free_wait_time_min. Unknown references are rejected.
Policy arguments must cite either the controlling applicable policy or a supplied
legacy policy field. Reference validation checks existence, not truth.

## Judge output and failures

The Judge retains the existing UI-compatible review fields and adds disputeId,
mode, sourceRefs and missingEvidence. The orchestrator includes both advocate
submissions. Every ruling carries a structured resolution: action (full_refund,
partial_refund, compensation or no_action), amount, currency (set by code: SGD for
datasets), recipient and the calculation in basis. It is rejected if no_action moves
money, a refund has no recipient or amount, the amount exceeds the disputed charge,
or an inconclusive ruling moves money. The Judge also writes partyNotices: a
plain-language message for the rider and for the driver. The UI marks them as held
when the case is escalated and superseded after a human decision. There is no
payment execution or message delivery.

Unavailable or invalid model output returns mode=fallback and confidenceScore=0.
If either advocate fails, the Judge call is skipped and the result is inconclusive.
No fallback chooses a winner based on ratings or statement length. The
deterministic Prioritization Agent assigns an explainable queue level and target
response time without consuming an LLM call. For stored cases, a failed review
(mode=fallback) leaves the case pending for a retry. The Escalation Agent applies
Policy v2.1: safety and values above SGD 50 always go to a human; SGD 10–50 requires
80% confidence; route deviations above 2 km go to a human; and any fraud flag raises
the confidence requirement to 95%. An inconclusive ruling also goes to a human. A human
decision (POST /api/disputes/:id/override) closes the case. The Learning Feedback
Agent then indexes that reviewed outcome when PostgreSQL and Ollama are available.
This is RAG feedback, not model fine-tuning. If the knowledge base is offline,
the human decision still saves and its feedback status is reported as skipped.
Earlier reviews, escalations and human decisions are never shown to the agents.

Model output is checked before use: confidenceScore is rounded to an integer
0-100, and each dataset policy argument must cite supplied policy.
Rejections are logged with the reason (context "Agents").

## Dataset interpretation

Under Policy v2.1, the DISP-002 wait is measured from the 08:45 scheduled pickup.
The 08:51 cancellation is after the five-minute free wait, and the record contains
both messages and an in-app call. The structured policy assessment therefore keeps
the fee, while the rider fraud flag requires 95% confidence for automatic resolution.
Profiles and fraud flags do not prove the trip facts; the flag affects routing only.

Evidence collection here means selecting and citing supplied records; no external
GPS, chat or policy service is queried. The dataset has no separate driver statement.

## Framework choice

The implementation uses LangGraph for explicit branching and parallel agent
execution while retaining the existing chat client. The graph ends with either
auto_resolved or human_intervention_required. Human review remains an API
boundary rather than a long-held HTTP request: POST /override records the human
decision and invokes learning feedback. LangChain model wrappers are not required.
