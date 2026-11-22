import React, { useCallback, useEffect, useState } from 'react';
import { Bell, CheckCircle2, X } from 'lucide-react';
import { AdminDashboard } from './components/AdminDashboard';
import { AnnouncementDetailModal } from './components/AnnouncementDetailModal';
import { AuthModal } from './components/AuthModal';
import { PortalAuthView, type PortalAuthTab } from './components/PortalAuthView';
import { ResidentPortal } from './components/ResidentPortal';
import { useRealtimeSocket } from './hooks/useRealtimeSocket';
import { api, ApiError } from './lib/api';
import type {
  AdminOverviewStats,
  Announcement,
  BootstrapStatus,
  EmailDispatchLog,
  EnrolledStudentRecord,
  PortalSettings,
  RealtimeEvent,
  SampleSessionBundle,
  UserProfile,
} from './types';

interface ToastState {
  id: number;
  message: string;
  tone: 'info' | 'success' | 'error';
}

const DEFAULT_OVERVIEW: AdminOverviewStats = {
  totalPublished: 0,
  urgentCount: 0,
  pinnedCount: 0,
  archivedCount: 0,
  totalResidents: 0,
  optedInResidents: 0,
  totalDispatches: 0,
  totalEmailsSent: 0,
};

const DEFAULT_PORTAL_SETTINGS: PortalSettings = {
  universityName: 'Occidental Mindoro State University',
  campusName: 'Mamburao Campus · Occidental Mindoro',
  portalTagline: 'Official Student, Faculty & Campus Residence Portal',
  heroHeadline: 'Official OMSU Mamburao announcements in one verified feed.',
  heroDescription:
    'Stay ahead of enrollment schedules, academic advisories, campus facilities updates, and student residence notices—synced in real time with direct email alerts.',
  bannerEnabled: true,
  bannerMessage:
    'Second Semester Enrollment & Student Portal verification is open at the Mamburao Registrar Office.',
  allowSelfRegistration: true,
  requireEnrolledVerification: true,
  supportEmail: 'registrar.mamburao@omsu.edu.ph',
  officeHours: 'Mon–Fri, 8:00 AM – 5:00 PM',
  updatedAt: '',
};

