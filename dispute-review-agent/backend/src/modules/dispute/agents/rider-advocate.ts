import type { AgentInput, AdvocateCase } from './contracts';
import { runAdvocate } from './advocate';

/** Accepts the complete sample JSON dataset or an existing web-app case. */
export function runRiderAdvocate(input: AgentInput): Promise<AdvocateCase> {
  return runAdvocate(input, 'rider_advocate');
}
