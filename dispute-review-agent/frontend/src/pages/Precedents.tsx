/**
 * Precedents — human decisions the AI Judge learns from.
 * Reviewers can see exactly what the AI is shown and remove any entry.
 */

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { BookMarked, Loader2, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { disputeApi } from '@/lib/dispute-api';
import { getErrorMessage } from '@/lib/api-client';
import { formatDateTime, recommendationLabels, typeLabels } from '@/lib/dispute-utils';
import type { Precedent } from '@/types/dispute';

function PrecedentCard({ p, onDelete, deleting }: { p: Precedent; onDelete: () => void; deleting: boolean }) {
  const [confirm, setConfirm] = useState(false);
  const overturned = p.aiRecommendation && p.aiRecommendation !== p.humanRecommendation;
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="font-mono text-sm text-muted-foreground">{p.caseNumber}</span>
              <Badge variant="outline">{typeLabels[p.type]}</Badge>
            </div>
            <CardTitle className="text-base">{p.title}</CardTitle>
          </div>
          {confirm ? (
            <div className="flex gap-2 flex-shrink-0">
              <Button size="sm" variant="destructive" disabled={deleting} onClick={onDelete}>
                Confirm delete
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirm(false)}>
                Cancel
              </Button>
            </div>
          ) : (
            <Button size="sm" variant="ghost" className="flex-shrink-0" onClick={() => setConfirm(true)}>
              <Trash2 className="w-3.5 h-3.5 mr-1.5" />
              Delete
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <p>
          <span className="text-muted-foreground">Human decision: </span>
          <span className="font-semibold">{recommendationLabels[p.humanRecommendation]}</span>
          {p.aiRecommendation && (
            <span className="text-muted-foreground ml-3">
              AI: {recommendationLabels[p.aiRecommendation]} ({p.aiConfidence}%)
              {overturned && ' — overturned'}
            </span>
          )}
        </p>
        <p>
          <span className="text-muted-foreground">Reason: </span>
          {p.reason}
        </p>
        <p className="text-muted-foreground whitespace-pre-wrap">{p.facts}</p>
        <p className="text-xs text-muted-foreground">
          {p.decidedBy ? `${p.decidedBy} · ` : ''}
          {formatDateTime(p.decidedAt)}
        </p>
      </CardContent>
    </Card>
  );
}

export default function Precedents() {
  const queryClient = useQueryClient();
  const { data: precedents, isLoading } = useQuery({
    queryKey: ['precedents'],
    queryFn: disputeApi.getPrecedents,
  });

  const deleteMutation = useMutation({
    mutationFn: disputeApi.deletePrecedent,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['precedents'] });
      queryClient.invalidateQueries({ queryKey: ['dispute'] });
      toast.success('Precedent deleted; the AI Judge will no longer use it');
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <BookMarked className="w-6 h-6" />
        Precedents
      </h1>
      <p className="text-sm text-muted-foreground mt-1 mb-6">
        Human decisions marked "use as a precedent" are kept here. When the AI Judge reviews a dispute of the same type, it is shown the most recent few to calibrate its standards.
        Precedents are never treated as evidence, and a case is never shown its own decision.
      </p>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : !precedents?.length ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No precedents yet. Make a human decision on a case page and tick "Use as a precedent for the AI Judge" to add one.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {precedents.map((p) => (
            <PrecedentCard
              key={p.caseNumber}
              p={p}
              deleting={deleteMutation.isPending}
              onDelete={() => deleteMutation.mutate(p.caseNumber)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
