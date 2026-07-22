import { createClient } from '@/lib/supabase/client';

export const LISTING_TYPES = ['room', 'studio', '1br', '2br', '3br_plus'] as const;
export type ListingTypeValue = (typeof LISTING_TYPES)[number];

const PHOTO_BUCKET = 'listing-photos';

export function listingPhotoUrl(storagePath: string): string {
  const supabase = createClient();
  return supabase.storage.from(PHOTO_BUCKET).getPublicUrl(storagePath).data.publicUrl;
}

type TypeLabelDict = {
  typeRoom: string;
  typeStudio: string;
  type1br: string;
  type2br: string;
  type3brPlus: string;
};

export function listingTypeLabels(l: TypeLabelDict): Record<ListingTypeValue, string> {
  return {
    room: l.typeRoom,
    studio: l.typeStudio,
    '1br': l.type1br,
    '2br': l.type2br,
    '3br_plus': l.type3brPlus,
  };
}

export function listingTypeLabel(type: string | null, l: TypeLabelDict): string {
  if (!type) return '';
  return listingTypeLabels(l)[type as ListingTypeValue] ?? type;
}

export type BrowseFilters = {
  rentMin: string;
  rentMax: string;
  zip: string;
  moveInBy: string;
  laundry: boolean;
  petsOk: boolean;
  elevator: boolean;
  walkUp: boolean;
  doorman: boolean;
  outdoor: boolean;
  noFee: boolean;
};

export const EMPTY_FILTERS: BrowseFilters = {
  rentMin: '',
  rentMax: '',
  zip: '',
  moveInBy: '',
  laundry: false,
  petsOk: false,
  elevator: false,
  walkUp: false,
  doorman: false,
  outdoor: false,
  noFee: false,
};

export function hasActiveFilters(filters: BrowseFilters): boolean {
  return Object.entries(filters).some(([key, value]) =>
    typeof value === 'boolean' ? value : value.trim() !== ''
  );
}
