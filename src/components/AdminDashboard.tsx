import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  ArrowLeft,
  CheckCircle2,
  Eye,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Mail,
  Megaphone,
  Menu,
  Pencil,
  Pin,
  Plus,
  Save,
  Search,
  Send,
  SlidersHorizontal,
  Trash2,
  Upload,
  UserCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { formatDateTime, formatShortDate } from './AnnouncementDetailModal';
import type {
  AdminOverviewStats,
  Announcement,
  AnnouncementAudience,
  AnnouncementCategory,
  AnnouncementPriority,
  BootstrapStatus,
  EmailDispatchLog,
  EnrolledStudentRecord,
  PortalSettings,
  UserProfile,
  UserRole,
} from '../types';

type AdminTab = 'announcements' | 'residents' | 'roster' | 'dispatches' | 'portal-settings';

interface AdminDashboardProps {
  token: string;
  currentUser: UserProfile;
  bootstrapStatus: BootstrapStatus;
  portalSettings: PortalSettings;
  announcements: Announcement[];
  residents: UserProfile[];
  roster: EnrolledStudentRecord[];
  dispatches: EmailDispatchLog[];
  overview: AdminOverviewStats;
  wsConnected: boolean;
  onlineCount: number;
  onRefreshAll: () => Promise<void>;
  onPortalSettingsSaved: (settings: PortalSettings) => void;
  onSelectAnnouncement: (announcement: Announcement) => void;
  onSwitchToBulletin: () => void;
  onSwitchToSampleResident?: () => void;
  onSwitchToSampleTeacher?: () => void;
  onSignOut: () => void;
  onNotifyToast: (message: string, tone?: 'info' | 'success' | 'error') => void;
}

const CATEGORIES: AnnouncementCategory[] = [
  'Academics',
  'Operations',
  'Events',
  'Health & Safety',
  'Financial',
  'Athletics',
];

const AUDIENCES: AnnouncementAudience[] = [
  'All Residents',
  'Dorm & Housing',
  'Students & Parents',
  'Faculty & Staff',
];

