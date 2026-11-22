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
  RealtimeEvent,
  UserProfile,
  UserRole,
  UserStatus,
} from '../types';

let staticModeFlag = false;

export function isStaticModeActive(): boolean {
  return staticModeFlag;
}

export function enableStaticMode() {
  staticModeFlag = true;
}

const channel = (() => {
  try {
    return typeof BroadcastChannel !== 'undefined'
      ? new BroadcastChannel('omsu-mamburao-realtime')
      : null;
  } catch {
    return null;
  }
})();

function emitRealtime(event: RealtimeEvent) {
  window.dispatchEvent(new CustomEvent('omsu:realtime', { detail: event }));
  channel?.postMessage(event);
}

interface InternalUser extends UserProfile {
  passwordDigest: string;
  salt: string;
}

async function hashWithSalt(password: string, salt: string): Promise<string> {
  const input = `${salt}:${password}`;
  if (typeof window !== 'undefined' && window.crypto?.subtle) {
    const enc = new TextEncoder().encode(input);
    const buf = await window.crypto.subtle.digest('SHA-256', enc);
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  let h1 = 0x811c9dc5;
  let h2 = 0xdeadbeef;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193);
    h2 = Math.imul(h2 ^ c, 0x85ebca6b);
  }
  return `${(h1 >>> 0).toString(16).padStart(8, '0')}${(h2 >>> 0).toString(16).padStart(8, '0')}`;
}

