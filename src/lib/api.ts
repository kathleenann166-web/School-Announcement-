import type {
  AdminOverviewStats,
  Announcement,
  AnnouncementAudience,
  AnnouncementCategory,
  AnnouncementPriority,
  AnnouncementStatus,
  BootstrapStatus,
  EmailDispatchLog,
  EnrolledStudentRecord,
  PortalSettings,
  UserProfile,
  UserRole,
  UserStatus,
} from '../types';
import { enableStaticMode, isStaticModeActive, staticApi } from './staticFallback';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function invokeStatic<T>(staticFn: () => Promise<T>): Promise<T> {
  try {
    return await staticFn();
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    throw new ApiError(e?.message || 'Request failed', e?.status || 400);
  }
}

async function request<T>(
  url: string,
  options: RequestInit = {},
  token?: string | null,
  staticFn?: () => Promise<T>
): Promise<T> {
  if (isStaticModeActive() && staticFn) {
    return invokeStatic(staticFn);
  }

  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  let res: Response;
  try {
    res = await fetch(url, { ...options, headers });
  } catch (err) {
    if (staticFn) {
      enableStaticMode();
      return invokeStatic(staticFn);
    }
    throw err;
  }

  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json') && staticFn) {
    enableStaticMode();
    return invokeStatic(staticFn);
  }

  const data = (await res.json().catch(() => ({}))) as { error?: string } & T;
  if (!res.ok) {
    throw new ApiError(data.error || `Request failed (${res.status})`, res.status);
  }
  return data;
}

