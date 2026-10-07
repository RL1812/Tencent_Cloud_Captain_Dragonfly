/**
 * Dashboard — Dispute case overview with stats and case list
 */

import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Loader2, ClipboardList, Clock, Search, CheckCircle2, ArrowRight, FilePlus } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { disputeApi } from '@/lib/dispute-api';
import {
  typeLabels,
  priorityLabels,
  statusLabels,
  statusBadgeClass,
  priorityBadgeClass,
  formatDateTime,
} from '@/lib/dispute-utils';
import { cn } from '@/lib/utils';

interface StatCardProps {
  label: string;
  value: number | undefined;
  icon: React.ElementType;
  iconClass: string;
}

function StatCard({ label, value, icon: Icon, iconClass }: StatCardProps) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="text-3xl font-bold mt-1">
              {value !== undefined ? value : '--'}
            </p>
          </div>
          <div className={cn('flex items-center justify-center w-12 h-12 rounded-lg', iconClass)}>
            <Icon className="w-6 h-6" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { data: stats } = useQuery({
    queryKey: ['dispute-stats'],
    queryFn: disputeApi.getStats,
  });

  const { data: cases, isLoading } = useQuery({
    queryKey: ['disputes'],
    queryFn: disputeApi.getAll,
  });

  return (
    <div className="p-6 lg:p-8">
      {/* Page Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Dispute Review Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Driver–rider dispute review — case overview and AI rulings
          </p>
        </div>
        <Link to="/submit">
          <Button>
            <FilePlus className="w-4 h-4 mr-2" />
            Submit new case
          </Button>
        </Link>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          label="Total cases"
          value={stats?.total}
          icon={ClipboardList}
          iconClass="bg-blue-50 text-blue-600"
        />
        <StatCard
          label="Pending"
          value={stats?.pending}
          icon={Clock}
          iconClass="bg-amber-50 text-amber-600"
        />
        <StatCard
          label="Under review"
          value={stats?.underReview}
          icon={Search}
          iconClass="bg-purple-50 text-purple-600"
        />
        <StatCard
          label="Resolved"
          value={stats?.resolved}
          icon={CheckCircle2}
          iconClass="bg-green-50 text-green-600"
        />
      </div>

      {/* Case List */}
      <Card>
        <CardHeader>
          <CardTitle>Dispute cases</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Case no.</TableHead>
                  <TableHead className="min-w-[200px]">Title</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cases?.map((c) => (
                  <TableRow key={c.id} className="hover:bg-muted/50">
                    <TableCell className="font-mono text-sm text-muted-foreground">
                      {c.caseNumber}
                    </TableCell>
                    <TableCell className="font-medium">{c.title}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{typeLabels[c.type]}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={priorityBadgeClass(c.priority)}
                      >
                        {priorityLabels[c.priority]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={statusBadgeClass(c.status)}
                      >
                        {statusLabels[c.status]}
                      </Badge>
                      {c.escalation?.needsHuman && (
                        <Badge
                          variant="outline"
                          className="ml-1.5 border-amber-300 bg-amber-50 text-amber-700"
                        >
                          Needs human
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDateTime(c.createdAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Link to={`/cases/${c.id}`}>
                        <Button variant="ghost" size="sm">
                          View details
                          <ArrowRight className="w-3.5 h-3.5 ml-1" />
                        </Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
