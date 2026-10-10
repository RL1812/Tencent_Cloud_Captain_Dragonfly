/**
 * AgentReview — shows how the three agents handled a case:
 * Rider Advocate and Driver Advocate each present a case, then the Judge rules.
 * Also the human-escalation panel and the human decision card.
 */

import { useState } from 'react';
import {
  AlertTriangle,
  BookMarked,
  Bot,
  BrainCircuit,
  Gavel,
  Gauge,
  Link2,
  ListChecks,
  Loader2,
  Pencil,
  Undo2,
  UserCheck,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  confidenceBarColor,
  confidenceColor,
  formatDateTime,
  recommendationLabels,
} from '@/lib/dispute-utils';
import { cn } from '@/lib/utils';
import type {
  AdvocateSubmission,
  AIReview,
  DisputeCase,
  HumanDecisionInput,
  Recommendation,
} from '@/types/dispute';

// --- Source references (JSON pointers into the case record) ---
export function SourceRefs({ refs }: { refs: string[] }) {
  if (refs.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1 mt-1">
      <Link2 className="w-3 h-3 text-muted-foreground" />
      {refs.map((r) => (
        <code key={r} className="text-[11px] bg-muted px-1.5 py-0.5 rounded font-mono">
          {r}
        </code>
      ))}
    </div>
  );
}

function BulletList({ items }: { items: string[] }) {
  return (
    <ul className="list-disc pl-5 space-y-1 text-sm">
      {items.map((t, i) => (
        <li key={i}>{t}</li>
      ))}
    </ul>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground mb-1.5">{title}</p>
      {children}
    </div>
  );
}

