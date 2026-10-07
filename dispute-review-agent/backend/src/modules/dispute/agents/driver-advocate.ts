import type { AgentInput, AdvocateCase } from './contracts';
import { runAdvocate } from './advocate';

/** Accepts the complete sample JSON dataset or an existing web-app case. */
export function runDriverAdvocate(input: AgentInput): Promise<AdvocateCase> {
  return runAdvocate(input, 'driver_advocate');
}
