/**
 * CaseDetail — Dispute case detail with AI review
 */

import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Car,
  User,
  MapPin,
  Clock,
  DollarSign,
  Route as RouteIcon,
  FileText,
  Scale,
  Loader2,
  CheckCircle,
  Gavel,
  Shield,
  Target,
  BookOpen,
  Lightbulb,
  FileSearch,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EvidenceForm, EvidenceList } from '@/components/EvidenceEditor';
import { disputeApi } from '@/lib/dispute-api';
import {
  typeLabels,
  priorityLabels,
  statusLabels,
  recommendationLabels,
  statusBadgeClass,
  priorityBadgeClass,
  recommendationColor,
  confidenceColor,
  confidenceBarColor,
  formatDateTime,
} from '@/lib/dispute-utils';
import { cn } from '@/lib/utils';
import type { DisputeCase, AIReview, NewEvidence, Party } from '@/types/dispute';

// --- Party Card ---
function PartyCard({ title, party, icon: Icon }: { title: string; party: Party; icon: React.ElementType }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-muted-foreground" />
          <CardTitle className="text-base">{title}</CardTitle>
          <Badge variant="secondary" className="ml-auto">
            {party.rating} / 5.0
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-sm text-muted-foreground mb-1">
          {party.name} · {party.id}
        </div>
        <p className="text-sm leading-relaxed mt-2">{party.statement}</p>
      </CardContent>
    </Card>
  );
}

// --- Trip Detail Row ---
function TripDetail({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="w-4 h-4 text-muted-foreground flex-shrink-0" />
      <div>
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-sm font-medium">{value}</div>
      </div>
    </div>
  );
}