export default function App() {
  // In-memory auth session (never persisted in localStorage/sessionStorage)
  const [token, setToken] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [viewMode, setViewMode] = useState<'portal' | 'bulletin' | 'admin'>('portal');
  const [portalTab, setPortalTab] = useState<PortalAuthTab>('resident');
  const [sampleBundle, setSampleBundle] = useState<SampleSessionBundle | null>(null);
  const [portalSettings, setPortalSettings] = useState<PortalSettings>(DEFAULT_PORTAL_SETTINGS);

  const [bootstrapStatus, setBootstrapStatus] = useState<BootstrapStatus>({
    adminExists: true,
    envPasscodeConfigured: false,
    smtpConfigured: false,
  });

  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [residents, setResidents] = useState<UserProfile[]>([]);
  const [roster, setRoster] = useState<EnrolledStudentRecord[]>([]);
  const [dispatches, setDispatches] = useState<EmailDispatchLog[]>([]);
  const [overview, setOverview] = useState<AdminOverviewStats>(DEFAULT_OVERVIEW);
  const [loadingInitial, setLoadingInitial] = useState(true);

  // Modals & notifications
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<'login' | 'register' | 'claim-admin'>('login');
  const [selectedAnnouncementId, setSelectedAnnouncementId] = useState<string | null>(null);
  const [busyDetailAction, setBusyDetailAction] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);

  const showToast = useCallback((message: string, tone: 'info' | 'success' | 'error' = 'info') => {
    const id = Date.now();
    setToast({ id, message, tone });
    window.setTimeout(() => {
      setToast((curr) => (curr?.id === id ? null : curr));
    }, 4500);
  }, []);

  const loadBootstrapAndAnnouncements = useCallback(
    async (activeToken: string | null, activeUser: UserProfile | null) => {
      const [statusRes, settingsRes] = await Promise.all([
        api.getBootstrapStatus(),
        api.getPortalSettings(),
      ]);
      setBootstrapStatus(statusRes);
      setPortalSettings(settingsRes.settings);

      if (activeToken && activeUser) {
        const annRes = await api.listAnnouncements(activeToken, activeUser.role === 'admin');
        setAnnouncements(annRes.announcements);
      } else {
        setAnnouncements([]);
      }
    },
    []
  );

  const loadAdminData = useCallback(async (activeToken: string) => {
    const [ovRes, resRes, rosterRes, dispRes] = await Promise.all([
      api.getAdminOverview(activeToken),
      api.listResidents(activeToken),
      api.listRoster(activeToken),
      api.listDispatches(activeToken),
    ]);
    setOverview(ovRes.stats);
    setResidents(resRes.users);
    setRoster(rosterRes.roster);
    setDispatches(dispRes.dispatches);
  }, []);

  const refreshAll = useCallback(async () => {
    await loadBootstrapAndAnnouncements(token, currentUser);
    if (token && currentUser?.role === 'admin') {
      await loadAdminData(token);
    }
  }, [token, currentUser, loadBootstrapAndAnnouncements, loadAdminData]);

  useEffect(() => {
    let active = true;
    loadBootstrapAndAnnouncements(null, null)
      .catch(() => {
        if (active) showToast('Unable to load initial bulletin feed.', 'error');
      })
      .finally(() => {
        if (active) setLoadingInitial(false);
      });
    return () => {
      active = false;
    };
  }, [loadBootstrapAndAnnouncements, showToast]);

  const handleRealtimeEvent = useCallback(
    (event: RealtimeEvent) => {
      if (event.type === 'announcement:created') {
        setAnnouncements((prev) => {
          if (prev.some((a) => a.id === event.announcement.id)) return prev;
          return [event.announcement, ...prev].sort((a, b) => {
            if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
            return b.createdAt.localeCompare(a.createdAt);
          });
        });
        showToast(`New announcement: ${event.announcement.title}`, 'info');
        if (token && currentUser?.role === 'admin') {
          api.getAdminOverview(token).then((r) => setOverview(r.stats)).catch(() => {});
        }
      } else if (event.type === 'announcement:updated') {
        setAnnouncements((prev) => {
          const exists = prev.some((a) => a.id === event.announcement.id);
          const nextList = exists
            ? prev.map((a) =>
                a.id === event.announcement.id
                  ? { ...event.announcement, isReadByMe: a.isReadByMe }
                  : a
              )
            : [event.announcement, ...prev];
          return [...nextList].sort((a, b) => {
            if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
            return b.createdAt.localeCompare(a.createdAt);
          });
        });
        if (token && currentUser?.role === 'admin') {
          api.getAdminOverview(token).then((r) => setOverview(r.stats)).catch(() => {});
        }
      } else if (event.type === 'announcement:deleted') {
        setAnnouncements((prev) => prev.filter((a) => a.id !== event.id));
        if (selectedAnnouncementId === event.id) {
          setSelectedAnnouncementId(null);
        }
        if (token && currentUser?.role === 'admin') {
          api.getAdminOverview(token).then((r) => setOverview(r.stats)).catch(() => {});
        }
      } else if (event.type === 'announcement:read') {
        setAnnouncements((prev) =>
          prev.map((a) =>
            a.id === event.id
              ? {
                  ...a,
                  readCount: event.readCount,
                  isReadByMe:
                    currentUser && event.userId === currentUser.id ? true : a.isReadByMe,
                }
              : a
          )
        );
      } else if (event.type === 'email:dispatched') {
        setDispatches((prev) =>
          prev.some((d) => d.id === event.dispatch.id) ? prev : [event.dispatch, ...prev]
        );
        if (token && currentUser?.role === 'admin') {
          api.getAdminOverview(token).then((r) => setOverview(r.stats)).catch(() => {});
        }
      } else if (event.type === 'resident:updated') {
        if (token && currentUser?.role === 'admin') {
          loadAdminData(token).catch(() => {});
        }
      } else if (event.type === 'portal:updated') {
        setPortalSettings(event.settings);
      }
    },
    [token, currentUser, selectedAnnouncementId, loadAdminData, showToast]
  );

  const { connected: wsConnected, onlineCount } = useRealtimeSocket({
    token,
    onEvent: handleRealtimeEvent,
  });

  async function handleAuthenticated(
    newToken: string,
    user: UserProfile,
    extraInfo?: string,
    newSampleBundle?: SampleSessionBundle,
    preferredView?: 'admin' | 'bulletin'
  ) {
    setToken(newToken);
    setCurrentUser(user);
    if (newSampleBundle) {
      setSampleBundle(newSampleBundle);
    }
    setViewMode(preferredView ?? (user.role === 'admin' ? 'admin' : 'bulletin'));
    await loadBootstrapAndAnnouncements(newToken, user);
    if (user.role === 'admin') {
      await loadAdminData(newToken);
    }
    showToast(extraInfo || `Signed in as ${user.name} (${user.role}).`, 'success');
  }

  async function handleSwitchSampleRole(targetRole: 'admin' | 'resident' | 'teacher') {
    if (!sampleBundle) return;
    const target =
      targetRole === 'admin'
        ? sampleBundle.admin
        : targetRole === 'teacher'
          ? sampleBundle.teacher
          : sampleBundle.resident;
    setToken(target.token);
    setCurrentUser(target.user);
    setViewMode(targetRole === 'admin' ? 'admin' : 'bulletin');
    await loadBootstrapAndAnnouncements(target.token, target.user);
    if (targetRole === 'admin') {
      await loadAdminData(target.token);
    }
    showToast(`Switched to ${target.user.name} (${target.user.role}).`, 'info');
  }

  async function handleSignOut() {
    const nextTab: PortalAuthTab =
      currentUser?.role === 'admin'
        ? 'admin'
        : currentUser?.role === 'teacher'
          ? 'teacher'
          : 'resident';
    setToken(null);
    setCurrentUser(null);
    setViewMode('portal');
    setPortalTab(nextTab);
    setAnnouncements([]);
    setResidents([]);
    setRoster([]);
    setDispatches([]);
    setOverview(DEFAULT_OVERVIEW);
    await loadBootstrapAndAnnouncements(null, null);
    showToast('Signed out cleanly. Sample accounts remain attached below.', 'info');
  }

  async function handleAcknowledge(id: string) {
    if (!token) {
      setPortalTab('resident');
      setViewMode('portal');
      return;
    }
    setBusyDetailAction('read');
    try {
      const res = await api.markAnnouncementRead(id, token);
      setAnnouncements((prev) =>
        prev.map((a) =>
          a.id === id ? { ...a, readCount: res.readCount, isReadByMe: true } : a
        )
      );
      showToast('Announcement marked as read.', 'success');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Unable to mark as read.', 'error');
    } finally {
      setBusyDetailAction(null);
    }
  }

  const selectedAnnouncement =
    announcements.find((a) => a.id === selectedAnnouncementId) ?? null;

  if (loadingInitial) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0F254A] text-sm text-blue-100">
        Loading OMSU Mamburao Portal...
      </div>
    );
  }

  return (
    <>
      {!currentUser || !token ? (
        <PortalAuthView
          bootstrapStatus={bootstrapStatus}
          portalSettings={portalSettings}
          sampleBundle={sampleBundle}
          initialTab={portalTab}
          onAuthenticated={handleAuthenticated}
        />
      ) : viewMode === 'admin' && currentUser.role === 'admin' ? (
        <AdminDashboard
          token={token}
          currentUser={currentUser}
          bootstrapStatus={bootstrapStatus}
          portalSettings={portalSettings}
          announcements={announcements}
          residents={residents}
          roster={roster}
          dispatches={dispatches}
          overview={overview}
          wsConnected={wsConnected}
          onlineCount={onlineCount}
          onRefreshAll={refreshAll}
          onPortalSettingsSaved={(nextSettings) => setPortalSettings(nextSettings)}
          onSelectAnnouncement={(ann) => setSelectedAnnouncementId(ann.id)}
          onSwitchToBulletin={() => setViewMode('bulletin')}
          onSwitchToSampleResident={
            sampleBundle ? () => handleSwitchSampleRole('resident') : undefined
          }
          onSwitchToSampleTeacher={
            sampleBundle ? () => handleSwitchSampleRole('teacher') : undefined
          }
          onSignOut={handleSignOut}
          onNotifyToast={showToast}
        />
      ) : (
        <ResidentPortal
          token={token}
          currentUser={currentUser}
          bootstrapStatus={bootstrapStatus}
          portalSettings={portalSettings}
          announcements={announcements}
          wsConnected={wsConnected}
          onlineCount={onlineCount}
          onOpenAuth={(mode) => {
            if (!currentUser) {
              setPortalTab(
                mode === 'register' ? 'register' : mode === 'claim-admin' ? 'admin' : 'resident'
              );
              setViewMode('portal');
              return;
            }
            setAuthModalMode(mode);
            setAuthModalOpen(true);
          }}
          onOpenAdminDashboard={async () => {
            if (token && currentUser?.role === 'admin') {
              await loadAdminData(token);
              setViewMode('admin');
            }
          }}
          onSwitchToSampleAdmin={
            sampleBundle && currentUser?.role !== 'admin'
              ? () => handleSwitchSampleRole('admin')
              : undefined
          }
          onSwitchToSampleResident={
            sampleBundle && currentUser?.role !== 'resident'
              ? () => handleSwitchSampleRole('resident')
              : undefined
          }
          onSwitchToSampleTeacher={
            sampleBundle && currentUser?.role !== 'teacher'
              ? () => handleSwitchSampleRole('teacher')
              : undefined
          }
          onSelectAnnouncement={(ann) => setSelectedAnnouncementId(ann.id)}
          onAcknowledge={handleAcknowledge}
          onUpdateUser={(u) => setCurrentUser(u)}
          onSignOut={handleSignOut}
          onNotifyToast={showToast}
        />
      )}

      <AuthModal
        open={authModalOpen}
        initialMode={authModalMode}
        bootstrapStatus={bootstrapStatus}
        onClose={() => setAuthModalOpen(false)}
        onAuthenticated={handleAuthenticated}
      />

      <AnnouncementDetailModal
        announcement={selectedAnnouncement}
        currentUser={currentUser}
        busyAction={busyDetailAction}
        onClose={() => setSelectedAnnouncementId(null)}
        onAcknowledge={handleAcknowledge}
        onTogglePin={
          currentUser?.role === 'admin' && token
            ? async (ann) => {
                setBusyDetailAction('pin');
                try {
                  await api.updateAnnouncement(ann.id, { pinned: !ann.pinned }, token);
                  await refreshAll();
                } finally {
                  setBusyDetailAction(null);
                }
              }
            : undefined
        }
        onToggleArchive={
          currentUser?.role === 'admin' && token
            ? async (ann) => {
                setBusyDetailAction('archive');
                try {
                  await api.updateAnnouncement(
                    ann.id,
                    { status: ann.status === 'archived' ? 'published' : 'archived' },
                    token
                  );
                  await refreshAll();
                } finally {
                  setBusyDetailAction(null);
                }
              }
            : undefined
        }
        onSendEmail={
          currentUser?.role === 'admin' && token
            ? async (ann) => {
                setBusyDetailAction('notify');
                try {
                  const res = await api.sendEmailNotification(ann.id, token);
                  await refreshAll();
                  showToast(
                    `Email batch processed for ${res.dispatch.recipientCount} residents.`,
                    'success'
                  );
                } finally {
                  setBusyDetailAction(null);
                }
              }
            : undefined
        }
      />

      {toast && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed bottom-5 right-5 z-50 flex max-w-sm items-center gap-3 rounded-xl border px-4 py-3 text-xs font-medium shadow-lg ${
            toast.tone === 'error'
              ? 'border-red-200 bg-red-50 text-red-800'
              : toast.tone === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : 'border-slate-200 bg-white text-slate-800'
          }`}
        >
          {toast.tone === 'success' ? (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
          ) : (
            <Bell className="h-4 w-4 shrink-0 text-blue-700" />
          )}
          <span className="flex-1 leading-snug">{toast.message}</span>
          <button
            type="button"
            onClick={() => setToast(null)}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Dismiss notification"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </>
  );
}