export const api = {
  getBootstrapStatus: () =>
    request<BootstrapStatus>('/api/auth/bootstrap-status', {}, null, () =>
      staticApi.getBootstrapStatus()
    ),

  claimAdmin: (payload: {
    name: string;
    email: string;
    password: string;
    unit: string;
    adminPasscode?: string;
  }) =>
    request<{ token: string; user: UserProfile }>(
      '/api/auth/claim-admin',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      null,
      () => staticApi.claimAdmin(payload)
    ),

  bootstrapSampleAccounts: (payload: {
    adminName: string;
    adminEmail: string;
    adminUnit: string;
    residentName: string;
    residentEmail: string;
    residentUnit: string;
    teacherName?: string;
    teacherEmail?: string;
    teacherUnit?: string;
    password: string;
    adminPasscode?: string;
  }) =>
    request<{
      token: string;
      user: UserProfile;
      residentToken: string;
      residentUser: UserProfile;
      teacherToken: string;
      teacherUser: UserProfile;
    }>(
      '/api/auth/bootstrap-samples',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      null,
      () => staticApi.bootstrapSampleAccounts(payload)
    ),

  registerResident: (payload: {
    studentId: string;
    name: string;
    email: string;
    password: string;
    unit: string;
    emailNotifications: boolean;
  }) =>
    request<{ token: string; user: UserProfile }>(
      '/api/auth/register',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      null,
      () => staticApi.registerResident(payload)
    ),

  login: (payload: { email: string; password: string }) =>
    request<{ token: string; user: UserProfile }>(
      '/api/auth/login',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      null,
      () => staticApi.login(payload)
    ),

  updateMyPreferences: (
    payload: { name?: string; unit?: string; emailNotifications?: boolean },
    token: string
  ) =>
    request<{ user: UserProfile }>(
      '/api/auth/me/preferences',
      {
        method: 'PATCH',
        body: JSON.stringify(payload),
      },
      token,
      () => staticApi.updateMyPreferences(payload, token)
    ),

  listAnnouncements: (token?: string | null, includeArchived = false) =>
    request<{ announcements: Announcement[] }>(
      `/api/announcements${includeArchived ? '?includeArchived=true' : ''}`,
      {},
      token,
      () => staticApi.listAnnouncements(token, includeArchived)
    ),

  createAnnouncement: (
    payload: {
      title: string;
      body: string;
      category: AnnouncementCategory;
      priority: AnnouncementPriority;
      audience: AnnouncementAudience;
      pinned: boolean;
      eventDate: string;
      notifyResidents: boolean;
    },
    token: string
  ) =>
    request<{ announcement: Announcement; dispatch: EmailDispatchLog | null }>(
      '/api/announcements',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      token,
      () => staticApi.createAnnouncement(payload, token)
    ),

  updateAnnouncement: (
    id: string,
    payload: Partial<{
      title: string;
      body: string;
      category: AnnouncementCategory;
      priority: AnnouncementPriority;
      audience: AnnouncementAudience;
      status: AnnouncementStatus;
      pinned: boolean;
      eventDate: string;
      notifyResidents: boolean;
    }>,
    token: string
  ) =>
    request<{ announcement: Announcement; dispatch: EmailDispatchLog | null }>(
      `/api/announcements/${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        body: JSON.stringify(payload),
      },
      token,
      () => staticApi.updateAnnouncement(id, payload, token)
    ),

  deleteAnnouncement: (id: string, token: string) =>
    request<{ deleted: boolean; id: string }>(
      `/api/announcements/${encodeURIComponent(id)}`,
      { method: 'DELETE' },
      token,
      () => staticApi.deleteAnnouncement(id, token)
    ),

  sendEmailNotification: (id: string, token: string) =>
    request<{ dispatch: EmailDispatchLog }>(
      `/api/announcements/${encodeURIComponent(id)}/notify`,
      { method: 'POST' },
      token,
      () => staticApi.sendEmailNotification(id, token)
    ),

  markAnnouncementRead: (id: string, token: string) =>
    request<{ id: string; readCount: number; isReadByMe: boolean }>(
      `/api/announcements/${encodeURIComponent(id)}/read`,
      { method: 'POST' },
      token,
      () => staticApi.markAnnouncementRead(id, token)
    ),

  getAdminOverview: (token: string) =>
    request<{ stats: AdminOverviewStats }>(
      '/api/admin/overview',
      {},
      token,
      () => staticApi.getAdminOverview(token)
    ),

  listResidents: (token: string) =>
    request<{ users: UserProfile[] }>(
      '/api/admin/residents',
      {},
      token,
      () => staticApi.listResidents(token)
    ),

  createResidentAccount: (
    payload: {
      studentId?: string;
      name: string;
      email: string;
      password: string;
      unit: string;
      role: UserRole;
      emailNotifications: boolean;
    },
    token: string
  ) =>
    request<{ user: UserProfile }>(
      '/api/admin/residents',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      token,
      () => staticApi.createResidentAccount(payload, token)
    ),

  updateResidentAccount: (
    id: string,
    payload: Partial<{
      status: UserStatus;
      emailNotifications: boolean;
      unit: string;
      role: UserRole;
    }>,
    token: string
  ) =>
    request<{ user: UserProfile }>(
      `/api/admin/residents/${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        body: JSON.stringify(payload),
      },
      token,
      () => staticApi.updateResidentAccount(id, payload, token)
    ),

  deleteResidentAccount: (id: string, token: string) =>
    request<{ deleted: boolean; id: string }>(
      `/api/admin/residents/${encodeURIComponent(id)}`,
      { method: 'DELETE' },
      token,
      () => staticApi.deleteResidentAccount(id, token)
    ),

  listRoster: (token: string) =>
    request<{ roster: EnrolledStudentRecord[] }>(
      '/api/admin/roster',
      {},
      token,
      () => staticApi.listRoster(token)
    ),

  addRosterEntry: (
    payload: {
      studentId: string;
      fullName: string;
      email: string;
      programUnit: string;
      memberType?: 'student' | 'teacher';
      campus?: string;
      semester?: string;
    },
    token: string
  ) =>
    request<{ entry: EnrolledStudentRecord }>(
      '/api/admin/roster',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      token,
      () => staticApi.addRosterEntry(payload, token)
    ),

  bulkImportRoster: (
    payload: { lines: string; campus?: string; semester?: string; memberType?: 'student' | 'teacher' },
    token: string
  ) =>
    request<{ addedCount: number; skippedCount: number }>(
      '/api/admin/roster/bulk',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      token,
      () => staticApi.bulkImportRoster(payload, token)
    ),

  updateRosterEntry: (
    id: string,
    payload: Partial<{
      enrollmentStatus: 'enrolled' | 'inactive';
      programUnit: string;
      semester: string;
      memberType: 'student' | 'teacher';
    }>,
    token: string
  ) =>
    request<{ entry: EnrolledStudentRecord }>(
      `/api/admin/roster/${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        body: JSON.stringify(payload),
      },
      token,
      () => staticApi.updateRosterEntry(id, payload, token)
    ),

  deleteRosterEntry: (id: string, token: string) =>
    request<{ deleted: boolean; id: string }>(
      `/api/admin/roster/${encodeURIComponent(id)}`,
      { method: 'DELETE' },
      token,
      () => staticApi.deleteRosterEntry(id, token)
    ),

  listDispatches: (token: string) =>
    request<{ dispatches: EmailDispatchLog[] }>(
      '/api/admin/dispatches',
      {},
      token,
      () => staticApi.listDispatches(token)
    ),

  getPortalSettings: () =>
    request<{ settings: PortalSettings }>('/api/portal-settings', {}, null, () =>
      staticApi.getPortalSettings()
    ),

  updatePortalSettings: (
    payload: Partial<Omit<PortalSettings, 'updatedAt'>>,
    token: string
  ) =>
    request<{ settings: PortalSettings }>(
      '/api/admin/portal-settings',
      {
        method: 'PATCH',
        body: JSON.stringify(payload),
      },
      token,
      () => staticApi.updatePortalSettings(payload, token)
    ),
};
