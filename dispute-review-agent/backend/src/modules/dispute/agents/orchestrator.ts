import type { AgentInput, MultiAgentReview } from './contracts';
import { runDriverAdvocate } from './driver-advocate';
import { runJudge } from './judge';
import { runRiderAdvocate } from './rider-advocate';
import { disputeId, validateInput } from './shared';
import { disputeType } from './checklist';
import { precedentStore } from '../precedents';

/**
 * Both advocates see the full record; the Judge waits for both submissions and
 * also gets recent human decisions on disputes of the same type as precedents.
 */
export async function reviewDispute(input: AgentInput): Promise<MultiAgentReview> {
  const record = validateInput(input);
  const [rider, driver] = await Promise.all([
    runRiderAdvocate(record),
    runDriverAdvocate(record),
  ]);
  const precedents = precedentStore.select(disputeType(record), disputeId(record));
  const ruling = await runJudge(record, rider, driver, precedents);
  return { ...ruling, advocateSubmissions: { rider, driver } };
}
