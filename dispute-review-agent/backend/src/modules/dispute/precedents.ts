/**
 * Dispute Review — precedents: human reviewers' decisions, kept so the AI Judge
 * can calibrate to the team's standards (few-shot examples in its prompt).
 *
 * Stored in a JSON file (PRECEDENTS_FILE) so they survive restarts, unlike the
 * in-memory cases. Only decisions the reviewer marked "use as precedent" are kept.
 */

import fs from 'fs';
import path from 'path';
import { z } from 'zod';
import { env } from '../../config/env';
import { createLogger } from '../../config/logger';
import type { DisputeCase, DisputeType, HumanOverride } from './types';

const logger = createLogger('Precedents');

const recommendation = z.enum(['driver', 'passenger', 'shared', 'inconclusive']);

const precedentSchema = z.object({
  caseNumber: z.string(),
  type: z.enum(['route_deviation', 'no_show_charge', 'property_damage', 'safety_accident']),
  title: z.string(),
  facts: z.string(),
  aiRecommendation: recommendation.optional(),
  aiConfidence: z.number().optional(),
  humanRecommendation: recommendation,
  reason: z.string(),
  decidedBy: z.string().optional(),
  decidedAt: z.string(),
});

export type Precedent = z.infer<typeof precedentSchema>;

// Keeps each example short so a few of them fit the Judge's prompt
const MAX_FACTS_CHARS = 900;

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max)}…` : text);

/** What the case was about, in a few sentences, for the Judge to compare against. */
function caseFacts(c: DisputeCase): string {
  const parts: string[] = [];
  if (c.dataset) parts.push(`Complaint: ${clip(c.dataset.dispute_ticket.description, 400)}`);
  else {
    if (c.driver.statement) parts.push(`Driver says: ${clip(c.driver.statement, 300)}`);
    if (c.passenger.statement) parts.push(`Rider says: ${clip(c.passenger.statement, 300)}`);
  }
  if (c.review?.mode !== 'fallback' && c.review?.summary) parts.push(`AI summary: ${clip(c.review.summary, 400)}`);
  return clip(parts.join('\n'), MAX_FACTS_CHARS);
}

export function precedentFromCase(c: DisputeCase, decision: HumanOverride): Precedent {
  const aiRan = c.review && c.review.mode !== 'fallback';
  return {
    caseNumber: c.caseNumber,
    type: c.type,
    title: c.title,
    facts: caseFacts(c),
    aiRecommendation: aiRan ? c.review!.recommendation : undefined,
    aiConfidence: aiRan ? c.review!.confidenceScore : undefined,
    humanRecommendation: decision.recommendation,
    reason: decision.reason,
    decidedBy: decision.decidedBy,
    decidedAt: decision.decidedAt,
  };
}

let cache: Precedent[] | null = null;

function filePath(): string {
  return path.resolve(env.PRECEDENTS_FILE);
}

function load(): Precedent[] {
  if (cache) return cache;
  try {
    const parsed = z.array(z.unknown()).parse(JSON.parse(fs.readFileSync(filePath(), 'utf8')));
    // Skip entries that were edited by hand into an invalid shape rather than losing them all
    cache = parsed.flatMap((p) => {
      const result = precedentSchema.safeParse(p);
      return result.success ? [result.data] : [];
    });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      logger.warn({ err: err instanceof Error ? err.message : err, file: filePath() }, 'Could not read precedents; starting empty');
    }
    cache = [];
  }
  return cache;
}

function save(list: Precedent[]): void {
  const file = filePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  // Write then rename, so a crash mid-write never leaves a half-written file
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(list, null, 2));
  fs.renameSync(tmp, file);
  cache = list;
}

export const precedentStore = {
  /** Newest first */
  list(): Precedent[] {
    return [...load()].sort((a, b) => b.decidedAt.localeCompare(a.decidedAt));
  },

  /** One precedent per case; a newer decision on the same case replaces it. */
  upsert(p: Precedent): void {
    save([...load().filter((x) => x.caseNumber !== p.caseNumber), p]);
  },

  remove(caseNumber: string): boolean {
    const list = load();
    const next = list.filter((x) => x.caseNumber !== caseNumber);
    if (next.length === list.length) return false;
    save(next);
    return true;
  },

  /**
   * Examples for the Judge: same dispute type only (another type's ruling could
   * mislead), newest first, never the case under review (its own earlier decision
   * must not decide it again).
   */
  select(type: DisputeType, excludeCaseNumber: string, limit = env.PRECEDENT_EXAMPLES): Precedent[] {
    return this.list()
      .filter((p) => p.type === type && p.caseNumber !== excludeCaseNumber)
      .slice(0, limit);
  },
};
