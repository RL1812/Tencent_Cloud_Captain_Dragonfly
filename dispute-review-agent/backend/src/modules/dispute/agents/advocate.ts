import { chatCompletion } from '../../../lib/llm-chat';
import { advocateOutputSchema, type AgentInput, type AdvocateCase, type AdvocateRole } from './contracts';
import {
  checkAdvocateSources, disputeId, evidenceInstructions,
  formatCaseContext, parseJsonObject, validateInput,
} from './shared';
import { createLogger } from '../../../config/logger';

const logger = createLogger('Agents');

/** Shared transport and validation; advocates use distinct roles and prompts. */
export async function runAdvocate(input: AgentInput, agent: AdvocateRole): Promise<AdvocateCase> {
  const record = validateInput(input);
  const party = agent === 'rider_advocate' ? 'rider' : 'driver';
  const prompt = `You are the ${party} advocate. Gather relevant material from the provided
record and present the strongest honest case for the ${party}, acknowledging adverse evidence.
${evidenceInstructions}
Return only this JSON shape:
{
  "positionSummary": "party position",
  "claims": ["allegations or claims, with attribution"],
  "supportingEvidence": [{"evidence":"fact or allegation","relevance":"why it matters","sourceRefs":["/path"]}],
  "adverseEvidence": [{"evidence":"adverse fact","relevance":"why it weakens the case","sourceRefs":["/path"]}],
  "policyArguments": [{"argument":"application of supplied policy","sourceRefs":["/cancellation_policy/free_wait_time_min","/trip_data/driver_wait_start"]}],
  "missingEvidence": ["missing facts or conflicting timestamps"],
  "requestedOutcome": "specific requested remedy, including SGD amount when supported",
  "confidenceScore": "integer from 0 to 100"
}
Use empty arrays when there is no evidence or supplied policy. Never fabricate a citation.`;
  try {
    const text = await chatCompletion([
      { role: 'system', content: prompt },
      { role: 'user', content: formatCaseContext(record) },
    ], { temperature: 0.2, max_tokens: 2600 });
    const output: AdvocateCase = {
      ...advocateOutputSchema.parse(parseJsonObject(text)),
      agent, disputeId: disputeId(record), mode: 'llm',
    };
    checkAdvocateSources(output, record);
    return output;
  } catch (err) {
    logger.warn({ agent, err: err instanceof Error ? err.message : String(err) }, 'Advocate output unavailable or invalid');
    return {
      agent, disputeId: disputeId(record), mode: 'fallback',
      positionSummary: `The ${party} submission could not be generated or validated.`,
      claims: ['No model-assessed claims are available.'],
      supportingEvidence: [], adverseEvidence: [], policyArguments: [],
      missingEvidence: ['A valid model-generated assessment of the supplied evidence is unavailable.'],
      requestedOutcome: 'No merits recommendation; retry analysis.',
      confidenceScore: 0,
    };
  }
}
