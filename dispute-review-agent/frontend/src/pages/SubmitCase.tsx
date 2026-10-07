/**
 * SubmitCase — Dispute case submission form
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ChevronRight } from 'lucide-react';
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
import { DatasetImport } from '@/components/DatasetImport';
import { EvidenceForm, EvidenceList } from '@/components/EvidenceEditor';
import { disputeApi } from '@/lib/dispute-api';
import { getErrorMessage } from '@/lib/api-client';
import { typeLabels, priorityLabels } from '@/lib/dispute-utils';
import type {
  CreateDisputeDTO,
  DisputePriority,
  DisputeType,
  NewEvidence,
  Party,
  TripInfo,
} from '@/types/dispute';

const initialForm: CreateDisputeDTO = {
  title: '',
  priority: 'medium',
  type: 'route_deviation',
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
  evidence: [],
};

export default function SubmitCase() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<CreateDisputeDTO>(initialForm);

  const createMutation = useMutation({
    mutationFn: disputeApi.create,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['disputes'] });
      queryClient.invalidateQueries({ queryKey: ['dispute-stats'] });
      toast.success('Case created');
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

  function addEvidence(evidence: NewEvidence) {
    setForm((prev) => ({ ...prev, evidence: [...prev.evidence, evidence] }));
  }

  function removeEvidence(index: number) {
    setForm((prev) => ({
      ...prev,
      evidence: prev.evidence.filter((_, i) => i !== index),
    }));
  }

  // --- Validation ---
  // No input restrictions: any text (or none) is accepted.
  function validate(): boolean {
    return true;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    createMutation.mutate(form);
  }

  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto">
      {/* Page Header */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
        <button onClick={() => navigate('/')} className="hover:text-foreground">
          Dashboard
        </button>
        <ChevronRight className="w-3.5 h-3.5" />
        <span className="text-foreground">Submit case</span>
      </div>
      <h1 className="text-2xl font-bold mb-6">Submit a new dispute</h1>

      <DatasetImport />

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Section 1: Case Info */}
        <Card>
          <CardHeader>
            <CardTitle>Case</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={form.title}
                onChange={(e) => updateField('title', e.target.value)}
                placeholder="e.g. Rider says the driver took a longer route and overcharged"
                className="mt-1.5"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Dispute type</Label>
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
                <Label>Priority</Label>
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
            <CardTitle>Driver</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label htmlFor="drv-name">Name</Label>
                <Input
                  id="drv-name"
                  value={form.driver.name}
                  onChange={(e) => updateDriver('name', e.target.value)}
                  className="mt-1.5"
                  placeholder="e.g. Ahmad Tan"
                />
              </div>
              <div>
                <Label htmlFor="drv-id">Driver ID</Label>
                <Input
                  id="drv-id"
                  value={form.driver.id}
                  onChange={(e) => updateDriver('id', e.target.value)}
                  className="mt-1.5"
                  placeholder="DRV-0001"
                />
              </div>
              <div>
                <Label htmlFor="drv-rating">Rating (0-5)</Label>
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
              <Label htmlFor="drv-stmt">Driver statement</Label>
              <Textarea
                id="drv-stmt"
                value={form.driver.statement}
                onChange={(e) => updateDriver('statement', e.target.value)}
                className="mt-1.5"
                rows={4}
                placeholder="The driver's account of what happened..."
              />
            </div>
          </CardContent>
        </Card>

        {/* Section 3: Passenger Info */}
        <Card>
          <CardHeader>
            <CardTitle>Rider</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label htmlFor="pas-name">Name</Label>
                <Input
                  id="pas-name"
                  value={form.passenger.name}
                  onChange={(e) => updatePassenger('name', e.target.value)}
                  className="mt-1.5"
                  placeholder="e.g. Mei Ling"
                />
              </div>
              <div>
                <Label htmlFor="pas-id">Rider ID</Label>
                <Input
                  id="pas-id"
                  value={form.passenger.id}
                  onChange={(e) => updatePassenger('id', e.target.value)}
                  className="mt-1.5"
                  placeholder="PAS-0001"
                />
              </div>
              <div>
                <Label htmlFor="pas-rating">Rating (0-5)</Label>
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
              <Label htmlFor="pas-stmt">Rider statement</Label>
              <Textarea
                id="pas-stmt"
                value={form.passenger.statement}
                onChange={(e) => updatePassenger('statement', e.target.value)}
                className="mt-1.5"
                rows={4}
                placeholder="The rider's account of what happened..."
              />
            </div>
          </CardContent>
        </Card>

        {/* Section 4: Trip Info */}
        <Card>
          <CardHeader>
            <CardTitle>Trip</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="pickup">Pickup</Label>
                <Input
                  id="pickup"
                  value={form.trip.pickupLocation}
                  onChange={(e) =>
                    updateTrip('pickupLocation', e.target.value)
                  }
                  className="mt-1.5"
                  placeholder="e.g. Tiong Bahru Plaza"
                />
              </div>
              <div>
                <Label htmlFor="dropoff">Drop-off</Label>
                <Input
                  id="dropoff"
                  value={form.trip.dropoffLocation}
                  onChange={(e) =>
                    updateTrip('dropoffLocation', e.target.value)
                  }
                  className="mt-1.5"
                  placeholder="e.g. Changi Airport T3"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="pickup-time">Pickup time</Label>
                <Input
                  id="pickup-time"
                  type="datetime-local"
                  value={form.trip.pickupTime}
                  onChange={(e) => updateTrip('pickupTime', e.target.value)}
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label htmlFor="dropoff-time">Drop-off time</Label>
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
                <Label htmlFor="fare">Fare (¥)</Label>
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
                <Label htmlFor="distance">Distance (km)</Label>
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
                <Label htmlFor="vehicle">Vehicle</Label>
                <Input
                  id="vehicle"
                  value={form.trip.vehicleModel}
                  onChange={(e) => updateTrip('vehicleModel', e.target.value)}
                  className="mt-1.5"
                  placeholder="e.g. Toyota Camry"
                />
              </div>
              <div>
                <Label htmlFor="plate">Plate</Label>
                <Input
                  id="plate"
                  value={form.trip.plateNumber}
                  onChange={(e) => updateTrip('plateNumber', e.target.value)}
                  className="mt-1.5"
                  placeholder="e.g. SGP 4521 M"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Section 5: Evidence */}
        <Card>
          <CardHeader>
            <CardTitle>Evidence</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <EvidenceList items={form.evidence} onRemove={removeEvidence} />
            <EvidenceForm onAdd={addEvidence} />
          </CardContent>
        </Card>

        {/* Submit */}
        <div className="flex items-center justify-end gap-3 pb-8">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate('/')}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={createMutation.isPending}>
            {createMutation.isPending ? 'Submitting...' : 'Submit case'}
          </Button>
        </div>
      </form>
    </div>
  );
}
