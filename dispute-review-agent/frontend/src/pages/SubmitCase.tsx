/**
 * SubmitCase — Dispute case submission form
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Trash2, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { disputeApi } from '@/lib/dispute-api';
import { getErrorMessage } from '@/lib/api-client';
import { typeLabels, priorityLabels } from '@/lib/dispute-utils';
import type {
  CreateDisputeDTO,
  DisputePriority,
  DisputeType,
  Party,
  TripInfo,
} from '@/types/dispute';

const initialForm: CreateDisputeDTO = {
  title: '',
  priority: 'medium',
  type: 'fare_dispute',
  driver: { name: '', id: '', rating: 5, statement: '' },
  passenger: { name: '', id: '', rating: 5, statement: '' },
  trip: {
    pickupLocation: '',
    dropoffLocation: '',
    pickupTime: '',
    dropoffTime: '',
    fare: 0,
    distance: 0,
    vehicleModel: '',
    plateNumber: '',
  },
  evidence: { description: '', items: [''] },
};

export default function SubmitCase() {
  const navigate = useNavigate();
  const [form, setForm] = useState<CreateDisputeDTO>(initialForm);

  const createMutation = useMutation({
    mutationFn: disputeApi.create,
    onSuccess: (data) => {
      toast.success('案件创建成功');
      navigate(`/cases/${data.id}`);
    },
    onError: (error) => {
      toast.error(getErrorMessage(error));
    },
  });

  // --- Form update helpers ---
  function updateField<K extends keyof CreateDisputeDTO>(
    field: K,
    value: CreateDisputeDTO[K]
  ) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function updateDriver(field: keyof Party, value: string | number) {
    setForm((prev) => ({
      ...prev,
      driver: { ...prev.driver, [field]: value },
    }));
  }

  function updatePassenger(field: keyof Party, value: string | number) {
    setForm((prev) => ({
      ...prev,
      passenger: { ...prev.passenger, [field]: value },
    }));
  }

  function updateTrip(field: keyof TripInfo, value: string | number) {
    setForm((prev) => ({
      ...prev,
      trip: { ...prev.trip, [field]: value },
    }));
  }

  function updateEvidenceItem(index: number, value: string) {
    setForm((prev) => {
      const items = [...prev.evidence.items];
      items[index] = value;
      return { ...prev, evidence: { ...prev.evidence, items } };
    });
  }

  function addEvidenceItem() {
    setForm((prev) => ({
      ...prev,
      evidence: {
        ...prev.evidence,
        items: [...prev.evidence.items, ''],
      },
    }));
  }

  function removeEvidenceItem(index: number) {
    setForm((prev) => ({
      ...prev,
      evidence: {
        ...prev.evidence,
        items: prev.evidence.items.filter((_, i) => i !== index),
      },
    }));
  }

  // --- Validation ---
  function validate(): boolean {
    if (!form.title.trim()) {
      toast.error('请输入案件标题');
      return false;
    }
    if (!form.driver.name.trim() || !form.driver.id.trim()) {
      toast.error('请填写司机姓名和工号');
      return false;
    }
    if (!form.driver.statement.trim()) {
      toast.error('请填写司机陈述');
      return false;
    }
    if (!form.passenger.name.trim() || !form.passenger.id.trim()) {
      toast.error('请填写乘客姓名和账号');
      return false;
    }
    if (!form.passenger.statement.trim()) {
      toast.error('请填写乘客陈述');
      return false;
    }
    if (!form.trip.pickupLocation.trim() || !form.trip.dropoffLocation.trim()) {
      toast.error('请填写行程起点和终点');
      return false;
    }
    if (!form.evidence.description.trim()) {
      toast.error('请填写证据描述');
      return false;
    }
    const validItems = form.evidence.items.filter((i) => i.trim());
    if (validItems.length === 0) {
      toast.error('至少添加一项证据');
      return false;
    }
    return true;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    const payload: CreateDisputeDTO = {
      ...form,
      evidence: {
        ...form.evidence,
        items: form.evidence.items.filter((i) => i.trim()),
      },
    };
    createMutation.mutate(payload);
  }

  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto">
      {/* Page Header */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
        <button onClick={() => navigate('/')} className="hover:text-foreground">
          仪表盘
        </button>
        <ChevronRight className="w-3.5 h-3.5" />
        <span className="text-foreground">提交案件</span>
      </div>
      <h1 className="text-2xl font-bold mb-6">提交新纠纷案件</h1>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Section 1: Case Info */}
        <Card>
          <CardHeader>
            <CardTitle>案件信息</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="title">案件标题</Label>
              <Input
                id="title"
                value={form.title}
                onChange={(e) => updateField('title', e.target.value)}
                placeholder="例：乘客投诉司机绕路导致车费增加"
                className="mt-1.5"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>纠纷类型</Label>
                <Select
                  value={form.type}
                  onValueChange={(v) => updateField('type', v as DisputeType)}
                >
                  <SelectTrigger className="mt-1.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(typeLabels).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>优先级</Label>
                <Select
                  value={form.priority}
                  onValueChange={(v) =>
                    updateField('priority', v as DisputePriority)
                  }
                >
                  <SelectTrigger className="mt-1.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(priorityLabels).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Section 2: Driver Info */}
        <Card>
          <CardHeader>
            <CardTitle>司机信息</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label htmlFor="drv-name">姓名</Label>
                <Input
                  id="drv-name"
                  value={form.driver.name}
                  onChange={(e) => updateDriver('name', e.target.value)}
                  className="mt-1.5"
                  placeholder="张师傅"
                />
              </div>
              <div>
                <Label htmlFor="drv-id">工号</Label>
                <Input
                  id="drv-id"
                  value={form.driver.id}
                  onChange={(e) => updateDriver('id', e.target.value)}
                  className="mt-1.5"
                  placeholder="DRV-0001"
                />
              </div>
              <div>
                <Label htmlFor="drv-rating">评分 (0-5)</Label>
                <Input
                  id="drv-rating"
                  type="number"
                  min="0"
                  max="5"
                  step="0.1"
                  value={form.driver.rating}
                  onChange={(e) =>
                    updateDriver('rating', Number(e.target.value))
                  }
                  className="mt-1.5"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="drv-stmt">司机陈述</Label>
              <Textarea
                id="drv-stmt"
                value={form.driver.statement}
                onChange={(e) => updateDriver('statement', e.target.value)}
                className="mt-1.5"
                rows={4}
                placeholder="请描述司机对事件的陈述..."
              />
            </div>
          </CardContent>
        </Card>

        {/* Section 3: Passenger Info */}
        <Card>
          <CardHeader>
            <CardTitle>乘客信息</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label htmlFor="pas-name">姓名</Label>
                <Input
                  id="pas-name"
                  value={form.passenger.name}
                  onChange={(e) => updatePassenger('name', e.target.value)}
                  className="mt-1.5"
                  placeholder="李先生"
                />
              </div>
              <div>
                <Label htmlFor="pas-id">账号</Label>
                <Input
                  id="pas-id"
                  value={form.passenger.id}
                  onChange={(e) => updatePassenger('id', e.target.value)}
                  className="mt-1.5"
                  placeholder="PAS-0001"
                />
              </div>
              <div>
                <Label htmlFor="pas-rating">评分 (0-5)</Label>
                <Input
                  id="pas-rating"
                  type="number"
                  min="0"
                  max="5"
                  step="0.1"
                  value={form.passenger.rating}
                  onChange={(e) =>
                    updatePassenger('rating', Number(e.target.value))
                  }
                  className="mt-1.5"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="pas-stmt">乘客陈述</Label>
              <Textarea
                id="pas-stmt"
                value={form.passenger.statement}
                onChange={(e) => updatePassenger('statement', e.target.value)}
                className="mt-1.5"
                rows={4}
                placeholder="请描述乘客对事件的陈述..."
              />
            </div>
          </CardContent>
        </Card>

        {/* Section 4: Trip Info */}
        <Card>
          <CardHeader>
            <CardTitle>行程信息</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="pickup">起点</Label>
                <Input
                  id="pickup"
                  value={form.trip.pickupLocation}
                  onChange={(e) =>
                    updateTrip('pickupLocation', e.target.value)
                  }
                  className="mt-1.5"
                  placeholder="例：南山科技园"
                />
              </div>
              <div>
                <Label htmlFor="dropoff">终点</Label>
                <Input
                  id="dropoff"
                  value={form.trip.dropoffLocation}
                  onChange={(e) =>
                    updateTrip('dropoffLocation', e.target.value)
                  }
                  className="mt-1.5"
                  placeholder="例：宝安机场"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="pickup-time">上车时间</Label>
                <Input
                  id="pickup-time"
                  type="datetime-local"
                  value={form.trip.pickupTime}
                  onChange={(e) => updateTrip('pickupTime', e.target.value)}
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label htmlFor="dropoff-time">下车时间</Label>
                <Input
                  id="dropoff-time"
                  type="datetime-local"
                  value={form.trip.dropoffTime}
                  onChange={(e) => updateTrip('dropoffTime', e.target.value)}
                  className="mt-1.5"
                />
              </div>
            </div>
            <div className="grid grid-cols-4 gap-4">
              <div>
                <Label htmlFor="fare">车费 (¥)</Label>
                <Input
                  id="fare"
                  type="number"
                  min="0"
                  value={form.trip.fare}
                  onChange={(e) => updateTrip('fare', Number(e.target.value))}
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label htmlFor="distance">距离 (km)</Label>
                <Input
                  id="distance"
                  type="number"
                  min="0"
                  step="0.1"
                  value={form.trip.distance}
                  onChange={(e) =>
                    updateTrip('distance', Number(e.target.value))
                  }
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label htmlFor="vehicle">车型</Label>
                <Input
                  id="vehicle"
                  value={form.trip.vehicleModel}
                  onChange={(e) => updateTrip('vehicleModel', e.target.value)}
                  className="mt-1.5"
                  placeholder="丰田凯美瑞"
                />
              </div>
              <div>
                <Label htmlFor="plate">车牌号</Label>
                <Input
                  id="plate"
                  value={form.trip.plateNumber}
                  onChange={(e) => updateTrip('plateNumber', e.target.value)}
                  className="mt-1.5"
                  placeholder="粤B·G3F92"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Section 5: Evidence */}
        <Card>
          <CardHeader>
            <CardTitle>证据信息</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="evidence-desc">证据描述</Label>
              <Input
                id="evidence-desc"
                value={form.evidence.description}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    evidence: { ...prev.evidence, description: e.target.value },
                  }))
                }
                className="mt-1.5"
                placeholder="例：车内录音和行车记录仪已调取"
              />
            </div>
            <div>
              <Label>证据清单</Label>
              <div className="space-y-2 mt-1.5">
                {form.evidence.items.map((item, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <Input
                      value={item}
                      onChange={(e) => updateEvidenceItem(index, e.target.value)}
                      placeholder={`证据 ${index + 1}`}
                    />
                    {form.evidence.items.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeEvidenceItem(index)}
                      >
                        <Trash2 className="w-4 h-4 text-muted-foreground" />
                      </Button>
                    )}
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addEvidenceItem}
                >
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  添加证据项
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Submit */}
        <div className="flex items-center justify-end gap-3 pb-8">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate('/')}
          >
            取消
          </Button>
          <Button type="submit" disabled={createMutation.isPending}>
            {createMutation.isPending ? '提交中...' : '提交案件'}
          </Button>
        </div>
      </form>
    </div>
  );
}
