/**
 * AgentReview — shows how the three agents handled a case:
 * Rider Advocate and Driver Advocate each present a case, then the Judge rules.
 * Also the human-escalation panel and the human decision card.
 */

import { useState } from 'react';
import { AlertTriangle, Bot, Gavel, Link2, UserCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
              未生成
            </Badge>
          ) : (
            <span className={cn('text-sm font-semibold', confidenceColor(a.confidenceScore))}>
              置信度 {a.confidenceScore}%
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm leading-relaxed">{a.positionSummary}</p>

        {!failed && (
          <>
            <Section title="请求的结果">
              <p className="text-sm">{a.requestedOutcome}</p>
            </Section>

            {a.claims.length > 0 && (
              <Section title="主张">
                <BulletList items={a.claims} />
              </Section>
            )}

            {a.supportingEvidence.length > 0 && (
              <Section title="支持己方的证据">
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
              <Section title="对己方不利的证据">
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
              <Section title="引用的政策">
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
              <Section title="缺失的证据 / 存疑之处">
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
      <h2 className="text-xl font-bold mb-1">多智能体审查过程</h2>
      <p className="text-sm text-muted-foreground mb-4">
        第一步：骑手代理与司机代理各自取证并陈词（并行） → 第二步：法官综合双方陈词作出裁决
      </p>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <AdvocateCard title="骑手代理（Rider Advocate）" tone="rider" a={sub.rider} />
        <AdvocateCard title="司机代理（Driver Advocate）" tone="driver" a={sub.driver} />
      </div>
      <div className="flex items-center gap-2 mt-4 text-sm font-medium">
        <Gavel className="w-4 h-4" />
        法官裁决见下方「AI 审查报告」
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
        <p className="font-medium text-amber-800">AI 审查未能完成</p>
        <p className="text-amber-700 mt-0.5">
          模型不可用或输出未通过校验，以下为降级结果，不代表对案件的判断。案件保持待审查，可点击「重新审查」重试。
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
          已转人工审核
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">{reason}</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <Label>人工裁决</Label>
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
            <Label>裁决理由</Label>
            <Textarea
              className="mt-1.5"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="说明人工裁决的依据（将记录下来，供系统后续学习）"
            />
          </div>
        </div>
        <Button size="sm" disabled={pending} onClick={() => onSubmit(recommendation, note)}>
          提交人工裁决
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
          人工裁决
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <p>
          <span className="text-muted-foreground">最终裁决：</span>
          <span className="font-semibold">{recommendationLabels[h.recommendation]}</span>
          <span className="text-muted-foreground ml-3">{formatDateTime(h.decidedAt)}</span>
        </p>
        {h.reason && (
          <p>
            <span className="text-muted-foreground">理由：</span>
            {h.reason}
          </p>
        )}
        {ai && (
          <p className="text-muted-foreground">
            AI 原裁决：{recommendationLabels[ai.recommendation]}（置信度 {ai.confidenceScore}%）
            {ai.recommendation !== h.recommendation && ' — 已被人工改判'}
          </p>
        )}
      </CardContent>
    </Card>
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
        <CardTitle className="text-base">引用来源与缺失证据</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {refs.length > 0 && (
          <Section title="法官引用的记录">
            <SourceRefs refs={refs} />
          </Section>
        )}
        {missing.length > 0 && (
          <Section title="缺失的证据 / 未解决的冲突">
            <BulletList items={missing} />
          </Section>
        )}
      </CardContent>
    </Card>
  );
}

export { confidenceBarColor };
