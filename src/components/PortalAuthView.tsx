import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Building2,
  Eye,
  EyeOff,
  GraduationCap,
  Lock,
  Mail,
  ShieldCheck,
  UserCheck,
  UserPlus,
} from 'lucide-react';
import { api, ApiError } from '../lib/api';
import type { BootstrapStatus, PortalSettings, SampleSessionBundle, UserProfile } from '../types';

export type PortalAuthTab = 'resident' | 'teacher' | 'register' | 'admin';

interface PortalAuthViewProps {
  bootstrapStatus: BootstrapStatus;
  portalSettings: PortalSettings;
  sampleBundle: SampleSessionBundle | null;
  initialTab?: PortalAuthTab;
  onAuthenticated: (
    token: string,
    user: UserProfile,
    extraInfo?: string,
    newSampleBundle?: SampleSessionBundle,
    preferredView?: 'admin' | 'bulletin'
  ) => void;
}

function generateRuntimeSamplePassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const bytes = new Uint8Array(10);
  window.crypto.getRandomValues(bytes);
  let out = 'Omsu-';
  for (let i = 0; i < bytes.length; i++) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  return out;
}

const DEFAULT_SAMPLES = {
  admin: {
    name: 'Dean Elena Morales',
    email: 'admin@omsu-mamburao.edu.ph',
    unit: 'OMSU Mamburao Administration Office',
  },
  resident: {
    name: 'Marco Santos',
    email: 'student@omsu-mamburao.edu.ph',
    studentId: 'OMSU-2026-0001',
    unit: 'BSIT 1-B',
  },
  teacher: {
    name: 'Prof. Clarissa Dizon',
    email: 'teacher@omsu-mamburao.edu.ph',
    studentId: 'FAC-2026-0001',
    unit: 'CAST Faculty · BSIT Department',
  },
};

