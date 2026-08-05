import { redirect } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { hasSupabaseRuntimeConfig } from '@/lib/supabase/runtime-config';

import { getCurrentAppUser } from '@/lib/current-user';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const isConfigured = await hasSupabaseRuntimeConfig();
  if (!isConfigured) {
    redirect('/login');
  }

  let hasSession = false;
  try {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.auth.getSession();
    hasSession = Boolean(data.session);
  } catch {
    hasSession = false;
  }
  if (!hasSession) {
    redirect('/login');
  }

  const currentUser = await getCurrentAppUser();
  return (
    <AppShell userRole={currentUser?.role ?? null} userName={currentUser?.fullName ?? null}>
      {children}
    </AppShell>
  );
}

