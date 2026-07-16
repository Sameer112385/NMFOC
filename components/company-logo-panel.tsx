"use client";

import { useState, useEffect } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { Upload, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';
import Image from 'next/image';
import { cn } from '@/lib/utils';

export function CompanyLogoPanel() {
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadingLogin, setUploadingLogin] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [logoTimestamp, setLogoTimestamp] = useState<string>('');
  const [loginLogoTimestamp, setLoginLogoTimestamp] = useState<string>('');
  const [companyName, setCompanyName] = useState('DETASAD');
  const [companySubtext, setCompanySubtext] = useState('Control Center');

  const supabase = createSupabaseBrowserClient();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const baseLogoUrl = supabaseUrl ? `${supabaseUrl}/storage/v1/object/public/cn41-files/global/logo.png` : '';
  const baseLoginLogoUrl = supabaseUrl ? `${supabaseUrl}/storage/v1/object/public/cn41-files/global/login_logo.png` : '';

  useEffect(() => {
    const cachedTime = localStorage.getItem('logo_timestamp') || '';
    const cachedLoginTime = localStorage.getItem('login_logo_timestamp') || '';
    setLogoTimestamp(cachedTime);
    setLoginLogoTimestamp(cachedLoginTime);
    setCompanyName(localStorage.getItem('company_name') || 'DETASAD');
    setCompanySubtext(localStorage.getItem('company_subtext') || 'Control Center');
  }, []);

  const currentLogoUrl = baseLogoUrl ? (logoTimestamp ? `${baseLogoUrl}?t=${logoTimestamp}` : baseLogoUrl) : null;
  const currentLoginLogoUrl = baseLoginLogoUrl ? (loginLogoTimestamp ? `${baseLoginLogoUrl}?t=${loginLogoTimestamp}` : baseLoginLogoUrl) : null;

  const handleSaveTextSettings = () => {
    try {
      setErrorMsg(null);
      setSuccessMsg(null);
      localStorage.setItem('company_name', companyName.trim());
      localStorage.setItem('company_subtext', companySubtext.trim());
      setSuccessMsg('Branding text settings saved successfully!');
      window.dispatchEvent(new Event('logo-updated'));
    } catch (err: any) {
      setErrorMsg('Failed to save settings.');
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>, type: 'sidebar' | 'login') => {
    try {
      setErrorMsg(null);
      setSuccessMsg(null);

      const file = event.target.files?.[0];
      if (!file) return;

      // Validate file type
      if (!file.type.startsWith('image/')) {
        setErrorMsg('Please upload an image file (PNG, JPG, SVG).');
        return;
      }

      // Validate file size (max 2MB)
      if (file.size > 2 * 1024 * 1024) {
        setErrorMsg('Image size must be less than 2MB.');
        return;
      }

      if (type === 'sidebar') setUploading(true);
      else setUploadingLogin(true);

      const path = type === 'sidebar' ? 'global/logo.png' : 'global/login_logo.png';

      const { error: uploadError } = await supabase.storage
        .from('cn41-files')
        .upload(path, file, {
          upsert: true,
          contentType: file.type,
        });

      if (uploadError) {
        throw new Error(uploadError.message);
      }

      const newTimestamp = String(Date.now());
      if (type === 'sidebar') {
        localStorage.setItem('logo_timestamp', newTimestamp);
        setLogoTimestamp(newTimestamp);
        setSuccessMsg('Sidebar logo uploaded and updated successfully!');
      } else {
        localStorage.setItem('login_logo_timestamp', newTimestamp);
        setLoginLogoTimestamp(newTimestamp);
        setSuccessMsg('Login page banner/logo uploaded and updated successfully!');
      }

      // Notify other components to refresh
      window.dispatchEvent(new Event('logo-updated'));
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to upload image.');
    } finally {
      setUploading(false);
      setUploadingLogin(false);
    }
  };

  return (
    <div className="flex flex-col justify-between">
      <div>
        {/* Text Settings */}
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-text uppercase tracking-wider mb-2">Company Name</label>
            <input
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              className="w-full rounded-xl border border-line bg-panel/35 px-4 py-2.5 text-sm text-text focus:outline-none focus:border-accent/40"
              placeholder="e.g. DETASAD"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-text uppercase tracking-wider mb-2">Branding Subtext</label>
            <input
              type="text"
              value={companySubtext}
              onChange={(e) => setCompanySubtext(e.target.value)}
              className="w-full rounded-xl border border-line bg-panel/35 px-4 py-2.5 text-sm text-text focus:outline-none focus:border-accent/40"
              placeholder="e.g. Control Center"
            />
          </div>
          <button
            type="button"
            onClick={handleSaveTextSettings}
            className="w-full rounded-xl bg-accent text-white px-4 py-2.5 text-xs font-bold hover:bg-accent/90 transition shadow-[0_4px_12px_rgba(99,102,241,0.25)]"
          >
            Save Branding Text
          </button>
        </div>

        <div className="border-t border-line/35 my-5" />

        {/* Sidebar Logo Selection */}
        <div>
          <label className="block text-xs font-bold text-text uppercase tracking-wider mb-3">Sidebar Logo</label>
          <div className="flex flex-col sm:flex-row items-center gap-5">
            <div className="flex-none w-20 h-20 rounded-2xl overflow-hidden border border-line bg-panel flex items-center justify-center relative group">
              {currentLogoUrl ? (
                <Image
                  src={currentLogoUrl}
                  alt="Sidebar Logo Preview"
                  width={80}
                  height={80}
                  className="object-contain w-full h-full p-2"
                  unoptimized
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              ) : (
                <div className="text-2xl font-black text-muted select-none">
                  {companyName ? companyName.charAt(0).toUpperCase() : 'D'}
                </div>
              )}
            </div>

            <label className="flex-1 w-full flex flex-col items-center justify-center border border-dashed border-line rounded-2xl p-5 hover:border-accent/40 bg-panel/35 transition cursor-pointer text-center group">
              <Upload className="h-5 w-5 text-muted group-hover:text-accent transition duration-200" />
              <span className="text-xs font-bold text-text mt-2 block">Choose Sidebar Logo</span>
              <span className="text-[10px] text-muted mt-0.5">PNG, JPG, SVG up to 2MB</span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleFileUpload(e, 'sidebar')}
                disabled={uploading}
              />
            </label>
          </div>
          {uploading && (
            <div className="mt-2 flex items-center gap-2 text-[11px] font-semibold text-accent animate-pulse">
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              Uploading sidebar logo...
            </div>
          )}
        </div>

        <div className="border-t border-line/35 my-5" />

        {/* Login Page Logo Selection */}
        <div>
          <label className="block text-xs font-bold text-text uppercase tracking-wider mb-3">Login Page Logo / Banner</label>
          <div className="flex flex-col sm:flex-row items-center gap-5">
            <div className="flex-none w-20 h-20 rounded-2xl overflow-hidden border border-line bg-panel flex items-center justify-center relative group">
              {currentLoginLogoUrl ? (
                <Image
                  src={currentLoginLogoUrl}
                  alt="Login Logo Preview"
                  width={80}
                  height={80}
                  className="object-contain w-full h-full p-2"
                  unoptimized
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              ) : (
                <div className="text-2xl font-black text-muted select-none">
                  {companyName ? companyName.charAt(0).toUpperCase() : 'D'}
                </div>
              )}
            </div>

            <label className="flex-1 w-full flex flex-col items-center justify-center border border-dashed border-line rounded-2xl p-5 hover:border-accent/40 bg-panel/35 transition cursor-pointer text-center group">
              <Upload className="h-5 w-5 text-muted group-hover:text-accent transition duration-200" />
              <span className="text-xs font-bold text-text mt-2 block">Choose Login Logo/Banner</span>
              <span className="text-[10px] text-muted mt-0.5">PNG, JPG, SVG up to 2MB</span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleFileUpload(e, 'login')}
                disabled={uploadingLogin}
              />
            </label>
          </div>
          {uploadingLogin && (
            <div className="mt-2 flex items-center gap-2 text-[11px] font-semibold text-accent animate-pulse">
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              Uploading login page logo...
            </div>
          )}
        </div>

        {/* Feedback Messages */}
        {successMsg && (
          <div className="mt-4 p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl text-xs font-medium flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 flex-none" />
            {successMsg}
          </div>
        )}

        {errorMsg && (
          <div className="mt-4 p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-xl text-xs font-medium flex items-center gap-2">
            <AlertCircle className="h-4 w-4 flex-none" />
            {errorMsg}
          </div>
        )}
      </div>
    </div>
  );
}
