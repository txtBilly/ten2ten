'use client';

import { useEffect, useState } from 'react';
import { EMPTY_FILTERS, type BrowseFilters } from '@/lib/listings';

const fieldClass =
  'w-full rounded-lg border border-white/15 bg-ink/40 px-3 py-2.5 text-paper placeholder:text-muted/60 outline-none focus-visible:ring-2 focus-visible:ring-gold';
const labelClass = 'mb-1.5 block text-sm text-muted';

export function FiltersSheet({
  open,
  filters,
  todayStr,
  labels,
  onApply,
  onClose,
}: {
  open: boolean;
  filters: BrowseFilters;
  todayStr: string;
  labels: {
    title: string;
    rentMin: string;
    rentMax: string;
    zip: string;
    moveInBy: string;
    laundry: string;
    petsOk: string;
    elevator: string;
    walkUp: string;
    doorman: string;
    outdoor: string;
    noFee: string;
    apply: string;
    clear: string;
    close: string;
  };
  onApply: (filters: BrowseFilters) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<BrowseFilters>(filters);

  useEffect(() => {
    if (open) setDraft(filters);
  }, [open, filters]);

  if (!open) return null;

  const amenities: { key: keyof BrowseFilters; label: string }[] = [
    { key: 'laundry', label: labels.laundry },
    { key: 'petsOk', label: labels.petsOk },
    { key: 'elevator', label: labels.elevator },
    { key: 'walkUp', label: labels.walkUp },
    { key: 'doorman', label: labels.doorman },
    { key: 'outdoor', label: labels.outdoor },
    { key: 'noFee', label: labels.noFee },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/70 sm:items-center" role="dialog" aria-modal="true">
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-white/10 bg-ink p-6 sm:rounded-2xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="font-display text-xl text-paper">{labels.title}</h2>
          <button onClick={onClose} aria-label={labels.close} className="text-muted hover:text-paper">
            ✕
          </button>
        </div>

        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="rent-min" className={labelClass}>
                {labels.rentMin}
              </label>
              <input
                id="rent-min"
                type="number"
                min={0}
                step={1}
                value={draft.rentMin}
                onChange={(e) => setDraft((cur) => ({ ...cur, rentMin: e.target.value }))}
                className={fieldClass}
              />
            </div>
            <div>
              <label htmlFor="rent-max" className={labelClass}>
                {labels.rentMax}
              </label>
              <input
                id="rent-max"
                type="number"
                min={0}
                step={1}
                value={draft.rentMax}
                onChange={(e) => setDraft((cur) => ({ ...cur, rentMax: e.target.value }))}
                className={fieldClass}
              />
            </div>
          </div>

          <div>
            <label htmlFor="filter-zip" className={labelClass}>
              {labels.zip}
            </label>
            <input
              id="filter-zip"
              type="text"
              inputMode="numeric"
              value={draft.zip}
              onChange={(e) => setDraft((cur) => ({ ...cur, zip: e.target.value }))}
              className={fieldClass}
            />
          </div>

          <div>
            <label htmlFor="move-in-by" className={labelClass}>
              {labels.moveInBy}
            </label>
            <input
              id="move-in-by"
              type="date"
              min={todayStr}
              value={draft.moveInBy}
              onChange={(e) => setDraft((cur) => ({ ...cur, moveInBy: e.target.value }))}
              className={fieldClass}
            />
          </div>

          <fieldset>
            <div className="flex flex-wrap gap-2">
              {amenities.map(({ key, label }) => (
                <label
                  key={key}
                  className={`cursor-pointer rounded-full border px-4 py-1.5 text-sm transition ${
                    draft[key] ? 'border-gold bg-gold text-ink' : 'border-white/15 text-muted hover:border-white/30 hover:text-paper'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={Boolean(draft[key])}
                    onChange={(e) => setDraft((cur) => ({ ...cur, [key]: e.target.checked }))}
                    className="sr-only"
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
        </div>

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={() => setDraft(EMPTY_FILTERS)}
            className="flex-1 rounded-lg border border-white/15 px-5 py-3 font-medium text-paper hover:border-white/30"
          >
            {labels.clear}
          </button>
          <button
            type="button"
            onClick={() => onApply(draft)}
            className="flex-1 rounded-lg bg-gold px-5 py-3 font-medium text-ink transition hover:brightness-110"
          >
            {labels.apply}
          </button>
        </div>
      </div>
    </div>
  );
}
