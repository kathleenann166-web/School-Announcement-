import React, { useEffect, useState } from 'react';
import { Eye, EyeOff, Lock, Mail, RefreshCw, ShieldCheck, UserPlus, Users, X } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import type { BootstrapStatus, SampleSessionBundle, UserProfile } from '../types';

interface AuthModalProps {
  open: boolean;
  initialMode?: 'login' | 'register' | 'claim-admin';
  bootstrapStatus: BootstrapStatus;
  onClose: () => void;
  onAuthenticated: (
    token: string,
    user: UserProfile,
    extraInfo?: string,
    sampleBundle?: SampleSessionBundle,
    preferredView?: 'admin' | 'bulletin'
  ) => void;
}

function generateRuntimeSamplePassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const bytes = new Uint8Array(10);
  window.crypto.getRandomValues(bytes);
  let out = 'Cv-';
  for (let i = 0; i < bytes.length; i++) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  return out;
}

export function AuthModal({
  open,
  initialMode = 'login',
  bootstrapStatus,
  onClose,
  onAuthenticated,
}: AuthModalProps) {
  const [mode, setMode] = useState<'login' | 'register' | 'claim-admin'>(
    !bootstrapStatus.adminExists && initialMode === 'login' ? 'claim-admin' : initialMode
  );

  // Regular Login / Resident Register fields
  const [studentId, setStudentId] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [unit, setUnit] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [adminPasscode, setAdminPasscode] = useState('');
  const [emailNotifications, setEmailNotifications] = useState(true);

  // Sample Setup fields (pre-filled with runtime-generated password on open when !adminExists)
  const [sampleAdminName] = useState('OMSU Mamburao Admin');
  const [sampleAdminEmail, setSampleAdminEmail] = useState('admin@omsu-mamburao.edu.ph');
  const [sampleAdminUnit] = useState('Administration Office · Mamburao');
  const [sampleResidentName] = useState('Juan Dela Cruz');
  const [sampleResidentEmail, setSampleResidentEmail] = useState('student@omsu-mamburao.edu.ph');
  const [sampleResidentUnit] = useState('BSIT 1-B');
  const [samplePassword, setSamplePassword] = useState('');
  const [showSamplePassword, setShowSamplePassword] = useState(true);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      const nextMode =
        !bootstrapStatus.adminExists && initialMode === 'login' ? 'claim-admin' : initialMode;
      setMode(nextMode);
      setError(null);
      if (!bootstrapStatus.adminExists && !samplePassword) {
        setSamplePassword(generateRuntimeSamplePassword());
      }
    }
  }, [open, initialMode, bootstrapStatus.adminExists, samplePassword]);

  if (!open) return null;

  async function launchSampleAccounts(targetRole: 'admin' | 'resident') {
    setError(null);
    setLoading(true);
    try {
      const res = await api.bootstrapSampleAccounts({
        adminName: sampleAdminName,
        adminEmail: sampleAdminEmail,
        adminUnit: sampleAdminUnit,
        residentName: sampleResidentName,
        residentEmail: sampleResidentEmail,
        residentUnit: sampleResidentUnit,
        teacherName: 'Prof. Clarissa Dizon',
        teacherEmail: 'teacher@omsu-mamburao.edu.ph',
        teacherUnit: 'CAST Faculty · BSIT Department',
        password: samplePassword,
        adminPasscode: bootstrapStatus.envPasscodeConfigured ? adminPasscode : undefined,
      });

      const bundle: SampleSessionBundle = {
        admin: { token: res.token, user: res.user },
        resident: { token: res.residentToken, user: res.residentUser },
        teacher: { token: res.teacherToken, user: res.teacherUser },
        sessionPassword: samplePassword,
      };

      if (targetRole === 'admin') {
        onAuthenticated(
          res.token,
          res.user,
          `Signed in as Admin (${res.user.email}). Student & Teacher sample accounts are also ready.`,
          bundle,
          'admin'
        );
      } else {
        onAuthenticated(
          res.residentToken,
          res.residentUser,
          `Signed in as Student (${res.residentUser.email}). Admin & Teacher sample accounts are also ready.`,
          bundle,
          'bulletin'
        );
      }
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to launch sample accounts.');
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (mode === 'claim-admin') {
      await launchSampleAccounts('admin');
      return;
    }

    setError(null);
    setLoading(true);
    try {
      if (mode === 'login') {
        const res = await api.login({ email, password });
        onAuthenticated(res.token, res.user);
        onClose();
      } else {
        const res = await api.registerResident({
          studentId,
          name,
          email,
          password,
          unit,
          emailNotifications,
        });
        onAuthenticated(res.token, res.user);
        onClose();
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to complete request.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
    >
      <div className="flex max-h-[92vh] w-full max-w-lg flex-col rounded-xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 id="auth-modal-title" className="font-display text-lg font-semibold text-slate-900">
              {mode === 'claim-admin'
                ? 'Quick Sign In — Sample Admin & Resident'
                : mode === 'login'
                  ? 'Sign in to OMSU Mamburao Portal'
                  : 'Create Student / Resident Account'}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {mode === 'claim-admin'
                ? 'Password is pre-filled below—click Sign In to open the dashboard immediately.'
                : mode === 'login'
                  ? 'Sign in with your Admin or Resident email and password.'
                  : 'Receive real-time campus announcements and email alerts.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close authentication modal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="border-b border-slate-200 bg-slate-50 px-6 py-2.5">
          <div className="flex items-center gap-1 rounded-lg bg-slate-200/70 p-1">
            {!bootstrapStatus.adminExists && (
              <button
                type="button"
                onClick={() => {
                  setMode('claim-admin');
                  setError(null);
                }}
                className={`flex-1 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  mode === 'claim-admin'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Sample Sign In
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setError(null);
              }}
              className={`flex-1 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                mode === 'login'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('register');
                setError(null);
              }}
              className={`flex-1 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                mode === 'register'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Resident Sign Up
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 overflow-y-auto p-6">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-700">
              {error}
            </div>
          )}

          {mode === 'claim-admin' ? (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
                    <ShieldCheck className="h-3.5 w-3.5 text-blue-700" />
                    <span>Sample Admin</span>
                  </div>
                  <input
                    type="email"
                    required
                    aria-label="Sample Admin Email"
                    value={sampleAdminEmail}
                    onChange={(e) => setSampleAdminEmail(e.target.value)}
                    className="mt-2 w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
                  />
                  <div className="mt-1.5 text-[11px] text-slate-500">{sampleAdminUnit}</div>
                </div>

                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
                    <Users className="h-3.5 w-3.5 text-blue-700" />
                    <span>Sample Resident</span>
                  </div>
                  <input
                    type="email"
                    required
                    aria-label="Sample Resident Email"
                    value={sampleResidentEmail}
                    onChange={(e) => setSampleResidentEmail(e.target.value)}
                    className="mt-2 w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
                  />
                  <div className="mt-1.5 text-[11px] text-slate-500">{sampleResidentUnit}</div>
                </div>
              </div>

              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label htmlFor="sample-password" className="text-xs font-medium text-slate-700">
                    Password for Sample Accounts
                  </label>
                  <button
                    type="button"
                    onClick={() => setSamplePassword(generateRuntimeSamplePassword())}
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-700 hover:underline"
                  >
                    <RefreshCw className="h-3 w-3" />
                    Regenerate
                  </button>
                </div>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <input
                    id="sample-password"
                    type={showSamplePassword ? 'text' : 'password'}
                    required
                    minLength={8}
                    value={samplePassword}
                    onChange={(e) => setSamplePassword(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-10 font-mono text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/15"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSamplePassword((s) => !s)}
                    aria-label={showSamplePassword ? 'Hide password' : 'Show password'}
                    className="absolute right-2.5 top-2 rounded p-1 text-slate-400 hover:text-slate-700"
                  >
                    {showSamplePassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              {bootstrapStatus.envPasscodeConfigured && (
                <div>
                  <label htmlFor="auth-passcode" className="mb-1.5 block text-xs font-medium text-slate-700">
                    Server Admin Setup Passcode
                  </label>
                  <input
                    id="auth-passcode"
                    type="password"
                    required
                    value={adminPasscode}
                    onChange={(e) => setAdminPasscode(e.target.value)}
                    placeholder="Enter ADMIN_PASSCODE"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/15"
                  />
                </div>
              )}

              <div className="flex flex-col gap-2 pt-1 sm:flex-row">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <ShieldCheck className="h-4 w-4" />
                  <span>{loading ? 'Opening...' : 'Open Admin Dashboard'}</span>
                </button>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => launchSampleAccounts('resident')}
                  className="flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-60"
                >
                  <Users className="h-4 w-4 text-slate-500" />
                  <span>Open Resident View</span>
                </button>
              </div>
            </>
          ) : (
            <>
              {mode === 'register' && (
                <>
                  <div>
                    <label htmlFor="auth-student-id" className="mb-1.5 block text-xs font-medium text-slate-700">
                      OMSU Student ID Number
                    </label>
                    <input
                      id="auth-student-id"
                      type="text"
                      required
                      minLength={4}
                      maxLength={40}
                      value={studentId}
                      onChange={(e) => setStudentId(e.target.value)}
                      placeholder="e.g. OMSU-2026-0002"
                      className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 font-mono text-sm uppercase text-slate-900 placeholder:normal-case placeholder:font-sans placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/15"
                    />
                  </div>
                  <div>
                    <label htmlFor="auth-name" className="mb-1.5 block text-xs font-medium text-slate-700">
                      Full Name
                    </label>
                    <input
                      id="auth-name"
                      type="text"
                      required
                      minLength={2}
                      maxLength={80}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Maria Clara Reyes"
                      className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/15"
                    />
                  </div>
                </>
              )}

              <div>
                <label htmlFor="auth-email" className="mb-1.5 block text-xs font-medium text-slate-700">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <input
                    id="auth-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@school.edu"
                    className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/15"
                  />
                </div>
              </div>

              {mode === 'register' && (
                <div>
                  <label htmlFor="auth-unit" className="mb-1.5 block text-xs font-medium text-slate-700">
                    Dorm, Grade, or Unit
                  </label>
                  <input
                    id="auth-unit"
                    type="text"
                    required
                    maxLength={80}
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    placeholder="e.g. BSIT 1-B · Mamburao Dormitory"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/15"
                  />
                </div>
              )}

              <div>
                <label htmlFor="auth-password" className="mb-1.5 block text-xs font-medium text-slate-700">
                  Password
                </label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <input
                    id="auth-password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={mode === 'login' ? 1 : 8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={mode === 'login' ? 'Enter password' : 'Minimum 8 characters'}
                    className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-10 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/15"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-2.5 top-2 rounded p-1 text-slate-400 hover:text-slate-700"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {mode === 'register' && (
                <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs text-slate-700">
                  <input
                    type="checkbox"
                    checked={emailNotifications}
                    onChange={(e) => setEmailNotifications(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-700 focus:ring-blue-600"
                  />
                  <span>
                    Email me immediately when administrators publish new campus announcements or urgent notices.
                  </span>
                </label>
              )}

              <button
                type="submit"
                disabled={loading}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {mode === 'register' ? <UserPlus className="h-4 w-4" /> : null}
                <span>
                  {loading
                    ? 'Signing in...'
                    : mode === 'login'
                      ? 'Sign In'
                      : 'Create Resident Account'}
                </span>
              </button>
            </>
          )}
        </form>
      </div>
    </div>
  );
}
