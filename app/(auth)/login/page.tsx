"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

import Image from 'next/image';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [isSupabaseConfigured, setIsSupabaseConfigured] = useState(false);
  const [companyName, setCompanyName] = useState('DETASAD');
  const [companySubtext, setCompanySubtext] = useState('Detecon Al Saudia');
  const [logoTimestamp, setLogoTimestamp] = useState<string>('');
  const [logoError, setLogoError] = useState(false);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const baseLogoUrl = supabaseUrl ? `${supabaseUrl}/storage/v1/object/public/cn41-files/global/login_logo.png` : '';
  const logoUrl = baseLogoUrl ? (logoTimestamp ? `${baseLogoUrl}?t=${logoTimestamp}` : baseLogoUrl) : null;

  const [isSignUp, setIsSignUp] = useState(false);

  useEffect(() => {
    // Load branding settings from localStorage
    setCompanyName(window.localStorage.getItem('company_name') || 'DETASAD');
    setCompanySubtext(window.localStorage.getItem('company_subtext') || 'Detecon Al Saudia');
    setLogoTimestamp(window.localStorage.getItem('login_logo_timestamp') || '');
    // Clear demo session on mount (logout)
    window.localStorage.removeItem('sap-cn41-demo-session');
    document.cookie = 'sap-cn41-demo-session=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';

    (async () => {
      try {
        const response = await fetch('/api/settings/supabase');
        if (response.ok) {
          const data = await response.json();
          if (data.configured && data.supabaseUrl && data.supabaseAnonKey) {
            window.localStorage.setItem('sap-cn41-supabase-url', data.supabaseUrl);
            window.localStorage.setItem('sap-cn41-supabase-anon-key', data.supabaseAnonKey);
            setIsSupabaseConfigured(true);
            try {
              const supabase = createSupabaseBrowserClient();
              supabase.auth.signOut().catch(() => {});
            } catch {
              // ignore
            }
            return;
          }
        }
      } catch (err) {
        console.error('Failed to sync Supabase client configuration', err);
      }

      const configured =
        Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) ||
        Boolean(
          window.localStorage.getItem('sap-cn41-supabase-url') &&
            window.localStorage.getItem('sap-cn41-supabase-anon-key'),
        );
      setIsSupabaseConfigured(configured);

      if (configured) {
        try {
          const supabase = createSupabaseBrowserClient();
          supabase.auth.signOut().catch(() => {});
        } catch {
          // ignore
        }
      }
    })();
  }, []);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setMessage('');

    const isAdminLogin =
      email.trim().toLowerCase() === 'admin' ||
      email.trim().toLowerCase() === 'admin@local' ||
      email.trim().toLowerCase() === 'admin@example.com';

    if (isAdminLogin && password === 'admin123') {
      localStorage.setItem(
        'sap-cn41-demo-session',
        JSON.stringify({
          email: 'admin@local',
          role: 'Admin',
          authenticatedAt: new Date().toISOString(),
        }),
      );
      // Set the demo session cookie for the server layout to read
      document.cookie = 'sap-cn41-demo-session=true; path=/; max-age=86400';
      router.push('/projects');
      return;
    }

    if (!isSupabaseConfigured) {
      if (isSignUp) {
        setMessage('Sign Up is not available in local demo mode. Use the admin/admin123 credentials.');
        setLoading(false);
        return;
      }
      setMessage('Demo login: use admin / admin123 until Supabase is configured.');
      setLoading(false);
      return;
    }

    try {
      const supabase = createSupabaseBrowserClient();
      if (isSignUp) {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback`,
          }
        });
        if (error) throw error;
        if (data?.user && !data.session) {
          setMessage('Registration successful! Please check your email to confirm.');
          setLoading(false);
        } else {
          router.push('/projects');
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.push('/projects');
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to authenticate.');
      setLoading(false);
    }
  }

  async function handleMagicLink() {
    setLoading(true);
    setMessage('');
    try {
      if (!isSupabaseConfigured) {
        setMessage('Supabase is not configured yet. Use the temporary admin login: admin / admin123.');
        return;
      }
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.signInWithOtp({ email });
      if (error) throw error;
      setMessage('Check your email for a login link.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to send login link.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-gradient-to-tr from-panel2 via-bg to-panel2 px-5 py-12">
      {/* Decorative background glow spots */}
      <div className="absolute top-1/4 left-1/4 h-80 w-80 -translate-x-1/2 rounded-full bg-accent/5 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 h-80 w-80 translate-x-1/2 rounded-full bg-cyan-500/5 blur-[120px] pointer-events-none" />

      <div className="relative w-full max-w-[420px] rounded-2xl border border-line bg-panel/60 p-8 shadow-glow backdrop-blur-xl transition-all duration-300 hover:shadow-card flex flex-col items-center">
        {/* Detasad Branding */}
        <div className="flex flex-col items-center text-center">
          {/* Logo container */}
          <div className="w-16 h-16 rounded-2xl overflow-hidden border border-line bg-panel2 flex items-center justify-center relative mb-4 shadow-sm">
            {logoUrl && !logoError ? (
              <Image
                src={logoUrl}
                alt="Company Logo"
                width={64}
                height={64}
                className="object-contain w-full h-full p-2"
                unoptimized
                onError={() => setLogoError(true)}
              />
            ) : (
              <div className="text-3xl font-black text-accent bg-gradient-to-r from-accent to-cyan-400 bg-clip-text text-transparent select-none">
                {companyName ? companyName.charAt(0).toUpperCase() : 'D'}
              </div>
            )}
          </div>
          
          <div className="text-3xl font-black tracking-[0.2em] select-none uppercase" style={{ color: '#005B7F' }}>
            {companyName}
          </div>
          <div className="mt-1.5 text-[9px] font-bold uppercase tracking-[0.3em] text-muted/70">
            {companySubtext}
          </div>
          <p className="mt-6 text-xs text-muted/80 font-medium">
            {isSignUp ? "Create a secure account to get started." : "Sign in to access project baselines, updates, and simulations."}
          </p>
        </div>

        <form className="mt-6 w-full space-y-4" onSubmit={handleSubmit}>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-muted">Email or Username</span>
            <input
              value={email}
              disabled={loading}
              onChange={(event) => setEmail(event.target.value)}
              type="text"
              className={`${inputClass} disabled:opacity-60 disabled:cursor-not-allowed`}
              placeholder={isSupabaseConfigured ? "name@detasad.com" : "admin"}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-muted">Password</span>
            <input
              value={password}
              disabled={loading}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              className={`${inputClass} disabled:opacity-60 disabled:cursor-not-allowed`}
              placeholder="••••••••"
            />
          </label>

          <div className="flex gap-2.5 pt-2">
            <button
              disabled={loading}
              type="submit"
              className="flex-1 rounded-lg bg-accent text-white px-4 py-2.5 text-xs font-semibold shadow hover:bg-accent-hover active:scale-[0.98] transition disabled:opacity-60 disabled:pointer-events-none"
            >
              {loading ? (isSignUp ? "Registering..." : "Signing in...") : (isSignUp ? "Create Account" : "Access System")}
            </button>
            {!isSignUp && (
              <button
                disabled={loading || !email}
                type="button"
                onClick={handleMagicLink}
                className="flex-1 rounded-lg border border-line bg-panel/60 px-4 py-2.5 text-xs font-semibold text-text hover:bg-panel2/80 active:scale-[0.98] transition disabled:opacity-50 disabled:pointer-events-none"
              >
                Magic Link
              </button>
            )}
          </div>
        </form>

        <div className="mt-6 text-center text-xs text-muted/90 font-medium">
          {isSignUp ? "Already have an account?" : "Don't have an account?"}{" "}
          <button
            type="button"
            onClick={() => {
              setIsSignUp(!isSignUp);
              setMessage("");
            }}
            className="text-accent hover:underline font-bold"
          >
            {isSignUp ? "Sign In" : "Sign Up"}
          </button>
        </div>

        {message ? (
          <p className="mt-4 text-center text-xs font-semibold text-accent/90 bg-accent/5 border border-accent/10 px-3.5 py-2.5 rounded-lg w-full">
            {message}
          </p>
        ) : null}

        <div className="mt-6 flex items-center justify-center gap-2 text-[10px] text-muted/60">
          <span className={`h-1.5 w-1.5 rounded-full ${isSupabaseConfigured ? 'bg-success' : 'bg-warning'}`} />
          {isSupabaseConfigured ? 'Connected to Supabase' : 'Local Demo Mode'}
        </div>
      </div>
    </div>
  );
}

const inputClass = "w-full rounded-lg border border-line bg-panel px-3 py-2.5 text-xs text-text outline-none placeholder:text-muted/45 focus:border-accent focus:ring-1 focus:ring-accent transition shadow-sm";


