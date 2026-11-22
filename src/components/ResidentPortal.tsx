import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Clock,
  Mail,
  Pin,
  Search,
  Settings,
  ShieldCheck,
  X,
} from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { formatShortDate } from './AnnouncementDetailModal';
import type {
  Announcement,
  AnnouncementCategory,
  BootstrapStatus,
  PortalSettings,
  UserProfile,
} from '../types';

interface ResidentPortalProps {
  token: string | null;
  currentUser: UserProfile | null;
  bootstrapStatus: BootstrapStatus;
  portalSettings: PortalSettings;
  announcements: Announcement[];
  wsConnected: boolean;
  onlineCount: number;
  onOpenAuth: (mode: 'login' | 'register' | 'claim-admin') => void;
  onOpenAdminDashboard: () => void;
  onSwitchToSampleAdmin?: () => void;
  onSwitchToSampleResident?: () => void;
  onSwitchToSampleTeacher?: () => void;
  onSelectAnnouncement: (announcement: Announcement) => void;
  onAcknowledge: (id: string) => Promise<void>;
  onUpdateUser: (user: UserProfile) => void;
  onSignOut: () => void;
  onNotifyToast: (message: string, tone?: 'info' | 'success' | 'error') => void;
}

const CATEGORIES: ('All' | AnnouncementCategory)[] = [
  'All',
  'Academics',
  'Operations',
  'Events',
  'Health & Safety',
  'Financial',
  'Athletics',
];

