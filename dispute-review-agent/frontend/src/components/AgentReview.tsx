/**
 * AgentReview — shows how the three agents handled a case:
 * Rider Advocate and Driver Advocate each present a case, then the Judge rules.
 * Also the human judge's panel (decide / revise / withdraw at any time), the Judge's
 * required checklist and the human precedents it was shown.
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  BookMarked,
  Bot,
  Gavel,
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
  HumanOverride,
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
              Not generated
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
              <Section title="Missing evidence / open questions">
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
        Step 1: the Rider and Driver Advocates each build their case from the evidence (in parallel) → Step 2: the Judge weighs both and rules
      </p>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <AdvocateCard title="Rider Advocate" tone="rider" a={sub.rider} />
        <AdvocateCard title="Driver Advocate" tone="driver" a={sub.driver} />
      </div>
      <div className="flex items-center gap-2 mt-4 text-sm font-medium">
        <Gavel className="w-4 h-4" />
        The Judge's ruling is in the AI Review Report below
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
        <p className="font-medium text-amber-800">The AI review could not be completed</p>
        <p className="text-amber-700 mt-0.5">
          The model was unavailable or its output failed validation. The result below is a placeholder, not a judgement on the case. The case stays pending; click "Re-run review" to try again.
        </p>
      </div>
    </div>
  );
}

// --- Human judge: decide, revise or withdraw at any time ---
const overrideChoices: Recommendation[] = ['driver', 'passenger', 'shared', 'inconclusive'];

function DecisionForm({
  initial,
  pending,
  onSubmit,
  onCancel,
}: {
  initial?: HumanOverride;
  pending?: boolean;
  onSubmit: (decision: HumanDecisionInput) => Promise<unknown>;
  onCancel?: () => void;
}) {
  const [recommendation, setRecommendation] = useState<Recommendation>(initial?.recommendation ?? 'driver');
  const [reason, setReason] = useState(initial?.reason ?? '');
  const [decidedBy, setDecidedBy] = useState(initial?.decidedBy ?? '');
  const [useAsPrecedent, setUseAsPrecedent] = useState(initial?.useAsPrecedent ?? true);

  async function submit() {
    try {
      await onSubmit({ recommendation, reason: reason.trim(), decidedBy: decidedBy.trim() || undefined, useAsPrecedent });
    } catch {
      // The error is shown as a toast; keep the form open with what was typed
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <Label>Decision</Label>
          <Select value={recommendation} onValueChange={(v) => setRecommendation(v as Recommendation)}>
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
          <Label htmlFor="decided-by">Reviewer (optional)</Label>
          <Input
            id="decided-by"
            className="mt-1.5"
            value={decidedBy}
            onChange={(e) => setDecidedBy(e.target.value)}
            placeholder="e.g. Jane Lim"
          />
        </div>
      </div>
      <div>
        <Label htmlFor="decision-reason">Reason (required)</Label>
        <Textarea
          id="decision-reason"
          className="mt-1.5"
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Explain the basis: which records you relied on and how the policy applies. If kept as a precedent, the AI Judge learns from this reason."
        />
      </div>
      <div className="flex items-start gap-2">
        <Checkbox
          id="use-as-precedent"
          className="mt-0.5"
          checked={useAsPrecedent}
          onCheckedChange={(v) => setUseAsPrecedent(v === true)}
        />
        <Label htmlFor="use-as-precedent" className="font-normal leading-snug">
          Use as a precedent for the AI Judge
          <span className="block text-xs text-muted-foreground mt-0.5">
            When reviewing similar disputes, the AI Judge will refer to this decision and reason (to calibrate its standards only, never as evidence)
          </span>
        </Label>
      </div>
      <div className="flex gap-2">
        <Button size="sm" disabled={pending || !reason.trim()} onClick={submit}>
          {pending && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
          Submit decision
        </Button>
        {onCancel && (
          <Button size="sm" variant="ghost" disabled={pending} onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}

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
  const h = c.humanOverride;
  const escalated = !h && !!c.escalation?.needsHuman;
  const [editing, setEditing] = useState(escalated);
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);
  const ai = c.review && c.review.mode !== 'fallback' ? c.review : undefined;

  const form = (
    <DecisionForm
      initial={h}
      pending={pending}
      onSubmit={async (d) => {
        await onSubmit(d);
        setEditing(false);
      }}
      onCancel={escalated ? undefined : () => setEditing(false)}
    />
  );

  // Already decided by a human
  if (h) {
    return (
      <Card className="mb-6 border-primary/40">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <CardTitle className="text-base flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-primary" />
              Human decision
              {h.useAsPrecedent && (
                <Badge variant="secondary" className="font-normal">
                  <BookMarked className="w-3 h-3 mr-1" />
                  Used as precedent
                </Badge>
              )}
            </CardTitle>
            {!editing && (
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                  <Pencil className="w-3.5 h-3.5 mr-1.5" />
                  Revise
                </Button>
                {confirmWithdraw ? (
                  <>
                    <Button size="sm" variant="destructive" disabled={pending} onClick={onWithdraw}>
                      Confirm withdraw
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirmWithdraw(false)}>
                      Cancel
                    </Button>
                  </>
                ) : (
                  <Button size="sm" variant="ghost" onClick={() => setConfirmWithdraw(true)}>
                    <Undo2 className="w-3.5 h-3.5 mr-1.5" />
                    Withdraw
                  </Button>
                )}
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {editing ? (
            form
          ) : (
            <>
              <p>
                <span className="text-muted-foreground">Final decision: </span>
                <span className="font-semibold">{recommendationLabels[h.recommendation]}</span>
                <span className="text-muted-foreground ml-3">
                  {h.decidedBy ? `${h.decidedBy} · ` : ''}
                  {formatDateTime(h.decidedAt)}
                </span>
              </p>
              <p>
                <span className="text-muted-foreground">Reason: </span>
                {h.reason}
              </p>
              {ai && (
                <p className="text-muted-foreground">
                  AI ruling: {recommendationLabels[ai.recommendation]} (confidence {ai.confidenceScore}%)
                  {ai.recommendation !== h.recommendation && ' — overturned by the reviewer'}
                </p>
              )}
              {confirmWithdraw && (
                <p className="text-amber-700">Withdrawing returns the case to the AI result (or to pending if the AI never reviewed it) and removes its precedent.</p>
              )}
            </>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn('mb-6', escalated ? 'border-amber-300' : 'border-dashed')}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className={cn('text-base flex items-center gap-2', escalated && 'text-amber-800')}>
            <UserCheck className="w-4 h-4" />
            {escalated ? 'Escalated to a human reviewer' : 'Human review'}
          </CardTitle>
          {!editing && (
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
              Decide
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          {escalated
            ? c.escalation!.reason
            : 'A reviewer can decide this case at any time, whether or not the AI has reviewed it. A human decision overrides the AI, and later AI reviews will not overturn it.'}
        </p>
        {editing && form}
      </CardContent>
    </Card>
  );
}

// --- The Judge's required checklist ---
export function JudgeChecklist({ review }: { review: AIReview }) {
  const items = review.checklist ?? [];
  if (items.length === 0) return null;
  const conflicts = items.filter((i) => i.conflict).length;
  return (
    <Card className="mb-4">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <ListChecks className="w-4 h-4 text-muted-foreground" />
            Judge checklist
          </CardTitle>
          {conflicts > 0 ? (
            <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-700">
              {conflicts} source conflict{conflicts > 1 ? 's' : ''}
            </Badge>
          ) : (
            <Badge variant="outline" className="border-green-200 bg-green-50 text-green-700">
              No source conflicts
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.map((i) => (
          <div
            key={i.id}
            className={cn('rounded-md border p-3 text-sm', i.conflict && 'border-amber-300 bg-amber-50/60')}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="font-medium">
                <span className="text-muted-foreground font-mono mr-1.5">{i.id}</span>
                {i.item}
              </p>
              {i.conflict && <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />}
            </div>
            <p className="mt-1 leading-relaxed">{i.finding}</p>
            <SourceRefs refs={i.sourceRefs} />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// --- Which human precedents the Judge was shown ---
export function PrecedentsUsed({ review }: { review: AIReview }) {
  const used = review.precedentsUsed ?? [];
  if (used.length === 0) return null;
  return (
    <div className="mb-4 flex gap-2 rounded-md border bg-muted/40 p-3 text-sm">
      <BookMarked className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
      <p className="text-muted-foreground">
        The Judge was shown {used.length} human precedent{used.length > 1 ? 's' : ''} for this dispute type:{' '}
        <span className="font-mono text-foreground">{used.join(', ')}</span>
        . Precedents only calibrate its standards; they are not evidence in this case.
        <Link to="/precedents" className="ml-1 text-primary hover:underline">
          View precedents
        </Link>
      </p>
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
        <CardTitle className="text-base">Cited sources and missing evidence</CardTitle>
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