export function AdminDashboard({
  token,
  currentUser,
  bootstrapStatus,
  portalSettings,
  announcements,
  residents,
  roster,
  dispatches,
  overview,
  wsConnected,
  onlineCount,
  onRefreshAll,
  onPortalSettingsSaved,
  onSelectAnnouncement,
  onSwitchToBulletin,
  onSwitchToSampleResident,
  onSwitchToSampleTeacher,
  onSignOut,
  onNotifyToast,
}: AdminDashboardProps) {
  const [activeTab, setActiveTab] = useState<AdminTab>('announcements');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Announcement filtering
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'published' | 'archived' | 'all'>('published');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  // Announcement composer state
  const [composerOpen, setComposerOpen] = useState(false);
  const [editingAnnouncement, setEditingAnnouncement] = useState<Announcement | null>(null);
  const [formTitle, setFormTitle] = useState('');
  const [formCategory, setFormCategory] = useState<AnnouncementCategory>('Academics');
  const [formPriority, setFormPriority] = useState<AnnouncementPriority>('normal');
  const [formAudience, setFormAudience] = useState<AnnouncementAudience>('All Residents');
  const [formEventDate, setFormEventDate] = useState('');
  const [formPinned, setFormPinned] = useState(false);
  const [formBody, setFormBody] = useState('');
  const [formNotifyEmail, setFormNotifyEmail] = useState(true);
  const [savingAnnouncement, setSavingAnnouncement] = useState(false);

  // Inline delete confirmation state
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [busyRowId, setBusyRowId] = useState<string | null>(null);

  // Resident directory state
  const [residentSearch, setResidentSearch] = useState('');
  const [addResidentOpen, setAddResidentOpen] = useState(false);
  const [newUserStudentId, setNewUserStudentId] = useState('');
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserUnit, setNewUserUnit] = useState('');
  const [newUserRole, setNewUserRole] = useState<UserRole>('resident');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserOptIn, setNewUserOptIn] = useState(true);
  const [savingUser, setSavingUser] = useState(false);
  const [confirmDeleteUserId, setConfirmDeleteUserId] = useState<string | null>(null);

  // Enrolled OMSU Roster state
  const [rosterSearch, setRosterSearch] = useState('');
  const [rosterStatusFilter, setRosterStatusFilter] = useState<'all' | 'enrolled' | 'inactive'>('all');
  const [addRosterOpen, setAddRosterOpen] = useState(false);
  const [bulkRosterOpen, setBulkRosterOpen] = useState(false);
  const [rosterStudentId, setRosterStudentId] = useState('');
  const [rosterFullName, setRosterFullName] = useState('');
  const [rosterEmail, setRosterEmail] = useState('');
  const [rosterProgram, setRosterProgram] = useState('');
  const [rosterMemberType, setRosterMemberType] = useState<'student' | 'teacher'>('student');
  const [rosterSemester, setRosterSemester] = useState('2nd Sem AY 2026-2027');
  const [bulkLines, setBulkLines] = useState('');
  const [savingRoster, setSavingRoster] = useState(false);
  const [confirmDeleteRosterId, setConfirmDeleteRosterId] = useState<string | null>(null);

  // Email dispatch preview state
  const [selectedDispatch, setSelectedDispatch] = useState<EmailDispatchLog | null>(null);

  // Portal & Student Portal settings form state
  const [psUniversity, setPsUniversity] = useState(portalSettings.universityName);
  const [psCampus, setPsCampus] = useState(portalSettings.campusName);
  const [psTagline, setPsTagline] = useState(portalSettings.portalTagline);
  const [psHeroHeadline, setPsHeroHeadline] = useState(portalSettings.heroHeadline);
  const [psHeroDescription, setPsHeroDescription] = useState(portalSettings.heroDescription);
  const [psBannerEnabled, setPsBannerEnabled] = useState(portalSettings.bannerEnabled);
  const [psBannerMessage, setPsBannerMessage] = useState(portalSettings.bannerMessage);
  const [psAllowSelfReg, setPsAllowSelfReg] = useState(portalSettings.allowSelfRegistration);
  const [psRequireEnrolled, setPsRequireEnrolled] = useState(
    portalSettings.requireEnrolledVerification
  );
  const [psSupportEmail, setPsSupportEmail] = useState(portalSettings.supportEmail);
  const [psOfficeHours, setPsOfficeHours] = useState(portalSettings.officeHours);
  const [savingSettings, setSavingSettings] = useState(false);

  useEffect(() => {
    setPsUniversity(portalSettings.universityName);
    setPsCampus(portalSettings.campusName);
    setPsTagline(portalSettings.portalTagline);
    setPsHeroHeadline(portalSettings.heroHeadline);
    setPsHeroDescription(portalSettings.heroDescription);
    setPsBannerEnabled(portalSettings.bannerEnabled);
    setPsBannerMessage(portalSettings.bannerMessage);
    setPsAllowSelfReg(portalSettings.allowSelfRegistration);
    setPsRequireEnrolled(portalSettings.requireEnrolledVerification);
    setPsSupportEmail(portalSettings.supportEmail);
    setPsOfficeHours(portalSettings.officeHours);
  }, [portalSettings]);

  async function handleSavePortalSettings(e: React.FormEvent) {
    e.preventDefault();
    setSavingSettings(true);
    try {
      const res = await api.updatePortalSettings(
        {
          universityName: psUniversity,
          campusName: psCampus,
          portalTagline: psTagline,
          heroHeadline: psHeroHeadline,
          heroDescription: psHeroDescription,
          bannerEnabled: psBannerEnabled,
          bannerMessage: psBannerMessage,
          allowSelfRegistration: psAllowSelfReg,
          requireEnrolledVerification: psRequireEnrolled,
          supportEmail: psSupportEmail,
          officeHours: psOfficeHours,
        },
        token
      );
      onPortalSettingsSaved(res.settings);
      onNotifyToast('Student Portal & university settings updated live.', 'success');
    } catch (err) {
      onNotifyToast(err instanceof ApiError ? err.message : 'Unable to save portal settings.', 'error');
    } finally {
      setSavingSettings(false);
    }
  }

  const filteredAnnouncements = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return announcements.filter((item) => {
      if (statusFilter !== 'all' && item.status !== statusFilter) return false;
      if (categoryFilter !== 'all' && item.category !== categoryFilter) return false;
      if (
        q &&
        !item.title.toLowerCase().includes(q) &&
        !item.body.toLowerCase().includes(q) &&
        !item.authorName.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [announcements, searchQuery, statusFilter, categoryFilter]);

  const filteredResidents = useMemo(() => {
    const q = residentSearch.trim().toLowerCase();
    return residents.filter((u) => {
      if (!q) return true;
      return (
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.unit.toLowerCase().includes(q) ||
        (u.studentId || '').toLowerCase().includes(q)
      );
    });
  }, [residents, residentSearch]);

  const filteredRoster = useMemo(() => {
    const q = rosterSearch.trim().toLowerCase();
    return roster.filter((r) => {
      if (rosterStatusFilter !== 'all' && r.enrollmentStatus !== rosterStatusFilter) return false;
      if (!q) return true;
      return (
        r.studentId.toLowerCase().includes(q) ||
        r.fullName.toLowerCase().includes(q) ||
        r.email.toLowerCase().includes(q) ||
        r.programUnit.toLowerCase().includes(q)
      );
    });
  }, [roster, rosterSearch, rosterStatusFilter]);

  function openCreateComposer() {
    setEditingAnnouncement(null);
    setFormTitle('');
    setFormCategory('Academics');
    setFormPriority('normal');
    setFormAudience('All Residents');
    setFormEventDate('');
    setFormPinned(false);
    setFormBody('');
    setFormNotifyEmail(true);
    setComposerOpen(true);
  }

  function openEditComposer(item: Announcement) {
    setEditingAnnouncement(item);
    setFormTitle(item.title);
    setFormCategory(item.category);
    setFormPriority(item.priority);
    setFormAudience(item.audience);
    setFormEventDate(item.eventDate || '');
    setFormPinned(item.pinned);
    setFormBody(item.body);
    setFormNotifyEmail(false);
    setComposerOpen(true);
  }

  async function handleSaveAnnouncement(e: React.FormEvent) {
    e.preventDefault();
    setSavingAnnouncement(true);
    try {
      if (editingAnnouncement) {
        const res = await api.updateAnnouncement(
          editingAnnouncement.id,
          {
            title: formTitle,
            body: formBody,
            category: formCategory,
            priority: formPriority,
            audience: formAudience,
            pinned: formPinned,
            eventDate: formEventDate,
            notifyResidents: formNotifyEmail,
          },
          token
        );
        onNotifyToast(
          res.dispatch
            ? `Announcement updated and emailed to ${res.dispatch.recipientCount} residents.`
            : 'Announcement updated in real time.',
          'success'
        );
      } else {
        const res = await api.createAnnouncement(
          {
            title: formTitle,
            body: formBody,
            category: formCategory,
            priority: formPriority,
            audience: formAudience,
            pinned: formPinned,
            eventDate: formEventDate,
            notifyResidents: formNotifyEmail,
          },
          token
        );
        onNotifyToast(
          res.dispatch
            ? `Published and queued email alert for ${res.dispatch.recipientCount} opted-in residents.`
            : 'Announcement published live to all dashboards.',
          'success'
        );
      }
      setComposerOpen(false);
      await onRefreshAll();
    } catch (err) {
      onNotifyToast(err instanceof ApiError ? err.message : 'Could not save announcement.', 'error');
    } finally {
      setSavingAnnouncement(false);
    }
  }

  async function handleQuickTogglePin(item: Announcement) {
    setBusyRowId(item.id);
    try {
      await api.updateAnnouncement(item.id, { pinned: !item.pinned }, token);
      onNotifyToast(item.pinned ? 'Announcement unpinned.' : 'Announcement pinned to top.', 'info');
      await onRefreshAll();
    } catch (err) {
      onNotifyToast(err instanceof ApiError ? err.message : 'Failed to update pin status.', 'error');
    } finally {
      setBusyRowId(null);
    }
  }

  async function handleQuickArchive(item: Announcement) {
    setBusyRowId(item.id);
    try {
      const nextStatus = item.status === 'archived' ? 'published' : 'archived';
      await api.updateAnnouncement(item.id, { status: nextStatus }, token);
      onNotifyToast(
        nextStatus === 'archived' ? 'Announcement moved to archive.' : 'Announcement restored live.',
        'info'
      );
      await onRefreshAll();
    } catch (err) {
      onNotifyToast(err instanceof ApiError ? err.message : 'Failed to update status.', 'error');
    } finally {
      setBusyRowId(null);
    }
  }

  async function handleQuickEmailDispatch(item: Announcement) {
    setBusyRowId(item.id);
    try {
      const res = await api.sendEmailNotification(item.id, token);
      onNotifyToast(
        `Dispatched email notice to ${res.dispatch.recipientCount} opted-in residents.`,
        'success'
      );
      await onRefreshAll();
    } catch (err) {
      onNotifyToast(err instanceof ApiError ? err.message : 'Email dispatch failed.', 'error');
    } finally {
      setBusyRowId(null);
    }
  }

  async function handleDeleteAnnouncement(id: string) {
    setBusyRowId(id);
    try {
      await api.deleteAnnouncement(id, token);
      setConfirmDeleteId(null);
      onNotifyToast('Announcement permanently deleted.', 'info');
      await onRefreshAll();
    } catch (err) {
      onNotifyToast(err instanceof ApiError ? err.message : 'Failed to delete announcement.', 'error');
    } finally {
      setBusyRowId(null);
    }
  }

  async function handleCreateResident(e: React.FormEvent) {
    e.preventDefault();
    setSavingUser(true);
    try {
      await api.createResidentAccount(
        {
          studentId: newUserRole === 'admin' ? undefined : newUserStudentId,
          name: newUserName,
          email: newUserEmail,
          password: newUserPassword,
          unit: newUserUnit,
          role: newUserRole,
          emailNotifications: newUserOptIn,
        },
        token
      );
      setAddResidentOpen(false);
      setNewUserStudentId('');
      setNewUserName('');
      setNewUserEmail('');
      setNewUserUnit('');
      setNewUserPassword('');
      setNewUserRole('resident');
      setNewUserOptIn(true);
      onNotifyToast('Account created and verified in the OMSU Enrolled Roster.', 'success');
      await onRefreshAll();
    } catch (err) {
      onNotifyToast(err instanceof ApiError ? err.message : 'Failed to create account.', 'error');
    } finally {
      setSavingUser(false);
    }
  }

  async function handleAddRosterEntry(e: React.FormEvent) {
    e.preventDefault();
    setSavingRoster(true);
    try {
      await api.addRosterEntry(
        {
          studentId: rosterStudentId,
          fullName: rosterFullName,
          email: rosterEmail,
          programUnit: rosterProgram,
          memberType: rosterMemberType,
          semester: rosterSemester,
        },
        token
      );
      setAddRosterOpen(false);
      setRosterStudentId('');
      setRosterFullName('');
      setRosterEmail('');
      setRosterProgram('');
      setRosterMemberType('student');
      onNotifyToast('Record added to official OMSU roster.', 'success');
      await onRefreshAll();
    } catch (err) {
      onNotifyToast(err instanceof ApiError ? err.message : 'Failed to add enrolled record.', 'error');
    } finally {
      setSavingRoster(false);
    }
  }

  async function handleBulkImportRoster(e: React.FormEvent) {
    e.preventDefault();
    setSavingRoster(true);
    try {
      const res = await api.bulkImportRoster({ lines: bulkLines, semester: rosterSemester }, token);
      setBulkRosterOpen(false);
      setBulkLines('');
      onNotifyToast(
        `Imported ${res.addedCount} enrolled students (${res.skippedCount} skipped/duplicates).`,
        'success'
      );
      await onRefreshAll();
    } catch (err) {
      onNotifyToast(err instanceof ApiError ? err.message : 'Bulk import failed.', 'error');
    } finally {
      setSavingRoster(false);
    }
  }

  async function handleToggleRosterStatus(entry: EnrolledStudentRecord) {
    const next = entry.enrollmentStatus === 'enrolled' ? 'inactive' : 'enrolled';
    try {
      await api.updateRosterEntry(entry.id, { enrollmentStatus: next }, token);
      await onRefreshAll();
      onNotifyToast(
        `${entry.fullName} (${entry.studentId}) marked as ${next === 'enrolled' ? 'Enrolled' : 'Inactive'}.`,
        'info'
      );
    } catch (err) {
      onNotifyToast(err instanceof ApiError ? err.message : 'Failed to update enrollment status.', 'error');
    }
  }

  async function handleDeleteRosterEntry(id: string) {
    try {
      await api.deleteRosterEntry(id, token);
      setConfirmDeleteRosterId(null);
      await onRefreshAll();
      onNotifyToast('Student removed from enrolled roster.', 'info');
    } catch (err) {
      onNotifyToast(err instanceof ApiError ? err.message : 'Failed to remove roster entry.', 'error');
    }
  }

  async function handleToggleUserEmail(u: UserProfile) {
    try {
      await api.updateResidentAccount(u.id, { emailNotifications: !u.emailNotifications }, token);
      await onRefreshAll();
      onNotifyToast(
        !u.emailNotifications ? `Email alerts enabled for ${u.name}.` : `Email alerts muted for ${u.name}.`,
        'info'
      );
    } catch (err) {
      onNotifyToast(err instanceof ApiError ? err.message : 'Failed to update account.', 'error');
    }
  }

  async function handleToggleUserStatus(u: UserProfile) {
    try {
      const next = u.status === 'active' ? 'suspended' : 'active';
      await api.updateResidentAccount(u.id, { status: next }, token);
      await onRefreshAll();
      onNotifyToast(`${u.name} marked as ${next}.`, 'info');
    } catch (err) {
      onNotifyToast(err instanceof ApiError ? err.message : 'Failed to update status.', 'error');
    }
  }

  async function handleDeleteUser(id: string) {
    try {
      await api.deleteResidentAccount(id, token);
      setConfirmDeleteUserId(null);
      await onRefreshAll();
      onNotifyToast('Account removed from directory.', 'info');
    } catch (err) {
      onNotifyToast(err instanceof ApiError ? err.message : 'Failed to remove account.', 'error');
    }
  }

  const sidebarContent = (
    <div className="flex h-full flex-col justify-between bg-white">
      <div>
        <div className="flex h-16 items-center justify-between border-b border-slate-200 px-5">
          <span className="font-display text-base font-bold tracking-tight text-slate-900 whitespace-nowrap">
            OMSU Mamburao Admin
          </span>
          <button
            type="button"
            onClick={() => setMobileMenuOpen(false)}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 lg:hidden"
            aria-label="Close sidebar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="space-y-1 p-3" aria-label="Admin sections">
          <button
            type="button"
            onClick={() => {
              setActiveTab('announcements');
              setMobileMenuOpen(false);
            }}
            className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
              activeTab === 'announcements'
                ? 'bg-blue-50 text-[#1E3A8A]'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <span className="flex items-center gap-2.5">
              <Megaphone className="h-4 w-4" />
              Announcements
            </span>
            <span className="font-mono text-xs tabular-nums text-slate-500">
              {overview.totalPublished}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('residents');
              setMobileMenuOpen(false);
            }}
            className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
              activeTab === 'residents'
                ? 'bg-blue-50 text-[#1E3A8A]'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <span className="flex items-center gap-2.5">
              <Users className="h-4 w-4" />
              Portal Accounts
            </span>
            <span className="font-mono text-xs tabular-nums text-slate-500">
              {overview.totalResidents}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('roster');
              setMobileMenuOpen(false);
            }}
            className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
              activeTab === 'roster'
                ? 'bg-blue-50 text-[#1E3A8A]'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <span className="flex items-center gap-2.5">
              <GraduationCap className="h-4 w-4" />
              Enrolled Roster
            </span>
            <span className="font-mono text-xs tabular-nums text-slate-500">
              {overview.enrolledRosterCount ?? roster.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('dispatches');
              setMobileMenuOpen(false);
            }}
            className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
              activeTab === 'dispatches'
                ? 'bg-blue-50 text-[#1E3A8A]'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <span className="flex items-center gap-2.5">
              <Mail className="h-4 w-4" />
              Email Logs
            </span>
            <span className="font-mono text-xs tabular-nums text-slate-500">
              {overview.totalDispatches}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('portal-settings');
              setMobileMenuOpen(false);
            }}
            className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
              activeTab === 'portal-settings'
                ? 'bg-blue-50 text-[#1E3A8A]'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <span className="flex items-center gap-2.5">
              <SlidersHorizontal className="h-4 w-4" />
              Portal Settings
            </span>
          </button>
        </nav>

        <div className="mx-3 mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3.5 text-xs text-slate-600">
          <div className="font-semibold text-slate-800">
            {bootstrapStatus.smtpConfigured ? 'Live SMTP Enabled' : 'Email Outbox Preview'}
          </div>
          <p className="mt-1 leading-relaxed text-slate-500">
            {bootstrapStatus.smtpConfigured
              ? 'Dispatches send real emails to subscribed students & residents via your configured SMTP server.'
              : 'Configure SMTP_HOST, SMTP_USER, and SMTP_PASS in environment variables to send live emails. All dispatches are logged in Email Logs.'}
          </p>
        </div>
      </div>

      <div className="border-t border-slate-200 p-4">
        <div className="mb-3">
          <div className="truncate text-sm font-semibold text-slate-900">{currentUser.name}</div>
          <div className="truncate text-xs text-slate-500">{currentUser.email}</div>
        </div>
        <div className="flex flex-col gap-1.5">
          {onSwitchToSampleResident && (
            <button
              type="button"
              onClick={onSwitchToSampleResident}
              className="flex w-full items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-[#1E3A8A] transition-colors hover:bg-blue-100"
            >
              <Users className="h-3.5 w-3.5" />
              Open Student Portal (BSIT 1-B)
            </button>
          )}
          {onSwitchToSampleTeacher && (
            <button
              type="button"
              onClick={onSwitchToSampleTeacher}
              className="flex w-full items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-[#1E3A8A] transition-colors hover:bg-blue-100"
            >
              <GraduationCap className="h-3.5 w-3.5" />
              Open Teacher Portal (Faculty)
            </button>
          )}
          <button
            type="button"
            onClick={onSwitchToBulletin}
            className="flex w-full items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Preview Student Portal
          </button>
          <button
            type="button"
            onClick={onSignOut}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900">
      {/* Desktop Sidebar */}
      <aside className="hidden w-[260px] shrink-0 border-r border-slate-200 lg:block">
        {sidebarContent}
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 flex lg:hidden">
          <div
            className="fixed inset-0 bg-slate-900/40"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="relative z-10 w-[260px] border-r border-slate-200 bg-white">
            {sidebarContent}
          </aside>
        </div>
      )}

      {/* Main Workspace */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 items-center justify-between gap-4 border-b border-slate-200 bg-white px-4 sm:px-8">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
              aria-label="Open navigation menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-2 text-sm">
              <LayoutDashboard className="hidden h-4 w-4 text-slate-400 sm:inline" />
              <span className="text-slate-500">Console</span>
              <span aria-hidden="true" className="text-slate-300">
                /
              </span>
              <span className="font-semibold text-slate-900">
                {activeTab === 'announcements'
                  ? 'Announcements'
                  : activeTab === 'residents'
                    ? 'Portal Accounts'
                    : activeTab === 'roster'
                      ? 'Official OMSU Enrolled Roster'
                      : activeTab === 'dispatches'
                        ? 'Email Dispatch Logs'
                        : 'Portal & Student Portal Settings'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <span className="hidden text-xs text-slate-500 sm:inline tabular-nums">
              {wsConnected ? `Real-time sync active · ${onlineCount} online` : 'Reconnecting live sync...'}
            </span>
            <button
              type="button"
              onClick={openCreateComposer}
              className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg bg-[#1E3A8A] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#1D4ED8]"
            >
              <Plus className="h-4 w-4" />
              New Announcement
            </button>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1200px] flex-1 space-y-6 p-4 sm:p-8">
          {/* 4-Column KPI Strip */}
          <section
            aria-label="Campus bulletin overview"
            className="grid grid-cols-2 gap-4 lg:grid-cols-4"
          >
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="text-xs font-medium text-slate-500">Published Notices</div>
              <div className="mt-2 font-display text-2xl font-bold text-slate-900 tabular-nums">
                {overview.totalPublished}
              </div>
              <div className="mt-1 text-xs text-slate-500 tabular-nums">
                {overview.pinnedCount} pinned · {overview.archivedCount} archived
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="text-xs font-medium text-slate-500">Urgent Alerts Active</div>
              <div className="mt-2 font-display text-2xl font-bold text-red-700 tabular-nums">
                {overview.urgentCount}
              </div>
              <div className="mt-1 text-xs text-slate-500">High-priority campus bulletins</div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="text-xs font-medium text-slate-500">Opted-In Residents</div>
              <div className="mt-2 font-display text-2xl font-bold text-slate-900 tabular-nums">
                {overview.optedInResidents}
              </div>
              <div className="mt-1 text-xs text-slate-500 tabular-nums">
                Out of {overview.totalResidents} registered residents
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="text-xs font-medium text-slate-500">Emails Dispatched</div>
              <div className="mt-2 font-display text-2xl font-bold text-slate-900 tabular-nums">
                {overview.totalEmailsSent}
              </div>
              <div className="mt-1 text-xs text-slate-500 tabular-nums">
                Across {overview.totalDispatches} broadcast batches
              </div>
            </div>
          </section>

          {/* TAB 1: ANNOUNCEMENTS */}
          {activeTab === 'announcements' && (
            <section className="rounded-xl border border-slate-200 bg-white">
              <div className="flex flex-col gap-3 border-b border-slate-200 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-1 flex-wrap items-center gap-3">
                  <div className="relative min-w-[220px] flex-1 sm:max-w-xs">
                    <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search title, body, or author..."
                      className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/15"
                    />
                  </div>

                  <select
                    aria-label="Filter by category"
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-600 focus:outline-none"
                  >
                    <option value="all">All Categories</option>
                    {CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
                  {(['published', 'archived', 'all'] as const).map((status) => (
                    <button
                      key={status}
                      type="button"
                      onClick={() => setStatusFilter(status)}
                      className={`whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                        statusFilter === status
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {status}
                    </button>
                  ))}
                </div>
              </div>

              {filteredAnnouncements.length === 0 ? (
                <div className="px-6 py-14 text-center">
                  <Megaphone className="mx-auto h-8 w-8 text-slate-300" />
                  <h3 className="mt-3 font-display text-base font-semibold text-slate-900">
                    No matching announcements
                  </h3>
                  <p className="mt-1 text-sm text-slate-500">
                    Adjust your search filters or publish a new school announcement to notify residents.
                  </p>
                  <button
                    type="button"
                    onClick={openCreateComposer}
                    className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-[#1E3A8A] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1D4ED8]"
                  >
                    <Plus className="h-4 w-4" />
                    Post Announcement
                  </button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                        <th className="px-5 py-3">Announcement</th>
                        <th className="px-4 py-3">Category & Audience</th>
                        <th className="px-4 py-3">Priority</th>
                        <th className="px-4 py-3 text-right">Reads</th>
                        <th className="px-4 py-3">Posted</th>
                        <th className="px-5 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {filteredAnnouncements.map((item) => {
                        const isConfirmingDelete = confirmDeleteId === item.id;
                        const isBusy = busyRowId === item.id;

                        return (
                          <tr key={item.id} className="transition-colors hover:bg-slate-50/80">
                            <td className="max-w-md px-5 py-3.5">
                              <button
                                type="button"
                                onClick={() => onSelectAnnouncement(item)}
                                className="text-left font-medium text-slate-900 hover:text-blue-700"
                              >
                                {item.title}
                              </button>
                              <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
                                <span>{item.authorName}</span>
                                {item.pinned && (
                                  <>
                                    <span aria-hidden="true">·</span>
                                    <span className="font-medium text-blue-700">Pinned</span>
                                  </>
                                )}
                                {item.status === 'archived' && (
                                  <>
                                    <span aria-hidden="true">·</span>
                                    <span className="text-slate-600">Archived</span>
                                  </>
                                )}
                              </div>
                            </td>

                            <td className="px-4 py-3.5 text-xs text-slate-600">
                              <div className="font-medium text-slate-800">{item.category}</div>
                              <div className="text-slate-500">{item.audience}</div>
                            </td>

                            <td className="px-4 py-3.5 text-xs font-medium">
                              {item.priority === 'urgent' ? (
                                <span className="inline-flex items-center gap-1 text-red-700">
                                  <AlertTriangle className="h-3.5 w-3.5" />
                                  Urgent
                                </span>
                              ) : item.priority === 'important' ? (
                                <span className="inline-flex items-center gap-1 text-amber-700">
                                  <AlertTriangle className="h-3.5 w-3.5" />
                                  Important
                                </span>
                              ) : (
                                <span className="text-slate-600">Standard</span>
                              )}
                            </td>

                            <td className="px-4 py-3.5 text-right font-mono text-xs tabular-nums text-slate-700">
                              {item.readCount}
                            </td>

                            <td className="whitespace-nowrap px-4 py-3.5 font-mono text-xs tabular-nums text-slate-500">
                              {formatShortDate(item.createdAt)}
                            </td>

                            <td className="px-5 py-3.5 text-right">
                              {isConfirmingDelete ? (
                                <div className="inline-flex items-center gap-2">
                                  <button
                                    type="button"
                                    disabled={isBusy}
                                    onClick={() => handleDeleteAnnouncement(item.id)}
                                    className="rounded-md bg-red-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-red-700"
                                  >
                                    Confirm Delete
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteId(null)}
                                    className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <div className="inline-flex items-center justify-end gap-1">
                                  <button
                                    type="button"
                                    disabled={isBusy}
                                    onClick={() => handleQuickEmailDispatch(item)}
                                    title="Send email notification to residents"
                                    aria-label="Send email notification to residents"
                                    className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-blue-50 hover:text-blue-700"
                                  >
                                    <Send className="h-4 w-4" />
                                  </button>
                                  <button
                                    type="button"
                                    disabled={isBusy}
                                    onClick={() => handleQuickTogglePin(item)}
                                    title={item.pinned ? 'Unpin' : 'Pin to top'}
                                    aria-label={item.pinned ? 'Unpin announcement' : 'Pin announcement'}
                                    className={`rounded-lg p-2 transition-colors ${
                                      item.pinned
                                        ? 'text-blue-700 hover:bg-blue-50'
                                        : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
                                    }`}
                                  >
                                    <Pin className="h-4 w-4" />
                                  </button>
                                  <button
                                    type="button"
                                    disabled={isBusy}
                                    onClick={() => openEditComposer(item)}
                                    title="Edit announcement"
                                    aria-label="Edit announcement"
                                    className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </button>
                                  <button
                                    type="button"
                                    disabled={isBusy}
                                    onClick={() => handleQuickArchive(item)}
                                    title={item.status === 'archived' ? 'Restore' : 'Archive'}
                                    aria-label={item.status === 'archived' ? 'Restore announcement' : 'Archive announcement'}
                                    className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
                                  >
                                    <Archive className="h-4 w-4" />
                                  </button>
                                  <button
                                    type="button"
                                    disabled={isBusy}
                                    onClick={() => setConfirmDeleteId(item.id)}
                                    title="Delete announcement"
                                    aria-label="Delete announcement"
                                    className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-red-50 hover:text-red-700"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          {/* TAB 2: RESIDENT DIRECTORY */}
          {activeTab === 'residents' && (
            <section className="rounded-xl border border-slate-200 bg-white">
              <div className="flex flex-col gap-3 border-b border-slate-200 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="relative min-w-[220px] flex-1 sm:max-w-sm">
                  <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    value={residentSearch}
                    onChange={(e) => setResidentSearch(e.target.value)}
                    placeholder="Search residents by name, email, or unit..."
                    className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/15"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setAddResidentOpen(true)}
                  className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg bg-[#1E3A8A] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#1D4ED8]"
                >
                  <UserPlus className="h-4 w-4" />
                  Add Account
                </button>
              </div>

              {filteredResidents.length === 0 ? (
                <div className="px-6 py-14 text-center">
                  <Users className="mx-auto h-8 w-8 text-slate-300" />
                  <h3 className="mt-3 font-display text-base font-semibold text-slate-900">
                    No accounts found
                  </h3>
                  <p className="mt-1 text-sm text-slate-500">
                    Residents can register from the public bulletin or be added directly here.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                        <th className="px-5 py-3">Name & Email</th>
                        <th className="px-4 py-3">Role</th>
                        <th className="px-4 py-3">Unit / Group</th>
                        <th className="px-4 py-3">Email Alerts</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-5 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {filteredResidents.map((u) => {
                        const isSelf = u.id === currentUser.id;
                        const isConfirming = confirmDeleteUserId === u.id;
                        return (
                          <tr key={u.id} className="hover:bg-slate-50/80">
                            <td className="px-5 py-3.5">
                              <div className="font-medium text-slate-900">
                                {u.name} {isSelf ? '(You)' : ''}
                              </div>
                              <div className="text-xs text-slate-500">
                                {u.email}
                                {u.studentId ? ` · ${u.studentId}` : ''}
                              </div>
                            </td>
                            <td className="px-4 py-3.5 text-xs font-medium capitalize text-slate-700">
                              {u.role === 'resident'
                                ? 'Enrolled Student'
                                : u.role === 'teacher'
                                  ? 'Teacher / Faculty'
                                  : 'Admin'}
                            </td>
                            <td className="px-4 py-3.5 text-xs text-slate-600">{u.unit || '—'}</td>
                            <td className="px-4 py-3.5">
                              <button
                                type="button"
                                onClick={() => handleToggleUserEmail(u)}
                                className={`text-xs font-medium ${
                                  u.emailNotifications
                                    ? 'text-emerald-700 hover:underline'
                                    : 'text-slate-500 hover:underline'
                                }`}
                              >
                                {u.emailNotifications ? 'Subscribed' : 'Muted'}
                              </button>
                            </td>
                            <td className="px-4 py-3.5 text-xs font-medium">
                              <span
                                className={
                                  u.status === 'active' ? 'text-emerald-700' : 'text-red-700'
                                }
                              >
                                {u.status === 'active' ? 'Active' : 'Suspended'}
                              </span>
                            </td>
                            <td className="px-5 py-3.5 text-right">
                              {isSelf ? (
                                <span className="text-xs text-slate-400">Primary Session</span>
                              ) : isConfirming ? (
                                <div className="inline-flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteUser(u.id)}
                                    className="rounded-md bg-red-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-red-700"
                                  >
                                    Remove
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteUserId(null)}
                                    className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <div className="inline-flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => handleToggleUserStatus(u)}
                                    className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                                  >
                                    {u.status === 'active' ? 'Suspend' : 'Activate'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteUserId(u.id)}
                                    aria-label={`Remove ${u.name}`}
                                    className="rounded-lg p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-700"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          {/* TAB 2B: OFFICIAL OMSU ENROLLED ROSTER */}
          {activeTab === 'roster' && (
            <section className="rounded-xl border border-slate-200 bg-white">
              <div className="flex flex-col gap-3 border-b border-slate-200 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="font-display text-base font-semibold text-slate-900">
                    Verified OMSU Enrolled Student Roster
                  </h2>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Only students listed as Enrolled here can create accounts and access the OMSU Mamburao Portal.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setBulkRosterOpen(true)}
                    className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    Bulk Import
                  </button>
                  <button
                    type="button"
                    onClick={() => setAddRosterOpen(true)}
                    className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg bg-[#1E3A8A] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#1D4ED8]"
                  >
                    <UserPlus className="h-4 w-4" />
                    Add Enrolled Student
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50/70 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="relative min-w-[220px] flex-1 sm:max-w-sm">
                  <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    value={rosterSearch}
                    onChange={(e) => setRosterSearch(e.target.value)}
                    placeholder="Search Student ID, name, email, or program..."
                    className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#1D4ED8] focus:outline-none"
                  />
                </div>
                <div className="flex items-center gap-1 rounded-lg bg-slate-200/70 p-1">
                  {(['all', 'enrolled', 'inactive'] as const).map((status) => (
                    <button
                      key={status}
                      type="button"
                      onClick={() => setRosterStatusFilter(status)}
                      className={`whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                        rosterStatusFilter === status
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {status}
                    </button>
                  ))}
                </div>
              </div>

              {filteredRoster.length === 0 ? (
                <div className="px-6 py-14 text-center">
                  <GraduationCap className="mx-auto h-8 w-8 text-slate-300" />
                  <h3 className="mt-3 font-display text-base font-semibold text-slate-900">
                    No matching enrolled records
                  </h3>
                  <p className="mt-1 text-sm text-slate-500">
                    Add officially enrolled OMSU students individually or bulk-import from a Registrar list.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                        <th className="px-5 py-3">Student ID</th>
                        <th className="px-4 py-3">Student Name &amp; Email</th>
                        <th className="px-4 py-3">Program &amp; Term</th>
                        <th className="px-4 py-3">Portal Status</th>
                        <th className="px-4 py-3">Enrollment</th>
                        <th className="px-5 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {filteredRoster.map((entry) => {
                        const isConfirming = confirmDeleteRosterId === entry.id;
                        return (
                          <tr key={entry.id} className="hover:bg-slate-50/80">
                            <td className="whitespace-nowrap px-5 py-3.5 font-mono text-xs font-semibold text-[#1E3A8A]">
                              {entry.studentId}
                            </td>
                            <td className="px-4 py-3.5">
                              <div className="font-medium text-slate-900">
                                {entry.fullName}{' '}
                                <span className="font-mono text-[11px] font-semibold text-blue-700">
                                  · {entry.memberType === 'teacher' ? 'Teacher' : 'Student'}
                                </span>
                              </div>
                              <div className="text-xs text-slate-500">{entry.email}</div>
                            </td>
                            <td className="px-4 py-3.5 text-xs text-slate-600">
                              <div className="font-medium text-slate-800">{entry.programUnit}</div>
                              <div className="text-slate-500">
                                {entry.campus} · {entry.semester}
                              </div>
                            </td>
                            <td className="px-4 py-3.5 text-xs">
                              {entry.hasAccount ? (
                                <span className="font-medium text-blue-700">Account Active</span>
                              ) : (
                                <span className="text-slate-400">Not Registered Yet</span>
                              )}
                            </td>
                            <td className="px-4 py-3.5 text-xs font-medium">
                              <span
                                className={
                                  entry.enrollmentStatus === 'enrolled'
                                    ? 'text-emerald-700'
                                    : 'text-red-700'
                                }
                              >
                                {entry.enrollmentStatus === 'enrolled' ? 'Enrolled' : 'Inactive'}
                              </span>
                            </td>
                            <td className="px-5 py-3.5 text-right">
                              {isConfirming ? (
                                <div className="inline-flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteRosterEntry(entry.id)}
                                    className="rounded-md bg-red-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-red-700"
                                  >
                                    Remove
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteRosterId(null)}
                                    className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <div className="inline-flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => handleToggleRosterStatus(entry)}
                                    className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                                  >
                                    {entry.enrollmentStatus === 'enrolled'
                                      ? 'Set Inactive'
                                      : 'Mark Enrolled'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteRosterId(entry.id)}
                                    aria-label={`Remove ${entry.fullName}`}
                                    className="rounded-lg p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-700"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          {/* TAB 3: EMAIL DISPATCH LOGS */}
          {activeTab === 'dispatches' && (
            <section className="rounded-xl border border-slate-200 bg-white">
              <div className="border-b border-slate-200 p-5">
                <h2 className="font-display text-base font-semibold text-slate-900">
                  Email Notification History
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Every announcement broadcast records its recipients, delivery status, and rendered HTML email body.
                </p>
              </div>

              {dispatches.length === 0 ? (
                <div className="px-6 py-14 text-center">
                  <Mail className="mx-auto h-8 w-8 text-slate-300" />
                  <h3 className="mt-3 font-display text-base font-semibold text-slate-900">
                    No email batches dispatched yet
                  </h3>
                  <p className="mt-1 text-sm text-slate-500">
                    Publish a new announcement with email notifications enabled or click the Send icon on any existing notice.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                        <th className="px-5 py-3">Subject & Triggered By</th>
                        <th className="px-4 py-3">Mode</th>
                        <th className="px-4 py-3 text-right">Recipients</th>
                        <th className="px-4 py-3 text-right">Delivered</th>
                        <th className="px-4 py-3">Sent At</th>
                        <th className="px-5 py-3 text-right">Preview</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {dispatches.map((d) => (
                        <tr key={d.id} className="hover:bg-slate-50/80">
                          <td className="max-w-md px-5 py-3.5">
                            <div className="font-medium text-slate-900">{d.subject}</div>
                            <div className="text-xs text-slate-500">
                              Triggered by {d.triggeredByName}
                            </div>
                          </td>
                          <td className="px-4 py-3.5 text-xs font-medium">
                            {d.deliveryMode === 'smtp' ? (
                              <span className="inline-flex items-center gap-1 text-emerald-700">
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                Live SMTP
                              </span>
                            ) : (
                              <span className="text-slate-600">Outbox Preview</span>
                            )}
                          </td>
                          <td className="px-4 py-3.5 text-right font-mono text-xs tabular-nums text-slate-700">
                            {d.recipientCount}
                          </td>
                          <td className="px-4 py-3.5 text-right font-mono text-xs tabular-nums text-slate-700">
                            {d.deliveredCount}
                            {d.failedCount > 0 ? ` (${d.failedCount} failed)` : ''}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3.5 font-mono text-xs tabular-nums text-slate-500">
                            {formatDateTime(d.createdAt)}
                          </td>
                          <td className="px-5 py-3.5 text-right">
                            <button
                              type="button"
                              onClick={() => setSelectedDispatch(d)}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                            >
                              <Eye className="h-3.5 w-3.5" />
                              Inspect
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          {/* TAB 4: PORTAL & STUDENT PORTAL SETTINGS */}
          {activeTab === 'portal-settings' && (
            <section className="rounded-xl border border-slate-200 bg-white">
              <div className="border-b border-slate-200 p-5 sm:p-6">
                <h2 className="font-display text-base font-semibold text-slate-900">
                  University &amp; Student Portal Configuration
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  Manage campus identity, Student Portal headlines, emergency/enrollment banners, and registration policies. Changes sync in real time across all active portals.
                </p>
              </div>

              <form onSubmit={handleSavePortalSettings} className="space-y-6 p-5 sm:p-6">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-slate-700">
                      University Name
                    </label>
                    <input
                      type="text"
                      required
                      minLength={3}
                      maxLength={120}
                      value={psUniversity}
                      onChange={(e) => setPsUniversity(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm focus:border-[#1D4ED8] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-slate-700">
                      Campus Branch &amp; Location
                    </label>
                    <input
                      type="text"
                      required
                      minLength={2}
                      maxLength={120}
                      value={psCampus}
                      onChange={(e) => setPsCampus(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm focus:border-[#1D4ED8] focus:outline-none"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="mb-1.5 block text-xs font-medium text-slate-700">
                      Portal Login Subtitle / Tagline
                    </label>
                    <input
                      type="text"
                      required
                      minLength={3}
                      maxLength={160}
                      value={psTagline}
                      onChange={(e) => setPsTagline(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm focus:border-[#1D4ED8] focus:outline-none"
                    />
                  </div>
                </div>

                <div className="space-y-4 border-t border-slate-200 pt-5">
                  <div className="text-xs font-semibold text-slate-800">
                    Student &amp; Resident Portal Banner Copy
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-slate-700">
                      Student Portal Hero Headline
                    </label>
                    <input
                      type="text"
                      required
                      minLength={4}
                      maxLength={180}
                      value={psHeroHeadline}
                      onChange={(e) => setPsHeroHeadline(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm focus:border-[#1D4ED8] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-slate-700">
                      Student Portal Intro Description
                    </label>
                    <textarea
                      rows={3}
                      required
                      minLength={8}
                      maxLength={500}
                      value={psHeroDescription}
                      onChange={(e) => setPsHeroDescription(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm leading-relaxed focus:border-[#1D4ED8] focus:outline-none"
                    />
                  </div>
                </div>

                <div className="space-y-4 border-t border-slate-200 pt-5">
                  <div className="text-xs font-semibold text-slate-800">
                    Campus Advisory Banner &amp; Access Controls
                  </div>
                  <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-slate-200 bg-slate-50 p-3.5 text-xs text-slate-700">
                    <input
                      type="checkbox"
                      checked={psBannerEnabled}
                      onChange={(e) => setPsBannerEnabled(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-slate-300 text-[#1E3A8A]"
                    />
                    <span>
                      Display a top advisory notice banner on both the Portal Sign-In screen and Student Portal
                    </span>
                  </label>

                  {psBannerEnabled && (
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-slate-700">
                        Advisory Banner Message
                      </label>
                      <input
                        type="text"
                        maxLength={300}
                        value={psBannerMessage}
                        onChange={(e) => setPsBannerMessage(e.target.value)}
                        placeholder="e.g. Second Semester enrollment verification is open at the Registrar."
                        className="w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm focus:border-[#1D4ED8] focus:outline-none"
                      />
                    </div>
                  )}

                  <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-slate-200 bg-slate-50 p-3.5 text-xs text-slate-700">
                    <input
                      type="checkbox"
                      checked={psAllowSelfReg}
                      onChange={(e) => setPsAllowSelfReg(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-slate-300 text-[#1E3A8A]"
                    />
                    <span>
                      Allow students and dormitory residents to self-register accounts via the Sign Up tab
                    </span>
                  </label>

                  <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-blue-200 bg-blue-50/70 p-3.5 text-xs text-slate-800">
                    <input
                      type="checkbox"
                      checked={psRequireEnrolled}
                      onChange={(e) => setPsRequireEnrolled(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-slate-300 text-[#1E3A8A]"
                    />
                    <span>
                      <strong>Enforce OMSU Enrolled Roster Verification:</strong> Restrict registration and portal access exclusively to students listed as &ldquo;Enrolled&rdquo; in the official Occidental Mindoro State University roster.
                    </span>
                  </label>
                </div>

                <div className="grid grid-cols-1 gap-4 border-t border-slate-200 pt-5 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-slate-700">
                      Registrar / Support Contact Email
                    </label>
                    <input
                      type="email"
                      required
                      value={psSupportEmail}
                      onChange={(e) => setPsSupportEmail(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm focus:border-[#1D4ED8] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-slate-700">
                      Campus Office Hours
                    </label>
                    <input
                      type="text"
                      required
                      maxLength={120}
                      value={psOfficeHours}
                      onChange={(e) => setPsOfficeHours(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm focus:border-[#1D4ED8] focus:outline-none"
                    />
                  </div>
                </div>

                <div className="flex justify-end border-t border-slate-200 pt-4">
                  <button
                    type="submit"
                    disabled={savingSettings}
                    className="inline-flex items-center gap-2 rounded-lg bg-[#1E3A8A] px-5 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-[#1D4ED8] disabled:opacity-60"
                  >
                    <Save className="h-4 w-4" />
                    {savingSettings ? 'Saving & Syncing...' : 'Save Portal Settings'}
                  </button>
                </div>
              </form>
            </section>
          )}
        </main>
      </div>

      {/* COMPOSER MODAL */}
      {composerOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-labelledby="composer-title"
        >
          <div className="flex max-h-[92vh] w-full max-w-2xl flex-col rounded-xl border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <h2 id="composer-title" className="font-display text-lg font-semibold text-slate-900">
                {editingAnnouncement ? 'Edit Announcement' : 'Publish New Announcement'}
              </h2>
              <button
                type="button"
                onClick={() => setComposerOpen(false)}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveAnnouncement} className="space-y-4 overflow-y-auto p-6">
              <div>
                <label htmlFor="ann-title" className="mb-1.5 block text-xs font-medium text-slate-700">
                  Headline
                </label>
                <input
                  id="ann-title"
                  type="text"
                  required
                  minLength={4}
                  maxLength={160}
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="Clear, specific headline for students and residents"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/15"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="ann-cat" className="mb-1.5 block text-xs font-medium text-slate-700">
                    Category
                  </label>
                  <select
                    id="ann-cat"
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value as AnnouncementCategory)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="ann-priority" className="mb-1.5 block text-xs font-medium text-slate-700">
                    Priority Level
                  </label>
                  <select
                    id="ann-priority"
                    value={formPriority}
                    onChange={(e) => setFormPriority(e.target.value as AnnouncementPriority)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                  >
                    <option value="normal">Standard Notice</option>
                    <option value="important">Important Notice</option>
                    <option value="urgent">Urgent Notice</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="ann-aud" className="mb-1.5 block text-xs font-medium text-slate-700">
                    Target Audience
                  </label>
                  <select
                    id="ann-aud"
                    value={formAudience}
                    onChange={(e) => setFormAudience(e.target.value as AnnouncementAudience)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                  >
                    {AUDIENCES.map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="ann-date" className="mb-1.5 block text-xs font-medium text-slate-700">
                    Effective / Event Date (Optional)
                  </label>
                  <input
                    id="ann-date"
                    type="date"
                    value={formEventDate}
                    onChange={(e) => setFormEventDate(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="ann-body" className="mb-1.5 block text-xs font-medium text-slate-700">
                  Full Announcement Details
                </label>
                <textarea
                  id="ann-body"
                  required
                  minLength={10}
                  maxLength={8000}
                  rows={6}
                  value={formBody}
                  onChange={(e) => setFormBody(e.target.value)}
                  placeholder="Provide all dates, locations, instructions, and contact information so residents never miss key details."
                  className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm leading-relaxed text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/15"
                />
              </div>

              <div className="space-y-2.5 rounded-lg border border-slate-200 bg-slate-50 p-4">
                <label className="flex cursor-pointer items-center gap-2.5 text-xs font-medium text-slate-800">
                  <input
                    type="checkbox"
                    checked={formPinned}
                    onChange={(e) => setFormPinned(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-blue-700 focus:ring-blue-600"
                  />
                  Pin this announcement to the top of the Campus Bulletin
                </label>

                <label className="flex cursor-pointer items-center gap-2.5 text-xs font-medium text-slate-800">
                  <input
                    type="checkbox"
                    checked={formNotifyEmail}
                    onChange={(e) => setFormNotifyEmail(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-blue-700 focus:ring-blue-600"
                  />
                  Notify all opted-in residents ({overview.optedInResidents}) via email upon saving
                </label>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setComposerOpen(false)}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingAnnouncement}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#1E3A8A] px-5 py-2 text-xs font-semibold text-white hover:bg-[#1D4ED8] disabled:opacity-60"
                >
                  <Send className="h-3.5 w-3.5" />
                  {savingAnnouncement
                    ? 'Publishing...'
                    : editingAnnouncement
                      ? 'Save Changes'
                      : 'Publish Announcement'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ADD ACCOUNT MODAL */}
      {addResidentOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-resident-title"
        >
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <h2 id="add-resident-title" className="font-display text-lg font-semibold text-slate-900">
                Add Campus Account
              </h2>
              <button
                type="button"
                onClick={() => setAddResidentOpen(false)}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleCreateResident} className="space-y-4 p-6">
              {newUserRole !== 'admin' && (
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-700">
                    {newUserRole === 'teacher'
                      ? 'OMSU Faculty ID (Optional — auto-generated if blank)'
                      : 'OMSU Student ID (Optional — auto-generated if blank)'}
                  </label>
                  <input
                    type="text"
                    maxLength={40}
                    value={newUserStudentId}
                    onChange={(e) => setNewUserStudentId(e.target.value)}
                    placeholder={newUserRole === 'teacher' ? 'e.g. FAC-2026-0002' : 'e.g. OMSU-2026-0006'}
                    className="w-full rounded-lg border border-slate-300 px-3.5 py-2 font-mono text-sm uppercase focus:border-blue-600 focus:outline-none"
                  />
                </div>
              )}
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-700">Full Name</label>
                <input
                  type="text"
                  required
                  minLength={2}
                  value={newUserName}
                  onChange={(e) => setNewUserName(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm focus:border-blue-600 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-700">Email Address</label>
                <input
                  type="email"
                  required
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm focus:border-blue-600 focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-700">Role</label>
                  <select
                    value={newUserRole}
                    onChange={(e) => setNewUserRole(e.target.value as UserRole)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
                  >
                    <option value="resident">Enrolled Student</option>
                    <option value="teacher">Teacher / Faculty</option>
                    <option value="admin">Administrator</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-700">
                    Section / Department
                  </label>
                  <input
                    type="text"
                    required
                    value={newUserUnit}
                    onChange={(e) => setNewUserUnit(e.target.value)}
                    placeholder={newUserRole === 'teacher' ? 'CAST Faculty' : 'BSIT 1-B'}
                    className="w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm focus:border-blue-600 focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-700">
                  Initial Password
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={newUserPassword}
                  onChange={(e) => setNewUserPassword(e.target.value)}
                  placeholder="Minimum 8 characters"
                  className="w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm focus:border-blue-600 focus:outline-none"
                />
              </div>
              <label className="flex cursor-pointer items-center gap-2.5 text-xs text-slate-700">
                <input
                  type="checkbox"
                  checked={newUserOptIn}
                  onChange={(e) => setNewUserOptIn(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-blue-700"
                />
                Subscribe to real-time email alerts
              </label>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setAddResidentOpen(false)}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingUser}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#1E3A8A] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1D4ED8]"
                >
                  <UserCheck className="h-3.5 w-3.5" />
                  {savingUser ? 'Creating...' : 'Create Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EMAIL DISPATCH PREVIEW MODAL */}
      {selectedDispatch && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-labelledby="dispatch-preview-title"
        >
          <div className="flex max-h-[92vh] w-full max-w-3xl flex-col rounded-xl border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <div className="min-w-0">
                <h2
                  id="dispatch-preview-title"
                  className="truncate font-display text-base font-semibold text-slate-900"
                >
                  {selectedDispatch.subject}
                </h2>
                <p className="mt-0.5 text-xs text-slate-500 tabular-nums">
                  {selectedDispatch.recipientCount} recipients ·{' '}
                  {selectedDispatch.deliveryMode === 'smtp' ? 'Sent via SMTP' : 'Outbox Preview'} ·{' '}
                  {formatDateTime(selectedDispatch.createdAt)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedDispatch(null)}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid flex-1 gap-4 overflow-y-auto p-6 md:grid-cols-3">
              <div className="md:col-span-2">
                <div className="mb-2 text-xs font-semibold text-slate-700">Rendered Email Body</div>
                <iframe
                  title="Email HTML Preview"
                  sandbox=""
                  srcDoc={selectedDispatch.htmlPreview}
                  className="h-[420px] w-full rounded-lg border border-slate-200 bg-slate-50"
                />
              </div>
              <div>
                <div className="mb-2 text-xs font-semibold text-slate-700">
                  Recipient Delivery ({selectedDispatch.recipientsSummary.length})
                </div>
                <div className="max-h-[420px] divide-y divide-slate-200 overflow-y-auto rounded-lg border border-slate-200">
                  {selectedDispatch.recipientsSummary.length === 0 ? (
                    <div className="p-4 text-xs text-slate-500">
                      No opted-in resident accounts were registered at the time of this broadcast.
                    </div>
                  ) : (
                    selectedDispatch.recipientsSummary.map((r) => (
                      <div key={r.email} className="p-3 text-xs">
                        <div className="font-medium text-slate-900">{r.name}</div>
                        <div className="truncate text-slate-500">{r.email}</div>
                        <div className="mt-1 flex items-center justify-between text-[11px]">
                          <span className="text-slate-400">{r.unit}</span>
                          <span
                            className={
                              r.status === 'failed'
                                ? 'font-medium text-red-700'
                                : 'font-medium text-emerald-700'
                            }
                          >
                            {r.status === 'sent'
                              ? 'Delivered'
                              : r.status === 'queued_preview'
                                ? 'Queued (Preview)'
                                : 'Failed'}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ADD ENROLLED STUDENT MODAL */}
      {addRosterOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-roster-title"
        >
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <h2 id="add-roster-title" className="font-display text-lg font-semibold text-slate-900">
                Add Enrolled OMSU Student
              </h2>
              <button
                type="button"
                onClick={() => setAddRosterOpen(false)}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleAddRosterEntry} className="space-y-4 p-6">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-700">
                  Member Type
                </label>
                <select
                  value={rosterMemberType}
                  onChange={(e) =>
                    setRosterMemberType(e.target.value === 'teacher' ? 'teacher' : 'student')
                  }
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-[#1D4ED8] focus:outline-none"
                >
                  <option value="student">Enrolled College Student</option>
                  <option value="teacher">Teacher / Faculty</option>
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-700">
                  {rosterMemberType === 'teacher' ? 'OMSU Faculty ID Number' : 'OMSU Student ID Number'}
                </label>
                <input
                  type="text"
                  required
                  minLength={4}
                  maxLength={40}
                  value={rosterStudentId}
                  onChange={(e) => setRosterStudentId(e.target.value)}
                  placeholder={rosterMemberType === 'teacher' ? 'FAC-2026-0002' : 'OMSU-2026-0006'}
                  className="w-full rounded-lg border border-slate-300 px-3.5 py-2 font-mono text-sm uppercase focus:border-[#1D4ED8] focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-700">Full Name</label>
                <input
                  type="text"
                  required
                  minLength={2}
                  value={rosterFullName}
                  onChange={(e) => setRosterFullName(e.target.value)}
                  placeholder="e.g. Ana Mae Bautista"
                  className="w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm focus:border-[#1D4ED8] focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-700">
                  Official OMSU Email
                </label>
                <input
                  type="email"
                  required
                  value={rosterEmail}
                  onChange={(e) => setRosterEmail(e.target.value)}
                  placeholder="ana.bautista@omsu-mamburao.edu.ph"
                  className="w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm focus:border-[#1D4ED8] focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-700">
                    Program / Section
                  </label>
                  <input
                    type="text"
                    required
                    value={rosterProgram}
                    onChange={(e) => setRosterProgram(e.target.value)}
                    placeholder="BSIT 2A"
                    className="w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm focus:border-[#1D4ED8] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-700">
                    Academic Term
                  </label>
                  <input
                    type="text"
                    required
                    value={rosterSemester}
                    onChange={(e) => setRosterSemester(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm focus:border-[#1D4ED8] focus:outline-none"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setAddRosterOpen(false)}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingRoster}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#1E3A8A] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1D4ED8]"
                >
                  <GraduationCap className="h-3.5 w-3.5" />
                  {savingRoster ? 'Saving...' : 'Add to Enrolled Roster'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* BULK IMPORT ROSTER MODAL */}
      {bulkRosterOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-labelledby="bulk-roster-title"
        >
          <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <h2 id="bulk-roster-title" className="font-display text-lg font-semibold text-slate-900">
                Bulk Import OMSU Enrolled Students
              </h2>
              <button
                type="button"
                onClick={() => setBulkRosterOpen(false)}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleBulkImportRoster} className="space-y-4 p-6">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                Enter one enrolled student per line separated by commas:
                <div className="mt-1 font-mono text-[11px] text-slate-800">
                  OMSU-2026-0010, Ana Lopez, ana.lopez@omsu-mamburao.edu.ph, BSIT 2A
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-700">
                  Registrar Student Lines
                </label>
                <textarea
                  rows={6}
                  required
                  value={bulkLines}
                  onChange={(e) => setBulkLines(e.target.value)}
                  placeholder="OMSU-2026-0010, Ana Lopez, ana.lopez@omsu-mamburao.edu.ph, BSIT 2A"
                  className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 font-mono text-xs leading-relaxed focus:border-[#1D4ED8] focus:outline-none"
                />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setBulkRosterOpen(false)}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingRoster}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#1E3A8A] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1D4ED8]"
                >
                  <Upload className="h-3.5 w-3.5" />
                  {savingRoster ? 'Importing...' : 'Import Enrolled Roster'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