export function PortalAuthView({
  bootstrapStatus,
  portalSettings,
  sampleBundle,
  initialTab = 'resident',
  onAuthenticated,
}: PortalAuthViewProps) {
  const [tab, setTab] = useState<PortalAuthTab>(initialTab);

  const canQuickFill =
    !bootstrapStatus.envPasscodeConfigured &&
    (!bootstrapStatus.adminExists || sampleBundle !== null);

  const [pendingQuickPassword, setPendingQuickPassword] = useState<string>(() =>
    bootstrapStatus.envPasscodeConfigured ? '' : generateRuntimeSamplePassword()
  );

  const attachedPassword = sampleBundle?.sessionPassword ?? pendingQuickPassword;

  function resolveSampleEmail(targetTab: 'resident' | 'teacher' | 'admin'): string {
    if (targetTab === 'admin') {
      return sampleBundle?.admin.user.email ?? DEFAULT_SAMPLES.admin.email;
    }
    if (targetTab === 'teacher') {
      return sampleBundle?.teacher.user.email ?? DEFAULT_SAMPLES.teacher.email;
    }
    return sampleBundle?.resident.user.email ?? DEFAULT_SAMPLES.resident.email;
  }

  // Pre-attach sample email and runtime password on load and after sign-out so user can click Sign In directly
  const [email, setEmail] = useState<string>(() => {
    if (!canQuickFill) return '';
    return initialTab === 'register'
      ? resolveSampleEmail('resident')
      : resolveSampleEmail(initialTab);
  });

  const [password, setPassword] = useState<string>(() => {
    if (!canQuickFill) return '';
    return attachedPassword;
  });

  const [showPassword, setShowPassword] = useState<boolean>(canQuickFill);

  // Enrolled OMSU student/teacher registration inputs
  const [regStudentId, setRegStudentId] = useState('');
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regUnit, setRegUnit] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [regEmailOptIn, setRegEmailOptIn] = useState(true);

  const [adminPasscode, setAdminPasscode] = useState('');
  const [forgotHelpOpen, setForgotHelpOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTab(initialTab);
    if (canQuickFill && initialTab !== 'register') {
      setEmail(resolveSampleEmail(initialTab));
      setPassword(attachedPassword);
    }
  }, [initialTab]);

  useEffect(() => {
    if (canQuickFill && tab !== 'register' && (!email || !password)) {
      setEmail(resolveSampleEmail(tab));
      setPassword(attachedPassword);
    }
  }, [canQuickFill, tab, sampleBundle, attachedPassword, email, password]);

  function ensureActiveQuickPassword(): string {
    const existing = sampleBundle?.sessionPassword ?? pendingQuickPassword;
    if (existing) {
      return existing;
    }
    const next = generateRuntimeSamplePassword();
    setPendingQuickPassword(next);
    return next;
  }

  function handleQuickFill(targetTab: 'resident' | 'teacher' | 'admin') {
    setTab(targetTab);
    setError(null);
    setForgotHelpOpen(false);
    const activePw = ensureActiveQuickPassword();
    setPassword(activePw);
    setEmail(resolveSampleEmail(targetTab));
  }

  function handleTabSwitch(nextTab: PortalAuthTab) {
    setTab(nextTab);
    setError(null);
    setForgotHelpOpen(false);
    if (canQuickFill && nextTab !== 'register') {
      handleQuickFill(nextTab);
    }
  }

  async function executeSignIn(
    targetTab: 'resident' | 'teacher' | 'admin',
    targetEmail: string,
    targetPassword: string
  ) {
    setError(null);
    setLoading(true);
    try {
      const normalizedEmail = targetEmail.trim().toLowerCase();

      if (
        !bootstrapStatus.adminExists &&
        (targetTab === 'admin' ||
          targetTab === 'teacher' ||
          normalizedEmail === DEFAULT_SAMPLES.resident.email ||
          normalizedEmail === DEFAULT_SAMPLES.teacher.email ||
          normalizedEmail === DEFAULT_SAMPLES.admin.email)
      ) {
        const res = await api.bootstrapSampleAccounts({
          adminName: DEFAULT_SAMPLES.admin.name,
          adminEmail: targetTab === 'admin' ? normalizedEmail : DEFAULT_SAMPLES.admin.email,
          adminUnit: DEFAULT_SAMPLES.admin.unit,
          residentName: DEFAULT_SAMPLES.resident.name,
          residentEmail: targetTab === 'resident' ? normalizedEmail : DEFAULT_SAMPLES.resident.email,
          residentUnit: DEFAULT_SAMPLES.resident.unit,
          teacherName: DEFAULT_SAMPLES.teacher.name,
          teacherEmail: targetTab === 'teacher' ? normalizedEmail : DEFAULT_SAMPLES.teacher.email,
          teacherUnit: DEFAULT_SAMPLES.teacher.unit,
          password: targetPassword,
          adminPasscode: bootstrapStatus.envPasscodeConfigured ? adminPasscode : undefined,
        });

        const bundle: SampleSessionBundle = {
          admin: { token: res.token, user: res.user },
          resident: { token: res.residentToken, user: res.residentUser },
          teacher: { token: res.teacherToken, user: res.teacherUser },
          sessionPassword: targetPassword,
        };

        if (targetTab === 'admin') {
          onAuthenticated(
            res.token,
            res.user,
            `Signed in as ${res.user.name} (Admin Dashboard ready).`,
            bundle,
            'admin'
          );
        } else if (targetTab === 'teacher') {
          onAuthenticated(
            res.teacherToken,
            res.teacherUser,
            `Signed in as ${res.teacherUser.name} (Teacher Portal ready).`,
            bundle,
            'bulletin'
          );
        } else {
          onAuthenticated(
            res.residentToken,
            res.residentUser,
            `Signed in as ${res.residentUser.name} (BSIT 1-B Student Portal ready).`,
            bundle,
            'bulletin'
          );
        }
        return;
      }

      const res = await api.login({ email: normalizedEmail, password: targetPassword });
      if (targetTab === 'admin' && res.user.role !== 'admin') {
        setError('This account is not an Administrator. Switch to the Student or Teacher tab.');
        return;
      }
      if (targetTab === 'teacher' && res.user.role === 'resident') {
        setError('This account is an Enrolled Student account. Switch to the Student tab.');
        return;
      }

      onAuthenticated(
        res.token,
        res.user,
        undefined,
        sampleBundle ?? undefined,
        res.user.role === 'admin' ? 'admin' : 'bulletin'
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to sign in.');
    } finally {
      setLoading(false);
    }
  }

  async function handleSignInSubmit(e: React.FormEvent) {
    e.preventDefault();
    const activeTab = tab === 'register' ? 'resident' : tab;
    await executeSignIn(activeTab, email, password);
  }

  async function handleRegisterSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api.registerResident({
        studentId: regStudentId,
        name: regName,
        email: regEmail,
        password: regPassword,
        unit: regUnit,
        emailNotifications: regEmailOptIn,
      });
      onAuthenticated(
        res.token,
        res.user,
        `Welcome ${res.user.name}! Your OMSU Mamburao account is verified and active.`,
        sampleBundle ?? undefined,
        'bulletin'
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to create account.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#0F254A] px-4 py-8 text-slate-900">
      <div className="w-full max-w-[540px] overflow-hidden rounded-2xl border border-blue-950/40 bg-white shadow-2xl">
        {/* University Header */}
        <div className="bg-[#1E3A8A] px-6 py-7 text-center text-white">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-blue-200/30 bg-white/10">
            <GraduationCap className="h-7 w-7 text-blue-100" />
          </div>
          <h1 className="mt-3.5 font-display text-lg font-bold tracking-tight text-white sm:text-xl">
            {portalSettings.universityName.toUpperCase()}
          </h1>
          <p className="mt-1 text-xs font-medium text-blue-100">
            {portalSettings.campusName}
          </p>
          <p className="mt-2 text-[11px] font-medium tracking-wide text-amber-200/95">
            {portalSettings.portalTagline}
          </p>
        </div>

        {portalSettings.bannerEnabled && portalSettings.bannerMessage && (
          <div className="flex items-start gap-2.5 border-b border-amber-200 bg-amber-50 px-5 py-2.5 text-xs text-amber-900">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-700" />
            <span className="leading-snug">{portalSettings.bannerMessage}</span>
          </div>
        )}

        {/* 4-Tab Switcher: Student / Teacher / Sign Up / Admin */}
        <div className="border-b border-slate-200 bg-blue-50/70 p-1.5">
          <div className="grid grid-cols-4 gap-1">
            <button
              type="button"
              onClick={() => handleTabSwitch('resident')}
              className={`flex items-center justify-center gap-1 rounded-lg px-2 py-2.5 text-xs font-semibold transition-colors ${
                tab === 'resident'
                  ? 'bg-white text-[#1E3A8A] shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <UserCheck className="h-3.5 w-3.5 shrink-0" />
              <span className="whitespace-nowrap">Student</span>
            </button>

            <button
              type="button"
              onClick={() => handleTabSwitch('teacher')}
              className={`flex items-center justify-center gap-1 rounded-lg px-2 py-2.5 text-xs font-semibold transition-colors ${
                tab === 'teacher'
                  ? 'bg-white text-[#1E3A8A] shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <BookOpen className="h-3.5 w-3.5 shrink-0" />
              <span className="whitespace-nowrap">Teacher</span>
            </button>

            <button
              type="button"
              onClick={() => handleTabSwitch('register')}
              className={`flex items-center justify-center gap-1 rounded-lg px-2 py-2.5 text-xs font-semibold transition-colors ${
                tab === 'register'
                  ? 'bg-white text-[#1E3A8A] shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <UserPlus className="h-3.5 w-3.5 shrink-0" />
              <span className="whitespace-nowrap">Sign Up</span>
            </button>

            <button
              type="button"
              onClick={() => handleTabSwitch('admin')}
              className={`flex items-center justify-center gap-1 rounded-lg px-2 py-2.5 text-xs font-semibold transition-colors ${
                tab === 'admin'
                  ? 'bg-white text-[#1E3A8A] shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Building2 className="h-3.5 w-3.5 shrink-0" />
              <span className="whitespace-nowrap">Admin</span>
            </button>
          </div>
        </div>

        {/* Tab Forms */}
        <div className="p-6">
          {error && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-700">
              {error}
            </div>
          )}

          {tab === 'register' ? (
            !portalSettings.allowSelfRegistration ? (
              <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-5 text-center text-xs text-slate-600">
                <div className="font-semibold text-slate-900">
                  Self-Registration Is Closed
                </div>
                <p className="leading-relaxed">
                  The campus administrator has restricted public sign-ups. Please contact{' '}
                  <span className="font-semibold text-[#1E3A8A]">
                    {portalSettings.supportEmail}
                  </span>{' '}
                  ({portalSettings.officeHours}) to request an account.
                </p>
                <button
                  type="button"
                  onClick={() => handleTabSwitch('resident')}
                  className="font-semibold text-[#1E3A8A] underline"
                >
                  Return to Student Sign In
                </button>
              </div>
            ) : (
              <form onSubmit={handleRegisterSubmit} className="space-y-4">
                {portalSettings.requireEnrolledVerification && (
                  <div className="rounded-lg border border-blue-200 bg-blue-50/80 px-3.5 py-2.5 text-xs leading-relaxed text-[#1E3A8A]">
                    <div className="font-semibold">Enrolled OMSU Students &amp; Faculty Only</div>
                    <div className="mt-0.5 text-[11px] text-slate-600">
                      Your OMSU Student or Faculty ID and Email must match the Mamburao Registrar roster.
                      Sample roster ID: <span className="font-mono font-semibold">OMSU-2026-0002</span> ({' '}
                      <span className="font-mono">maria.reyes@omsu-mamburao.edu.ph</span>)
                    </div>
                  </div>
                )}

                <div>
                  <label htmlFor="reg-student-id" className="mb-1.5 block text-xs font-semibold text-slate-700">
                    OMSU Student / Faculty ID Number
                  </label>
                  <input
                    id="reg-student-id"
                    type="text"
                    required={portalSettings.requireEnrolledVerification}
                    minLength={4}
                    maxLength={40}
                    value={regStudentId}
                    onChange={(e) => setRegStudentId(e.target.value)}
                    placeholder="e.g. OMSU-2026-0002"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 font-mono text-sm uppercase text-slate-900 placeholder:normal-case placeholder:font-sans placeholder:text-slate-400 focus:border-[#1D4ED8] focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/15"
                  />
                </div>

                <div>
                  <label htmlFor="reg-name" className="mb-1.5 block text-xs font-semibold text-slate-700">
                    Full Name
                  </label>
                  <input
                    id="reg-name"
                    type="text"
                    required
                    minLength={2}
                    maxLength={80}
                    value={regName}
                    onChange={(e) => setRegName(e.target.value)}
                    placeholder="e.g. Maria Clara Reyes"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#1D4ED8] focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/15"
                  />
                </div>

                <div>
                  <label htmlFor="reg-email" className="mb-1.5 block text-xs font-semibold text-slate-700">
                    Official OMSU Email Address
                  </label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
                    <input
                      id="reg-email"
                      type="email"
                      required
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                      placeholder="student@omsu-mamburao.edu.ph"
                      className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-9 pr-3.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#1D4ED8] focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/15"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="reg-unit" className="mb-1.5 block text-xs font-semibold text-slate-700">
                    Program, Year &amp; Section, or Department
                  </label>
                  <input
                    id="reg-unit"
                    type="text"
                    required
                    maxLength={80}
                    value={regUnit}
                    onChange={(e) => setRegUnit(e.target.value)}
                    placeholder="e.g. BSIT 1-B"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#1D4ED8] focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/15"
                  />
                </div>

                <div>
                  <label htmlFor="reg-password" className="mb-1.5 block text-xs font-semibold text-slate-700">
                    Password
                  </label>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
                    <input
                      id="reg-password"
                      type={showRegPassword ? 'text' : 'password'}
                      required
                      minLength={8}
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      placeholder="Minimum 8 characters"
                      className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-9 pr-10 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#1D4ED8] focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/15"
                    />
                    <button
                      type="button"
                      onClick={() => setShowRegPassword((s) => !s)}
                      aria-label={showRegPassword ? 'Hide password' : 'Show password'}
                      className="absolute right-2.5 top-2.5 rounded p-1 text-slate-400 hover:text-slate-700"
                    >
                      {showRegPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs text-slate-700">
                  <input
                    type="checkbox"
                    checked={regEmailOptIn}
                    onChange={(e) => setRegEmailOptIn(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-[#1E3A8A] focus:ring-[#1D4ED8]"
                  />
                  <span>
                    Email me immediately when OMSU Mamburao posts new announcements or urgent alerts.
                  </span>
                </label>

                <button
                  type="submit"
                  disabled={loading}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#1E3A8A] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#1D4ED8] disabled:opacity-60"
                >
                  <span>{loading ? 'Creating Account...' : 'Create Account'}</span>
                  <ArrowRight className="h-4 w-4" />
                </button>

                <p className="text-center text-xs text-slate-500">
                  Already registered?{' '}
                  <button
                    type="button"
                    onClick={() => handleTabSwitch('resident')}
                    className="font-semibold text-[#1E3A8A] underline hover:text-[#1D4ED8]"
                  >
                    Sign In here
                  </button>
                </p>
              </form>
            )
          ) : (
            <form onSubmit={handleSignInSubmit} className="space-y-4">
              <div>
                <label htmlFor="portal-email" className="mb-1.5 block text-xs font-semibold text-slate-700">
                  {tab === 'admin'
                    ? 'Administrator Email Address'
                    : tab === 'teacher'
                      ? 'Faculty / Teacher Email Address'
                      : 'Enrolled College Student Email Address'}
                </label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
                  <input
                    id="portal-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={
                      tab === 'admin'
                        ? DEFAULT_SAMPLES.admin.email
                        : tab === 'teacher'
                          ? DEFAULT_SAMPLES.teacher.email
                          : DEFAULT_SAMPLES.resident.email
                    }
                    className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-9 pr-3.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#1D4ED8] focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/15"
                  />
                </div>
              </div>

              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label htmlFor="portal-password" className="text-xs font-semibold text-slate-700">
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() => setForgotHelpOpen((prev) => !prev)}
                    className="text-xs font-medium text-[#1E3A8A] hover:underline"
                  >
                    Forgot Password?
                  </button>
                </div>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
                  <input
                    id="portal-password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={!bootstrapStatus.adminExists ? 8 : 1}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter password"
                    className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-9 pr-10 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#1D4ED8] focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/15"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-2.5 top-2.5 rounded p-1 text-slate-400 hover:text-slate-700"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {forgotHelpOpen && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs leading-relaxed text-slate-600">
                  {tab === 'admin'
                    ? 'Administrators can set or rotate access via the server ADMIN_PASSCODE environment variable.'
                    : `Students and teachers can contact ${portalSettings.supportEmail} (${portalSettings.officeHours}) for password assistance.`}
                </div>
              )}

              {tab === 'admin' && !bootstrapStatus.adminExists && bootstrapStatus.envPasscodeConfigured && (
                <div>
                  <label htmlFor="portal-passcode" className="mb-1.5 block text-xs font-semibold text-slate-700">
                    Server Admin Setup Passcode
                  </label>
                  <input
                    id="portal-passcode"
                    type="password"
                    required
                    value={adminPasscode}
                    onChange={(e) => setAdminPasscode(e.target.value)}
                    placeholder="Enter ADMIN_PASSCODE"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-[#1D4ED8] focus:outline-none"
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#1E3A8A] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#1D4ED8] disabled:opacity-60"
              >
                {tab === 'admin' ? <ShieldCheck className="h-4 w-4" /> : null}
                <span>
                  {loading
                    ? 'Signing In...'
                    : tab === 'admin'
                      ? 'Sign In as Admin'
                      : tab === 'teacher'
                        ? 'Sign In as Teacher'
                        : 'Sign In as College Student'}
                </span>
                <ArrowRight className="h-4 w-4" />
              </button>

              {tab === 'resident' && portalSettings.allowSelfRegistration && (
                <p className="text-center text-xs text-slate-500">
                  Don&apos;t have an account yet?{' '}
                  <button
                    type="button"
                    onClick={() => handleTabSwitch('register')}
                    className="font-semibold text-[#1E3A8A] underline hover:text-[#1D4ED8]"
                  >
                    Create an Account (Sign Up)
                  </button>
                </p>
              )}
            </form>
          )}
        </div>
      </div>

      <p className="mt-5 flex items-center gap-1.5 text-center text-xs font-medium text-blue-100/90">
        <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-amber-300" />
        <span>
          Restricted Access: Only officially enrolled Occidental Mindoro State University students &amp; faculty may enter.
        </span>
      </p>
    </div>
  );
}
