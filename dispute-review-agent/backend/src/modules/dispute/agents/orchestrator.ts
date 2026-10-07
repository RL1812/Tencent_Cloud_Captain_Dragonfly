import type { AgentInput, MultiAgentReview } from './contracts';
import { runDriverAdvocate } from './driver-advocate';
import { runJudge } from './judge';
import { runRiderAdvocate } from './rider-advocate';
import { validateInput } from './shared';

/** Both advocates see the full record; the Judge waits for both submissions. */
export async function reviewDispute(input: AgentInput): Promise<MultiAgentReview> {
  const record = validateInput(input);
  const [rider, driver] = await Promise.all([
    runRiderAdvocate(record),
    runDriverAdvocate(record),
  ]);
  const ruling = await runJudge(record, rider, driver);
  return { ...ruling, advocateSubmissions: { rider, driver } };
}