function randomHex(bytesLen = 12): string {
  const bytes = new Uint8Array(bytesLen);
  window.crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function toPublicUser(u: InternalUser): UserProfile {
  return {
    id: u.id,
    studentId: u.studentId,
    name: u.name,
    email: u.email,
    role: u.role,
    unit: u.unit,
    emailNotifications: u.emailNotifications,
    status: u.status,
    createdAt: u.createdAt,
  };
}

const now = Date.now();
const hoursAgo = (h: number) => new Date(now - h * 3600_000).toISOString();
const daysAhead = (d: number) => new Date(now + d * 86400_000).toISOString().slice(0, 10);

const state: {
  users: InternalUser[];
  tokens: Map<string, string>;
  readMap: Map<string, Set<string>>;
  roster: EnrolledStudentRecord[];
  announcements: Announcement[];
  dispatches: EmailDispatchLog[];
  settings: PortalSettings;
} = {
  users: [],
  tokens: new Map<string, string>(),
  readMap: new Map<string, Set<string>>(),
  roster: [
    {
      id: 'roster-1',
      studentId: 'OMSU-2026-0001',
      fullName: 'Marco Santos',
      email: 'student@omsu-mamburao.edu.ph',
      programUnit: 'BSIT 1-B',
      memberType: 'student',
      campus: 'Mamburao Campus',
      semester: '2nd Sem AY 2026-2027',
      enrollmentStatus: 'enrolled',
      createdAt: hoursAgo(72),
    },
    {
      id: 'roster-2',
      studentId: 'OMSU-2026-0002',
      fullName: 'Maria Clara Reyes',
      email: 'maria.reyes@omsu-mamburao.edu.ph',
      programUnit: 'BSED 2B · English',
      memberType: 'student',
      campus: 'Mamburao Campus',
      semester: '2nd Sem AY 2026-2027',
      enrollmentStatus: 'enrolled',
      createdAt: hoursAgo(70),
    },
    {
      id: 'roster-3',
      studentId: 'OMSU-2026-0003',
      fullName: 'Joshua Mendoza',
      email: 'joshua.mendoza@omsu-mamburao.edu.ph',
      programUnit: 'BSBA 4A · Marketing Management',
      memberType: 'student',
      campus: 'Mamburao Campus',
      semester: '2nd Sem AY 2026-2027',
      enrollmentStatus: 'enrolled',
      createdAt: hoursAgo(68),
    },
    {
      id: 'roster-4',
      studentId: 'FAC-2026-0001',
      fullName: 'Prof. Clarissa Dizon',
      email: 'teacher@omsu-mamburao.edu.ph',
      programUnit: 'CAST Faculty · BSIT Department',
      memberType: 'teacher',
      campus: 'Mamburao Campus',
      semester: '2nd Sem AY 2026-2027',
      enrollmentStatus: 'enrolled',
      createdAt: hoursAgo(66),
    },
  ],
  announcements: [
    {
      id: 'ann-static-1',
      title: 'OMSU Mamburao Midterm Examination Schedule & Room Assignments',
      body: 'Official midterm examinations for all undergraduate programs at Occidental Mindoro State University — Mamburao Campus will proceed next week from Monday to Friday. BSIT 1-B and CAST students should check Room 204 and Computer Lab B schedules posted by your department chair and bring validated student IDs.',
      category: 'Academics',
      priority: 'urgent',
      audience: 'Students & Parents',
      status: 'published',
      pinned: true,
      eventDate: daysAhead(4),
      authorId: 'seed-admin',
      authorName: 'Office of the Campus Director · OMSU Mamburao',
      createdAt: hoursAgo(3),
      updatedAt: hoursAgo(3),
      readCount: 18,
    },
    {
      id: 'ann-static-2',
      title: 'BSIT & Campus Wi-Fi Maintenance Window — Academic Building B',
      body: 'Campus ICT Services will upgrade access points in Academic Building B and the Student Learning Commons this Saturday from 7:00 AM to 11:00 AM. Wired laboratory terminals remain operational for scheduled make-up laboratory sessions.',
      category: 'Operations',
      priority: 'important',
      audience: 'All Residents',
      status: 'published',
      pinned: true,
      eventDate: daysAhead(2),
      authorId: 'seed-admin',
      authorName: 'OMSU Mamburao ICT & Facilities Office',
      createdAt: hoursAgo(9),
      updatedAt: hoursAgo(9),
      readCount: 12,
    },
    {
      id: 'ann-static-3',
      title: 'CHED & Tertiary Education Subsidy (TES) Stipend Verification',
      body: 'Officially enrolled scholars for Second Semester AY 2026-2027 must submit their Certificate of Enrollment and signed validation slip at the Scholarship & Financial Assistance Window between 8:30 AM and 4:00 PM.',
      category: 'Financial',
      priority: 'normal',
      audience: 'Students & Parents',
      status: 'published',
      pinned: false,
      eventDate: daysAhead(7),
      authorId: 'seed-admin',
      authorName: 'Student Financial Assistance Office',
      createdAt: hoursAgo(22),
      updatedAt: hoursAgo(22),
      readCount: 9,
    },
    {
      id: 'ann-static-4',
      title: 'University Foundation Week Opening Assembly & Cultural Parade',
      body: 'All colleges, faculty members, and student organizations are invited to assemble at the Mamburao Campus Quadrangle at 7:30 AM in official college shirts for the opening ceremony and academic booths.',
      category: 'Events',
      priority: 'normal',
      audience: 'All Residents',
      status: 'published',
      pinned: false,
      eventDate: daysAhead(12),
      authorId: 'seed-admin',
      authorName: 'Office of Student Affairs & Services',
      createdAt: hoursAgo(36),
      updatedAt: hoursAgo(36),
      readCount: 15,
    },
  ],
  dispatches: [],
  settings: {
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
    updatedAt: hoursAgo(1),
  },
};

function getAuthUser(token?: string | null): InternalUser {
  if (!token) {
    throw { status: 401, message: 'Authentication required.' };
  }
  const userId = state.tokens.get(token);
  const user = state.users.find((u) => u.id === userId);
  if (!user || user.status !== 'active') {
    throw { status: 401, message: 'Invalid or expired session.' };
  }
  return user;
}

function requireAdminUser(token?: string | null): InternalUser {
  const user = getAuthUser(token);
  if (user.role !== 'admin') {
    throw { status: 403, message: 'Administrator privileges required.' };
  }
  return user;
}

function isEnrolledInRoster(email: string, studentId?: string): boolean {
  const e = email.trim().toLowerCase();
  const sid = (studentId || '').trim().toUpperCase();
  const entry = state.roster.find(
    (r) => r.email.toLowerCase() === e || (sid && r.studentId.toUpperCase() === sid)
  );
  return entry ? entry.enrollmentStatus === 'enrolled' : false;
}

function buildEmailDispatch(ann: Announcement, triggeredByName: string): EmailDispatchLog {
  const recipients = state.users.filter(
    (u) => (u.role === 'resident' || u.role === 'teacher') && u.status === 'active' && u.emailNotifications
  );
  const subject = `[OMSU Mamburao · ${ann.priority.toUpperCase()}] ${ann.title}`;
  const htmlPreview = `<!doctype html><html><body style="font-family:sans-serif;background:#f8fafc;padding:24px;color:#0f172a;"><div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #cbd5e1;border-radius:12px;overflow:hidden;"><div style="background:#1E3A8A;color:#ffffff;padding:18px 24px;"><strong>${state.settings.universityName}</strong><div style="font-size:12px;opacity:.9;">${state.settings.campusName}</div></div><div style="padding:24px;"><div style="font-size:12px;color:#1E3A8A;font-weight:700;">${ann.category} · ${ann.audience}</div><h2 style="margin:8px 0 12px;font-size:18px;">${ann.title}</h2><p style="font-size:14px;line-height:1.6;color:#334155;">${ann.body}</p><div style="margin-top:16px;font-size:12px;color:#64748b;">Posted by ${ann.authorName}</div></div></div></body></html>`;

  const dispatch: EmailDispatchLog = {
    id: `disp-${randomHex(6)}`,
    announcementId: ann.id,
    announcementTitle: ann.title,
    triggeredByName,
    recipientCount: recipients.length,
    deliveredCount: recipients.length,
    failedCount: 0,
    deliveryMode: 'outbox_preview',
    subject,
    htmlPreview,
    recipientsSummary: recipients.map((r) => ({
      email: r.email,
      name: r.name,
      unit: r.unit,
      status: 'queued_preview',
    })),
    createdAt: new Date().toISOString(),
  };
  state.dispatches.unshift(dispatch);
  emitRealtime({ type: 'email:dispatched', dispatch });
  return dispatch;
}

export const staticApi = {
  getBootstrapStatus: async (): Promise<BootstrapStatus> => ({
    adminExists: state.users.some((u) => u.role === 'admin'),
    envPasscodeConfigured: false,
    smtpConfigured: false,
  }),

  claimAdmin: async (payload: {
    name: string;
    email: string;
    password: string;
    unit: string;
  }) => {
    const salt = randomHex(8);
    const digest = await hashWithSalt(payload.password, salt);
    const user: InternalUser = {
      id: `u-${randomHex(6)}`,
      studentId: '',
      name: payload.name.trim(),
      email: payload.email.trim().toLowerCase(),
      role: 'admin',
      unit: payload.unit.trim() || 'Administration Office',
      emailNotifications: true,
      status: 'active',
      createdAt: new Date().toISOString(),
      passwordDigest: digest,
      salt,
    };
    state.users.push(user);
    const token = `static-${randomHex(16)}`;
    state.tokens.set(token, user.id);
    return { token, user: toPublicUser(user) };
  },

  bootstrapSampleAccounts: async (payload: {
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
  }) => {
    if (state.users.some((u) => u.role === 'admin')) {
      throw { status: 409, message: 'Admin account has already been initialized.' };
    }
    const createdAt = new Date().toISOString();

    const makeUser = async (
      role: UserRole,
      name: string,
      email: string,
      unit: string,
      studentId: string
    ) => {
      const salt = randomHex(8);
      const digest = await hashWithSalt(payload.password, salt);
      const user: InternalUser = {
        id: `u-${randomHex(6)}`,
        studentId,
        name,
        email: email.trim().toLowerCase(),
        role,
        unit,
        emailNotifications: true,
        status: 'active',
        createdAt,
        passwordDigest: digest,
        salt,
      };
      state.users.push(user);
      const tok = `static-${randomHex(16)}`;
      state.tokens.set(tok, user.id);
      return { token: tok, user };
    };

    const admin = await makeUser('admin', payload.adminName, payload.adminEmail, payload.adminUnit, '');
    const resident = await makeUser(
      'resident',
      payload.residentName,
      payload.residentEmail,
      payload.residentUnit,
      'OMSU-2026-0001'
    );
    const teacher = await makeUser(
      'teacher',
      payload.teacherName || 'Prof. Clarissa Dizon',
      payload.teacherEmail || 'teacher@omsu-mamburao.edu.ph',
      payload.teacherUnit || 'CAST Faculty · BSIT Department',
      'FAC-2026-0001'
    );

    return {
      token: admin.token,
      user: toPublicUser(admin.user),
      residentToken: resident.token,
      residentUser: toPublicUser(resident.user),
      teacherToken: teacher.token,
      teacherUser: toPublicUser(teacher.user),
    };
  },

  registerResident: async (payload: {
    studentId: string;
    name: string;
    email: string;
    password: string;
    unit: string;
    emailNotifications: boolean;
  }) => {
    if (!state.settings.allowSelfRegistration) {
      throw { status: 403, message: 'Student self-registration is currently disabled.' };
    }
    const cleanEmail = payload.email.trim().toLowerCase();
    const cleanId = payload.studentId.trim().toUpperCase();
    let role: UserRole = 'resident';
    let resolvedUnit = payload.unit.trim();

    if (state.settings.requireEnrolledVerification) {
      const entry = state.roster.find(
        (r) =>
          r.studentId.toUpperCase() === cleanId &&
          r.email.toLowerCase() === cleanEmail &&
          r.enrollmentStatus === 'enrolled'
      );
      if (!entry) {
        throw {
          status: 403,
          message:
            'Access restricted: Only officially enrolled OMSU students and faculty matching the Registrar roster can register.',
        };
      }
      role = entry.memberType === 'teacher' ? 'teacher' : 'resident';
      if (!resolvedUnit) resolvedUnit = entry.programUnit;
    }

    if (state.users.some((u) => u.email === cleanEmail)) {
      throw { status: 409, message: 'An account with this email is already registered.' };
    }

    const salt = randomHex(8);
    const digest = await hashWithSalt(payload.password, salt);
    const user: InternalUser = {
      id: `u-${randomHex(6)}`,
      studentId: cleanId,
      name: payload.name.trim(),
      email: cleanEmail,
      role,
      unit: resolvedUnit || 'BSIT 1-B',
      emailNotifications: payload.emailNotifications,
      status: 'active',
      createdAt: new Date().toISOString(),
      passwordDigest: digest,
      salt,
    };
    state.users.push(user);
    const token = `static-${randomHex(16)}`;
    state.tokens.set(token, user.id);
    emitRealtime({ type: 'resident:updated' });
    return { token, user: toPublicUser(user) };
  },

  login: async (payload: { email: string; password: string }) => {
    const cleanEmail = payload.email.trim().toLowerCase();
    const user = state.users.find((u) => u.email === cleanEmail);
    if (!user) {
      throw { status: 401, message: 'Invalid email or password.' };
    }
    const digest = await hashWithSalt(payload.password, user.salt);
    if (digest !== user.passwordDigest) {
      throw { status: 401, message: 'Invalid email or password.' };
    }
    if (user.status !== 'active') {
      throw { status: 403, message: 'This account has been suspended.' };
    }
    if ((user.role === 'resident' || user.role === 'teacher') && !isEnrolledInRoster(user.email, user.studentId)) {
      throw {
        status: 403,
        message: 'Access denied: Only officially enrolled OMSU students and active faculty can access this portal.',
      };
    }
    const token = `static-${randomHex(16)}`;
    state.tokens.set(token, user.id);
    return { token, user: toPublicUser(user) };
  },

  updateMyPreferences: async (
    payload: { name?: string; unit?: string; emailNotifications?: boolean },
    token: string
  ) => {
    const user = getAuthUser(token);
    if (payload.name && payload.name.trim().length >= 2) user.name = payload.name.trim();
    if (payload.unit !== undefined) user.unit = payload.unit.trim();
    if (typeof payload.emailNotifications === 'boolean') {
      user.emailNotifications = payload.emailNotifications;
    }
    emitRealtime({ type: 'resident:updated' });
    return { user: toPublicUser(user) };
  },

  listAnnouncements: async (token?: string | null, includeArchived = false) => {
    const user = getAuthUser(token);
    const list = state.announcements
      .filter((a) => (includeArchived && user.role === 'admin' ? true : a.status === 'published'))
      .map((a) => ({
        ...a,
        isReadByMe: state.readMap.get(a.id)?.has(user.id) ?? false,
      }))
      .sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        return b.createdAt.localeCompare(a.createdAt);
      });
    return { announcements: list };
  },

  createAnnouncement: async (
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
  ) => {
    const admin = requireAdminUser(token);
    const nowIso = new Date().toISOString();
    const ann: Announcement = {
      id: `ann-${randomHex(6)}`,
      title: payload.title.trim(),
      body: payload.body.trim(),
      category: payload.category,
      priority: payload.priority,
      audience: payload.audience,
      status: 'published',
      pinned: payload.pinned,
      eventDate: payload.eventDate || '',
      authorId: admin.id,
      authorName: admin.name,
      createdAt: nowIso,
      updatedAt: nowIso,
      readCount: 0,
      isReadByMe: false,
    };
    state.announcements.unshift(ann);
    emitRealtime({ type: 'announcement:created', announcement: ann });
    const dispatch = payload.notifyResidents ? buildEmailDispatch(ann, admin.name) : null;
    return { announcement: ann, dispatch };
  },

  updateAnnouncement: async (
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
  ) => {
    const admin = requireAdminUser(token);
    const ann = state.announcements.find((a) => a.id === id);
    if (!ann) throw { status: 404, message: 'Announcement not found.' };
    if (payload.title !== undefined) ann.title = payload.title.trim();
    if (payload.body !== undefined) ann.body = payload.body.trim();
    if (payload.category !== undefined) ann.category = payload.category;
    if (payload.priority !== undefined) ann.priority = payload.priority;
    if (payload.audience !== undefined) ann.audience = payload.audience;
    if (payload.status !== undefined) ann.status = payload.status;
    if (typeof payload.pinned === 'boolean') ann.pinned = payload.pinned;
    if (payload.eventDate !== undefined) ann.eventDate = payload.eventDate;
    ann.updatedAt = new Date().toISOString();
    emitRealtime({ type: 'announcement:updated', announcement: { ...ann } });
    const dispatch = payload.notifyResidents ? buildEmailDispatch(ann, admin.name) : null;
    return { announcement: { ...ann }, dispatch };
  },

  deleteAnnouncement: async (id: string, token: string) => {
    requireAdminUser(token);
    const idx = state.announcements.findIndex((a) => a.id === id);
    if (idx === -1) throw { status: 404, message: 'Announcement not found.' };
    state.announcements.splice(idx, 1);
    emitRealtime({ type: 'announcement:deleted', id });
    return { deleted: true, id };
  },

  sendEmailNotification: async (id: string, token: string) => {
    const admin = requireAdminUser(token);
    const ann = state.announcements.find((a) => a.id === id);
    if (!ann) throw { status: 404, message: 'Announcement not found.' };
    const dispatch = buildEmailDispatch(ann, admin.name);
    return { dispatch };
  },

  markAnnouncementRead: async (id: string, token: string) => {
    const user = getAuthUser(token);
    const ann = state.announcements.find((a) => a.id === id);
    if (!ann) throw { status: 404, message: 'Announcement not found.' };
    let set = state.readMap.get(id);
    if (!set) {
      set = new Set<string>();
      state.readMap.set(id, set);
    }
    if (!set.has(user.id)) {
      set.add(user.id);
      ann.readCount += 1;
    }
    emitRealtime({ type: 'announcement:read', id, readCount: ann.readCount, userId: user.id });
    return { id, readCount: ann.readCount, isReadByMe: true };
  },

  getAdminOverview: async (token: string): Promise<{ stats: AdminOverviewStats }> => {
    requireAdminUser(token);
    const published = state.announcements.filter((a) => a.status === 'published');
    const members = state.users.filter((u) => u.role === 'resident' || u.role === 'teacher');
    return {
      stats: {
        totalPublished: published.length,
        urgentCount: published.filter((a) => a.priority === 'urgent').length,
        pinnedCount: published.filter((a) => a.pinned).length,
        archivedCount: state.announcements.filter((a) => a.status === 'archived').length,
        totalResidents: members.length,
        optedInResidents: members.filter((u) => u.status === 'active' && u.emailNotifications).length,
        totalDispatches: state.dispatches.length,
        totalEmailsSent: state.dispatches.reduce((sum, d) => sum + d.deliveredCount, 0),
        enrolledRosterCount: state.roster.filter((r) => r.enrollmentStatus === 'enrolled').length,
      },
    };
  },

  listResidents: async (token: string) => {
    requireAdminUser(token);
    return { users: state.users.map(toPublicUser) };
  },

  createResidentAccount: async (
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
  ) => {
    requireAdminUser(token);
    const cleanEmail = payload.email.trim().toLowerCase();
    if (state.users.some((u) => u.email === cleanEmail)) {
      throw { status: 409, message: 'An account with this email already exists.' };
    }
    const cleanId =
      payload.role === 'admin'
        ? ''
        : (payload.studentId || '').trim().toUpperCase() ||
          `${payload.role === 'teacher' ? 'FAC' : 'OMSU'}-2026-${Math.floor(1000 + Math.random() * 8999)}`;
    const salt = randomHex(8);
    const digest = await hashWithSalt(payload.password, salt);
    const user: InternalUser = {
      id: `u-${randomHex(6)}`,
      studentId: cleanId,
      name: payload.name.trim(),
      email: cleanEmail,
      role: payload.role,
      unit: payload.unit.trim(),
      emailNotifications: payload.emailNotifications,
      status: 'active',
      createdAt: new Date().toISOString(),
      passwordDigest: digest,
      salt,
    };
    state.users.push(user);
    if (payload.role !== 'admin') {
      state.roster.push({
        id: `roster-${randomHex(6)}`,
        studentId: cleanId,
        fullName: user.name,
        email: cleanEmail,
        programUnit: user.unit,
        memberType: payload.role === 'teacher' ? 'teacher' : 'student',
        campus: 'Mamburao Campus',
        semester: '2nd Sem AY 2026-2027',
        enrollmentStatus: 'enrolled',
        createdAt: user.createdAt,
      });
    }
    emitRealtime({ type: 'resident:updated' });
    return { user: toPublicUser(user) };
  },

  updateResidentAccount: async (
    id: string,
    payload: Partial<{
      status: UserStatus;
      emailNotifications: boolean;
      unit: string;
      role: UserRole;
    }>,
    token: string
  ) => {
    requireAdminUser(token);
    const user = state.users.find((u) => u.id === id);
    if (!user) throw { status: 404, message: 'Account not found.' };
    if (payload.status) user.status = payload.status;
    if (typeof payload.emailNotifications === 'boolean') {
      user.emailNotifications = payload.emailNotifications;
    }
    if (payload.unit !== undefined) user.unit = payload.unit;
    if (payload.role) user.role = payload.role;
    emitRealtime({ type: 'resident:updated' });
    return { user: toPublicUser(user) };
  },

  deleteResidentAccount: async (id: string, token: string) => {
    const admin = requireAdminUser(token);
    if (id === admin.id) throw { status: 400, message: 'Cannot delete your active admin account.' };
    const idx = state.users.findIndex((u) => u.id === id);
    if (idx === -1) throw { status: 404, message: 'Account not found.' };
    state.users.splice(idx, 1);
    emitRealtime({ type: 'resident:updated' });
    return { deleted: true, id };
  },

  listRoster: async (token: string) => {
    requireAdminUser(token);
    return {
      roster: state.roster.map((r) => ({
        ...r,
        hasAccount: state.users.some(
          (u) =>
            u.email.toLowerCase() === r.email.toLowerCase() ||
            (u.studentId && u.studentId.toUpperCase() === r.studentId.toUpperCase())
        ),
      })),
    };
  },

  addRosterEntry: async (
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
  ) => {
    requireAdminUser(token);
    const entry: EnrolledStudentRecord = {
      id: `roster-${randomHex(6)}`,
      studentId: payload.studentId.trim().toUpperCase(),
      fullName: payload.fullName.trim(),
      email: payload.email.trim().toLowerCase(),
      programUnit: payload.programUnit.trim(),
      memberType: payload.memberType === 'teacher' ? 'teacher' : 'student',
      campus: payload.campus || 'Mamburao Campus',
      semester: payload.semester || '2nd Sem AY 2026-2027',
      enrollmentStatus: 'enrolled',
      hasAccount: false,
      createdAt: new Date().toISOString(),
    };
    state.roster.unshift(entry);
    emitRealtime({ type: 'resident:updated' });
    return { entry };
  },

  bulkImportRoster: async (
    payload: { lines: string; campus?: string; semester?: string; memberType?: 'student' | 'teacher' },
    token: string
  ) => {
    requireAdminUser(token);
    let addedCount = 0;
    let skippedCount = 0;
    for (const raw of payload.lines.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)) {
      const parts = raw.split(/[,\t|]/).map((p) => p.trim());
      if (parts.length < 3) {
        skippedCount += 1;
        continue;
      }
      const [sid, name, email, prog = 'OMSU Mamburao Member'] = parts;
      const cleanId = sid.toUpperCase();
      const cleanEmail = email.toLowerCase();
      if (state.roster.some((r) => r.studentId === cleanId || r.email === cleanEmail)) {
        skippedCount += 1;
        continue;
      }
      state.roster.push({
        id: `roster-${randomHex(6)}`,
        studentId: cleanId,
        fullName: name,
        email: cleanEmail,
        programUnit: prog,
        memberType: cleanId.startsWith('FAC-') ? 'teacher' : payload.memberType || 'student',
        campus: payload.campus || 'Mamburao Campus',
        semester: payload.semester || '2nd Sem AY 2026-2027',
        enrollmentStatus: 'enrolled',
        createdAt: new Date().toISOString(),
      });
      addedCount += 1;
    }
    emitRealtime({ type: 'resident:updated' });
    return { addedCount, skippedCount };
  },

  updateRosterEntry: async (
    id: string,
    payload: Partial<{
      enrollmentStatus: 'enrolled' | 'inactive';
      programUnit: string;
      semester: string;
      memberType: 'student' | 'teacher';
    }>,
    token: string
  ) => {
    requireAdminUser(token);
    const entry = state.roster.find((r) => r.id === id);
    if (!entry) throw { status: 404, message: 'Roster record not found.' };
    if (payload.enrollmentStatus) entry.enrollmentStatus = payload.enrollmentStatus;
    if (payload.programUnit) entry.programUnit = payload.programUnit;
    if (payload.semester) entry.semester = payload.semester;
    if (payload.memberType) entry.memberType = payload.memberType;
    emitRealtime({ type: 'resident:updated' });
    return { entry };
  },

  deleteRosterEntry: async (id: string, token: string) => {
    requireAdminUser(token);
    const idx = state.roster.findIndex((r) => r.id === id);
    if (idx === -1) throw { status: 404, message: 'Roster record not found.' };
    state.roster.splice(idx, 1);
    emitRealtime({ type: 'resident:updated' });
    return { deleted: true, id };
  },

  listDispatches: async (token: string) => {
    requireAdminUser(token);
    return { dispatches: [...state.dispatches] };
  },

  getPortalSettings: async () => ({
    settings: { ...state.settings },
  }),

  updatePortalSettings: async (
    payload: Partial<Omit<PortalSettings, 'updatedAt'>>,
    token: string
  ) => {
    requireAdminUser(token);
    state.settings = {
      ...state.settings,
      ...payload,
      updatedAt: new Date().toISOString(),
    };
    emitRealtime({ type: 'portal:updated', settings: { ...state.settings } });
    return { settings: { ...state.settings } };
  },
};
