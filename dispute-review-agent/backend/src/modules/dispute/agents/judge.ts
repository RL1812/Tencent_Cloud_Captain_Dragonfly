import { chatCompletion } from '../../../lib/llm-chat';
import {
  judgeOutputSchema, type AgentInput, type AdvocateCase, type JudgeOutput, type JudgeReview,
} from './contracts';
import {
  assertSourceRefs, checkAdvocateSources, disputeId, evidenceInstructions,
  formatCaseContext, parseJsonObject, validateInput,
} from './shared';
import { createLogger } from '../../../config/logger';
import type { ChecklistAnswer, Resolution } from '../types';
import {
  isDataset,
  isFareDisputeDataset,
  isLegacyRouteDeviationDataset,
  isNoShowDataset,
  isStructuredRouteDeviationDataset,
} from './dataset';
import type { Precedent } from '../precedents';
import { judgeChecklist, type ChecklistItem } from './checklist';

const logger = createLogger('Agents');

function unavailable(input: AgentInput): JudgeReview {
  return {
    disputeId: disputeId(input), mode: 'fallback',
    summary: 'Inconclusive: the three-agent review could not be completed.',
    keyIssues: ['A validated assessment from both advocates and the Judge is required.'],
    driverPerspective: 'No final assessment is available.',
    passengerPerspective: 'No final assessment is available.',
    evidenceAnalysis: 'The input is retained, but no reliable automated merits decision was completed.',
    policyReferences: [], recommendation: 'inconclusive',
    recommendationReasoning: 'No decision is inferred from ratings, statement length, or missing model output.',
    suggestedActions: ['Retry the review; make no refund or compensation adjustment from this result.'],
    resolution: {
      action: 'no_action', amount: 0, currency: currency(input), recipient: 'none',
      basis: 'No automated decision; retry the review or decide manually.',
    },
    confidenceScore: 0,
    confidenceReasoning: 'Model output was unavailable or failed validation.',
    sourceRefs: [], missingEvidence: ['A complete validated model assessment.'],
    reviewedAt: new Date().toISOString(),
  };
}

function currency(input: AgentInput): Resolution['currency'] {
  return isDataset(input) ? 'SGD' : input.trip.currency ?? 'CNY';
}

/** The charge under dispute: no refund or compensation may exceed it. */
function disputedAmount(input: AgentInput): number {
  if (isNoShowDataset(input)) return input.trip_data.cancellation_fee;
  if (isLegacyRouteDeviationDataset(input)) return input.trip_data.final_fare;
  if (isStructuredRouteDeviationDataset(input)) return input.trip_data.excess_fare;
  if (isFareDisputeDataset(input)) return input.trip_data.fare_difference;
  if ('dispute_ticket' in input) return 0;
  return input.trip.fare;
}

/**
 * Compensation may legitimately exceed the disputed charge (e.g. a rider is owed
 * more than the fare for a loss). Other actions (refunds) are capped at the charge.
 */
const COMPENSATION_CAP_MULTIPLIER = 2;

/** The ruling must name a concrete, internally consistent outcome that fits the disputed charge. */
function checkedResolution(output: JudgeOutput, input: AgentInput): Resolution {
  const { action, amount, recipient, basis } = output.resolution;
  if (action === 'no_action') {
    if (amount !== 0 || recipient !== 'none') throw new Error('no_action must have amount 0 and recipient none');
  } else {
    if (amount <= 0 || recipient === 'none') throw new Error(`${action} needs a positive amount and a recipient`);
    const cap = action === 'compensation'
      ? disputedAmount(input) * COMPENSATION_CAP_MULTIPLIER
      : disputedAmount(input);
    if (amount > cap + 0.005) {
      throw new Error(`${action} of ${amount} exceeds the cap of ${cap} (disputed charge ${disputedAmount(input)})`);
    }
  }
  if (output.recommendation === 'inconclusive' && action !== 'no_action') {
    throw new Error('An inconclusive ruling cannot move money');
  }
  return { action, amount, currency: currency(input), recipient, basis };
}

/** Every required check answered once, in order, with citations that exist in the record. */
function checklistAnswers(
  required: ChecklistItem[], output: JudgeOutput, input: AgentInput
): ChecklistAnswer[] {
  const answers = required.map(({ id, item }) => {
    const answer = output.checklist.find((a) => a.id.trim().toUpperCase() === id);
    if (!answer) throw new Error(`Judge skipped checklist item ${id}`);
    return { id, item, finding: answer.finding, conflict: answer.conflict, sourceRefs: answer.sourceRefs };
  });
  assertSourceRefs(answers.flatMap((a) => a.sourceRefs), input);
  return answers;
}

/**
 * Every flagged conflict must surface to the reviewer. When the Judge flags one
 * but lists nothing (typically a claim it considers settled by the records), its
 * finding is listed instead of discarding an otherwise valid ruling.
 */
function withConflictsListed(missing: string[], answers: ChecklistAnswer[]): string[] {
  if (missing.length > 0) return missing;
  return answers.filter((a) => a.conflict).map((a) => `Conflict at ${a.id} (${a.item}): ${a.finding}`);
}

