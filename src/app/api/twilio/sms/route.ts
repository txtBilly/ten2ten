import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

// Inbound SMS handler. Wire this URL into your Twilio number's "A Message
// Comes In" webhook. For the cold-start phase, a text from a seeker becomes
// an intake_request that the concierge picks up. We reply with TwiML.
//
// Twilio posts application/x-www-form-urlencoded with `From`, `Body`, etc.

function twiml(message: string) {
  const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${message}</Message></Response>`;
  return new NextResponse(xml, {
    status: 200,
    headers: { 'Content-Type': 'text/xml' },
  });
}

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const from = String(form.get('From') ?? '');
  const body = String(form.get('Body') ?? '').trim();

  if (!from) return twiml('Sorry, we could not read your number. Please try again.');

  const admin = createAdminClient();

  // Simple heuristic: if we have no open intake for this number, create one
  // from the free text. The concierge enriches it later.
  const { data: open } = await admin
    .from('intake_requests')
    .select('id')
    .eq('phone', from)
    .eq('status', 'new')
    .maybeSingle();

  if (open) {
    await admin
      .from('intake_requests')
      .update({ free_text: body, notes: 'updated via SMS' })
      .eq('id', open.id);
    return twiml('Got it — we updated your request. We will text you when something matches.');
  }

  // Detect Spanish loosely from accented characters / common words.
  const looksSpanish = /[áéíóúñ¿¡]|busco|apartamento|habitaci/i.test(body);

  await admin.from('intake_requests').insert({
    source: 'sms',
    phone: from,
    neighborhoods: [],
    free_text: body,
    preferred_locale: looksSpanish ? 'es' : 'en',
    status: 'new',
  });

  const reply = looksSpanish
    ? '¡Gracias! Estás en la lista de Ten2Ten. Te enviaremos un mensaje en cuanto encontremos un lugar que coincida.'
    : "Thanks! You're on the Ten2Ten list. We'll text you the moment we find a place that matches.";
  return twiml(reply);
}
