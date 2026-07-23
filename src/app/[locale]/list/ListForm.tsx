'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { getDictionary } from '@/i18n/config';
import type { Locale } from '@/i18n/config';
import { PhotoUploader, toListingPhoto, type ListingPhoto } from '@/components/ListingForm/PhotoUploader';
import { LISTING_TYPES, listingTypeLabels, type ListingTypeValue } from '@/lib/listings';

const MAX_EXTRA_PHOTOS = 5;

const fieldClass =
  'w-full rounded-lg border border-white/15 bg-ink/40 px-3 py-2.5 text-paper placeholder:text-muted/60 outline-none focus-visible:ring-2 focus-visible:ring-gold';
const labelClass = 'mb-1.5 block text-sm text-muted';

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export default function ListForm({ locale }: { locale: Locale }) {
  const d = getDictionary(locale);
  const l = d.listing;
  const router = useRouter();

  const [phase, setPhase] = useState<'checking' | 'loading' | 'ready' | 'published' | 'error'>('checking');
  const [listingId, setListingId] = useState<string | null>(null);
  const [listingStatus, setListingStatus] = useState<'draft' | 'active' | 'negotiating'>('draft');
  const [retryKey, setRetryKey] = useState(0);
  const hydrated = useRef(false);

  // Editing a published listing (in place) vs. the normal draft → publish flow.
  const isEditingActive = listingStatus === 'active';
  const isLocked = listingStatus === 'negotiating';

  // The apartment / location / terms / contact fields
  const [type, setType] = useState<ListingTypeValue | ''>('');
  const [neighborhood, setNeighborhood] = useState('');
  const [crossStreets, setCrossStreets] = useState('');
  const [fullAddress, setFullAddress] = useState('');
  const [zip, setZip] = useState('');
  const [monthlyRent, setMonthlyRent] = useState('');
  const [sqft, setSqft] = useState('');
  const [floor, setFloor] = useState('');
  const [description, setDescription] = useState('');
  const [availableFrom, setAvailableFrom] = useState('');
  const [petsOk, setPetsOk] = useState(false);
  const [laundry, setLaundry] = useState(false);
  const [elevator, setElevator] = useState(false);
  const [walkUp, setWalkUp] = useState(false);
  const [doorman, setDoorman] = useState(false);
  const [outdoor, setOutdoor] = useState(false);
  const [noFee, setNoFee] = useState(true);
  const [minCreditScore, setMinCreditScore] = useState('');
  const [gratitudeAmount, setGratitudeAmount] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [confirmAvailability, setConfirmAvailability] = useState(false);
  const [confirmAccuracy, setConfirmAccuracy] = useState(false);

  const [photos, setPhotos] = useState<{ bedroom?: ListingPhoto; kitchen?: ListingPhoto; bathroom?: ListingPhoto }>({});
  const [extraPhotos, setExtraPhotos] = useState<ListingPhoto[]>([]);

  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState('');
  const [activeCount, setActiveCount] = useState(0);
  const [yearlyCount, setYearlyCount] = useState(0);

  const photoLabels = {
    upload: l.photoUpload,
    replace: l.photoReplace,
    remove: l.photoRemove,
    uploading: l.photoUploading,
    errorType: l.photoErrorType,
    errorSize: l.photoErrorSize,
    errorGeneric: l.photoErrorGeneric,
  };

  useEffect(() => {
    // Guards against a hang if any query below never resolves — surface a
    // visible error instead of sitting on "Checking…" forever.
    let settled = false;
    const timeoutId = setTimeout(() => {
      if (settled) return;
      settled = true;
      setError(l.errorLoadTimeout);
      setPhase('error');
    }, 12000);

    function finish() {
      if (settled) return false;
      settled = true;
      clearTimeout(timeoutId);
      return true;
    }

    setPhase('checking');
    setError('');

    const supabase = createClient();

    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (settled) return;

      if (!user) {
        if (!finish()) return;
        router.replace(`/${locale}/signin`);
        return;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('verification_status, full_name, phone')
        .eq('id', user.id)
        .single();
      if (settled) return;

      if (profile?.verification_status !== 'verified') {
        if (!finish()) return;
        router.replace(`/${locale}/verify?next=list`);
        return;
      }

      setPhase('loading');

      const { count: active } = await supabase
        .from('listings')
        .select('id', { count: 'exact', head: true })
        .eq('lister_id', user.id)
        .in('status', ['active', 'negotiating']);
      if (settled) return;
      setActiveCount(active ?? 0);

      const oneYearAgo = new Date();
      oneYearAgo.setDate(oneYearAgo.getDate() - 365);
      const { count: yearly } = await supabase
        .from('listings')
        .select('id', { count: 'exact', head: true })
        .eq('lister_id', user.id)
        .gte('published_at', oneYearAgo.toISOString());
      if (settled) return;
      setYearlyCount(yearly ?? 0);

      // /list/mine links to a specific draft via ?id=; fall back to
      // continuing whichever draft was most recently touched.
      const requestedId = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('id') : null;

      let draft = null;
      if (requestedId) {
        // Accept the lister's own draft OR a published listing (active /
        // negotiating) so this form doubles as the in-place editor. The draft
        // fallbacks below are skipped whenever a record is loaded here.
        const { data: requested } = await supabase
          .from('listings')
          .select('*')
          .eq('id', requestedId)
          .eq('lister_id', user.id)
          .in('status', ['draft', 'active', 'negotiating'])
          .maybeSingle();
        if (settled) return;
        draft = requested;
      }

      if (!draft) {
        const { data: existingDraft } = await supabase
          .from('listings')
          .select('*')
          .eq('lister_id', user.id)
          .eq('status', 'draft')
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (settled) return;
        draft = existingDraft;
      }

      if (!draft) {
        const { data: created, error: createError } = await supabase
          .from('listings')
          .insert({
            lister_id: user.id,
            status: 'draft',
            contact_name: profile?.full_name ?? '',
            contact_phone: profile?.phone ?? '',
          })
          .select()
          .single();
        if (settled) return;
        if (createError || !created) {
          if (!finish()) return;
          setError(l.errorGeneric);
          setPhase('ready');
          return;
        }
        draft = created;
      }

      setListingId(draft.id);
      setListingStatus((draft.status as 'draft' | 'active' | 'negotiating') ?? 'draft');
      setType((draft.type as ListingTypeValue) ?? '');
      setNeighborhood(draft.neighborhood ?? '');
      setCrossStreets(draft.cross_streets ?? '');
      setFullAddress(draft.full_address ?? '');
      setZip(draft.zip ?? '');
      setMonthlyRent(draft.monthly_rent != null ? String(draft.monthly_rent) : '');
      setSqft(draft.sqft != null ? String(draft.sqft) : '');
      setFloor(draft.floor ?? '');
      setDescription(draft.description ?? '');
      setAvailableFrom(draft.available_from ?? '');
      setPetsOk(!!draft.pets_ok);
      setLaundry(!!draft.laundry);
      setElevator(!!draft.elevator);
      setWalkUp(!!draft.walk_up);
      setDoorman(!!draft.doorman);
      setOutdoor(!!draft.outdoor);
      setNoFee(draft.no_fee ?? true);
      setMinCreditScore(draft.min_credit_score != null ? String(draft.min_credit_score) : '');
      setGratitudeAmount(draft.gratitude_amount != null ? String(draft.gratitude_amount) : '');
      setContactName(draft.contact_name ?? profile?.full_name ?? '');
      setContactPhone(draft.contact_phone ?? profile?.phone ?? '');

      const { data: existingPhotos } = await supabase
        .from('listing_photos')
        .select('*')
        .eq('listing_id', draft.id)
        .order('sort_order', { ascending: true });
      if (settled) return;

      if (existingPhotos) {
        const bySlot = (slot: string) => {
          const row = existingPhotos.find((p) => p.slot === slot);
          return row ? toListingPhoto(row) : undefined;
        };
        setPhotos({ bedroom: bySlot('bedroom'), kitchen: bySlot('kitchen'), bathroom: bySlot('bathroom') });
        setExtraPhotos(existingPhotos.filter((p) => p.slot === 'extra').map(toListingPhoto));
      }

      if (!finish()) return;
      hydrated.current = true;
      setPhase('ready');
    }

    load().catch(() => {
      if (!finish()) return;
      setError(l.errorLoadTimeout);
      setPhase('error');
    });

    return () => {
      settled = true;
      clearTimeout(timeoutId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale, router, retryKey]);

  // Draft autosave, debounced. Only for drafts — a published (active) listing
  // is edited explicitly via Save changes so we never write a half-typed field
  // to a live listing, and a negotiating listing is locked entirely.
  useEffect(() => {
    if (!hydrated.current || !listingId || isEditingActive || isLocked) return;
    setSaveStatus('saving');
    const timeout = setTimeout(async () => {
      const supabase = createClient();
      const { error: saveError } = await supabase
        .from('listings')
        .update({
          type: type || null,
          neighborhood: neighborhood.trim() || null,
          cross_streets: crossStreets.trim() || null,
          full_address: fullAddress.trim() || null,
          zip: zip.trim() || null,
          monthly_rent: monthlyRent ? parseInt(monthlyRent, 10) : null,
          sqft: sqft ? parseInt(sqft, 10) : null,
          floor: floor.trim() || null,
          description: description.trim() || null,
          available_from: availableFrom || null,
          pets_ok: petsOk,
          laundry,
          elevator,
          walk_up: walkUp,
          doorman,
          outdoor,
          no_fee: noFee,
          min_credit_score: minCreditScore ? parseInt(minCreditScore, 10) : null,
          gratitude_amount: gratitudeAmount ? parseInt(gratitudeAmount, 10) : null,
          contact_name: contactName.trim() || null,
          contact_phone: contactPhone.trim() || null,
        })
        .eq('id', listingId);
      setSaveStatus(saveError ? 'idle' : 'saved');
      if (!saveError) setTimeout(() => setSaveStatus('idle'), 2000);
    }, 800);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    type,
    neighborhood,
    crossStreets,
    fullAddress,
    zip,
    monthlyRent,
    sqft,
    floor,
    description,
    availableFrom,
    petsOk,
    laundry,
    elevator,
    walkUp,
    doorman,
    outdoor,
    noFee,
    minCreditScore,
    gratitudeAmount,
    contactName,
    contactPhone,
  ]);

  async function handlePublish(e: FormEvent) {
    e.preventDefault();
    setError('');

    if (activeCount > 0) {
      setError(l.blockActiveListing);
      return;
    }
    if (yearlyCount >= 3) {
      setError(l.blockYearlyLimit);
      return;
    }

    const missingRequired =
      !type ||
      !monthlyRent ||
      Number(monthlyRent) <= 0 ||
      !neighborhood.trim() ||
      !crossStreets.trim() ||
      !fullAddress.trim() ||
      !zip.trim() ||
      !availableFrom ||
      !contactName.trim() ||
      !contactPhone.trim() ||
      !confirmAvailability ||
      !confirmAccuracy ||
      !photos.bedroom ||
      !photos.kitchen ||
      !photos.bathroom;

    if (missingRequired) {
      setError(l.errorRequired);
      return;
    }

    if (availableFrom < todayStr()) {
      setError(l.errorPastDate);
      return;
    }

    setPublishing(true);
    const supabase = createClient();
    const { error: publishError } = await supabase
      .from('listings')
      .update({
        type,
        neighborhood: neighborhood.trim(),
        cross_streets: crossStreets.trim(),
        full_address: fullAddress.trim(),
        zip: zip.trim(),
        monthly_rent: parseInt(monthlyRent, 10),
        sqft: sqft ? parseInt(sqft, 10) : null,
        floor: floor.trim() || null,
        description: description.trim() || null,
        available_from: availableFrom,
        pets_ok: petsOk,
        laundry,
        elevator,
        walk_up: walkUp,
        doorman,
        outdoor,
        no_fee: noFee,
        min_credit_score: minCreditScore ? parseInt(minCreditScore, 10) : null,
        gratitude_amount: gratitudeAmount ? parseInt(gratitudeAmount, 10) : null,
        contact_name: contactName.trim(),
        contact_phone: contactPhone.trim(),
        contact_confirmed: true,
        status: 'active',
      })
      .eq('id', listingId);

    setPublishing(false);
    if (publishError) {
      setError(publishError.message || l.errorGeneric);
      return;
    }
    setPhase('published');
  }

  // In-place save for an already-published listing. Validates the same required
  // fields as publish (so a live listing can't be saved into an invalid state),
  // but keeps status active and skips the 1-active / 3-per-year limits.
  async function handleSaveActive(e: FormEvent) {
    e.preventDefault();
    setError('');

    const missingRequired =
      !type ||
      !monthlyRent ||
      Number(monthlyRent) <= 0 ||
      !neighborhood.trim() ||
      !crossStreets.trim() ||
      !fullAddress.trim() ||
      !zip.trim() ||
      !availableFrom ||
      !contactName.trim() ||
      !contactPhone.trim() ||
      !photos.bedroom ||
      !photos.kitchen ||
      !photos.bathroom;

    if (missingRequired) {
      setError(l.errorRequired);
      return;
    }
    if (availableFrom < todayStr()) {
      setError(l.errorPastDate);
      return;
    }

    setPublishing(true);
    const supabase = createClient();
    const { error: saveError } = await supabase
      .from('listings')
      .update({
        type,
        neighborhood: neighborhood.trim(),
        cross_streets: crossStreets.trim(),
        full_address: fullAddress.trim(),
        zip: zip.trim(),
        monthly_rent: parseInt(monthlyRent, 10),
        sqft: sqft ? parseInt(sqft, 10) : null,
        floor: floor.trim() || null,
        description: description.trim() || null,
        available_from: availableFrom,
        pets_ok: petsOk,
        laundry,
        elevator,
        walk_up: walkUp,
        doorman,
        outdoor,
        no_fee: noFee,
        min_credit_score: minCreditScore ? parseInt(minCreditScore, 10) : null,
        gratitude_amount: gratitudeAmount ? parseInt(gratitudeAmount, 10) : null,
        contact_name: contactName.trim(),
        contact_phone: contactPhone.trim(),
      })
      .eq('id', listingId);

    setPublishing(false);
    if (saveError) {
      setError(saveError.message || l.errorGeneric);
      return;
    }
    router.push(`/${locale}/list/mine`);
  }

  if (phase === 'checking' || phase === 'loading') {
    return (
      <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center px-5 text-center">
        <p className="mb-2 text-sm uppercase tracking-wide text-gold">Ten2Ten</p>
        <p className="text-sm text-muted">{phase === 'checking' ? l.checkingVerification : l.loadingDraft}</p>
      </main>
    );
  }

  if (phase === 'error') {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-5 py-16 text-center">
        <p className="mb-4 text-sm uppercase tracking-wide text-gold">Ten2Ten</p>
        <p role="alert" className="mb-6 text-sm text-red-400">
          {error || l.errorLoadTimeout}
        </p>
        <button
          onClick={() => {
            setError('');
            setPhase('checking');
            setRetryKey((k) => k + 1);
          }}
          className="w-full rounded-lg bg-gold px-5 py-3 font-medium text-ink transition hover:brightness-110"
        >
          {l.retryCta}
        </button>
      </main>
    );
  }

  if (phase === 'published') {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-5 py-16 text-center">
        <p className="mb-4 text-sm uppercase tracking-wide text-gold">Ten2Ten</p>
        <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-sage/20">
          <span className="text-2xl text-sage">✓</span>
        </div>
        <h1 className="mb-2 font-display text-3xl text-paper">{l.successTitle}</h1>
        <p className="mb-8 text-sm text-muted">{l.successBody}</p>
        <Link
          href={`/${locale}/account`}
          className="w-full rounded-lg bg-gold px-5 py-3 font-medium text-ink transition hover:brightness-110"
        >
          {l.backToAccount}
        </Link>
      </main>
    );
  }

  if (isLocked) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-5 py-16 text-center">
        <p className="mb-4 text-sm uppercase tracking-wide text-gold">Ten2Ten</p>
        <h1 className="mb-2 font-display text-2xl text-paper">{l.editTitle}</h1>
        <p className="mb-8 text-sm text-amber-300">{l.editLockedNegotiating}</p>
        <Link
          href={`/${locale}/list/mine`}
          className="w-full rounded-lg bg-gold px-5 py-3 font-medium text-ink transition hover:brightness-110"
        >
          {l.backToMine}
        </Link>
      </main>
    );
  }

  const typeOptions: { value: ListingTypeValue; label: string }[] = LISTING_TYPES.map((value) => ({
    value,
    label: listingTypeLabels(l)[value],
  }));

  const amenities: { checked: boolean; onChange: (v: boolean) => void; label: string }[] = [
    { checked: laundry, onChange: setLaundry, label: l.amenityLaundry },
    { checked: petsOk, onChange: setPetsOk, label: l.amenityPetsOk },
    { checked: elevator, onChange: setElevator, label: l.amenityElevator },
    { checked: walkUp, onChange: setWalkUp, label: l.amenityWalkUp },
    { checked: doorman, onChange: setDoorman, label: l.amenityDoorman },
    { checked: outdoor, onChange: setOutdoor, label: l.amenityOutdoor },
    { checked: noFee, onChange: setNoFee, label: l.amenityNoFee },
  ];

  return (
    <main className="mx-auto max-w-2xl px-5 py-16">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <p className="mb-1 text-sm uppercase tracking-wide text-gold">Ten2Ten</p>
          <h1 className="font-display text-3xl text-paper">{isEditingActive ? l.editTitle : l.title}</h1>
        </div>
        <p className="text-xs text-muted" role="status">
          {!isEditingActive && (saveStatus === 'saving' ? l.saving : saveStatus === 'saved' ? l.saved : '')}
        </p>
      </div>

      {!isEditingActive && activeCount > 0 && (
        <p role="alert" className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {l.blockActiveListing}
        </p>
      )}
      {!isEditingActive && activeCount === 0 && yearlyCount >= 3 && (
        <p role="alert" className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {l.blockYearlyLimit}
        </p>
      )}

      <form onSubmit={isEditingActive ? handleSaveActive : handlePublish} noValidate className="flex flex-col gap-10">
        {/* Photos */}
        <section>
          <h2 className="mb-4 font-display text-xl text-paper">{l.sectionPhotos}</h2>
          <div className="flex flex-col gap-5">
            {listingId && (
              <>
                <PhotoUploader
                  listingId={listingId}
                  slot="bedroom"
                  label={l.photoBedroom}
                  required
                  photo={photos.bedroom}
                  onChange={(p) => setPhotos((cur) => ({ ...cur, bedroom: p ?? undefined }))}
                  labels={photoLabels}
                />
                <PhotoUploader
                  listingId={listingId}
                  slot="kitchen"
                  label={l.photoKitchen}
                  required
                  photo={photos.kitchen}
                  onChange={(p) => setPhotos((cur) => ({ ...cur, kitchen: p ?? undefined }))}
                  labels={photoLabels}
                />
                <PhotoUploader
                  listingId={listingId}
                  slot="bathroom"
                  label={l.photoBathroom}
                  required
                  photo={photos.bathroom}
                  onChange={(p) => setPhotos((cur) => ({ ...cur, bathroom: p ?? undefined }))}
                  labels={photoLabels}
                />

                {extraPhotos.map((photo, i) => (
                  <PhotoUploader
                    key={photo.id}
                    listingId={listingId}
                    slot="extra"
                    label={`${l.photoExtra} ${i + 1}`}
                    photo={photo}
                    sortOrder={i}
                    onChange={(p) =>
                      setExtraPhotos((cur) =>
                        p ? cur.map((x) => (x.id === photo.id ? p : x)) : cur.filter((x) => x.id !== photo.id)
                      )
                    }
                    labels={photoLabels}
                  />
                ))}

                {extraPhotos.length < MAX_EXTRA_PHOTOS && (
                  <PhotoUploader
                    key={`extra-new-${extraPhotos.length}`}
                    listingId={listingId}
                    slot="extra"
                    label={l.photoAddExtra}
                    sortOrder={extraPhotos.length}
                    onChange={(p) => {
                      if (p) setExtraPhotos((cur) => [...cur, p]);
                    }}
                    labels={photoLabels}
                  />
                )}
              </>
            )}
          </div>
        </section>

        {/* Location */}
        <section>
          <h2 className="mb-4 font-display text-xl text-paper">{l.sectionLocation}</h2>
          <div className="flex flex-col gap-5">
            <div>
              <label htmlFor="neighborhood" className={labelClass}>
                {l.neighborhoodLabel}
              </label>
              <input
                id="neighborhood"
                type="text"
                required
                value={neighborhood}
                onChange={(e) => setNeighborhood(e.target.value)}
                placeholder={l.neighborhoodPlaceholder}
                className={fieldClass}
              />
            </div>
            <div>
              <label htmlFor="cross-streets" className={labelClass}>
                {l.crossStreetsLabel}
              </label>
              <input
                id="cross-streets"
                type="text"
                required
                value={crossStreets}
                onChange={(e) => setCrossStreets(e.target.value)}
                placeholder={l.crossStreetsPlaceholder}
                className={fieldClass}
              />
            </div>
            <div>
              <label htmlFor="full-address" className={labelClass}>
                {l.fullAddressLabel}
              </label>
              <input
                id="full-address"
                type="text"
                required
                value={fullAddress}
                onChange={(e) => setFullAddress(e.target.value)}
                className={fieldClass}
              />
              <p className="mt-1 text-xs text-muted">{l.fullAddressHint}</p>
            </div>
            <div>
              <label htmlFor="zip" className={labelClass}>
                {l.zipLabel}
              </label>
              <input
                id="zip"
                type="text"
                inputMode="numeric"
                required
                value={zip}
                onChange={(e) => setZip(e.target.value)}
                className={fieldClass}
              />
            </div>
          </div>
        </section>

        {/* The apartment */}
        <section>
          <h2 className="mb-4 font-display text-xl text-paper">{l.sectionApartment}</h2>
          <div className="flex flex-col gap-5">
            <div>
              <label htmlFor="type" className={labelClass}>
                {l.typeLabel}
              </label>
              <select
                id="type"
                required
                value={type}
                onChange={(e) => setType(e.target.value as ListingTypeValue)}
                className={fieldClass}
              >
                <option value="" className="bg-ink">
                  {l.typePlaceholder}
                </option>
                {typeOptions.map(({ value, label }) => (
                  <option key={value} value={value} className="bg-ink">
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="rent" className={labelClass}>
                {l.rentLabel}
              </label>
              <input
                id="rent"
                type="number"
                min={0}
                step={1}
                required
                value={monthlyRent}
                onChange={(e) => setMonthlyRent(e.target.value)}
                className={fieldClass}
              />
              <p className="mt-1 text-xs text-muted">{l.rentHint}</p>
            </div>
            <div className="grid grid-cols-2 gap-5">
              <div>
                <label htmlFor="floor" className={labelClass}>
                  {l.floorLabel}
                </label>
                <input
                  id="floor"
                  type="text"
                  value={floor}
                  onChange={(e) => setFloor(e.target.value)}
                  className={fieldClass}
                />
              </div>
              <div>
                <label htmlFor="sqft" className={labelClass}>
                  {l.sqftLabel}
                </label>
                <input
                  id="sqft"
                  type="number"
                  min={0}
                  step={1}
                  value={sqft}
                  onChange={(e) => setSqft(e.target.value)}
                  className={fieldClass}
                />
              </div>
            </div>
            <div>
              <label htmlFor="description" className={labelClass}>
                {l.descriptionLabel}
              </label>
              <textarea
                id="description"
                rows={5}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={l.descriptionPlaceholder}
                className={fieldClass}
              />
            </div>
            <div>
              <label htmlFor="available-from" className={labelClass}>
                {l.availableFromLabel}
              </label>
              <input
                id="available-from"
                type="date"
                required
                min={todayStr()}
                value={availableFrom}
                onChange={(e) => setAvailableFrom(e.target.value)}
                className={fieldClass}
              />
            </div>
          </div>
        </section>

        {/* Amenities */}
        <section>
          <h2 className="mb-4 font-display text-xl text-paper">{l.sectionAmenities}</h2>
          <div className="flex flex-wrap gap-2">
            {amenities.map(({ checked, onChange, label }) => (
              <label
                key={label}
                className={`cursor-pointer rounded-full border px-4 py-1.5 text-sm transition ${
                  checked
                    ? 'border-gold bg-gold text-ink'
                    : 'border-white/15 text-muted hover:border-white/30 hover:text-paper'
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => onChange(e.target.checked)}
                  className="sr-only"
                />
                {label}
              </label>
            ))}
          </div>
        </section>

        {/* Terms */}
        <section>
          <h2 className="mb-4 font-display text-xl text-paper">{l.sectionTerms}</h2>
          <div className="flex flex-col gap-5">
            <div>
              <label htmlFor="min-credit-score" className={labelClass}>
                {l.minCreditScoreLabel}
              </label>
              <input
                id="min-credit-score"
                type="number"
                min={0}
                step={1}
                value={minCreditScore}
                onChange={(e) => setMinCreditScore(e.target.value)}
                className={fieldClass}
              />
              <p className="mt-1 text-xs text-muted">{l.minCreditScoreHint}</p>
            </div>
            <div>
              <label htmlFor="gratitude" className={labelClass}>
                {l.gratitudeLabel}
              </label>
              <input
                id="gratitude"
                type="number"
                min={0}
                step={1}
                value={gratitudeAmount}
                onChange={(e) => setGratitudeAmount(e.target.value)}
                className={fieldClass}
              />
              <p className="mt-1 text-xs text-muted">{l.gratitudeHint}</p>
            </div>
          </div>
        </section>

        {/* Contact */}
        <section>
          <h2 className="mb-4 font-display text-xl text-paper">{l.sectionContact}</h2>
          <div className="flex flex-col gap-5">
            <div>
              <label htmlFor="contact-name" className={labelClass}>
                {l.contactNameLabel}
              </label>
              <input
                id="contact-name"
                type="text"
                required
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                className={fieldClass}
              />
            </div>
            <div>
              <label htmlFor="contact-phone" className={labelClass}>
                {l.contactPhoneLabel}
              </label>
              <input
                id="contact-phone"
                type="tel"
                required
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                className={fieldClass}
              />
            </div>

            <label className="flex items-start gap-3 text-sm text-muted">
              <input
                type="checkbox"
                required
                checked={confirmAvailability}
                onChange={(e) => setConfirmAvailability(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-white/30 bg-ink/40 accent-gold"
              />
              <span>{l.confirmAvailability}</span>
            </label>
            <label className="flex items-start gap-3 text-sm text-muted">
              <input
                type="checkbox"
                required
                checked={confirmAccuracy}
                onChange={(e) => setConfirmAccuracy(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-white/30 bg-ink/40 accent-gold"
              />
              <span>{l.confirmAccuracy}</span>
            </label>
          </div>
        </section>

        {error && (
          <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={publishing || (!isEditingActive && (activeCount > 0 || yearlyCount >= 3))}
          className="w-full rounded-lg bg-gold px-5 py-3 font-medium text-ink transition hover:brightness-110 disabled:opacity-50"
        >
          {publishing
            ? isEditingActive
              ? l.saving
              : l.publishing
            : isEditingActive
              ? l.saveChanges
              : l.publish}
        </button>
      </form>
    </main>
  );
}
