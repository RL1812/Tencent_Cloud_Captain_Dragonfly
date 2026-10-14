/**
 * Dashboard — Dispute case overview with stats and case list
 */

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Loader2,
  ClipboardList,
  Clock,
  Search,
  CheckCircle2,
  ArrowRight,
  ArrowDown,
  ArrowUp,
  ChevronsUpDown,
  FilePlus,
} from 'lucide-react';
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
import type { DisputeCase } from '@/types/dispute';

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


// --- Sortable columns -------------------------------------------------------
type SortKey = 'caseNumber' | 'title' | 'createdAt' | 'type' | 'priority' | 'status';
type SortDir = 'asc' | 'desc';
interface SortState {
  key: SortKey | null;
  dir: SortDir;
}

const priorityRank: Record<DisputeCase['priority'], number> = { low: 0, medium: 1, high: 2, urgent: 3 };
const statusRank: Record<DisputeCase['status'], number> = { pending: 0, under_review: 1, resolved: 2 };

/** Natural, case-insensitive text comparison ("DR-2024-002" < "DR-2024-010"). */
const compareText = (a: string, b: string) =>
  a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' });

/** Titles sort by their first letter, ignoring leading symbols such as "[DISP-003]". */
const titleKey = (title: string) => title.replace(/^[^A-Za-z0-9]+/, '');

function compareBy(a: DisputeCase, b: DisputeCase, key: SortKey): number {
  switch (key) {
    case 'caseNumber':
      return compareText(a.caseNumber, b.caseNumber);
    case 'title':
      return compareText(titleKey(a.title), titleKey(b.title));
    case 'createdAt':
      return (Date.parse(a.createdAt) || 0) - (Date.parse(b.createdAt) || 0);
    case 'type':
      return compareText(typeLabels[a.type], typeLabels[b.type]);
    case 'priority':
      return priorityRank[a.priority] - priorityRank[b.priority];
    case 'status':
      return statusRank[a.status] - statusRank[b.status];
  }
}

function SortHead({
  label,
  sortKey,
  sort,
  onSort,
  className,
}: {
  label: string;
  sortKey: SortKey;
  sort: SortState;
  onSort: (key: SortKey) => void;
  className?: string;
}) {
  const active = sort.key === sortKey;
  const Icon = !active ? ChevronsUpDown : sort.dir === 'asc' ? ArrowUp : ArrowDown;
  return (
    <TableHead
      className={className}
      aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          'inline-flex items-center gap-1 rounded -ml-1 px-1 py-0.5 hover:text-foreground',
          active ? 'text-foreground' : 'text-muted-foreground'
        )}
        title={`Sort by ${label.toLowerCase()}`}
      >
        {label}
        <Icon className={cn('w-3.5 h-3.5', !active && 'opacity-40')} />
      </button>
    </TableHead>
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

  // First click on a column sorts descending, the second ascending, then it toggles.
  // No column is active at first; the list then shows the newest cases on top.
  const [sort, setSort] = useState<SortState>({ key: null, dir: 'desc' });
  const handleSort = (key: SortKey) =>
    setSort((prev) =>
      prev.key === key ? { key, dir: prev.dir === 'desc' ? 'asc' : 'desc' } : { key, dir: 'desc' }
    );
  const sortedCases = useMemo(() => {
    if (!cases) return cases;
    if (!sort.key) {
      return [...cases].sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0));
    }
    const key = sort.key;
    const sign = sort.dir === 'asc' ? 1 : -1;
    return [...cases].sort(
      (a, b) =>
        sign * compareBy(a, b, key) ||
        (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0) ||
        compareText(a.caseNumber, b.caseNumber)
    );
  }, [cases, sort]);

  return (
    <div className="p-6 lg:p-8">
      {/* Page Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Dispute review dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Ryde Resolve — prioritized, evidence-grounded reviews with human oversight
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
                  <SortHead label="Case number" sortKey="caseNumber" sort={sort} onSort={handleSort} />
                  <SortHead label="Title" sortKey="title" sort={sort} onSort={handleSort} className="min-w-[200px]" />
                  <SortHead label="Created" sortKey="createdAt" sort={sort} onSort={handleSort} />
                  <SortHead label="Type" sortKey="type" sort={sort} onSort={handleSort} />
                  <SortHead label="Priority" sortKey="priority" sort={sort} onSort={handleSort} />
                  <SortHead label="Status" sortKey="status" sort={sort} onSort={handleSort} />
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedCases?.map((c) => (
                  <TableRow key={c.id} className="hover:bg-muted/50">
                    <TableCell className="font-mono text-sm text-muted-foreground">
                      {c.caseNumber}
                    </TableCell>
                    <TableCell className="font-medium">{c.title}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDateTime(c.createdAt)}
                    </TableCell>
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
                          Human review
                        </Badge>
                      )}
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
