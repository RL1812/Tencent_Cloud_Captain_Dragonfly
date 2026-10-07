/**
 * EvidenceEditor — shared evidence UI: grouped list + add form.
 * Used on the submit page (before the case exists) and the case detail page.
 * Evidence can be text and/or an attached file (photo, PDF, anything).
 */

import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { FileText, Loader2, Paperclip, Plus, Trash2 } from 'lucide-react';
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
import { evidenceKindLabels, evidencePartyLabels } from '@/lib/dispute-utils';
import type { EvidenceKind, EvidenceParty, NewEvidence } from '@/types/dispute';

function isImage(item: NewEvidence): boolean {
  return !!item.fileUrl && !!item.mimeType?.startsWith('image/');
}

// --- Grouped list (driver / rider) ---
export function EvidenceList({
  items,
  onRemove,
}: {
  items: NewEvidence[];
  onRemove?: (index: number) => void;
}) {
  const parties: EvidenceParty[] = ['driver', 'rider', 'platform'];
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {parties.map((party) => {
        const group = items
          .map((item, index) => ({ item, index }))
          .filter(({ item }) => item.party === party);
        return (
          <div key={party}>
            <p className="text-sm font-medium mb-2">
              {party === 'platform' ? '平台记录' : `${evidencePartyLabels[party]}方证据`}（{group.length}）
            </p>
            {group.length === 0 ? (
              <p className="text-sm text-muted-foreground">暂无证据</p>
            ) : (
              <div className="space-y-2">
                {group.map(({ item, index }) => (
                  <div key={index} className="rounded-md border p-3 text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                        <span className="font-medium truncate">{item.title}</span>
                        <span className="text-xs text-muted-foreground flex-shrink-0">
                          {evidenceKindLabels[item.kind]}
                        </span>
                      </div>
                      {onRemove && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => onRemove(index)}
                        >
                          <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                        </Button>
                      )}
                    </div>
                    {item.content && (
                      <p className="mt-1.5 text-muted-foreground whitespace-pre-wrap break-words">
                        {item.content}
                      </p>
                    )}
                    {item.fileUrl &&
                      (isImage(item) ? (
                        <a href={item.fileUrl} target="_blank" rel="noreferrer">
                          <img
                            src={item.fileUrl}
                            alt={item.fileName || item.title}
                            className="mt-2 max-h-48 rounded border object-contain"
                          />
                        </a>
                      ) : (
                        <a
                          href={item.fileUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-2 flex items-center gap-1.5 text-primary hover:underline break-all"
                        >
                          <Paperclip className="w-3.5 h-3.5 flex-shrink-0" />
                          {item.fileName || '查看附件'}
                        </a>
                      ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// --- Add form ---
export function EvidenceForm({
  onAdd,
  pending,
}: {
  onAdd: (evidence: NewEvidence) => void;
  pending?: boolean;
}) {
  const [party, setParty] = useState<EvidenceParty>('driver');
  const [kind, setKind] = useState<EvidenceKind>('text');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0] ?? null;
    setFile(picked);
    if (picked) {
      if (picked.type.startsWith('image/') && kind === 'text') setKind('photo');
      if (!title) setTitle(picked.name);
    }
  }

  async function handleAdd() {
    let attachment: Pick<NewEvidence, 'fileName' | 'fileUrl' | 'mimeType'> = {};
    if (file) {
      setUploading(true);
      try {
        const uploaded = await disputeApi.uploadFile(file);
        attachment = {
          fileName: uploaded.fileName,
          fileUrl: uploaded.fileUrl,
          mimeType: uploaded.mimeType,
        };
      } catch (error) {
        toast.error(getErrorMessage(error));
        setUploading(false);
        return;
      }
      setUploading(false);
    }
    onAdd({ party, kind, title, content, ...attachment });
    setTitle('');
    setContent('');
    setFile(null);
    if (fileInput.current) fileInput.current.value = '';
  }

  return (
    <div className="rounded-md border border-dashed p-4 space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <Label>上传方</Label>
          <Select value={party} onValueChange={(v) => setParty(v as EvidenceParty)}>
            <SelectTrigger className="mt-1.5">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(evidencePartyLabels).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>证据类型</Label>
          <Select value={kind} onValueChange={(v) => setKind(v as EvidenceKind)}>
            <SelectTrigger className="mt-1.5">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(evidenceKindLabels).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>标题</Label>
          <Input
            className="mt-1.5"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="例：与司机的聊天记录"
          />
        </div>
      </div>
      <div>
        <Label>内容</Label>
        <Textarea
          className="mt-1.5"
          rows={3}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="粘贴聊天记录、GPS 数据点、付款明细，或文字说明"
        />
      </div>
      <div>
        <Label>附件（照片、PDF 等，可选）</Label>
        <input
          ref={fileInput}
          type="file"
          onChange={handleFileChange}
          className="mt-1.5 block w-full cursor-pointer rounded-md border border-input bg-transparent px-3 py-1.5 text-sm shadow-xs file:mr-3 file:border-0 file:bg-transparent file:text-sm file:font-medium"
        />
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleAdd}
        disabled={pending || uploading}
      >
        {uploading ? (
          <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
        ) : (
          <Plus className="w-3.5 h-3.5 mr-1" />
        )}
        {uploading ? '上传中...' : '添加证据'}
      </Button>
    </div>
  );
}
