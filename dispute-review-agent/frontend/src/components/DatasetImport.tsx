/**
 * DatasetImport — turn a sample dataset (e.g. DISP-002, DISP-003) into a case.
 * Accepts the .json file or the sample .md (the JSON block is extracted).
 */

import { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Database, Loader2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { disputeApi } from '@/lib/dispute-api';
import { getErrorMessage } from '@/lib/api-client';

const SAMPLES = [
  { file: 'disp-002.json', label: 'Load sample DISP-002 (no-show charge)' },
  { file: 'disp-003.json', label: 'Load sample DISP-003 (route deviation)' },
];

function extractJson(text: string): unknown {
  const block = text.match(/```json\s*([\s\S]*?)```/i);
  return JSON.parse(block ? block[1] : text);
}

export function DatasetImport() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);

  const importMutation = useMutation({
    mutationFn: disputeApi.importDataset,
    onSuccess: ({ case: c, existing }) => {
      queryClient.invalidateQueries({ queryKey: ['disputes'] });
      queryClient.invalidateQueries({ queryKey: ['dispute-stats'] });
      if (existing) toast.info(`${c.caseNumber} was already imported. Opening the existing case.`);
      else toast.success(`Imported ${c.caseNumber}`);
      navigate(`/cases/${c.id}`);
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  async function loadSample(file: string) {
    try {
      const res = await fetch(`/samples/${file}`);
      importMutation.mutate(await res.json());
    } catch {
      toast.error('Could not load the sample dataset.');
    }
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      importMutation.mutate(extractJson(await file.text()));
    } catch {
      toast.error('The file is not a valid JSON dataset.');
    }
    if (fileInput.current) fileInput.current.value = '';
  }

  return (
    <Card className="mb-5">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Database className="w-4 h-4" />
          Import dataset
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Create a case directly from a dataset containing GPS, chat, app events, fare, and policy data.
          Supported dispute types: no-show charge and route deviation.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          {SAMPLES.map((sample) => (
            <Button
              key={sample.file}
              type="button"
              onClick={() => loadSample(sample.file)}
              disabled={importMutation.isPending}
            >
              {importMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
              ) : (
                <Database className="w-4 h-4 mr-1.5" />
              )}
              {sample.label}
            </Button>
          ))}
          <Button
            type="button"
            variant="outline"
            disabled={importMutation.isPending}
            onClick={() => fileInput.current?.click()}
          >
            <Upload className="w-4 h-4 mr-1.5" />
            Choose dataset file (.json / .md)
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept=".json,.md,.txt"
            className="hidden"
            onChange={handleFile}
          />
        </div>
      </CardContent>
    </Card>
  );
}
