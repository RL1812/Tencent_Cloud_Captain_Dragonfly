import { chatCompletion } from '../../../lib/llm-chat';
import { judgeOutputSchema, type AgentInput, type AdvocateCase, type JudgeReview } from './contracts';
import {
  assertSourceRefs, checkAdvocateSources, disputeId, evidenceInstructions,
  formatCaseContext, parseJsonObject, validateInput,
} from './shared';
import { createLogger } from '../../../config/logger';

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
    confidenceScore: 0,
    confidenceReasoning: 'Model output was unavailable or failed validation.',
    sourceRefs: [], missingEvidence: ['A complete validated model assessment.'],
    reviewedAt: new Date().toISOString(),
  };
}

export async function runJudge(
  input: AgentInput, riderCase: AdvocateCase, driverCase: AdvocateCase
): Promise<JudgeReview> {
  const record = validateInput(input);
  // Do not silently judge from one successful advocate and one template fallback.
  if (riderCase.mode !== 'llm' || driverCase.mode !== 'llm') return unavailable(record);
  try {
    checkAdvocateSources(riderCase, record);
    checkAdvocateSources(driverCase, record);
    if (riderCase.agent !== 'rider_advocate' || driverCase.agent !== 'driver_advocate') {
      throw new Error('Unexpected advocate roles');
    }
    const response = await chatCompletion([
      {
        role: 'system',
        content: `You are the impartial Judge. Weigh both submissions against the original record.
${evidenceInstructions}
Advocate arguments are not additional evidence. Do not simply average their confidence.
For no-show charges, explicitly explain whether the fee is upheld, reversed or inconclusive,
the SGD amount, and who receives it. If deciding despite conflicting timer records, explain
your policy interpretation and lower confidence as appropriate.
Return only this JSON object:
{
 "summary":"ruling summary", "keyIssues":["issue"],
 "driverPerspective":"assessment", "passengerPerspective":"assessment",
 "evidenceAnalysis":"evidence comparison", "policyReferences":["supplied policy and exact value"],
 "recommendation":"driver|passenger|shared|inconclusive",
 "recommendationReasoning":"ruling with source-grounded explanation",
 "suggestedActions":["specific action including amount and recipient when justified"],
 "confidenceScore":"integer from 0 to 100", "confidenceReasoning":"uncertainties",
 "sourceRefs":["/existing/source/path"], "missingEvidence":["missing facts or unresolved conflicts"]
}
Select one recommendation enum value. Do not output the pipe-separated example literally.`,
      },
      {
        role: 'user',
        content: JSON.stringify({
          ...JSON.parse(formatCaseContext(record)),
          riderAdvocateSubmission: riderCase,
          driverAdvocateSubmission: driverCase,
        }),
      },
    ], { temperature: 0.1, max_tokens: 3000 });
    const output = judgeOutputSchema.parse(parseJsonObject(response));
    assertSourceRefs(output.sourceRefs, record);
    return {
      ...output, disputeId: disputeId(record), mode: 'llm',
      reviewedAt: new Date().toISOString(),
    };
  } catch (err) {
    logger.warn({ agent: 'judge', err: err instanceof Error ? err.message : String(err) }, 'Judge output unavailable or invalid');
    return unavailable(record);
  }
}
