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

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(
  url: string,
  options: RequestInit = {},
  token?: string | null
): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const res = await fetch(url, { ...options, headers });
  const data = (await res.json().catch(() => ({}))) as { error?: string } & T;
  if (!res.ok) {
    throw new ApiError(data.error || `Request failed (${res.status})`, res.status);
  }
  return data;
}

export const api = {
  getBootstrapStatus: () => request<BootstrapStatus>('/api/auth/bootstrap-status'),

  claimAdmin: (payload: {
    name: string;
    email: string;
    password: string;
    unit: string;
    adminPasscode?: string;
  }) =>
    request<{ token: string; user: UserProfile }>('/api/auth/claim-admin', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

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
    }>('/api/auth/bootstrap-samples', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  registerResident: (payload: {
    studentId: string;
    name: string;
    email: string;
    password: string;
    unit: string;
    emailNotifications: boolean;
  }) =>
    request<{ token: string; user: UserProfile }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  login: (payload: { email: string; password: string }) =>
    request<{ token: string; user: UserProfile }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

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
      token
    ),

  listAnnouncements: (token?: string | null, includeArchived = false) =>
    request<{ announcements: Announcement[] }>(
      `/api/announcements${includeArchived ? '?includeArchived=true' : ''}`,
      {},
      token
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
      token
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
      token
    ),

  deleteAnnouncement: (id: string, token: string) =>
    request<{ deleted: boolean; id: string }>(
      `/api/announcements/${encodeURIComponent(id)}`,
      { method: 'DELETE' },
      token
    ),

  sendEmailNotification: (id: string, token: string) =>
    request<{ dispatch: EmailDispatchLog }>(
      `/api/announcements/${encodeURIComponent(id)}/notify`,
      { method: 'POST' },
      token
    ),

  markAnnouncementRead: (id: string, token: string) =>
    request<{ id: string; readCount: number; isReadByMe: boolean }>(
      `/api/announcements/${encodeURIComponent(id)}/read`,
      { method: 'POST' },
      token
    ),

  getAdminOverview: (token: string) =>
    request<{ stats: AdminOverviewStats }>('/api/admin/overview', {}, token),

  listResidents: (token: string) =>
    request<{ users: UserProfile[] }>('/api/admin/residents', {}, token),

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
      token
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
      token
    ),

  deleteResidentAccount: (id: string, token: string) =>
    request<{ deleted: boolean; id: string }>(
      `/api/admin/residents/${encodeURIComponent(id)}`,
      { method: 'DELETE' },
      token
    ),

  listRoster: (token: string) =>
    request<{ roster: EnrolledStudentRecord[] }>('/api/admin/roster', {}, token),

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
      token
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
      token
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
      token
    ),

  deleteRosterEntry: (id: string, token: string) =>
    request<{ deleted: boolean; id: string }>(
      `/api/admin/roster/${encodeURIComponent(id)}`,
      { method: 'DELETE' },
      token
    ),

  listDispatches: (token: string) =>
    request<{ dispatches: EmailDispatchLog[] }>('/api/admin/dispatches', {}, token),

  getPortalSettings: () => request<{ settings: PortalSettings }>('/api/portal-settings'),

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
      token
    ),
};