// --- AI Review Content ---
function AIReviewContent({ review }: { review: AIReview }) {
  const recColor = recommendationColor(review.recommendation);

  return (
    <div className="space-y-4">
      {/* Section Header */}
      <div className="flex items-center gap-2 pt-2">
        <Scale className="w-5 h-5 text-primary" />
        <h2 className="text-xl font-bold">AI 审查报告</h2>
        <span className="text-sm text-muted-foreground ml-auto">
          审查时间：{formatDateTime(review.reviewedAt)}
        </span>
      </div>

      {/* Recommendation Banner */}
      <div className={cn('rounded-lg border p-6', recColor.bg)}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground mb-1">AI 裁决建议</p>
            <p className={cn('text-2xl font-bold', recColor.text)}>
              {recommendationLabels[review.recommendation]}
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm text-muted-foreground mb-1">置信度</p>
            <p className={cn('text-2xl font-bold', confidenceColor(review.confidenceScore))}>
              {review.confidenceScore}%
            </p>
          </div>
        </div>
        {/* Confidence Bar */}
        <div className="mt-3 w-full bg-gray-200 rounded-full h-2 overflow-hidden">
          <div
            className={cn('h-2 rounded-full transition-all duration-500', confidenceBarColor(review.confidenceScore))}
            style={{ width: `${review.confidenceScore}%` }}
          />
        </div>
      </div>

      {/* Summary */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-muted-foreground" />
            <CardTitle className="text-base">案件摘要</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-relaxed">{review.summary}</p>
        </CardContent>
      </Card>

      {/* Key Issues */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Target className="w-4 h-4 text-muted-foreground" />
            <CardTitle className="text-base">关键争议点</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2.5">
            {review.keyIssues.map((issue, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-muted text-muted-foreground flex items-center justify-center text-xs font-medium">
                  {i + 1}
                </span>
                <span className="leading-relaxed">{issue}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* Analysis: Driver vs Passenger */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Car className="w-4 h-4 text-blue-500" />
              <CardTitle className="text-base text-blue-700">司机方分析</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-relaxed">{review.driverPerspective}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-green-500" />
              <CardTitle className="text-base text-green-700">乘客方分析</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-relaxed">{review.passengerPerspective}</p>
          </CardContent>
        </Card>
      </div>

      {/* Evidence Analysis */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <FileSearch className="w-4 h-4 text-muted-foreground" />
            <CardTitle className="text-base">证据分析</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-relaxed">{review.evidenceAnalysis}</p>
        </CardContent>
      </Card>

      {/* Policy References */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-muted-foreground" />
            <CardTitle className="text-base">适用规则</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {review.policyReferences.map((policy, i) => (
              <Badge key={i} variant="secondary" className="text-xs">
                {policy}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Recommendation Reasoning */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Gavel className="w-4 h-4 text-muted-foreground" />
            <CardTitle className="text-base">裁决理由</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-relaxed">{review.recommendationReasoning}</p>
        </CardContent>
      </Card>

      {/* Confidence Reasoning */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-muted-foreground" />
            <CardTitle className="text-base">置信度说明</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-relaxed">{review.confidenceReasoning}</p>
        </CardContent>
      </Card>

      {/* Suggested Actions */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Lightbulb className="w-4 h-4 text-muted-foreground" />
            <CardTitle className="text-base">建议措施</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <ol className="space-y-2.5">
            {review.suggestedActions.map((action, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm">
                <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                <span className="leading-relaxed">{action}</span>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}

// --- Main Component ---
export default function CaseDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: caseData, isLoading } = useQuery({
    queryKey: ['dispute', id],
    queryFn: () => disputeApi.getById(id!),
    enabled: !!id,
  });

  const reviewMutation = useMutation({
    mutationFn: () => disputeApi.review(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dispute', id] });
      toast.success('AI审查完成');
    },
    onError: (error) => {
      const msg = error instanceof Error ? error.message : 'AI审查失败，请稍后重试';
      toast.error(msg);
    },
  });

  const evidenceMutation = useMutation({
    mutationFn: (evidence: NewEvidence) => disputeApi.addEvidence(id!, evidence),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dispute', id] });
      toast.success('证据已添加');
    },
    onError: (error) => {
      const msg = error instanceof Error ? error.message : '添加证据失败';
      toast.error(msg);
    },
  });

  if (isLoading || !caseData) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const c: DisputeCase = caseData;

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto">
      {/* Breadcrumb */}
      <button
        onClick={() => navigate('/')}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        返回案件列表
      </button>

      {/* Case Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <span className="font-mono text-sm text-muted-foreground">{c.caseNumber}</span>
          <Badge variant="outline" className={statusBadgeClass(c.status)}>
            {statusLabels[c.status]}
          </Badge>
          <Badge variant="outline" className={priorityBadgeClass(c.priority)}>
            {priorityLabels[c.priority]}
          </Badge>
          <Badge variant="outline">{typeLabels[c.type]}</Badge>
        </div>
        <h1 className="text-2xl font-bold">{c.title}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          创建时间：{formatDateTime(c.createdAt)}
        </p>
      </div>

      {/* Driver vs Passenger */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <PartyCard title="司机" party={c.driver} icon={Car} />
        <PartyCard title="乘客" party={c.passenger} icon={User} />
      </div>

      {/* Trip Details */}
      <Card className="mb-4">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">行程信息</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <TripDetail icon={MapPin} label="起点" value={c.trip.pickupLocation} />
            <TripDetail icon={MapPin} label="终点" value={c.trip.dropoffLocation} />
            <TripDetail icon={Clock} label="上车时间" value={formatDateTime(c.trip.pickupTime)} />
            <TripDetail icon={Clock} label="下车时间" value={formatDateTime(c.trip.dropoffTime)} />
            <TripDetail icon={DollarSign} label="车费" value={`¥${c.trip.fare}`} />
            <TripDetail icon={RouteIcon} label="距离" value={`${c.trip.distance} km`} />
            <TripDetail icon={Car} label="车型" value={c.trip.vehicleModel} />
            <TripDetail icon={Car} label="车牌" value={c.trip.plateNumber} />
          </div>
        </CardContent>
      </Card>

      {/* Evidence */}
      <Card className="mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">证据信息</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <EvidenceList items={c.evidence} />
          <EvidenceForm
            onAdd={(evidence) => evidenceMutation.mutate(evidence)}
            pending={evidenceMutation.isPending}
          />
        </CardContent>
      </Card>

      {/* AI Review Section */}
      {reviewMutation.isPending ? (
        <Card>
          <CardContent className="py-16">
            <div className="flex flex-col items-center">
              <Loader2 className="w-10 h-10 animate-spin text-primary mb-4" />
              <p className="font-medium">AI Agent 正在审查纠纷</p>
              <p className="text-sm text-muted-foreground mt-1 max-w-md text-center">
                正在分析双方陈述、交叉验证证据、匹配平台规则...通常需要10-30秒
              </p>
            </div>
          </CardContent>
        </Card>
      ) : c.review ? (
        <AIReviewContent review={c.review} />
      ) : (
        <Card className="border-dashed border-2">
          <CardContent className="py-16">
            <div className="flex flex-col items-center">
              <div className="flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
                <Scale className="w-8 h-8 text-primary" />
              </div>
              <p className="font-medium text-lg mb-1">此案件尚未进行AI审查</p>
              <p className="text-sm text-muted-foreground mb-5 max-w-md text-center">
                AI Agent 将自动分析双方陈述、交叉验证证据，并基于平台规则给出裁决建议和置信度评分
              </p>
              <Button size="lg" onClick={() => reviewMutation.mutate()}>
                <Scale className="w-4 h-4 mr-2" />
                启动AI审查
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
