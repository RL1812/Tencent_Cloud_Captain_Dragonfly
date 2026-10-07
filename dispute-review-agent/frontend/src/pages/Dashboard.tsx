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
          <h1 className="text-2xl font-bold">纠纷审查仪表盘</h1>
          <p className="text-sm text-muted-foreground mt-1">
            滴滴司乘纠纷智能审查系统 — 案件总览与AI裁决
          </p>
        </div>
        <Link to="/submit">
          <Button>
            <FilePlus className="w-4 h-4 mr-2" />
            提交新案件
          </Button>
        </Link>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          label="总案件数"
          value={stats?.total}
          icon={ClipboardList}
          iconClass="bg-blue-50 text-blue-600"
        />
        <StatCard
          label="待审查"
          value={stats?.pending}
          icon={Clock}
          iconClass="bg-amber-50 text-amber-600"
        />
        <StatCard
          label="审查中"
          value={stats?.underReview}
          icon={Search}
          iconClass="bg-purple-50 text-purple-600"
        />
        <StatCard
          label="已裁决"
          value={stats?.resolved}
          icon={CheckCircle2}
          iconClass="bg-green-50 text-green-600"
        />
      </div>

      {/* Case List */}
      <Card>
        <CardHeader>
          <CardTitle>纠纷案件列表</CardTitle>
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
                  <TableHead>案件编号</TableHead>
                  <TableHead className="min-w-[200px]">标题</TableHead>
                  <TableHead>类型</TableHead>
                  <TableHead>优先级</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>创建时间</TableHead>
                  <TableHead className="text-right">操作</TableHead>
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
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDateTime(c.createdAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Link to={`/cases/${c.id}`}>
                        <Button variant="ghost" size="sm">
                          查看详情
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
