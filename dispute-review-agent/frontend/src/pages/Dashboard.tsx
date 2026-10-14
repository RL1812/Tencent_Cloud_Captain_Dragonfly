/**
 * Dashboard — Dispute case overview with stats and case list
 */

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import {
  Loader2,
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
  const navigate = useNavigate();
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

  // The most urgent case still waiting for a decision
  const nextCase = useMemo(() => {
    const open = (cases ?? []).filter((c) => c.status !== 'resolved');
    return [...open].sort(
      (a, b) =>
        priorityRank[b.priority] - priorityRank[a.priority] ||
        (Date.parse(a.createdAt) || 0) - (Date.parse(b.createdAt) || 0)
    )[0];
  }, [cases]);

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto">
      {/* Hero: the queue at a glance and the one thing to do next */}
      <section className="relative mb-6 overflow-hidden rounded-2xl bg-gradient-to-br from-[#ee4a72] via-[#e93864] to-[#b8264f] px-5 py-6 md:px-8 md:py-8 text-white shadow-md">
        <div className="pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full bg-white/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 left-1/3 h-64 w-64 rounded-full bg-[#7a1633]/30 blur-3xl" />
        <div className="relative grid gap-8 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <h1 className="text-3xl md:text-4xl font-extrabold leading-tight">
              {stats === undefined
                ? 'Loading queue…'
                : stats.pending > 0
                  ? `${stats.pending} ${stats.pending === 1 ? 'case is' : 'cases are'} waiting for review`
                  : 'The queue is clear'}
            </h1>
            <div className="mt-6 flex flex-wrap gap-3">
              {nextCase && (
                <Link to={`/cases/${nextCase.id}`}>
                  <Button size="lg" className="bg-white text-primary hover:bg-white/90">
                    Open most urgent case
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
              )}
              <Link to="/submit">
                <Button size="lg" variant="outline" className="border-white/40 bg-transparent text-white hover:bg-white/15 hover:text-white">
                  <FilePlus className="mr-2 h-4 w-4" />
                  Submit new case
                </Button>
              </Link>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3 lg:w-96">
            {[
              { label: 'Total', value: stats?.total },
              { label: 'Under review', value: stats?.underReview },
              { label: 'Resolved', value: stats?.resolved },
            ].map((t) => (
              <div key={t.label} className="rounded-xl bg-white/15 px-4 py-4 ring-1 ring-white/20">
                <div className="text-3xl font-extrabold">{t.value ?? '--'}</div>
                <div className="mt-1 text-xs text-white/65">{t.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Case List */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-lg">Dispute cases</CardTitle>
          </div>
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
                  <SortHead label="Title" sortKey="title" sort={sort} onSort={handleSort} className="w-full" />
                  <SortHead label="Created" sortKey="createdAt" sort={sort} onSort={handleSort} className="hidden lg:table-cell" />
                  <SortHead label="Type" sortKey="type" sort={sort} onSort={handleSort} className="hidden xl:table-cell" />
                  <SortHead label="Priority" sortKey="priority" sort={sort} onSort={handleSort} />
                  <SortHead label="Status" sortKey="status" sort={sort} onSort={handleSort} />
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedCases?.map((c) => (
                  <TableRow key={c.id} className="cursor-pointer hover:bg-accent/40" onClick={() => navigate(`/cases/${c.id}`)}>
                    <TableCell className="font-mono text-sm text-muted-foreground">
                      {c.caseNumber}
                    </TableCell>
                    <TableCell className="w-full max-w-0 font-medium">
                      <span className="block min-w-40 truncate" title={c.title}>{c.title}</span>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                      {formatDateTime(c.createdAt)}
                    </TableCell>
                    <TableCell className="hidden xl:table-cell">
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