export async function runJudge(
  input: AgentInput, riderCase: AdvocateCase, driverCase: AdvocateCase,
  precedents: Precedent[] = []
): Promise<JudgeReview> {
  const record = validateInput(input);
  // Do not silently judge from one successful advocate and one template fallback.
  if (riderCase.mode !== 'llm' || driverCase.mode !== 'llm') return unavailable(record);
  let output: JudgeOutput | undefined;
  try {
    checkAdvocateSources(riderCase, record);
    checkAdvocateSources(driverCase, record);
    if (riderCase.agent !== 'rider_advocate' || driverCase.agent !== 'driver_advocate') {
      throw new Error('Unexpected advocate roles');
    }
    const required = judgeChecklist(record);
    const response = await chatCompletion([
      {
        role: 'system',
        content: `You are the impartial Judge. Weigh both submissions against the original record.
${evidenceInstructions}
Advocate arguments are not additional evidence. Do not simply average their confidence.
For no-show charges, explicitly explain whether the fee is upheld, reversed or inconclusive,
the SGD amount, and who receives it. If deciding despite conflicting timer records, explain
your policy interpretation and lower confidence as appropriate.
For route deviations, decide whether the deviation was justified (rider request or agreement, a
policy exemption supported by the record), whether notice was given, and the excess-distance refund.
For fare disputes, compare the binding upfront quote with the actual fare and refund an unnotified
surge differential under Policy v2.1 §3. Safety-related disputes receive no AI merits ruling.
resolution is the concrete outcome, in ${currency(record)}:
- full_refund: return the whole disputed charge to the rider
- partial_refund: return part of it to the rider (e.g. the overcharge above the upfront estimate)
- compensation: pay a party for a loss caused by the other party or the platform (may exceed the disputed charge, up to ${disputedAmount(record) * COMPENSATION_CAP_MULTIPLIER} ${currency(record)})
- no_action: the charge stands (e.g. a no-show fee is upheld and stays with the driver); amount 0,
  recipient "none". Use no_action when the ruling is inconclusive.
Refunds (full_refund, partial_refund) can never exceed the disputed charge (${disputedAmount(record)} ${currency(record)}). Show the calculation in basis.
partyNotices are short messages (3-5 sentences) sent to each party: plain, respectful language
addressed to that person ("you"), stating the outcome, any amount and when it applies, the main
reason in everyday terms, and that they can reply to appeal. No JSON paths, internal agent names or
confidence scores, and nothing about the other party beyond what the decision needs.
Before ruling, answer every item in requiredChecklist, by its id. For each, state what the record
shows, set conflict to true when sources disagree, and cite sourceRefs (an empty array when nothing
in the record addresses it). For every conflict, add an entry to missingEvidence saying whether it is
resolved by the records (and how) or still open, and reflect open conflicts in confidenceReasoning.
humanPrecedents (may be empty) are earlier disputes of this type decided by human reviewers, with
their reasons. Use them only to calibrate standards: how the policy is applied and how records are
weighed against statements. They are not evidence about this case, are never cited in sourceRefs and
never override this record. Where this case differs materially, rule on its own facts.
Return only this JSON object:
{
 "summary":"ruling summary", "keyIssues":["issue"],
 "driverPerspective":"assessment", "passengerPerspective":"assessment",
 "evidenceAnalysis":"evidence comparison", "policyReferences":["supplied policy and exact value"],
 "recommendation":"driver|passenger|shared|inconclusive",
 "recommendationReasoning":"ruling with source-grounded explanation",
 "suggestedActions":["specific action including amount and recipient when justified"],
 "confidenceScore":"integer from 0 to 100", "confidenceReasoning":"uncertainties",
 "sourceRefs":["/existing/source/path"], "missingEvidence":["missing facts or unresolved conflicts"],
 "checklist":[{"id":"C1","finding":"what the record shows","conflict":false,"sourceRefs":["/existing/source/path"]}],
 "resolution":{"action":"full_refund|partial_refund|compensation|no_action","amount":0,"recipient":"rider|driver|none","basis":"calculation from policy and record"},
 "partyNotices":{"rider":"message to the rider","driver":"message to the driver"}
}
Select one value for each enum field. Do not output the pipe-separated examples literally.`,
      },
      {
        role: 'user',
        content: JSON.stringify({
          ...JSON.parse(formatCaseContext(record)),
          riderAdvocateSubmission: riderCase,
          driverAdvocateSubmission: driverCase,
          requiredChecklist: required,
          humanPrecedents: precedents.map((p) => ({
            caseNumber: p.caseNumber, title: p.title, facts: p.facts,
            aiRecommendation: p.aiRecommendation, humanDecision: p.humanRecommendation, humanReason: p.reason,
          })),
        }),
      },
    ], { temperature: 0.1, max_tokens: 3000 });
    output = judgeOutputSchema.parse(parseJsonObject(response));
    assertSourceRefs(output.sourceRefs, record);
    const checklist = checklistAnswers(required, output, record);
    return {
      ...output,
      resolution: checkedResolution(output, record),
      checklist,
      missingEvidence: withConflictsListed(output.missingEvidence, checklist),
      precedentsUsed: precedents.map((p) => p.caseNumber),
      disputeId: disputeId(record), mode: 'llm',
      reviewedAt: new Date().toISOString(),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn({
      agent: 'judge',
      err: msg,
      disputeId: disputeId(record),
      disputedAmount: disputedAmount(record),
      ...(output?.resolution && {
        action: output.resolution.action,
        attemptedAmount: output.resolution.amount,
        recipient: output.resolution.recipient,
      }),
    }, 'Judge output unavailable or invalid');
    return unavailable(record);
  }
}
