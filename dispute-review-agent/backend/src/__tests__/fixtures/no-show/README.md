# Ten synthetic no-show dispute cases

These fixtures follow the eight-section JSON structure of the original DISP-002
sample. They are fictional test data, dated September 14-23, 2026, with unique
dispute, trip, rider and driver IDs. All money is in SGD.

| Case | Scenario | Expected outcome | Refund |
|---|---|---|---|
| [DISP-003](DISP-003.json) | Valid charge despite lower driver rating | uphold | SGD 0 |
| [DISP-004](DISP-004.json) | Cancelled within free-wait period | reverse | SGD 5 |
| [DISP-005](DISP-005.json) | Driver waits at the wrong location | reverse | SGD 5 |
| [DISP-006](DISP-006.json) | Early arrival with undefined wait-start policy | inconclusive | Undetermined |
| [DISP-007](DISP-007.json) | Fee exceeds policy amount | partial_refund | SGD 5 |
| [DISP-008](DISP-008.json) | Missing evidence of arrival and waiting | inconclusive | Undetermined |
| [DISP-009](DISP-009.json) | Trip summary and app timer disagree | inconclusive | Undetermined |
| [DISP-010](DISP-010.json) | Rider replies but cannot reach pickup | uphold | SGD 0 |
| [DISP-011](DISP-011.json) | Driver leaves before completing wait | reverse | SGD 5 |
| [DISP-012](DISP-012.json) | One second short of no-show threshold | reverse | SGD 5 |

Each DISP-*.json file is a complete, standalone request body for
POST /api/disputes/dataset-review, or input to reviewDispute(dataset).
The endpoint does not persist these cases to the dashboard.

Example from the backend directory, while the API is running:

    curl.exe http://localhost:3000/api/disputes/dataset-review -H "Content-Type: application/json" --data-binary "@src/__tests__/fixtures/no-show/DISP-003.json"

Only send a DISP-*.json file to the model. The separate
[expected-results.json](expected-results.json) is an evaluation answer key with
reasoning, evidence references, acceptance criteria and assumptions. Do not import
that file into the evidence knowledge base or include it in model prompts.

## Interpreting the expected results

The rubric is authored for these synthetic fixtures; it is not an observed model
result or an official Ryde policy. Evaluate the material reasoning and money
amounts, not exact wording or an invented confidence score.

Common benchmark interpretation: a rider_no_show fee requires the full eight-minute
no-show threshold at the booked pickup. The five-minute free-wait threshold alone
is insufficient. Where a required rule is not explicit in the source's four-field
policy, assumptions are documented separately in the answer key.

- DISP-003 tests whether objective trip evidence outweighs adverse driver history.
- DISP-004 ends before either waiting threshold.
- DISP-005 has consistently wrong-location GPS, not a conflicting location feed.
- DISP-006 tests early arrival versus scheduled pickup without an explicit timer rule.
- DISP-007 requires retaining SGD 5 and refunding only the excess SGD 5.
- DISP-008 deliberately omits GPS and communication evidence; missing data is not proof of fault.
- DISP-009 deliberately conflicts at the summary/app-timer level; the conflict is not a data-generation mistake.
- DISP-010 contains a rider reply acknowledging absence, with no agreed wait extension.
- DISP-011 has evidence of early departure despite a later cancellation.
- DISP-012 tests the exact 479-second versus 480-second boundary.

The fixtures preserve the original no_show_charge scope. They do not extend the
dataset schema to other dispute categories. Under-specified cases intentionally
have no fixed refund amount and expect an inconclusive result.

## Validation

Run from the backend directory:

    npm test -- --runInBand src/__tests__/no-show-fixtures.test.ts

These tests validate fixture structure and scenario facts without model calls.
Live end-to-end evaluation requires a configured TokenHub key and is a separate step.
