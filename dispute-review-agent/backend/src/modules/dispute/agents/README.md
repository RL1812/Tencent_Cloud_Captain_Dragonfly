# Core-agent input and output

The Rider Advocate and Driver Advocate independently receive the **entire JSON block**
from the DISP-002 markdown. Do not pass the markdown's expected ruling or evidence
summary to the models. Existing web-app DisputeCase inputs remain supported.

The eight dataset sections are dispute_ticket, rider_profile, driver_profile,
trip_data, gps_telemetry, chat_logs, app_events, and cancellation_policy.
dataset.ts validates timestamps, coordinate ranges, numeric fields and matching IDs.
The dataset schema currently covers no_show_charge; other structured dispute
datasets need their own schemas. Legacy case categories remain available.

## Calls

    const rider = await runRiderAdvocate(dataset);
    const driver = await runDriverAdvocate(dataset);
    const ruling = await runJudge(dataset, rider, driver);

Normally call reviewDispute(dataset), which runs both advocates concurrently and
then calls the Judge. It returns the ruling and advocateSubmissions.rider/driver.
All model calls still use the existing TokenHub client and hy3 model.

POST /api/disputes/dataset-review accepts the JSON block as the body and returns
{ data: MultiAgentReview }. It does not persist a case or populate the dashboard.
POST /api/disputes/:id/review continues to review existing stored cases.

## Advocate output

- agent, disputeId and mode (llm or fallback), assigned by code
- positionSummary, claims, requestedOutcome and confidenceScore (0-100)
- supportingEvidence and adverseEvidence: arrays of { evidence, relevance, sourceRefs }
- policyArguments: arrays of { argument, sourceRefs }
- missingEvidence: gaps, conflicts and unresolved assumptions

sourceRefs are JSON pointers, for example /gps_telemetry/4,
/chat_logs/2, or /cancellation_policy/no_show_threshold_min.
Unknown references are rejected. Policy arguments for dataset inputs must cite
actual cancellation_policy fields. Reference validation checks existence, not
whether a model's interpretation is correct.

## Judge output and failures

The Judge retains the existing UI-compatible review fields and adds disputeId,
mode, sourceRefs and missingEvidence. The orchestrator includes both advocate
submissions. Monetary actions are described in suggestedActions in SGD for this
Singapore sample. There is no payment execution.

Unavailable or invalid model output returns mode=fallback and confidenceScore=0.
If either advocate fails, the Judge call is skipped and the result is inconclusive.
No fallback chooses a winner based on ratings or statement length. Existing
cases stay pending after failed or inconclusive reviews.

## Dataset interpretation

DISP-002 records 08:43 arrival and wait start, an 08:43:10 app timer start,
08:45 scheduled pickup, and 08:51 cancellation. The prompt requires agents to
explain this discrepancy and any interpretation of the wait-start policy.
The policy does not explicitly define whether early arrival counts. No expected
verdict is hardcoded. Profiles and fraud flags do not prove fault on this trip.

Evidence collection here means selecting and citing supplied records; no external
GPS, chat or policy service is queried. The dataset has no separate driver statement.

## Framework choice

The implementation currently uses ordinary async TypeScript orchestration.
It can be wrapped in LangGraph nodes: input -> parallel advocates -> Judge -> output.
LangGraph can retain the existing TokenHub client. LangChain is optional for
model wrappers or future retrieval tools. No framework migration, prioritization,
human escalation or learning feedback loop is implemented in this change.
