import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import type {
  AdvocateCase,
  AgentInput,
  EscalationDecision,
  EvidenceValidation,
  JudgeReview,
  MultiAgentReview,
  PriorityAssessment,
  ReviewWorkflowStatus,
} from './contracts';
import { runDriverAdvocate } from './driver-advocate';
import { runEscalationAgent } from './escalation-agent';
import { runEvidenceValidationAgent } from './evidence-validation-agent';
import { runJudge } from './judge';
import { runPrioritizationAgent } from './prioritization-agent';
import { runRiderAdvocate } from './rider-advocate';
import { disputeId, validateInput } from './shared';
import { disputeType } from './checklist';
import { precedentStore } from '../precedents';

const ReviewState = Annotation.Root({
  input: Annotation<AgentInput>(),
  priorityAssessment: Annotation<PriorityAssessment>(),
  evidenceValidation: Annotation<EvidenceValidation>(),
  rider: Annotation<AdvocateCase>(),
  driver: Annotation<AdvocateCase>(),
  ruling: Annotation<JudgeReview>(),
  escalation: Annotation<EscalationDecision>(),
  workflowStatus: Annotation<ReviewWorkflowStatus>(),
});

/**
 * LangGraph workflow: priority -> evidence validation -> parallel advocates ->
 * Judge -> confidence routing -> automatic resolution or human intervention.
 */
export const disputeReviewGraph = new StateGraph(ReviewState)
  .addNode('prioritization', (state) => ({
    priorityAssessment: runPrioritizationAgent(state.input),
  }))
  .addNode('evidence_validation', (state) => ({
    evidenceValidation: runEvidenceValidationAgent(state.input),
  }))
  .addNode('rider_advocate', async (state) => ({
    rider: await runRiderAdvocate(state.input),
  }))
  .addNode('driver_advocate', async (state) => ({
    driver: await runDriverAdvocate(state.input),
  }))
  .addNode('judge', async (state) => ({
    ruling: await runJudge(
      state.input,
      state.rider,
      state.driver,
      precedentStore.select(disputeType(state.input), disputeId(state.input))
    ),
  }))
  .addNode('confidence_escalation', (state) => ({
    escalation: runEscalationAgent(state.ruling),
  }))
  .addNode('automatic_resolution', () => ({
    workflowStatus: 'auto_resolved' as const,
  }))
  .addNode('human_intervention', () => ({
    workflowStatus: 'human_intervention_required' as const,
  }))
  .addEdge(START, 'prioritization')
  .addEdge('prioritization', 'evidence_validation')
  .addEdge('evidence_validation', 'rider_advocate')
  .addEdge('evidence_validation', 'driver_advocate')
  .addEdge(['rider_advocate', 'driver_advocate'], 'judge')
  .addEdge('judge', 'confidence_escalation')
  .addConditionalEdges(
    'confidence_escalation',
    (state) => state.escalation.needsHuman ? 'human' : 'automatic',
    { human: 'human_intervention', automatic: 'automatic_resolution' }
  )
  .addEdge('automatic_resolution', END)
  .addEdge('human_intervention', END)
  .compile();

export async function reviewDispute(input: AgentInput): Promise<MultiAgentReview> {
  const state = await disputeReviewGraph.invoke({ input: validateInput(input) });
  if (!state.ruling || !state.rider || !state.driver || !state.priorityAssessment ||
      !state.evidenceValidation || !state.escalation || !state.workflowStatus) {
    throw new Error('LangGraph review finished without a complete workflow state.');
  }
  return {
    ...state.ruling,
    advocateSubmissions: { rider: state.rider, driver: state.driver },
    priorityAssessment: state.priorityAssessment,
    evidenceValidation: state.evidenceValidation,
    escalation: state.escalation,
    workflowStatus: state.workflowStatus,
  };
}