// --- One advocate's case ---
function AdvocateCard({
  title,
  tone,
  a,
}: {
  title: string;
  tone: 'rider' | 'driver';
  a: AdvocateSubmission;
}) {
  const failed = a.mode === 'fallback';
  const toneClass = tone === 'rider' ? 'text-green-700' : 'text-blue-700';
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className={cn('text-base flex items-center gap-2', toneClass)}>
            <Bot className="w-4 h-4" />
            {title}
          </CardTitle>
          {failed ? (
            <Badge variant="outline" className="border-amber-300 text-amber-700">
              Unavailable
            </Badge>
          ) : (
            <span className={cn('text-sm font-semibold', confidenceColor(a.confidenceScore))}>
              Confidence {a.confidenceScore}%
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm leading-relaxed">{a.positionSummary}</p>

        {!failed && (
          <>
            <Section title="Requested outcome">
              <p className="text-sm">{a.requestedOutcome}</p>
            </Section>

            {a.claims.length > 0 && (
              <Section title="Claims">
                <BulletList items={a.claims} />
              </Section>
            )}

            {a.supportingEvidence.length > 0 && (
              <Section title="Supporting evidence">
                <div className="space-y-2">
                  {a.supportingEvidence.map((e, i) => (
                    <div key={i} className="rounded-md bg-muted/50 p-2.5 text-sm">
                      <p>{e.evidence}</p>
                      <p className="text-muted-foreground mt-0.5">{e.relevance}</p>
                      <SourceRefs refs={e.sourceRefs} />
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {a.adverseEvidence.length > 0 && (
              <Section title="Adverse evidence">
                <div className="space-y-2">
                  {a.adverseEvidence.map((e, i) => (
                    <div key={i} className="rounded-md bg-amber-50 p-2.5 text-sm">
                      <p>{e.evidence}</p>
                      <p className="text-muted-foreground mt-0.5">{e.relevance}</p>
                      <SourceRefs refs={e.sourceRefs} />
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {a.policyArguments.length > 0 && (
              <Section title="Policy arguments">
                <div className="space-y-2">
                  {a.policyArguments.map((p, i) => (
                    <div key={i} className="text-sm">
                      <p>{p.argument}</p>
                      <SourceRefs refs={p.sourceRefs} />
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {a.missingEvidence.length > 0 && (
              <Section title="Missing evidence / uncertainties">
                <BulletList items={a.missingEvidence} />
              </Section>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// --- Whole multi-agent process ---
export function AgentTranscript({ review }: { review: AIReview }) {
  const sub = review.advocateSubmissions;
  if (!sub) return null;
  return (
    <div className="mb-6">
      <h2 className="text-xl font-bold mb-1">Multi-agent review</h2>
      <p className="text-sm text-muted-foreground mb-4">
        Prioritization → parallel rider and driver advocacy → Judge decision → confidence-based escalation
      </p>
      {review.priorityAssessment && (
        <Card className="mb-4 border-primary/30 bg-primary/5">
          <CardContent className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <Gauge className="mt-0.5 h-4 w-4 text-primary" />
              <div>
                <p className="text-sm font-semibold">Prioritization Agent</p>
                <p className="text-sm text-muted-foreground">
                  {review.priorityAssessment.reasons.join(' ')}
                </p>
              </div>
            </div>
            <Badge className="w-fit bg-primary text-primary-foreground">
              {review.priorityAssessment.priority.toUpperCase()} · {review.priorityAssessment.targetResponseMinutes} min SLA
            </Badge>
          </CardContent>
        </Card>
      )}
      {review.evidenceValidation && (
        <Card className="mb-4">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <ListChecks className="mt-0.5 h-4 w-4 text-primary" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold">Evidence Validation Agent</p>
                  <Badge variant="outline">
                    {review.evidenceValidation.status} · {review.evidenceValidation.evidenceItemCount} records
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {review.evidenceValidation.checks.join(' ')}
                </p>
                {review.evidenceValidation.warnings.length > 0 && (
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-700">
                    {review.evidenceValidation.warnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <AdvocateCard title="Rider Advocate" tone="rider" a={sub.rider} />
        <AdvocateCard title="Driver Advocate" tone="driver" a={sub.driver} />
      </div>
      <div className="flex items-center gap-2 mt-4 text-sm font-medium">
        <Gavel className="w-4 h-4" />
        The Judge's decision appears in the AI review report below.
      </div>
    </div>
  );
}

// --- Review could not be completed ---
export function FallbackNotice({ review }: { review: AIReview }) {
  if (review.mode !== 'fallback') return null;
  return (
    <div className="mb-4 flex gap-3 rounded-md border border-amber-300 bg-amber-50 p-4 text-sm">
      <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
      <div>
        <p className="font-medium text-amber-800">AI review could not be completed</p>
        <p className="text-amber-700 mt-0.5">
          The model was unavailable or its output failed validation. This fallback is not a decision; the case remains pending and can be retried.
        </p>
      </div>
    </div>
  );
}

// --- Escalation: a human decides ---
const overrideChoices: Recommendation[] = ['driver', 'passenger', 'shared', 'inconclusive'];

export function EscalationPanel({
  reason,
  pending,
  onSubmit,
}: {
  reason: string;
  pending?: boolean;
  onSubmit: (recommendation: Recommendation, reason: string) => void;
}) {
  const [recommendation, setRecommendation] = useState<Recommendation>('driver');
  const [note, setNote] = useState('');
  return (
    <Card className="mb-6 border-amber-300">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2 text-amber-800">
          <UserCheck className="w-4 h-4" />
          Escalated to a human reviewer
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">{reason}</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <Label>Human decision</Label>
            <Select
              value={recommendation}
              onValueChange={(v) => setRecommendation(v as Recommendation)}
            >
              <SelectTrigger className="mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {overrideChoices.map((r) => (
                  <SelectItem key={r} value={r}>
                    {recommendationLabels[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Label>Decision rationale</Label>
            <Textarea
              className="mt-1.5"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Explain the decision. It will be indexed for future knowledge retrieval."
            />
          </div>
        </div>
        <Button size="sm" disabled={pending} onClick={() => onSubmit(recommendation, note)}>
          Submit human decision
        </Button>
      </CardContent>
    </Card>
  );
}

// --- A human has decided ---
export function HumanDecisionCard({ c }: { c: DisputeCase }) {
  const h = c.humanOverride;
  if (!h) return null;
  const ai = c.review;
  return (
    <Card className="mb-6 border-primary/40">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <UserCheck className="w-4 h-4 text-primary" />
          Human decision
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <p>
          <span className="text-muted-foreground">Final outcome: </span>
          <span className="font-semibold">{recommendationLabels[h.recommendation]}</span>
          <span className="text-muted-foreground ml-3">{formatDateTime(h.decidedAt)}</span>
        </p>
        {h.reason && (
          <p>
            <span className="text-muted-foreground">Rationale: </span>
            {h.reason}
          </p>
        )}
        {ai && (
          <p className="text-muted-foreground">
            Original AI decision: {recommendationLabels[ai.recommendation]} (confidence {ai.confidenceScore}%)
            {ai.recommendation !== h.recommendation && ' — overridden by the reviewer'}
          </p>
        )}
        {c.learningFeedback && (
          <div className="flex items-start gap-2 rounded-md bg-muted/60 p-3">
            <BrainCircuit className="mt-0.5 h-4 w-4 text-primary" />
            <div>
              <p className="font-medium">Learning Feedback Agent · {c.learningFeedback.status}</p>
              <p className="text-muted-foreground">{c.learningFeedback.message}</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// --- Full human review: decide, revise, or withdraw at any time ---
export function HumanDecisionPanel({
  c,
  pending,
  onSubmit,
  onWithdraw,
}: {
  c: DisputeCase;
  pending?: boolean;
  onSubmit: (decision: HumanDecisionInput) => Promise<unknown>;
  onWithdraw: () => void;
}) {
  const existing = c.humanOverride;
  const escalated = !existing && !!c.escalation?.needsHuman;
  const [editing, setEditing] = useState(escalated);
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);
  const [recommendation, setRecommendation] = useState<Recommendation>(existing?.recommendation ?? 'driver');
  const [reason, setReason] = useState(existing?.reason ?? '');
  const [decidedBy, setDecidedBy] = useState(existing?.decidedBy ?? '');
  const [useAsPrecedent, setUseAsPrecedent] = useState(existing?.useAsPrecedent ?? true);

  async function submit() {
    await onSubmit({
      recommendation,
      reason: reason.trim(),
      decidedBy: decidedBy.trim() || undefined,
      useAsPrecedent,
    });
    setEditing(false);
  }

  return (
    <Card className={cn('mb-6', escalated ? 'border-amber-300' : existing ? 'border-primary/40' : 'border-dashed')}>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className={cn('text-base flex items-center gap-2', escalated && 'text-amber-800')}>
            <UserCheck className="w-4 h-4" />
            {existing ? 'Human decision' : escalated ? 'Escalated to a human reviewer' : 'Human review'}
            {existing?.useAsPrecedent && (
              <Badge variant="secondary" className="font-normal">
                <BookMarked className="w-3 h-3 mr-1" /> Used as precedent
              </Badge>
            )}
          </CardTitle>
          {!editing && (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                {existing && <Pencil className="w-3.5 h-3.5 mr-1.5" />}
                {existing ? 'Revise' : 'Decide'}
              </Button>
              {existing && (confirmWithdraw ? (
                <>
                  <Button size="sm" variant="destructive" disabled={pending} onClick={onWithdraw}>Confirm withdraw</Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirmWithdraw(false)}>Cancel</Button>
                </>
              ) : (
                <Button size="sm" variant="ghost" onClick={() => setConfirmWithdraw(true)}>
                  <Undo2 className="w-3.5 h-3.5 mr-1.5" /> Withdraw
                </Button>
              ))}
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {editing ? (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <Label>Decision</Label>
                <Select value={recommendation} onValueChange={(value) => setRecommendation(value as Recommendation)}>
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {overrideChoices.map((value) => <SelectItem key={value} value={value}>{recommendationLabels[value]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="decided-by">Reviewer (optional)</Label>
                <Input id="decided-by" className="mt-1.5" value={decidedBy} onChange={(event) => setDecidedBy(event.target.value)} />
              </div>
            </div>
            <div>
              <Label htmlFor="decision-reason">Reason (required)</Label>
              <Textarea id="decision-reason" className="mt-1.5" rows={3} value={reason} onChange={(event) => setReason(event.target.value)} />
            </div>
            <div className="flex items-start gap-2">
              <Checkbox id="use-as-precedent" checked={useAsPrecedent} onCheckedChange={(value) => setUseAsPrecedent(value === true)} />
              <Label htmlFor="use-as-precedent" className="font-normal">
                Use this decision to calibrate the AI Judge on similar disputes
              </Label>
            </div>
            <div className="flex gap-2">
              <Button size="sm" disabled={pending || !reason.trim()} onClick={submit}>
                {pending && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />} Submit decision
              </Button>
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => setEditing(false)}>Cancel</Button>
            </div>
          </>
        ) : existing ? (
          <>
            <p><span className="text-muted-foreground">Final outcome: </span><strong>{recommendationLabels[existing.recommendation]}</strong></p>
            <p><span className="text-muted-foreground">Reason: </span>{existing.reason}</p>
            <p className="text-muted-foreground">{existing.decidedBy ? `${existing.decidedBy} · ` : ''}{formatDateTime(existing.decidedAt)}</p>
            {c.learningFeedback && (
              <div className="flex items-start gap-2 rounded-md bg-muted/60 p-3">
                <BrainCircuit className="mt-0.5 h-4 w-4 text-primary" />
                <p><strong>Learning Feedback Agent · {c.learningFeedback.status}</strong><br />{c.learningFeedback.message}</p>
              </div>
            )}
            {confirmWithdraw && <p className="text-amber-700">Withdrawing removes its precedent and restores the status implied by the AI review.</p>}
          </>
        ) : (
          <p className="text-muted-foreground">
            {c.escalation?.reason || 'A reviewer can decide this case at any time. A human decision overrides the AI result.'}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export function JudgeChecklist({ review }: { review: AIReview }) {
  const items = review.checklist ?? [];
  if (items.length === 0) return null;
  const conflicts = items.filter((item) => item.conflict).length;
  return (
    <Card className="mb-4">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base flex items-center gap-2"><ListChecks className="w-4 h-4" /> Judge checklist</CardTitle>
          <Badge variant="outline" className={conflicts ? 'border-amber-300 text-amber-700' : 'border-green-200 text-green-700'}>
            {conflicts ? `${conflicts} source conflict${conflicts > 1 ? 's' : ''}` : 'No source conflicts'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.map((item) => (
          <div key={item.id} className={cn('rounded-md border p-3 text-sm', item.conflict && 'border-amber-300 bg-amber-50/60')}>
            <p className="font-medium"><span className="font-mono text-muted-foreground mr-1.5">{item.id}</span>{item.item}</p>
            <p className="mt-1">{item.finding}</p>
            <SourceRefs refs={item.sourceRefs} />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function PrecedentsUsed({ review }: { review: AIReview }) {
  const used = review.precedentsUsed ?? [];
  if (used.length === 0) return null;
  return (
    <div className="mb-4 flex gap-2 rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
      <BookMarked className="w-4 h-4 flex-shrink-0 mt-0.5" />
      <p>The Judge used these same-type human precedents to calibrate its standards: <span className="font-mono text-foreground">{used.join(', ')}</span>. They are not evidence in this case.</p>
    </div>
  );
}

// --- Judge's cited sources and open gaps (shown in the report) ---
export function JudgeSources({ review }: { review: AIReview }) {
  const refs = review.sourceRefs ?? [];
  const missing = review.missingEvidence ?? [];
  if (refs.length === 0 && missing.length === 0) return null;
  return (
    <Card className="mb-4">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Sources and evidence gaps</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {refs.length > 0 && (
          <Section title="Records cited by the Judge">
            <SourceRefs refs={refs} />
          </Section>
        )}
        {missing.length > 0 && (
          <Section title="Missing evidence / unresolved conflicts">
            <BulletList items={missing} />
          </Section>
        )}
      </CardContent>
    </Card>
  );
}

export { confidenceBarColor };
