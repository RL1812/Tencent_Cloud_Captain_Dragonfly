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
  RefreshCw,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  AgentTranscript,
  EscalationPanel,
  FallbackNotice,
  HumanDecisionCard,
  JudgeSources,
} from '@/components/AgentReview';
import { EvidenceForm, EvidenceList } from '@/components/EvidenceEditor';
import { disputeApi } from '@/lib/dispute-api';
import { getErrorMessage } from '@/lib/api-client';
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
  formatFare,
} from '@/lib/dispute-utils';
import { cn } from '@/lib/utils';
import type { DisputeCase, AIReview, NewEvidence, Party, Recommendation } from '@/types/dispute';

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
        <h2 className="text-xl font-bold">AI review report</h2>
        <span className="text-sm text-muted-foreground ml-auto">
          Reviewed: {formatDateTime(review.reviewedAt)}
        </span>
      </div>

      {/* Recommendation Banner */}
      <div className={cn('rounded-lg border p-6', recColor.bg)}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground mb-1">AI recommendation</p>
            <p className={cn('text-2xl font-bold', recColor.text)}>
              {recommendationLabels[review.recommendation]}
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm text-muted-foreground mb-1">Confidence</p>
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
            <CardTitle className="text-base">Case summary</CardTitle>
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
            <CardTitle className="text-base">Key issues</CardTitle>
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
              <CardTitle className="text-base text-blue-700">Driver analysis</CardTitle>
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
              <CardTitle className="text-base text-green-700">Rider analysis</CardTitle>
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
            <CardTitle className="text-base">Evidence analysis</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-relaxed">{review.evidenceAnalysis}</p>
        </CardContent>
      </Card>

      <JudgeSources review={review} />

      {/* Policy References */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-muted-foreground" />
            <CardTitle className="text-base">Applicable policy</CardTitle>
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
            <CardTitle className="text-base">Decision reasoning</CardTitle>
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
            <CardTitle className="text-base">Confidence rationale</CardTitle>
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
            <CardTitle className="text-base">Suggested actions</CardTitle>
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

  const { data: caseData, isLoading, isError, error } = useQuery({
    queryKey: ['dispute', id],
    queryFn: () => disputeApi.getById(id!),
    enabled: !!id,
  });

  // The case's status shows on the dashboard too, so refresh both
  function refreshCase() {
    queryClient.invalidateQueries({ queryKey: ['dispute', id] });
    queryClient.invalidateQueries({ queryKey: ['disputes'] });
    queryClient.invalidateQueries({ queryKey: ['dispute-stats'] });
  }

  const reviewMutation = useMutation({
    mutationFn: () => disputeApi.review(id!),
    onSuccess: (updated) => {
      refreshCase();
      if (updated.review?.mode === 'fallback') toast.warning('AI review could not be completed. Try again later.');
      else toast.success('AI review completed.');
    },
    onError: (error) => {
      // The status was set to "under review" while the agents ran
      refreshCase();
      toast.error(getErrorMessage(error));
    },
  });

  const evidenceMutation = useMutation({
    mutationFn: (evidence: NewEvidence) => disputeApi.addEvidence(id!, evidence),
    onSuccess: () => {
      refreshCase();
      toast.success('Evidence added.');
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const overrideMutation = useMutation({
    mutationFn: ({ rec, reason }: { rec: Recommendation; reason: string }) =>
      disputeApi.override(id!, rec, reason),
    onSuccess: () => {
      refreshCase();
      toast.success('Human decision recorded.');
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  if (isError) {
    return (
      <div className="p-6 lg:p-8 max-w-5xl mx-auto">
        <p className="text-sm text-muted-foreground mb-4">{getErrorMessage(error)}</p>
        <Button variant="outline" size="sm" onClick={() => navigate('/')}>
          <ArrowLeft className="w-3.5 h-3.5 mr-1.5" />
          Back to cases
        </Button>
      </div>
    );
  }

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
        Back to cases
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
          Created: {formatDateTime(c.createdAt)}
        </p>
      </div>

      {/* Driver vs Passenger */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <PartyCard title="Driver" party={c.driver} icon={Car} />
        <PartyCard title="Rider" party={c.passenger} icon={User} />
      </div>

      {/* Trip Details */}
      <Card className="mb-4">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Trip information</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <TripDetail icon={MapPin} label="Pickup" value={c.trip.pickupLocation} />
            <TripDetail icon={MapPin} label="Drop-off" value={c.trip.dropoffLocation} />
            <TripDetail icon={Clock} label="Pickup time" value={formatDateTime(c.trip.pickupTime)} />
            <TripDetail icon={Clock} label="Drop-off time" value={formatDateTime(c.trip.dropoffTime)} />
            <TripDetail icon={DollarSign} label="Fare" value={formatFare(c.trip.fare, c.trip.currency)} />
            <TripDetail icon={RouteIcon} label="Distance" value={`${c.trip.distance} km`} />
            <TripDetail icon={Car} label="Vehicle" value={c.trip.vehicleModel} />
            <TripDetail icon={Car} label="Licence plate" value={c.trip.plateNumber} />
          </div>
        </CardContent>
      </Card>

      {/* Evidence */}
      <Card className="mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Evidence</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <EvidenceList items={c.evidence} />
          <EvidenceForm
            onAdd={(evidence) => evidenceMutation.mutate(evidence)}
            pending={evidenceMutation.isPending}
          />
        </CardContent>
      </Card>

      {c.dataset != null && (
        <p className="text-xs text-muted-foreground mb-4">
          This case was imported from a sample dataset. The AI reviews the original dataset; evidence added afterward is not included in that review.
        </p>
      )}

      {/* Multi-agent process (re-review also works for reviews from the old single-agent flow) */}
      {c.review && !reviewMutation.isPending && (
        <>
          <div className="flex justify-end mb-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => reviewMutation.mutate()}
            >
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
              Run review again
            </Button>
          </div>
          <FallbackNotice review={c.review} />
          <AgentTranscript review={c.review} />
        </>
      )}

      {/* Human escalation / decision */}
      {c.escalation?.needsHuman && !reviewMutation.isPending && (
        <EscalationPanel
          reason={c.escalation.reason}
          pending={overrideMutation.isPending}
          onSubmit={(rec, reason) => overrideMutation.mutate({ rec, reason })}
        />
      )}
      <HumanDecisionCard c={c} />

      {/* AI Review Section */}
      {reviewMutation.isPending ? (
        <Card>
          <CardContent className="py-16">
            <div className="flex flex-col items-center">
              <Loader2 className="w-10 h-10 animate-spin text-primary mb-4" />
              <p className="font-medium">AI agents are reviewing this dispute</p>
              <p className="text-sm text-muted-foreground mt-1 max-w-md text-center">
                The rider and driver advocates are preparing parallel cases, followed by the Judge. This usually takes 1–3 minutes.
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
              <p className="font-medium text-lg mb-1">This case has not been reviewed by AI</p>
              <p className="text-sm text-muted-foreground mb-5 max-w-md text-center">
                The agents analyze both accounts, cross-check the evidence, apply platform policy, and provide a recommendation with a confidence score.
              </p>
              <Button size="lg" onClick={() => reviewMutation.mutate()}>
                <Scale className="w-4 h-4 mr-2" />
                Start AI review
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
