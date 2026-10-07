/**
 * DatasetImport — turn a sample dataset (e.g. DISP-002) into a case.
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
      if (existing) toast.info(`${c.caseNumber} was already imported; opened the existing case`);
      else toast.success(`Imported ${c.caseNumber}`);
      navigate(`/cases/${c.id}`);
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  async function loadSample() {
    try {
      const res = await fetch('/samples/disp-002.json');
      importMutation.mutate(await res.json());
    } catch {
      toast.error('Could not load the sample dataset');
    }
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      importMutation.mutate(extractJson(await file.text()));
    } catch {
      toast.error('The file is not a valid JSON dataset');
    }
    if (fileInput.current) fileInput.current.value = '';
  }

  return (
    <Card className="mb-5">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Database className="w-4 h-4" />
          Import a dataset
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Create a case straight from a dataset (GPS, chat logs, app events, cancellation policy) instead of filling in the form.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={loadSample} disabled={importMutation.isPending}>
            {importMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
            ) : (
              <Database className="w-4 h-4 mr-1.5" />
            )}
            Load sample DISP-002 (no-show charge)
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={importMutation.isPending}
            onClick={() => fileInput.current?.click()}
          >
            <Upload className="w-4 h-4 mr-1.5" />
            Choose a dataset file (.json / .md)
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
