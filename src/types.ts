export type UserRole = 'admin' | 'resident' | 'teacher';
export type UserStatus = 'active' | 'suspended';

export type AnnouncementCategory =
  | 'Academics'
  | 'Operations'
  | 'Events'
  | 'Health & Safety'
  | 'Financial'
  | 'Athletics';

export type AnnouncementPriority = 'normal' | 'important' | 'urgent';

export type AnnouncementAudience =
  | 'All Residents'
  | 'Dorm & Housing'
  | 'Students & Parents'
  | 'Faculty & Staff';

export type AnnouncementStatus = 'published' | 'archived';

export interface UserProfile {
  id: string;
  studentId?: string;
  name: string;
  email: string;
  role: UserRole;
  unit: string;
  emailNotifications: boolean;
  status: UserStatus;
  createdAt: string;
}

export interface EnrolledStudentRecord {
  id: string;
  studentId: string;
  fullName: string;
  email: string;
  programUnit: string;
  memberType?: 'student' | 'teacher';
  campus: string;
  semester: string;
  enrollmentStatus: 'enrolled' | 'inactive';
  hasAccount?: boolean;
  createdAt: string;
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  category: AnnouncementCategory;
  priority: AnnouncementPriority;
  audience: AnnouncementAudience;
  status: AnnouncementStatus;
  pinned: boolean;
  eventDate: string;
  authorId: string;
  authorName: string;
  createdAt: string;
  updatedAt: string;
  readCount: number;
  isReadByMe?: boolean;
}

export interface RecipientDeliveryStatus {
  email: string;
  name: string;
  unit: string;
  status: 'sent' | 'queued_preview' | 'failed';
  error?: string;
}

export interface EmailDispatchLog {
  id: string;
  announcementId: string;
  announcementTitle: string;
  triggeredByName: string;
  recipientCount: number;
  deliveredCount: number;
  failedCount: number;
  deliveryMode: 'smtp' | 'outbox_preview';
  subject: string;
  htmlPreview: string;
  recipientsSummary: RecipientDeliveryStatus[];
  createdAt: string;
}

export interface AdminOverviewStats {
  totalPublished: number;
  urgentCount: number;
  pinnedCount: number;
  archivedCount: number;
  totalResidents: number;
  optedInResidents: number;
  totalDispatches: number;
  totalEmailsSent: number;
  enrolledRosterCount?: number;
}

export interface BootstrapStatus {
  adminExists: boolean;
  envPasscodeConfigured: boolean;
  smtpConfigured: boolean;
}

export interface SampleSessionBundle {
  admin: { token: string; user: UserProfile };
  resident: { token: string; user: UserProfile };
  teacher: { token: string; user: UserProfile };
  sessionPassword?: string;
}

export interface PortalSettings {
  universityName: string;
  campusName: string;
  portalTagline: string;
  heroHeadline: string;
  heroDescription: string;
  bannerEnabled: boolean;
  bannerMessage: string;
  allowSelfRegistration: boolean;
  requireEnrolledVerification: boolean;
  supportEmail: string;
  officeHours: string;
  updatedAt: string;
}

export type RealtimeEvent =
  | { type: 'ws:connected'; onlineCount: number }
  | { type: 'ws:presence'; onlineCount: number }
  | { type: 'announcement:created'; announcement: Announcement }
  | { type: 'announcement:updated'; announcement: Announcement }
  | { type: 'announcement:deleted'; id: string }
  | { type: 'announcement:read'; id: string; readCount: number; userId: string }
  | { type: 'email:dispatched'; dispatch: EmailDispatchLog }
  | { type: 'resident:updated' }
  | { type: 'portal:updated'; settings: PortalSettings };
