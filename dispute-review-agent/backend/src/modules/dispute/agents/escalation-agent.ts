import type { EscalationDecision, JudgeReview } from './contracts';

/** Below this Judge confidence, the case must be decided by a human reviewer. */
export const ESCALATION_THRESHOLD = 60;

export function runEscalationAgent<T extends Pick<JudgeReview, 'mode' | 'recommendation' | 'confidenceScore'>>(
  review: T,
  threshold = ESCALATION_THRESHOLD
): EscalationDecision {
  const triggers: string[] = [];

  // A provider/validation failure is retryable and is not treated as a merits escalation.
  if (review.mode !== 'fallback') {
    if (review.recommendation === 'inconclusive') triggers.push('Judge recommendation is inconclusive.');
    if (review.confidenceScore < threshold) {
      triggers.push(`Judge confidence ${review.confidenceScore}% is below the ${threshold}% threshold.`);
    }
  }

  return {
    agent: 'escalation_agent',
    needsHuman: triggers.length > 0,
    reason:
      review.mode === 'fallback'
        ? 'AI review did not complete. Retry the review before escalating on the merits.'
        : triggers.join(' ') || 'Judge confidence meets the automated-resolution threshold.',
    triggers,
    confidenceThreshold: threshold,
    evaluatedAt: new Date().toISOString(),
  };
}
