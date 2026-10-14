/**
 * DateTimeField — an English date and time picker.
 *
 * The browser's native datetime-local control and its calendar popup follow the
 * operating-system language (for example Chinese month and weekday names), so
 * this component builds the picker from the app's own calendar instead.
 * The value is a local "YYYY-MM-DDTHH:mm" string (empty when unset).
 */

import { useState } from 'react';
import { CalendarIcon } from 'lucide-react';
import { enUS } from 'react-day-picker/locale';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

const pad = (n: number | string) => String(n).padStart(2, '0');

function toDateString(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function clampDigits(raw: string, max: number): string {
  const digits = raw.replace(/\D/g, '').slice(0, 2);
  if (digits === '') return '';
  return Number(digits) > max ? String(max) : digits;
}

export function DateTimeField({
  id,
  value,
  onChange,
  placeholder = 'Select date and time',
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  // While typing, show exactly what was typed (no zero padding); pad when the field loses focus
  const [draft, setDraft] = useState<{ hh: string | null; mm: string | null }>({ hh: null, mm: null });
  const [date = '', time = ''] = value ? value.split('T') : [];
  const [hh = '', mm = ''] = time.split(':');
  const selected = date ? new Date(`${date}T00:00:00`) : undefined;

  function commit(nextDate: string, nextHh: string, nextMm: string) {
    const d = nextDate || toDateString(new Date());
    onChange(`${d}T${pad(nextHh || '0')}:${pad(nextMm || '0')}`);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          className="mt-1.5 w-full justify-start font-normal"
        >
          <CalendarIcon className="mr-2 h-4 w-4 text-muted-foreground" />
          {value ? (
            value.replace('T', ' ')
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          locale={enUS}
          selected={selected}
          defaultMonth={selected}
          onSelect={(d) => d && commit(toDateString(d), hh, mm)}
        />
        <div className="flex items-center gap-2 border-t p-3">
          <span className="text-sm text-muted-foreground">Time</span>
          <Input
            aria-label="Hour"
            inputMode="numeric"
            placeholder="HH"
            className="h-8 w-14 text-center"
            value={draft.hh ?? hh}
            onChange={(e) => {
              const v = clampDigits(e.target.value, 23);
              setDraft((d) => ({ ...d, hh: v }));
              commit(date, v, mm);
            }}
            onBlur={() => setDraft((d) => ({ ...d, hh: null }))}
          />
          <span>:</span>
          <Input
            aria-label="Minute"
            inputMode="numeric"
            placeholder="MM"
            className="h-8 w-14 text-center"
            value={draft.mm ?? mm}
            onChange={(e) => {
              const v = clampDigits(e.target.value, 59);
              setDraft((d) => ({ ...d, mm: v }));
              commit(date, hh, v);
            }}
            onBlur={() => setDraft((d) => ({ ...d, mm: null }))}
          />
          <Button type="button" size="sm" className="ml-auto" onClick={() => setOpen(false)}>
            Done
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
