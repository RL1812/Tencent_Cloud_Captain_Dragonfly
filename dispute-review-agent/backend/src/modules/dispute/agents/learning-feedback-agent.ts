import { isDatabaseReady } from '../../../config/database';
import { createLogger } from '../../../config/logger';
import { ingestText } from '../../knowledge/ingest';
import { getDocument } from '../../knowledge/repository';
import type { DisputeCase, LearningFeedback } from '../types';

const logger = createLogger('LearningFeedbackAgent');

function feedbackText(dispute: DisputeCase): string {
  const human = dispute.humanOverride!;
  const ai = dispute.review;
  return [
    `Human-reviewed dispute outcome: ${dispute.caseNumber}`,
    `Dispute type: ${dispute.type}`,
    `Case title: ${dispute.title}`,
    `AI recommendation: ${ai?.recommendation ?? 'not available'}`,
    `AI confidence: ${ai?.confidenceScore ?? 'not available'}`,
    `Human decision: ${human.recommendation}`,
    `Human rationale: ${human.reason || 'No rationale supplied'}`,
    `Overrode AI outcome: ${ai ? ai.recommendation !== human.recommendation : 'not applicable'}`,
    `Decision time: ${human.decidedAt}`,
  ].join('\n');
}

/** Stores a reviewed outcome as case-scoped knowledge. This is RAG feedback, not model fine-tuning. */
export async function runLearningFeedbackAgent(dispute: DisputeCase): Promise<LearningFeedback> {
  const recordedAt = new Date().toISOString();
  if (!dispute.humanOverride) {
    return { agent: 'learning_feedback_agent', status: 'skipped', message: 'No human override to learn from.', recordedAt };
  }
  if (!isDatabaseReady()) {
    return {
      agent: 'learning_feedback_agent',
      status: 'skipped',
      message: 'Knowledge base is offline; the human decision remains saved in the case record.',
      recordedAt,
    };
  }

  try {
    const result = await ingestText({
      // Store a generalized, name-free outcome globally so later cases can retrieve it.
      caseId: null,
      title: `Human review feedback — ${dispute.caseNumber}`,
      text: feedbackText(dispute),
    });
    await result.done;
    const document = await getDocument(result.document.id);
    const indexed = document?.status === 'ready';
    return {
      agent: 'learning_feedback_agent',
      status: indexed ? 'indexed' : 'failed',
      message: indexed
        ? 'Human override indexed in the knowledge base.'
        : document?.error || 'Knowledge-base indexing did not complete.',
      documentId: result.document.id,
      recordedAt,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn({ caseId: dispute.id, error: message }, 'Could not index human-review feedback');
    return { agent: 'learning_feedback_agent', status: 'failed', message, recordedAt };
  }
}