export function ResidentPortal({
  token,
  currentUser,
  bootstrapStatus,
  portalSettings,
  announcements,
  wsConnected,
  onlineCount,
  onOpenAuth,
  onOpenAdminDashboard,
  onSwitchToSampleAdmin,
  onSwitchToSampleResident,
  onSwitchToSampleTeacher,
  onSelectAnnouncement,
  onAcknowledge,
  onUpdateUser,
  onSignOut,
  onNotifyToast,
}: ResidentPortalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<'All' | AnnouncementCategory>('All');
  const [priorityFilter, setPriorityFilter] = useState<'all' | 'urgent' | 'important'>('all');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [imgError, setImgError] = useState(false);

  // Preferences drawer
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [prefName, setPrefName] = useState(currentUser?.name || '');
  const [prefUnit, setPrefUnit] = useState(currentUser?.unit || '');
  const [prefEmailOptIn, setPrefEmailOptIn] = useState(currentUser?.emailNotifications ?? true);
  const [savingPrefs, setSavingPrefs] = useState(false);

  const published = useMemo(
    () => announcements.filter((a) => a.status === 'published'),
    [announcements]
  );

  const urgentCount = useMemo(
    () => published.filter((a) => a.priority === 'urgent').length,
    [published]
  );

  const unreadCount = useMemo(
    () => (currentUser ? published.filter((a) => !a.isReadByMe).length : 0),
    [published, currentUser]
  );

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return published.filter((a) => {
      if (selectedCategory !== 'All' && a.category !== selectedCategory) return false;
      if (priorityFilter !== 'all' && a.priority !== priorityFilter) return false;
      if (unreadOnly && currentUser && a.isReadByMe) return false;
      if (
        q &&
        !a.title.toLowerCase().includes(q) &&
        !a.body.toLowerCase().includes(q) &&
        !a.authorName.toLowerCase().includes(q) &&
        !a.audience.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [published, selectedCategory, priorityFilter, unreadOnly, currentUser, searchQuery]);

  const pinnedNotices = useMemo(() => filtered.filter((a) => a.pinned), [filtered]);
  const standardNotices = useMemo(() => filtered.filter((a) => !a.pinned), [filtered]);

  function openPreferences() {
    if (!currentUser) {
      onOpenAuth('login');
      return;
    }
    setPrefName(currentUser.name);
    setPrefUnit(currentUser.unit);
    setPrefEmailOptIn(currentUser.emailNotifications);
    setPrefsOpen(true);
  }

  async function handleSavePreferences(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setSavingPrefs(true);
    try {
      const res = await api.updateMyPreferences(
        {
          name: prefName,
          unit: prefUnit,
          emailNotifications: prefEmailOptIn,
        },
        token
      );
      onUpdateUser(res.user);
      setPrefsOpen(false);
      onNotifyToast('Resident profile and email alert preferences saved.', 'success');
    } catch (err) {
      onNotifyToast(err instanceof ApiError ? err.message : 'Unable to save preferences.', 'error');
    } finally {
      setSavingPrefs(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Top Bar Contract: Exact 3 Zones separated by gap-8 */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-xs">
        <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between gap-8 px-4 sm:px-6">
          {/* Zone 1: Single-element brand wordmark */}
          <a
            href="#top"
            className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          >
            OMSU Mamburao
          </a>

          {/* Zone 2: 4 concise single-line nav links */}
          <nav className="hidden items-center gap-6 text-sm font-medium text-slate-600 md:flex">
            <a
              href="#bulletin-feed"
              onClick={() => {
                setPriorityFilter('all');
                setSelectedCategory('All');
              }}
              className="whitespace-nowrap shrink-0 transition-colors hover:text-slate-900"
            >
              Announcements
            </a>
            <a
              href="#bulletin-feed"
              onClick={() => setPriorityFilter('urgent')}
              className="whitespace-nowrap shrink-0 transition-colors hover:text-slate-900"
            >
              Urgent Notices
            </a>
            <a
              href="#bulletin-feed"
              onClick={() => {
                setPriorityFilter('all');
                setSelectedCategory('Academics');
              }}
              className="whitespace-nowrap shrink-0 transition-colors hover:text-slate-900"
            >
              Academics
            </a>
            <a
              href="#how-it-works"
              className="whitespace-nowrap shrink-0 transition-colors hover:text-slate-900"
            >
              Email Alerts
            </a>
          </nav>

          {/* Zone 3: 1 primary CTA */}
          <div className="shrink-0">
            {currentUser?.role === 'admin' ? (
              <button
                type="button"
                onClick={onOpenAdminDashboard}
                className="whitespace-nowrap shrink-0 rounded-lg bg-[#1E3A8A] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#1D4ED8]"
              >
                Open Admin Console
              </button>
            ) : currentUser ? (
              <button
                type="button"
                onClick={openPreferences}
                className="whitespace-nowrap shrink-0 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-slate-800"
              >
                {currentUser.role === 'teacher' ? 'Teacher Account' : 'Student Account'}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onOpenAuth(!bootstrapStatus.adminExists ? 'claim-admin' : 'login')}
                className="whitespace-nowrap shrink-0 rounded-lg bg-[#1E3A8A] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#1D4ED8]"
              >
                Sign In
              </button>
            )}
          </div>
        </div>
      </header>

      {portalSettings.bannerEnabled && portalSettings.bannerMessage && (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-center text-xs font-medium text-amber-900">
          <span className="inline-flex items-center gap-2">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-700" />
            <span>{portalSettings.bannerMessage}</span>
          </span>
        </div>
      )}

      <main id="top" className="mx-auto max-w-[1200px] space-y-10 px-4 py-8 sm:px-6 sm:py-10">
        {/* Hero Split */}
        <section className="grid items-stretch gap-6 lg:grid-cols-12">
          <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-6 sm:p-8 lg:col-span-7">
            <div>
              <div className="text-xs font-semibold text-[#1E3A8A]">
                {portalSettings.universityName} · {portalSettings.campusName}
              </div>
              <h1 className="mt-2 max-w-xl font-display text-3xl font-bold tracking-tight text-slate-900 [text-wrap:balance] sm:text-4xl">
                {portalSettings.heroHeadline}
              </h1>
              <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-slate-600">
                {portalSettings.heroDescription}
              </p>
            </div>

            <div className="mt-6 space-y-4">
              {currentUser && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-slate-700">
                    <span className="font-semibold text-slate-900">{currentUser.name}</span>
                    {currentUser.studentId && (
                      <>
                        <span aria-hidden="true" className="text-slate-300">
                          ·
                        </span>
                        <span className="font-mono font-medium text-[#1E3A8A]">
                          {currentUser.studentId}
                        </span>
                      </>
                    )}
                    <span aria-hidden="true" className="text-slate-300">
                      ·
                    </span>
                    <span>{currentUser.unit || 'OMSU Member'}</span>
                    <span aria-hidden="true" className="text-slate-300">
                      ·
                    </span>
                    <span className="tabular-nums">
                      {unreadCount} unread {unreadCount === 1 ? 'notice' : 'notices'}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    {onSwitchToSampleAdmin && (
                      <button
                        type="button"
                        onClick={onSwitchToSampleAdmin}
                        className="inline-flex items-center gap-1 font-semibold text-blue-700 hover:underline"
                      >
                        <ShieldCheck className="h-3.5 w-3.5" />
                        Switch to Admin
                      </button>
                    )}
                    {onSwitchToSampleTeacher && (
                      <button
                        type="button"
                        onClick={onSwitchToSampleTeacher}
                        className="inline-flex items-center gap-1 font-semibold text-blue-700 hover:underline"
                      >
                        Switch to Teacher
                      </button>
                    )}
                    {onSwitchToSampleResident && (
                      <button
                        type="button"
                        onClick={onSwitchToSampleResident}
                        className="inline-flex items-center gap-1 font-semibold text-blue-700 hover:underline"
                      >
                        Switch to Student (BSIT 1-B)
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={openPreferences}
                      className="inline-flex items-center gap-1 font-medium text-blue-700 hover:underline"
                    >
                      <Settings className="h-3.5 w-3.5" />
                      Preferences
                    </button>
                    <button
                      type="button"
                      onClick={onSignOut}
                      className="font-medium text-slate-500 hover:text-slate-900"
                    >
                      Sign Out
                    </button>
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-slate-200 pt-4 text-xs text-slate-500 tabular-nums">
                <span>{published.length} active announcements</span>
                <span aria-hidden="true">·</span>
                <span>{urgentCount} urgent notices</span>
                <span aria-hidden="true">·</span>
                <span>
                  {wsConnected
                    ? `Live WebSocket connected (${onlineCount} viewing)`
                    : 'Reconnecting live updates...'}
                </span>
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-100 lg:col-span-5">
            {!imgError ? (
              <img
                src="/src/assets/images/campus_courtyard_banner_1795332226928.jpg"
                alt="OMSU Mamburao Campus Courtyard and Academic Hall"
                referrerPolicy="no-referrer"
                onError={() => setImgError(true)}
                className="h-64 w-full object-cover lg:h-full"
              />
            ) : (
              <div className="flex h-64 flex-col items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 p-8 text-center lg:h-full">
                <Building2 className="h-10 w-10 text-slate-400" />
                <div className="mt-3 font-display text-base font-semibold text-slate-700">
                  OMSU Mamburao Campus
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  Occidental Mindoro State University · Official Bulletin
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Filter & Search Toolbar */}
        <section id="bulletin-feed" className="space-y-6">
          <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="relative flex-1 md:max-w-md">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search announcements by keyword, building, or office..."
                  className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/15"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
                  {(['all', 'urgent', 'important'] as const).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPriorityFilter(p)}
                      className={`whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                        priorityFilter === p
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {p === 'all' ? 'All Priorities' : p}
                    </button>
                  ))}
                </div>

                {currentUser && (
                  <button
                    type="button"
                    onClick={() => setUnreadOnly((prev) => !prev)}
                    className={`whitespace-nowrap rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                      unreadOnly
                        ? 'border-blue-600 bg-blue-50 text-blue-700'
                        : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    Unread Only ({unreadCount})
                  </button>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto border-t border-slate-100 pt-3">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={`whitespace-nowrap shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    selectedCategory === cat
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Empty State */}
          {filtered.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white px-6 py-16 text-center">
              <Mail className="mx-auto h-9 w-9 text-slate-300" />
              <h2 className="mt-3 font-display text-lg font-semibold text-slate-900">
                No announcements match these filters
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Try clearing your search term or switching back to all categories.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setSelectedCategory('All');
                  setPriorityFilter('all');
                  setUnreadOnly(false);
                }}
                className="mt-4 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Reset Filters
              </button>
            </div>
          ) : (
            <div className="space-y-8">
              {/* Pinned Notices */}
              {pinnedNotices.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                    <Pin className="h-3.5 w-3.5 text-blue-700" />
                    <span>Pinned Priority Bulletins</span>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    {pinnedNotices.map((item) => (
                      <AnnouncementCard
                        key={item.id}
                        announcement={item}
                        currentUser={currentUser}
                        onSelect={() => onSelectAnnouncement(item)}
                        onAcknowledge={() => onAcknowledge(item.id)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Chronological Feed */}
              {standardNotices.length > 0 && (
                <div className="space-y-3">
                  <div className="text-xs font-semibold text-slate-700">
                    Recent Campus Announcements
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    {standardNotices.map((item) => (
                      <AnnouncementCard
                        key={item.id}
                        announcement={item}
                        currentUser={currentUser}
                        onSelect={() => onSelectAnnouncement(item)}
                        onAcknowledge={() => onAcknowledge(item.id)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        {/* How Email & Real-Time Sync Works */}
        <section
          id="how-it-works"
          className="grid gap-6 rounded-xl border border-slate-200 bg-white p-6 sm:p-8 md:grid-cols-3"
        >
          <div>
            <div className="text-xs font-semibold text-blue-700">01. Centralized Publishing</div>
            <h3 className="mt-1.5 font-display text-base font-semibold text-slate-900">
              One Official Source of Truth
            </h3>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
              School administrators publish, pin, categorize, and archive notices from a single
              dashboard instead of scattered group chats and flyers.
            </p>
          </div>
          <div>
            <div className="text-xs font-semibold text-blue-700">02. Instant WebSocket Sync</div>
            <h3 className="mt-1.5 font-display text-base font-semibold text-slate-900">
              Real-Time Bulletin Updates
            </h3>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
              Every connected Resident and Admin view refreshes instantaneously when announcements are
              posted, edited, pinned, or acknowledged.
            </p>
          </div>
          <div>
            <div className="text-xs font-semibold text-blue-700">03. Automated Email Dispatch</div>
            <h3 className="mt-1.5 font-display text-base font-semibold text-slate-900">
              Direct Resident Inbox Alerts
            </h3>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
              Subscribed residents receive formatted email alerts the moment an announcement goes
              live, with read-receipt tracking for critical updates.
            </p>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[1200px] flex-col items-start justify-between gap-4 px-4 py-6 text-xs text-slate-500 sm:flex-row sm:items-center sm:px-6">
          <div>
            {portalSettings.universityName} · {portalSettings.campusName} · {portalSettings.officeHours}
          </div>
          <div className="flex items-center gap-4">
            <span>{portalSettings.supportEmail}</span>
            <a href="#bulletin-feed" className="hover:text-slate-900">
              Browse Bulletins
            </a>
            <button
              type="button"
              onClick={onSignOut}
              className="hover:text-slate-900"
            >
              Sign Out
            </button>
          </div>
        </div>
      </footer>

      {/* RESIDENT PREFERENCES MODAL */}
      {prefsOpen && currentUser && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-labelledby="prefs-title"
        >
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <h2 id="prefs-title" className="font-display text-lg font-semibold text-slate-900">
                Resident Alert Preferences
              </h2>
              <button
                type="button"
                onClick={() => setPrefsOpen(false)}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleSavePreferences} className="space-y-4 p-6">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-700">Full Name</label>
                <input
                  type="text"
                  required
                  minLength={2}
                  value={prefName}
                  onChange={(e) => setPrefName(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm focus:border-blue-600 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-700">
                  Dorm, Grade, or Unit
                </label>
                <input
                  type="text"
                  required
                  value={prefUnit}
                  onChange={(e) => setPrefUnit(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm focus:border-blue-600 focus:outline-none"
                />
              </div>
              <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-slate-200 bg-slate-50 p-3.5 text-xs text-slate-700">
                <input
                  type="checkbox"
                  checked={prefEmailOptIn}
                  onChange={(e) => setPrefEmailOptIn(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-700"
                />
                <span>
                  Receive real-time email notifications at <strong>{currentUser.email}</strong>{' '}
                  whenever campus administrators publish new announcements.
                </span>
              </label>

              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setPrefsOpen(false);
                    onSignOut();
                  }}
                  className="text-xs font-medium text-red-700 hover:underline"
                >
                  Sign Out
                </button>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setPrefsOpen(false)}
                    className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={savingPrefs}
                    className="rounded-lg bg-blue-700 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-800"
                  >
                    {savingPrefs ? 'Saving...' : 'Save Preferences'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

interface AnnouncementCardProps {
  announcement: Announcement;
  currentUser: UserProfile | null;
  onSelect: () => void;
  onAcknowledge: () => void;
}

function AnnouncementCard({
  announcement,
  currentUser,
  onSelect,
  onAcknowledge,
}: AnnouncementCardProps) {
  const isUrgent = announcement.priority === 'urgent';
  const isImportant = announcement.priority === 'important';

  return (
    <article className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-6 transition-colors hover:border-slate-300">
      <div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          {isUrgent ? (
            <span className="inline-flex items-center gap-1 font-semibold text-red-700">
              <AlertTriangle className="h-3.5 w-3.5" />
              Urgent Notice
            </span>
          ) : isImportant ? (
            <span className="inline-flex items-center gap-1 font-semibold text-amber-700">
              <AlertTriangle className="h-3.5 w-3.5" />
              Important
            </span>
          ) : (
            <span className="font-medium text-slate-600">Standard</span>
          )}
          <span aria-hidden="true" className="text-slate-300">
            ·
          </span>
          <span className="text-slate-600">{announcement.category}</span>
          <span aria-hidden="true" className="text-slate-300">
            ·
          </span>
          <span className="text-slate-500">{announcement.audience}</span>
          {announcement.pinned && (
            <>
              <span aria-hidden="true" className="text-slate-300">
                ·
              </span>
              <span className="inline-flex items-center gap-1 font-medium text-blue-700">
                <Pin className="h-3 w-3" />
                Pinned
              </span>
            </>
          )}
        </div>

        <h3 className="mt-2.5 font-display text-lg font-semibold leading-snug text-slate-900">
          <button
            type="button"
            onClick={onSelect}
            className="text-left transition-colors hover:text-blue-700"
          >
            {announcement.title}
          </button>
        </h3>

        <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-slate-600">
          {announcement.body}
        </p>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4 text-xs">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-slate-500">
          <span>{announcement.authorName}</span>
          <span aria-hidden="true">·</span>
          <span className="tabular-nums">{formatShortDate(announcement.createdAt)}</span>
          {announcement.eventDate && (
            <>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1 tabular-nums text-slate-700">
                <Clock className="h-3 w-3 text-slate-400" />
                {formatShortDate(announcement.eventDate)}
              </span>
            </>
          )}
        </div>

        <div className="flex items-center gap-3">
          {currentUser && (
            <button
              type="button"
              disabled={announcement.isReadByMe}
              onClick={onAcknowledge}
              className={`inline-flex items-center gap-1 font-medium transition-colors ${
                announcement.isReadByMe
                  ? 'text-emerald-700'
                  : 'text-blue-700 hover:text-blue-800 hover:underline'
              }`}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              {announcement.isReadByMe ? 'Acknowledged' : 'Acknowledge'}
            </button>
          )}
          <button
            type="button"
            onClick={onSelect}
            className="font-medium text-slate-700 hover:text-slate-900 hover:underline"
          >
            Read More
          </button>
        </div>
      </div>
    </article>
  );
}
