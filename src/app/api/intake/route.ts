import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/server';
import { sendSms } from '@/lib/twilio';

const IntakeSchema = z.object({
  neighborhoods: z.array(z.string()).min(1),
  type: z.enum(['studio', '1br', '2br', '3br_plus']).optional(),
  budget_max: z.number().int().positive().optional(),
  move_in_by: z.string().optional(), // ISO date
  must_haves: z.array(z.string()).default([]),
  free_text: z.string().max(2000).optional(),
  phone: z.string().min(10),
  email: z.string().email().optional(),
  preferred_locale: z.enum(['en', 'es']).default('en'),
});

export async function POST(req: NextRequest) {
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const parsed = IntakeSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation', issues: parsed.error.flatten() },
      { status: 422 }
    );
  }
  const data = parsed.data;

  const admin = createAdminClient();
  const { error } = await admin.from('intake_requests').insert({
    source: 'web',
    phone: data.phone,
    email: data.email,
    neighborhoods: data.neighborhoods,
    type: data.type,
    budget_max: data.budget_max,
    move_in_by: data.move_in_by || null,
    must_haves: data.must_haves,
    free_text: data.free_text,
    preferred_locale: data.preferred_locale,
    status: 'new',
  });

  if (error) {
    console.error('[intake] insert failed', error);
    return NextResponse.json({ error: 'server' }, { status: 500 });
  }

  // Fire-and-forget confirmation text (non-blocking; ignore failures).
  const confirm =
    data.preferred_locale === 'es'
      ? "Ten2Ten: ¡estás en la lista! Te enviaremos un mensaje en cuanto un lugar coincida con lo que buscas."
      : "Ten2Ten: you're on the list! We'll text you the moment a place matches what you're looking for.";
  sendSms(data.phone, confirm).catch((e) =>
    console.warn('[intake] confirm sms failed', e)
  );

  return NextResponse.json({ ok: true });
}
