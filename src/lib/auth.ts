'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export async function getUser() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

// Use in protected server components / actions. Redirects if unauthenticated.
export async function requireUser(locale = 'en') {
  const user = await getUser();
  if (!user) redirect(`/${locale}/signin`);
  return user;
}
