import { redirect } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { hasSupabaseRuntimeConfig } from '@/lib/supabase/runtime-config';
import { cookies } from 'next/headers';
import { getCurrentAppUser } from '@/lib/current-user';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const isConfigured = await hasSupabaseRuntimeConfig();
  const cookieStore = await cookies();
  const hasDemoSession = cookieStore.has('sap-cn41-demo-session');

  if (isConfigured && !hasDemoSession) {
    // Default to "has session" so a Supabase outage keeps the app usable (local scaffolding),
    // rather than locking everyone out.
    let hasSession = true;
    try {
      const supabase = await createSupabaseServerClient();
      const { data } = await supabase.auth.getSession();
      hasSession = Boolean(data.session);
    } catch {
      hasSession = true;
    }
    // redirect() throws NEXT_REDIRECT; it MUST live outside the try/catch above, or the
    // bare catch swallows it and the request falls through and 500s for signed-out users.
    if (!hasSession) {
      redirect('/login');
    }
  }

  const currentUser = await getCurrentAppUser();
  return (
    <AppShell userRole={currentUser?.role ?? null} userName={currentUser?.fullName ?? null}>
      {children}
    </AppShell>
  );
}

