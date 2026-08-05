import { createServerClient } from '@supabase/ssr';
import type { CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getSupabaseRuntimeConfig } from '@/lib/supabase/runtime-config';

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  const config = await getSupabaseRuntimeConfig();

  if (!config?.supabaseUrl || !config?.supabaseAnonKey) {
    throw new Error('Supabase is not configured. Open Settings and save the connection details first.');
  }

  return createServerClient(
    config.supabaseUrl,
    // Server clients act on behalf of the requesting user's cookie-backed
    // session. Privileged server work must use createSupabaseAdminClient().
    config.supabaseAnonKey,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options });
          } catch {
            // Can be ignored when called from Server Components
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: '', ...options, maxAge: 0 });
          } catch {
            // Can be ignored when called from Server Components
          }
        },
      },
    },
  );
}
