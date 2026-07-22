'use client';

import { useRef, useState, type ChangeEvent } from 'react';
import { createClient } from '@/lib/supabase/client';

export type ListingPhoto = {
  id: string;
  storage_path: string;
  slot: string;
  sort_order: number;
  url: string;
};

const MAX_BYTES = 8 * 1024 * 1024;
const BUCKET = 'listing-photos';

export function toListingPhoto(row: { id: string; storage_path: string; slot: string; sort_order: number }): ListingPhoto {
  const supabase = createClient();
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(row.storage_path);
  return { ...row, url: data.publicUrl };
}

export function PhotoUploader({
  listingId,
  slot,
  label,
  required,
  photo,
  sortOrder = 0,
  onChange,
  labels,
}: {
  listingId: string;
  slot: string;
  label: string;
  required?: boolean;
  photo?: ListingPhoto;
  sortOrder?: number;
  onChange: (photo: ListingPhoto | null) => void;
  labels: {
    upload: string;
    replace: string;
    remove: string;
    uploading: string;
    errorType: string;
    errorSize: string;
    errorGeneric: string;
  };
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError(labels.errorType);
      return;
    }
    if (file.size > MAX_BYTES) {
      setError(labels.errorSize);
      return;
    }

    setError('');
    setBusy(true);
    const supabase = createClient();
    const ext = file.name.split('.').pop() || 'jpg';
    const path = `${listingId}/${slot}-${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file);
    if (uploadError) {
      setError(labels.errorGeneric);
      setBusy(false);
      return;
    }

    if (photo) {
      await supabase.storage.from(BUCKET).remove([photo.storage_path]);
      await supabase.from('listing_photos').delete().eq('id', photo.id);
    }

    const { data: row, error: insertError } = await supabase
      .from('listing_photos')
      .insert({ listing_id: listingId, storage_path: path, slot, sort_order: sortOrder })
      .select()
      .single();

    setBusy(false);
    if (insertError || !row) {
      await supabase.storage.from(BUCKET).remove([path]);
      setError(labels.errorGeneric);
      return;
    }

    onChange(toListingPhoto(row));
  }

  async function handleRemove() {
    if (!photo) return;
    setBusy(true);
    const supabase = createClient();
    await supabase.storage.from(BUCKET).remove([photo.storage_path]);
    await supabase.from('listing_photos').delete().eq('id', photo.id);
    setBusy(false);
    onChange(null);
  }

  return (
    <div>
      <p className="mb-1.5 text-sm text-muted">
        {label}
        {required && <span className="text-gold"> *</span>}
      </p>
      <div className="flex items-center gap-3">
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo.url} alt={label} className="h-20 w-20 rounded-lg object-cover" />
        ) : (
          <div className="flex h-20 w-20 items-center justify-center rounded-lg border border-dashed border-white/20 text-xs text-muted/60">
            {busy ? '…' : ''}
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="rounded-lg border border-white/15 px-3 py-1.5 text-sm text-paper hover:border-white/30 disabled:opacity-50"
          >
            {busy ? labels.uploading : photo ? labels.replace : labels.upload}
          </button>
          {photo && (
            <button
              type="button"
              disabled={busy}
              onClick={handleRemove}
              className="text-xs text-muted hover:text-red-400"
            >
              {labels.remove}
            </button>
          )}
        </div>
        <input ref={inputRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />
      </div>
      {error && (
        <p role="alert" className="mt-1 text-xs text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
