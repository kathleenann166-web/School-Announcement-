import 'dotenv/config';
import express from 'express';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { db } from './server/db.ts';
import {
  hashPassword,
  isStudentEnrolled,
  loadUserById,
  requireAdmin,
  requireAuth,
  signToken,
  verifyConstantTime,
  verifyPassword,
  verifyToken,
  type AuthedRequest,
} from './server/auth.ts';
import { dispatchAnnouncementEmail, isSmtpConfigured } from './server/mailer.ts';

const VALID_CATEGORIES = new Set([
  'Academics',
  'Operations',
  'Events',
  'Health & Safety',
  'Financial',
  'Athletics',
]);
const VALID_PRIORITIES = new Set(['normal', 'important', 'urgent']);
const VALID_AUDIENCES = new Set([
  'All Residents',
  'Dorm & Housing',
  'Students & Parents',
  'Faculty & Staff',
]);

interface AnnouncementRow {
  id: string;
  title: string;
  body: string;
  category: string;
  priority: 'normal' | 'important' | 'urgent';
  audience: string;
  status: 'published' | 'archived';
  pinned: number;
  event_date: string;
  author_id: string;
  author_name: string;
  created_at: string;
  updated_at: string;
  read_count: number;
  is_read_by_me?: number;
}

function serializeAnnouncement(row: AnnouncementRow) {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    category: row.category,
    priority: row.priority,
    audience: row.audience,
    status: row.status,
    pinned: Boolean(row.pinned),
    eventDate: row.event_date,
    authorId: row.author_id,
    authorName: row.author_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    readCount: Number(row.read_count ?? 0),
    ...(typeof row.is_read_by_me === 'number' ? { isReadByMe: Boolean(row.is_read_by_me) } : {}),
  };
}

function fetchAnnouncementById(id: string, userId?: string) {
  const row = db
    .prepare(
      `SELECT
        a.*,
        (SELECT COUNT(*) FROM announcement_reads r WHERE r.announcement_id = a.id) AS read_count,
        CASE WHEN ? IS NOT NULL AND EXISTS(
          SELECT 1 FROM announcement_reads r2 WHERE r2.announcement_id = a.id AND r2.user_id = ?
        ) THEN 1 ELSE 0 END AS is_read_by_me
      FROM announcements a
      WHERE a.id = ?`
    )
    .get(userId ?? null, userId ?? null, id) as AnnouncementRow | undefined;

  if (!row) return null;
  const serialized = serializeAnnouncement(row);
  if (!userId) {
    delete serialized.isReadByMe;
  }
  return serialized;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 160;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  interface TrackedSocket {
    ws: WebSocket;
    role: 'guest' | 'resident' | 'teacher' | 'admin';
  }
  const clients = new Set<TrackedSocket>();

  function broadcastPublic(payload: object) {
    const message = JSON.stringify(payload);
    for (const client of clients) {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(message);
      }
    }
  }

  function broadcastEnrolled(payload: object) {
    const message = JSON.stringify(payload);
    for (const client of clients) {
      if (
        (client.role === 'resident' || client.role === 'teacher' || client.role === 'admin') &&
        client.ws.readyState === WebSocket.OPEN
      ) {
        client.ws.send(message);
      }
    }
  }

  function broadcastAdmins(payload: object) {
    const message = JSON.stringify(payload);
    for (const client of clients) {
      if (client.role === 'admin' && client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(message);
      }
    }
  }

  wss.on('connection', (ws) => {
    const tracked: TrackedSocket = { ws, role: 'guest' };
    clients.add(tracked);

    ws.send(JSON.stringify({ type: 'ws:connected', onlineCount: clients.size }));
    broadcastPublic({ type: 'ws:presence', onlineCount: clients.size });

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as { type?: unknown; token?: unknown };
        if (msg.type === 'auth' && typeof msg.token === 'string') {
          const parsed = verifyToken(msg.token);
          if (parsed) {
            const user = loadUserById(parsed.sub);
            if (user) {
              tracked.role = user.role;
              return;
            }
          }
          tracked.role = 'guest';
        }
      } catch {
        // Ignore malformed client frames
      }
    });

    ws.on('close', () => {
      clients.delete(tracked);
      broadcastPublic({ type: 'ws:presence', onlineCount: clients.size });
    });
  });

  // Health endpoint
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  // Auth: Bootstrap Status
  app.get('/api/auth/bootstrap-status', (_req, res) => {
    const row = db.prepare("SELECT COUNT(*) AS cnt FROM users WHERE role = 'admin'").get() as {
      cnt: number;
    };
    const envPasscodeConfigured = Boolean(
      process.env.ADMIN_PASSCODE && process.env.ADMIN_PASSCODE.trim().length > 0
    );
    res.json({
      adminExists: row.cnt > 0,
      envPasscodeConfigured,
      smtpConfigured: isSmtpConfigured(),
    });
  });

  // Auth: One-time first-run Admin setup/claim
  app.post('/api/auth/claim-admin', (req, res) => {
    const { name, email, password, unit, adminPasscode } = req.body ?? {};

    if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 80) {
      res.status(400).json({ error: 'Name must be between 2 and 80 characters.' });
      return;
    }
    if (typeof email !== 'string' || !isValidEmail(email.trim().toLowerCase())) {
      res.status(400).json({ error: 'Please enter a valid email address.' });
      return;
    }
    if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
      res.status(400).json({ error: 'Password must be at least 8 characters.' });
      return;
    }

    const configuredPasscode = (process.env.ADMIN_PASSCODE || '').trim();
    if (configuredPasscode.length > 0) {
      if (typeof adminPasscode !== 'string' || !verifyConstantTime(adminPasscode, configuredPasscode)) {
        res.status(403).json({ error: 'Invalid administrator setup passcode.' });
        return;
      }
    }

    const normalizedEmail = email.trim().toLowerCase();
    const cleanUnit = typeof unit === 'string' && unit.trim() ? unit.trim().slice(0, 80) : 'Administration Office';

    try {
      const createdUser = db.transaction(() => {
        const existingAdmin = db
          .prepare("SELECT COUNT(*) AS cnt FROM users WHERE role = 'admin'")
          .get() as { cnt: number };

        if (existingAdmin.cnt > 0) {
          return { conflict: 'Admin account has already been claimed. Please sign in.' as const };
        }

        const existingEmail = db
          .prepare('SELECT id FROM users WHERE email = ?')
          .get(normalizedEmail) as { id: string } | undefined;

        if (existingEmail) {
          return { emailConflict: 'An account with that email already exists.' as const };
        }

        const id = crypto.randomUUID();
        const createdAt = new Date().toISOString();
        const passwordHash = hashPassword(password);

        db.prepare(
          `INSERT INTO users (id, name, email, password_hash, role, unit, email_notifications, status, created_at)
           VALUES (?, ?, ?, ?, 'admin', ?, 1, 'active', ?)`
        ).run(id, name.trim(), normalizedEmail, passwordHash, cleanUnit, createdAt);

        return {
          user: {
            id,
            name: name.trim(),
            email: normalizedEmail,
            role: 'admin' as const,
            unit: cleanUnit,
            emailNotifications: true,
            status: 'active' as const,
            createdAt,
          },
        };
      })();

      if ('conflict' in createdUser) {
        res.status(409).json({ error: createdUser.conflict });
        return;
      }
      if ('emailConflict' in createdUser) {
        res.status(409).json({ error: createdUser.emailConflict });
        return;
      }

      const token = signToken(createdUser.user.id, 'admin');
      res.status(201).json({ token, user: createdUser.user });
    } catch (err) {
      res.status(500).json({ error: 'Unable to initialize administrator account.' });
    }
  });

  // Auth: One-time first-run Sample Admin + Enrolled Student + Teacher Setup
  app.post('/api/auth/bootstrap-samples', (req, res) => {
    const {
      adminName,
      adminEmail,
      adminUnit,
      residentName,
      residentEmail,
      residentUnit,
      teacherName,
      teacherEmail,
      teacherUnit,
      password,
      adminPasscode,
    } = req.body ?? {};

    const cleanAdminName =
      typeof adminName === 'string' && adminName.trim().length >= 2
        ? adminName.trim().slice(0, 80)
        : 'Dean Elena Morales';
    const cleanAdminEmail =
      typeof adminEmail === 'string' && adminEmail.trim()
        ? adminEmail.trim().toLowerCase()
        : 'admin@omsu-mamburao.edu.ph';
    const cleanAdminUnit =
      typeof adminUnit === 'string' && adminUnit.trim()
        ? adminUnit.trim().slice(0, 80)
        : 'OMSU Mamburao Administration Office';

    const cleanResidentName =
      typeof residentName === 'string' && residentName.trim().length >= 2
        ? residentName.trim().slice(0, 80)
        : 'Marco Santos';
    const cleanResidentEmail =
      typeof residentEmail === 'string' && residentEmail.trim()
        ? residentEmail.trim().toLowerCase()
        : 'student@omsu-mamburao.edu.ph';
    const cleanResidentUnit =
      typeof residentUnit === 'string' && residentUnit.trim()
        ? residentUnit.trim().slice(0, 80)
        : 'BSIT 1-B';

    const cleanTeacherName =
      typeof teacherName === 'string' && teacherName.trim().length >= 2
        ? teacherName.trim().slice(0, 80)
        : 'Prof. Clarissa Dizon';
    const cleanTeacherEmail =
      typeof teacherEmail === 'string' && teacherEmail.trim()
        ? teacherEmail.trim().toLowerCase()
        : 'teacher@omsu-mamburao.edu.ph';
    const cleanTeacherUnit =
      typeof teacherUnit === 'string' && teacherUnit.trim()
        ? teacherUnit.trim().slice(0, 80)
        : 'CAST Faculty · BSIT Department';

    if (
      !isValidEmail(cleanAdminEmail) ||
      !isValidEmail(cleanResidentEmail) ||
      !isValidEmail(cleanTeacherEmail)
    ) {
      res.status(400).json({ error: 'Please provide valid email addresses for all sample accounts.' });
      return;
    }
    if (
      cleanAdminEmail === cleanResidentEmail ||
      cleanAdminEmail === cleanTeacherEmail ||
      cleanResidentEmail === cleanTeacherEmail
    ) {
      res.status(400).json({ error: 'Admin, Student, and Teacher sample emails must be unique.' });
      return;
    }
    if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
      res.status(400).json({ error: 'Password must be at least 8 characters.' });
      return;
    }

    const configuredPasscode = (process.env.ADMIN_PASSCODE || '').trim();
    if (configuredPasscode.length > 0) {
      if (typeof adminPasscode !== 'string' || !verifyConstantTime(adminPasscode, configuredPasscode)) {
        res.status(403).json({ error: 'Invalid administrator setup passcode.' });
        return;
      }
    }

    try {
      const result = db.transaction(() => {
        const existingAdmin = db
          .prepare("SELECT COUNT(*) AS cnt FROM users WHERE role = 'admin'")
          .get() as { cnt: number };

        if (existingAdmin.cnt > 0) {
          return { conflict: 'Admin account has already been claimed. Please sign in.' as const };
        }

        const dupAdmin = db
          .prepare('SELECT id FROM users WHERE email = ?')
          .get(cleanAdminEmail) as { id: string } | undefined;
        const dupResident = db
          .prepare('SELECT id FROM users WHERE email = ?')
          .get(cleanResidentEmail) as { id: string } | undefined;
        const dupTeacher = db
          .prepare('SELECT id FROM users WHERE email = ?')
          .get(cleanTeacherEmail) as { id: string } | undefined;

        if (dupAdmin || dupResident || dupTeacher) {
          return { emailConflict: 'One of those sample email addresses is already registered.' as const };
        }

        const createdAt = new Date().toISOString();
        const adminId = crypto.randomUUID();
        const residentId = crypto.randomUUID();
        const teacherId = crypto.randomUUID();
        const sampleStudentId = 'OMSU-2026-0001';
        const sampleTeacherId = 'FAC-2026-0001';
        const passwordHash = hashPassword(password);

        db.prepare(
          `INSERT INTO users (id, student_id, name, email, password_hash, role, unit, email_notifications, status, created_at)
           VALUES (?, '', ?, ?, ?, 'admin', ?, 1, 'active', ?)`
        ).run(adminId, cleanAdminName, cleanAdminEmail, passwordHash, cleanAdminUnit, createdAt);

        db.prepare(
          `INSERT INTO users (id, student_id, name, email, password_hash, role, unit, email_notifications, status, created_at)
           VALUES (?, ?, ?, ?, ?, 'resident', ?, 1, 'active', ?)`
        ).run(
          residentId,
          sampleStudentId,
          cleanResidentName,
          cleanResidentEmail,
          passwordHash,
          cleanResidentUnit,
          createdAt
        );

        db.prepare(
          `INSERT INTO users (id, student_id, name, email, password_hash, role, unit, email_notifications, status, created_at)
           VALUES (?, ?, ?, ?, ?, 'teacher', ?, 1, 'active', ?)`
        ).run(
          teacherId,
          sampleTeacherId,
          cleanTeacherName,
          cleanTeacherEmail,
          passwordHash,
          cleanTeacherUnit,
          createdAt
        );

        const existingStudentRoster = db
          .prepare('SELECT id FROM enrolled_roster WHERE LOWER(email) = ? OR UPPER(student_id) = ?')
          .get(cleanResidentEmail, sampleStudentId) as { id: string } | undefined;

        if (!existingStudentRoster) {
          db.prepare(
            `INSERT INTO enrolled_roster (
              id, student_id, full_name, email, program_unit, member_type, campus, semester, enrollment_status, created_at
            ) VALUES (?, ?, ?, ?, ?, 'student', 'Mamburao Campus', '2nd Sem AY 2026-2027', 'enrolled', ?)`
          ).run(
            crypto.randomUUID(),
            sampleStudentId,
            cleanResidentName,
            cleanResidentEmail,
            cleanResidentUnit,
            createdAt
          );
        } else {
          db.prepare(
            `UPDATE enrolled_roster
             SET full_name = ?, email = ?, program_unit = ?, member_type = 'student', enrollment_status = 'enrolled'
             WHERE id = ?`
          ).run(cleanResidentName, cleanResidentEmail, cleanResidentUnit, existingStudentRoster.id);
        }

        const existingTeacherRoster = db
          .prepare('SELECT id FROM enrolled_roster WHERE LOWER(email) = ? OR UPPER(student_id) = ?')
          .get(cleanTeacherEmail, sampleTeacherId) as { id: string } | undefined;

        if (!existingTeacherRoster) {
          db.prepare(
            `INSERT INTO enrolled_roster (
              id, student_id, full_name, email, program_unit, member_type, campus, semester, enrollment_status, created_at
            ) VALUES (?, ?, ?, ?, ?, 'teacher', 'Mamburao Campus', '2nd Sem AY 2026-2027', 'enrolled', ?)`
          ).run(
            crypto.randomUUID(),
            sampleTeacherId,
            cleanTeacherName,
            cleanTeacherEmail,
            cleanTeacherUnit,
            createdAt
          );
        } else {
          db.prepare(
            `UPDATE enrolled_roster
             SET full_name = ?, email = ?, program_unit = ?, member_type = 'teacher', enrollment_status = 'enrolled'
             WHERE id = ?`
          ).run(cleanTeacherName, cleanTeacherEmail, cleanTeacherUnit, existingTeacherRoster.id);
        }

        return {
          adminUser: {
            id: adminId,
            studentId: '',
            name: cleanAdminName,
            email: cleanAdminEmail,
            role: 'admin' as const,
            unit: cleanAdminUnit,
            emailNotifications: true,
            status: 'active' as const,
            createdAt,
          },
          residentUser: {
            id: residentId,
            studentId: sampleStudentId,
            name: cleanResidentName,
            email: cleanResidentEmail,
            role: 'resident' as const,
            unit: cleanResidentUnit,
            emailNotifications: true,
            status: 'active' as const,
            createdAt,
          },
          teacherUser: {
            id: teacherId,
            studentId: sampleTeacherId,
            name: cleanTeacherName,
            email: cleanTeacherEmail,
            role: 'teacher' as const,
            unit: cleanTeacherUnit,
            emailNotifications: true,
            status: 'active' as const,
            createdAt,
          },
        };
      })();

      if ('conflict' in result) {
        res.status(409).json({ error: result.conflict });
        return;
      }
      if ('emailConflict' in result) {
        res.status(409).json({ error: result.emailConflict });
        return;
      }

      const token = signToken(result.adminUser.id, 'admin');
      const residentToken = signToken(result.residentUser.id, 'resident');
      const teacherToken = signToken(result.teacherUser.id, 'teacher');
      broadcastAdmins({ type: 'resident:updated' });
      res.status(201).json({
        token,
        user: result.adminUser,
        residentToken,
        residentUser: result.residentUser,
        teacherToken,
        teacherUser: result.teacherUser,
      });
    } catch {
      res.status(500).json({ error: 'Unable to create sample accounts.' });
    }
  });

  // Auth: Enrolled OMSU Student or Faculty Registration
  app.post('/api/auth/register', (req, res) => {
    const portalPolicy = db
      .prepare(
        "SELECT allow_self_registration, require_enrolled_verification FROM portal_settings WHERE id = 'default'"
      )
      .get() as { allow_self_registration: number; require_enrolled_verification: number } | undefined;

    if (portalPolicy && portalPolicy.allow_self_registration === 0) {
      res.status(403).json({
        error: 'Student self-registration is currently disabled by the campus administrator.',
      });
      return;
    }

    const requireEnrolled = portalPolicy ? portalPolicy.require_enrolled_verification === 1 : true;
    const { studentId, name, email, password, unit, role, emailNotifications } = req.body ?? {};

    const cleanStudentId = typeof studentId === 'string' ? studentId.trim().toUpperCase() : '';
    if (requireEnrolled && (cleanStudentId.length < 4 || cleanStudentId.length > 40)) {
      res.status(400).json({
        error: 'Please enter your official OMSU Student or Faculty ID Number (e.g., OMSU-2026-0002).',
      });
      return;
    }
    if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 80) {
      res.status(400).json({ error: 'Full name must be between 2 and 80 characters.' });
      return;
    }
    if (typeof email !== 'string' || !isValidEmail(email.trim().toLowerCase())) {
      res.status(400).json({ error: 'Please provide a valid email address.' });
      return;
    }
    if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
      res.status(400).json({ error: 'Password must be at least 8 characters.' });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();

    let resolvedUnit = typeof unit === 'string' ? unit.trim().slice(0, 80) : '';
    let assignedRole: 'resident' | 'teacher' = role === 'teacher' ? 'teacher' : 'resident';
    if (requireEnrolled) {
      const rosterEntry = db
        .prepare(
          `SELECT student_id, full_name, email, program_unit, member_type, enrollment_status
           FROM enrolled_roster
           WHERE UPPER(student_id) = ? AND LOWER(email) = ?
           LIMIT 1`
        )
        .get(cleanStudentId, normalizedEmail) as
        | {
            student_id: string;
            full_name: string;
            email: string;
            program_unit: string;
            member_type: 'student' | 'teacher';
            enrollment_status: 'enrolled' | 'inactive';
          }
        | undefined;

      if (!rosterEntry || rosterEntry.enrollment_status !== 'enrolled') {
        res.status(403).json({
          error:
            'Access restricted: Only officially enrolled Occidental Mindoro State University students and active faculty can register. Make sure your ID and Email match the Registrar roster.',
        });
        return;
      }
      assignedRole = rosterEntry.member_type === 'teacher' ? 'teacher' : 'resident';
      if (!resolvedUnit) {
        resolvedUnit = rosterEntry.program_unit;
      }
    }

    if (resolvedUnit.length < 2) {
      res.status(400).json({ error: 'Please enter your program, year & section, or department.' });
      return;
    }

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail);
    if (existing) {
      res.status(409).json({ error: 'An account with this email is already registered.' });
      return;
    }

    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    const optIn = emailNotifications === false ? 0 : 1;
    const passwordHash = hashPassword(password);

    db.prepare(
      `INSERT INTO users (id, student_id, name, email, password_hash, role, unit, email_notifications, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`
    ).run(id, cleanStudentId, name.trim(), normalizedEmail, passwordHash, assignedRole, resolvedUnit, optIn, createdAt);

    const user = {
      id,
      studentId: cleanStudentId,
      name: name.trim(),
      email: normalizedEmail,
      role: assignedRole,
      unit: resolvedUnit,
      emailNotifications: Boolean(optIn),
      status: 'active' as const,
      createdAt,
    };

    const token = signToken(id, assignedRole);
    broadcastAdmins({ type: 'resident:updated' });
    res.status(201).json({ token, user });
  });

  // Auth: Sign In (Enrolled OMSU Student, Teacher, or Admin)
  app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body ?? {};
    if (typeof email !== 'string' || typeof password !== 'string') {
      res.status(400).json({ error: 'Email and password are required.' });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    const row = db
      .prepare(
        'SELECT id, student_id, name, email, password_hash, role, unit, email_notifications, status, created_at FROM users WHERE email = ?'
      )
      .get(normalizedEmail) as
      | {
          id: string;
          student_id: string;
          name: string;
          email: string;
          password_hash: string;
          role: 'admin' | 'resident' | 'teacher';
          unit: string;
          email_notifications: number;
          status: 'active' | 'suspended';
          created_at: string;
        }
      | undefined;

    if (!row || !verifyPassword(password, row.password_hash)) {
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    if (row.status !== 'active') {
      res.status(403).json({ error: 'This account has been suspended by an administrator.' });
      return;
    }

    if ((row.role === 'resident' || row.role === 'teacher') && !isStudentEnrolled(row.email, row.student_id)) {
      res.status(403).json({
        error:
          'Access denied: Only officially enrolled Occidental Mindoro State University students and active faculty can access this portal. Contact the Mamburao Registrar to verify your status.',
      });
      return;
    }

    const user = {
      id: row.id,
      studentId: row.student_id || '',
      name: row.name,
      email: row.email,
      role: row.role,
      unit: row.unit,
      emailNotifications: Boolean(row.email_notifications),
      status: row.status,
      createdAt: row.created_at,
    };

    const token = signToken(user.id, user.role);
    res.json({ token, user });
  });

  // Auth: Current Profile
  app.get('/api/auth/me', requireAuth, (req: AuthedRequest, res) => {
    res.json({ user: req.user });
  });

  // Auth: Update own preferences
  app.patch('/api/auth/me/preferences', requireAuth, (req: AuthedRequest, res) => {
    const { name, unit, emailNotifications } = req.body ?? {};
    const current = req.user!;

    const nextName =
      typeof name === 'string' && name.trim().length >= 2 && name.trim().length <= 80
        ? name.trim()
        : current.name;
    const nextUnit =
      typeof unit === 'string' && unit.trim().length <= 80 ? unit.trim() : current.unit;
    const nextEmailOptIn =
      typeof emailNotifications === 'boolean'
        ? emailNotifications
          ? 1
          : 0
        : current.emailNotifications
          ? 1
          : 0;

    db.prepare('UPDATE users SET name = ?, unit = ?, email_notifications = ? WHERE id = ?').run(
      nextName,
      nextUnit,
      nextEmailOptIn,
      current.id
    );

    const updated = loadUserById(current.id);
    broadcastAdmins({ type: 'resident:updated' });
    res.json({ user: updated });
  });

  // Announcements: List (Enrolled OMSU Students & Admins ONLY)
  app.get('/api/announcements', requireAuth, (req: AuthedRequest, res) => {
    const includeArchived =
      req.query.includeArchived === 'true' && req.user?.role === 'admin';
    const userId = req.user!.id;

    const rows = db
      .prepare(
        `SELECT
          a.*,
          (SELECT COUNT(*) FROM announcement_reads r WHERE r.announcement_id = a.id) AS read_count,
          CASE WHEN EXISTS(
            SELECT 1 FROM announcement_reads r2 WHERE r2.announcement_id = a.id AND r2.user_id = ?
          ) THEN 1 ELSE 0 END AS is_read_by_me
        FROM announcements a
        ${includeArchived ? '' : "WHERE a.status = 'published'"}
        ORDER BY a.pinned DESC, a.created_at DESC`
      )
      .all(userId) as AnnouncementRow[];

    const items = rows.map((row) => serializeAnnouncement(row));
    res.json({ announcements: items });
  });

  // Announcements: Create (Admin only)
  app.post('/api/announcements', requireAuth, requireAdmin, async (req: AuthedRequest, res) => {
    const { title, body, category, priority, audience, pinned, eventDate, notifyResidents } =
      req.body ?? {};

    if (typeof title !== 'string' || title.trim().length < 4 || title.trim().length > 160) {
      res.status(400).json({ error: 'Title must be between 4 and 160 characters.' });
      return;
    }
    if (typeof body !== 'string' || body.trim().length < 10 || body.trim().length > 8000) {
      res.status(400).json({ error: 'Announcement details must be between 10 and 8000 characters.' });
      return;
    }
    if (typeof category !== 'string' || !VALID_CATEGORIES.has(category)) {
      res.status(400).json({ error: 'Invalid category selected.' });
      return;
    }
    if (typeof priority !== 'string' || !VALID_PRIORITIES.has(priority)) {
      res.status(400).json({ error: 'Invalid priority selected.' });
      return;
    }
    if (typeof audience !== 'string' || !VALID_AUDIENCES.has(audience)) {
      res.status(400).json({ error: 'Invalid audience selected.' });
      return;
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const cleanDate = typeof eventDate === 'string' ? eventDate.trim().slice(0, 32) : '';
    const isPinned = pinned === true ? 1 : 0;

    db.prepare(
      `INSERT INTO announcements (
        id, title, body, category, priority, audience, status, pinned, event_date,
        author_id, author_name, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'published', ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      title.trim(),
      body.trim(),
      category,
      priority,
      audience,
      isPinned,
      cleanDate,
      req.user!.id,
      req.user!.name,
      now,
      now
    );

    const created = fetchAnnouncementById(id, req.user!.id)!;
    broadcastEnrolled({ type: 'announcement:created', announcement: { ...created, isReadByMe: undefined } });

    let dispatch = null;
    if (notifyResidents !== false) {
      dispatch = await dispatchAnnouncementEmail(
        {
          id: created.id,
          title: created.title,
          body: created.body,
          category: created.category,
          priority: created.priority,
          audience: created.audience,
          eventDate: created.eventDate,
          authorName: created.authorName,
          createdAt: created.createdAt,
        },
        req.user!.name
      );
      broadcastAdmins({ type: 'email:dispatched', dispatch });
    }

    res.status(201).json({ announcement: created, dispatch });
  });

  // Announcements: Update / Pin / Archive (Admin only)
  app.patch('/api/announcements/:id', requireAuth, requireAdmin, async (req: AuthedRequest, res) => {
    const id = String(req.params.id);
    const existing = db.prepare('SELECT * FROM announcements WHERE id = ?').get(id) as
      | AnnouncementRow
      | undefined;

    if (!existing) {
      res.status(404).json({ error: 'Announcement not found.' });
      return;
    }

    const { title, body, category, priority, audience, status, pinned, eventDate, notifyResidents } =
      req.body ?? {};

    const nextTitle =
      typeof title === 'string' && title.trim().length >= 4 && title.trim().length <= 160
        ? title.trim()
        : existing.title;
    const nextBody =
      typeof body === 'string' && body.trim().length >= 10 && body.trim().length <= 8000
        ? body.trim()
        : existing.body;
    const nextCategory =
      typeof category === 'string' && VALID_CATEGORIES.has(category) ? category : existing.category;
    const nextPriority =
      typeof priority === 'string' && VALID_PRIORITIES.has(priority)
        ? (priority as 'normal' | 'important' | 'urgent')
        : existing.priority;
    const nextAudience =
      typeof audience === 'string' && VALID_AUDIENCES.has(audience) ? audience : existing.audience;
    const nextStatus =
      status === 'published' || status === 'archived' ? status : existing.status;
    const nextPinned = typeof pinned === 'boolean' ? (pinned ? 1 : 0) : existing.pinned;
    const nextEventDate =
      typeof eventDate === 'string' ? eventDate.trim().slice(0, 32) : existing.event_date;
    const updatedAt = new Date().toISOString();

    db.prepare(
      `UPDATE announcements
       SET title = ?, body = ?, category = ?, priority = ?, audience = ?, status = ?, pinned = ?, event_date = ?, updated_at = ?
       WHERE id = ?`
    ).run(
      nextTitle,
      nextBody,
      nextCategory,
      nextPriority,
      nextAudience,
      nextStatus,
      nextPinned,
      nextEventDate,
      updatedAt,
      id
    );

    const updated = fetchAnnouncementById(id, req.user!.id)!;
    broadcastEnrolled({ type: 'announcement:updated', announcement: { ...updated, isReadByMe: undefined } });

    let dispatch = null;
    if (notifyResidents === true && nextStatus === 'published') {
      dispatch = await dispatchAnnouncementEmail(
        {
          id: updated.id,
          title: updated.title,
          body: updated.body,
          category: updated.category,
          priority: updated.priority,
          audience: updated.audience,
          eventDate: updated.eventDate,
          authorName: updated.authorName,
          createdAt: updated.createdAt,
        },
        req.user!.name
      );
      broadcastAdmins({ type: 'email:dispatched', dispatch });
    }

    res.json({ announcement: updated, dispatch });
  });

  // Announcements: Delete (Admin only)
  app.delete('/api/announcements/:id', requireAuth, requireAdmin, (req: AuthedRequest, res) => {
    const id = String(req.params.id);
    const result = db.prepare('DELETE FROM announcements WHERE id = ?').run(id);
    if (result.changes === 0) {
      res.status(404).json({ error: 'Announcement not found.' });
      return;
    }
    broadcastEnrolled({ type: 'announcement:deleted', id });
    res.json({ deleted: true, id });
  });

  // Announcements: Manual Email Dispatch (Admin only)
  app.post('/api/announcements/:id/notify', requireAuth, requireAdmin, async (req: AuthedRequest, res) => {
    const id = String(req.params.id);
    const announcement = fetchAnnouncementById(id, req.user!.id);
    if (!announcement) {
      res.status(404).json({ error: 'Announcement not found.' });
      return;
    }

    const dispatch = await dispatchAnnouncementEmail(
      {
        id: announcement.id,
        title: announcement.title,
        body: announcement.body,
        category: announcement.category,
        priority: announcement.priority,
        audience: announcement.audience,
        eventDate: announcement.eventDate,
        authorName: announcement.authorName,
        createdAt: announcement.createdAt,
      },
      req.user!.name
    );

    broadcastAdmins({ type: 'email:dispatched', dispatch });
    res.json({ dispatch });
  });

  // Announcements: Mark as Read / Acknowledge (Any authenticated user)
  app.post('/api/announcements/:id/read', requireAuth, (req: AuthedRequest, res) => {
    const id = String(req.params.id);
    const exists = db.prepare('SELECT id FROM announcements WHERE id = ?').get(id);
    if (!exists) {
      res.status(404).json({ error: 'Announcement not found.' });
      return;
    }

    db.prepare(
      `INSERT OR IGNORE INTO announcement_reads (announcement_id, user_id, read_at)
       VALUES (?, ?, ?)`
    ).run(id, req.user!.id, new Date().toISOString());

    const countRow = db
      .prepare('SELECT COUNT(*) AS cnt FROM announcement_reads WHERE announcement_id = ?')
      .get(id) as { cnt: number };

    broadcastEnrolled({
      type: 'announcement:read',
      id,
      readCount: countRow.cnt,
      userId: req.user!.id,
    });

    res.json({ id, readCount: countRow.cnt, isReadByMe: true });
  });

  // Admin: Overview Metrics
  app.get('/api/admin/overview', requireAuth, requireAdmin, (_req, res) => {
    const annStats = db
      .prepare(
        `SELECT
          SUM(CASE WHEN status = 'published' THEN 1 ELSE 0 END) AS totalPublished,
          SUM(CASE WHEN status = 'published' AND priority = 'urgent' THEN 1 ELSE 0 END) AS urgentCount,
          SUM(CASE WHEN status = 'published' AND pinned = 1 THEN 1 ELSE 0 END) AS pinnedCount,
          SUM(CASE WHEN status = 'archived' THEN 1 ELSE 0 END) AS archivedCount
        FROM announcements`
      )
      .get() as {
      totalPublished: number | null;
      urgentCount: number | null;
      pinnedCount: number | null;
      archivedCount: number | null;
    };

    const userStats = db
      .prepare(
        `SELECT
          COUNT(*) AS totalResidents,
          SUM(CASE WHEN status = 'active' AND email_notifications = 1 THEN 1 ELSE 0 END) AS optedInResidents
        FROM users WHERE role IN ('resident', 'teacher')`
      )
      .get() as { totalResidents: number; optedInResidents: number | null };

    const emailStats = db
      .prepare(
        `SELECT
          COUNT(*) AS totalDispatches,
          COALESCE(SUM(delivered_count), 0) AS totalEmailsSent
        FROM email_dispatches`
      )
      .get() as { totalDispatches: number; totalEmailsSent: number };

    const rosterStats = db
      .prepare("SELECT COUNT(*) AS cnt FROM enrolled_roster WHERE enrollment_status = 'enrolled'")
      .get() as { cnt: number };

    res.json({
      stats: {
        totalPublished: annStats.totalPublished ?? 0,
        urgentCount: annStats.urgentCount ?? 0,
        pinnedCount: annStats.pinnedCount ?? 0,
        archivedCount: annStats.archivedCount ?? 0,
        totalResidents: userStats.totalResidents ?? 0,
        optedInResidents: userStats.optedInResidents ?? 0,
        totalDispatches: emailStats.totalDispatches ?? 0,
        totalEmailsSent: emailStats.totalEmailsSent ?? 0,
        enrolledRosterCount: rosterStats.cnt ?? 0,
      },
    });
  });

  // Admin: List Residents, Teachers & Admin Accounts
  app.get('/api/admin/residents', requireAuth, requireAdmin, (_req, res) => {
    const rows = db
      .prepare(
        `SELECT id, student_id, name, email, role, unit, email_notifications, status, created_at
         FROM users
         ORDER BY CASE WHEN role = 'admin' THEN 0 WHEN role = 'teacher' THEN 1 ELSE 2 END, created_at DESC`
      )
      .all() as {
      id: string;
      student_id: string;
      name: string;
      email: string;
      role: 'admin' | 'resident' | 'teacher';
      unit: string;
      email_notifications: number;
      status: 'active' | 'suspended';
      created_at: string;
    }[];

    res.json({
      users: rows.map((u) => ({
        id: u.id,
        studentId: u.student_id || '',
        name: u.name,
        email: u.email,
        role: u.role,
        unit: u.unit,
        emailNotifications: Boolean(u.email_notifications),
        status: u.status,
        createdAt: u.created_at,
      })),
    });
  });

  // Admin: Provision Student, Teacher, or Admin Account (Auto-enrolls Student/Teacher in OMSU roster)
  app.post('/api/admin/residents', requireAuth, requireAdmin, (req, res) => {
    const { studentId, name, email, password, unit, role, emailNotifications } = req.body ?? {};
    if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 80) {
      res.status(400).json({ error: 'Name must be between 2 and 80 characters.' });
      return;
    }
    if (typeof email !== 'string' || !isValidEmail(email.trim().toLowerCase())) {
      res.status(400).json({ error: 'Valid email is required.' });
      return;
    }
    if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
      res.status(400).json({ error: 'Password must be at least 8 characters.' });
      return;
    }
    const cleanRole: 'admin' | 'resident' | 'teacher' =
      role === 'admin' ? 'admin' : role === 'teacher' ? 'teacher' : 'resident';
    const cleanUnit =
      typeof unit === 'string' && unit.trim()
        ? unit.trim().slice(0, 80)
        : cleanRole === 'teacher'
          ? 'OMSU Mamburao Faculty'
          : 'BSIT 1-B';
    const normalizedEmail = email.trim().toLowerCase();
    const cleanStudentId =
      cleanRole === 'admin'
        ? ''
        : typeof studentId === 'string' && studentId.trim().length >= 3
          ? studentId.trim().toUpperCase().slice(0, 40)
          : `${cleanRole === 'teacher' ? 'FAC' : 'OMSU'}-${new Date().getFullYear()}-${crypto.randomInt(1000, 9999)}`;

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail);
    if (existing) {
      res.status(409).json({ error: 'An account with this email already exists.' });
      return;
    }

    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    const optIn = emailNotifications === false ? 0 : 1;

    db.transaction(() => {
      db.prepare(
        `INSERT INTO users (id, student_id, name, email, password_hash, role, unit, email_notifications, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`
      ).run(
        id,
        cleanStudentId,
        name.trim(),
        normalizedEmail,
        hashPassword(password),
        cleanRole,
        cleanUnit,
        optIn,
        createdAt
      );

      if (cleanRole !== 'admin') {
        const memberType = cleanRole === 'teacher' ? 'teacher' : 'student';
        const existingRoster = db
          .prepare('SELECT id FROM enrolled_roster WHERE LOWER(email) = ? OR UPPER(student_id) = ?')
          .get(normalizedEmail, cleanStudentId) as { id: string } | undefined;

        if (!existingRoster) {
          db.prepare(
            `INSERT INTO enrolled_roster (
              id, student_id, full_name, email, program_unit, member_type, campus, semester, enrollment_status, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, 'Mamburao Campus', '2nd Sem AY 2026-2027', 'enrolled', ?)`
          ).run(
            crypto.randomUUID(),
            cleanStudentId,
            name.trim(),
            normalizedEmail,
            cleanUnit,
            memberType,
            createdAt
          );
        } else {
          db.prepare(
            `UPDATE enrolled_roster
             SET enrollment_status = 'enrolled', full_name = ?, program_unit = ?, member_type = ?
             WHERE id = ?`
          ).run(name.trim(), cleanUnit, memberType, existingRoster.id);
        }
      }
    })();

    broadcastAdmins({ type: 'resident:updated' });
    res.status(201).json({
      user: {
        id,
        studentId: cleanStudentId,
        name: name.trim(),
        email: normalizedEmail,
        role: cleanRole,
        unit: cleanUnit,
        emailNotifications: Boolean(optIn),
        status: 'active',
        createdAt,
      },
    });
  });

  // Admin: Update Account status / notifications / unit / role
  app.patch('/api/admin/residents/:id', requireAuth, requireAdmin, (req: AuthedRequest, res) => {
    const id = String(req.params.id);
    const existing = db
      .prepare('SELECT id, student_id, name, email, role, unit, email_notifications, status, created_at FROM users WHERE id = ?')
      .get(id) as
      | {
          id: string;
          student_id: string;
          name: string;
          email: string;
          role: 'admin' | 'resident' | 'teacher';
          unit: string;
          email_notifications: number;
          status: 'active' | 'suspended';
          created_at: string;
        }
      | undefined;

    if (!existing) {
      res.status(404).json({ error: 'Account not found.' });
      return;
    }

    const { status, emailNotifications, unit, role } = req.body ?? {};
    const nextStatus = status === 'active' || status === 'suspended' ? status : existing.status;
    const nextRole =
      role === 'admin' || role === 'resident' || role === 'teacher' ? role : existing.role;
    const nextOptIn =
      typeof emailNotifications === 'boolean'
        ? emailNotifications
          ? 1
          : 0
        : existing.email_notifications;
    const nextUnit =
      typeof unit === 'string' && unit.trim().length <= 80 ? unit.trim() : existing.unit;

    if (id === req.user!.id && (nextStatus === 'suspended' || nextRole !== 'admin')) {
      res.status(400).json({ error: 'You cannot suspend or demote your own active admin account.' });
      return;
    }

    db.prepare('UPDATE users SET status = ?, email_notifications = ?, unit = ?, role = ? WHERE id = ?').run(
      nextStatus,
      nextOptIn,
      nextUnit,
      nextRole,
      id
    );

    broadcastAdmins({ type: 'resident:updated' });
    res.json({
      user: {
        id: existing.id,
        studentId: existing.student_id || '',
        name: existing.name,
        email: existing.email,
        role: nextRole,
        unit: nextUnit,
        emailNotifications: Boolean(nextOptIn),
        status: nextStatus,
        createdAt: existing.created_at,
      },
    });
  });

  // Admin: Delete Account
  app.delete('/api/admin/residents/:id', requireAuth, requireAdmin, (req: AuthedRequest, res) => {
    const id = String(req.params.id);
    if (id === req.user!.id) {
      res.status(400).json({ error: 'You cannot delete your own active admin account.' });
      return;
    }
    const result = db.prepare('DELETE FROM users WHERE id = ?').run(id);
    if (result.changes === 0) {
      res.status(404).json({ error: 'Account not found.' });
      return;
    }
    broadcastAdmins({ type: 'resident:updated' });
    res.json({ deleted: true, id });
  });

  // Admin: Enrolled OMSU Student & Faculty Roster Management
  app.get('/api/admin/roster', requireAuth, requireAdmin, (_req, res) => {
    const rows = db
      .prepare(
        `SELECT
          r.*,
          EXISTS(
            SELECT 1 FROM users u WHERE LOWER(u.email) = LOWER(r.email) OR (u.student_id != '' AND UPPER(u.student_id) = UPPER(r.student_id))
          ) AS has_account
         FROM enrolled_roster r
         ORDER BY r.enrollment_status ASC, r.member_type ASC, r.student_id ASC`
      )
      .all() as {
      id: string;
      student_id: string;
      full_name: string;
      email: string;
      program_unit: string;
      member_type: 'student' | 'teacher';
      campus: string;
      semester: string;
      enrollment_status: 'enrolled' | 'inactive';
      created_at: string;
      has_account: number;
    }[];

    res.json({
      roster: rows.map((r) => ({
        id: r.id,
        studentId: r.student_id,
        fullName: r.full_name,
        email: r.email,
        programUnit: r.program_unit,
        memberType: r.member_type || 'student',
        campus: r.campus,
        semester: r.semester,
        enrollmentStatus: r.enrollment_status,
        hasAccount: Boolean(r.has_account),
        createdAt: r.created_at,
      })),
    });
  });

  app.post('/api/admin/roster', requireAuth, requireAdmin, (req, res) => {
    const { studentId, fullName, email, programUnit, memberType, campus, semester } = req.body ?? {};
    const cleanId = typeof studentId === 'string' ? studentId.trim().toUpperCase() : '';
    const cleanName = typeof fullName === 'string' ? fullName.trim() : '';
    const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    const cleanProgram = typeof programUnit === 'string' ? programUnit.trim() : '';
    const cleanMemberType = memberType === 'teacher' ? 'teacher' : 'student';

    if (cleanId.length < 4 || cleanId.length > 40) {
      res.status(400).json({ error: 'OMSU ID must be between 4 and 40 characters.' });
      return;
    }
    if (cleanName.length < 2 || cleanName.length > 80) {
      res.status(400).json({ error: 'Full name must be between 2 and 80 characters.' });
      return;
    }
    if (!isValidEmail(cleanEmail)) {
      res.status(400).json({ error: 'Please provide a valid OMSU email address.' });
      return;
    }
    if (cleanProgram.length < 2 || cleanProgram.length > 80) {
      res.status(400).json({ error: 'Program / Section or Department is required.' });
      return;
    }

    const dup = db
      .prepare('SELECT id FROM enrolled_roster WHERE UPPER(student_id) = ? OR LOWER(email) = ?')
      .get(cleanId, cleanEmail);
    if (dup) {
      res.status(409).json({ error: 'A record with this ID or email is already in the OMSU roster.' });
      return;
    }

    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    const cleanCampus =
      typeof campus === 'string' && campus.trim() ? campus.trim().slice(0, 80) : 'Mamburao Campus';
    const cleanSemester =
      typeof semester === 'string' && semester.trim()
        ? semester.trim().slice(0, 60)
        : '2nd Sem AY 2026-2027';

    db.prepare(
      `INSERT INTO enrolled_roster (
        id, student_id, full_name, email, program_unit, member_type, campus, semester, enrollment_status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'enrolled', ?)`
    ).run(id, cleanId, cleanName, cleanEmail, cleanProgram, cleanMemberType, cleanCampus, cleanSemester, createdAt);

    broadcastAdmins({ type: 'resident:updated' });
    res.status(201).json({
      entry: {
        id,
        studentId: cleanId,
        fullName: cleanName,
        email: cleanEmail,
        programUnit: cleanProgram,
        memberType: cleanMemberType,
        campus: cleanCampus,
        semester: cleanSemester,
        enrollmentStatus: 'enrolled',
        hasAccount: false,
        createdAt,
      },
    });
  });

  app.post('/api/admin/roster/bulk', requireAuth, requireAdmin, (req, res) => {
    const { lines, campus, semester, memberType } = req.body ?? {};
    if (typeof lines !== 'string' || !lines.trim()) {
      res.status(400).json({ error: 'Provide at least one student or faculty line to import.' });
      return;
    }

    const cleanCampus =
      typeof campus === 'string' && campus.trim() ? campus.trim().slice(0, 80) : 'Mamburao Campus';
    const cleanSemester =
      typeof semester === 'string' && semester.trim()
        ? semester.trim().slice(0, 60)
        : '2nd Sem AY 2026-2027';
    const defaultMemberType = memberType === 'teacher' ? 'teacher' : 'student';

    const rawLines = lines
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(0, 200);

    let addedCount = 0;
    let skippedCount = 0;
    const now = new Date().toISOString();

    const insert = db.prepare(
      `INSERT OR IGNORE INTO enrolled_roster (
        id, student_id, full_name, email, program_unit, member_type, campus, semester, enrollment_status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'enrolled', ?)`
    );

    db.transaction(() => {
      for (const line of rawLines) {
        const parts = line.split(/[,\t|]/).map((p) => p.trim());
        if (parts.length < 3) {
          skippedCount += 1;
          continue;
        }
        const [rawId, rawName, rawEmail, rawProgram = 'OMSU Mamburao Member', rawRole] = parts;
        const cleanId = rawId.toUpperCase();
        const cleanEmail = rawEmail.toLowerCase();
        const lineType =
          rawRole?.toLowerCase() === 'teacher' || cleanId.startsWith('FAC-')
            ? 'teacher'
            : defaultMemberType;
        if (cleanId.length < 4 || rawName.length < 2 || !isValidEmail(cleanEmail)) {
          skippedCount += 1;
          continue;
        }
        const result = insert.run(
          crypto.randomUUID(),
          cleanId,
          rawName.slice(0, 80),
          cleanEmail,
          rawProgram.slice(0, 80) || 'OMSU Mamburao Member',
          lineType,
          cleanCampus,
          cleanSemester,
          now
        );
        if (result.changes > 0) {
          addedCount += 1;
        } else {
          skippedCount += 1;
        }
      }
    })();

    broadcastAdmins({ type: 'resident:updated' });
    res.status(201).json({ addedCount, skippedCount });
  });

  app.patch('/api/admin/roster/:id', requireAuth, requireAdmin, (req, res) => {
    const id = String(req.params.id);
    const existing = db.prepare('SELECT * FROM enrolled_roster WHERE id = ?').get(id) as
      | {
          id: string;
          student_id: string;
          full_name: string;
          email: string;
          program_unit: string;
          member_type: 'student' | 'teacher';
          campus: string;
          semester: string;
          enrollment_status: 'enrolled' | 'inactive';
          created_at: string;
        }
      | undefined;

    if (!existing) {
      res.status(404).json({ error: 'Roster record not found.' });
      return;
    }

    const { enrollmentStatus, programUnit, semester, memberType } = req.body ?? {};
    const nextStatus =
      enrollmentStatus === 'enrolled' || enrollmentStatus === 'inactive'
        ? enrollmentStatus
        : existing.enrollment_status;
    const nextProgram =
      typeof programUnit === 'string' && programUnit.trim().length >= 2
        ? programUnit.trim().slice(0, 80)
        : existing.program_unit;
    const nextSemester =
      typeof semester === 'string' && semester.trim().length >= 2
        ? semester.trim().slice(0, 60)
        : existing.semester;
    const nextMemberType =
      memberType === 'teacher' || memberType === 'student'
        ? memberType
        : existing.member_type || 'student';

    db.prepare(
      'UPDATE enrolled_roster SET enrollment_status = ?, program_unit = ?, semester = ?, member_type = ? WHERE id = ?'
    ).run(nextStatus, nextProgram, nextSemester, nextMemberType, id);

    broadcastAdmins({ type: 'resident:updated' });
    res.json({
      entry: {
        id: existing.id,
        studentId: existing.student_id,
        fullName: existing.full_name,
        email: existing.email,
        programUnit: nextProgram,
        memberType: nextMemberType,
        campus: existing.campus,
        semester: nextSemester,
        enrollmentStatus: nextStatus,
        createdAt: existing.created_at,
      },
    });
  });

  app.delete('/api/admin/roster/:id', requireAuth, requireAdmin, (req, res) => {
    const id = String(req.params.id);
    const result = db.prepare('DELETE FROM enrolled_roster WHERE id = ?').run(id);
    if (result.changes === 0) {
      res.status(404).json({ error: 'Roster record not found.' });
      return;
    }
    broadcastAdmins({ type: 'resident:updated' });
    res.json({ deleted: true, id });
  });

  // Admin: Email Dispatch Logs
  app.get('/api/admin/dispatches', requireAuth, requireAdmin, (_req, res) => {
    const rows = db
      .prepare('SELECT * FROM email_dispatches ORDER BY created_at DESC LIMIT 100')
      .all() as {
      id: string;
      announcement_id: string;
      announcement_title: string;
      triggered_by_name: string;
      recipient_count: number;
      delivered_count: number;
      failed_count: number;
      delivery_mode: 'smtp' | 'outbox_preview';
      subject: string;
      html_preview: string;
      recipients_summary: string;
      created_at: string;
    }[];

    res.json({
      dispatches: rows.map((d) => ({
        id: d.id,
        announcementId: d.announcement_id,
        announcementTitle: d.announcement_title,
        triggeredByName: d.triggered_by_name,
        recipientCount: d.recipient_count,
        deliveredCount: d.delivered_count,
        failedCount: d.failed_count,
        deliveryMode: d.delivery_mode,
        subject: d.subject,
        htmlPreview: d.html_preview,
        recipientsSummary: JSON.parse(d.recipients_summary),
        createdAt: d.created_at,
      })),
    });
  });

  // Portal Settings: Public Read
  app.get('/api/portal-settings', (_req, res) => {
    const row = db.prepare("SELECT * FROM portal_settings WHERE id = 'default'").get() as {
      university_name: string;
      campus_name: string;
      portal_tagline: string;
      hero_headline: string;
      hero_description: string;
      banner_enabled: number;
      banner_message: string;
      allow_self_registration: number;
      require_enrolled_verification: number;
      support_email: string;
      office_hours: string;
      updated_at: string;
    };

    res.json({
      settings: {
        universityName: row.university_name,
        campusName: row.campus_name,
        portalTagline: row.portal_tagline,
        heroHeadline: row.hero_headline,
        heroDescription: row.hero_description,
        bannerEnabled: Boolean(row.banner_enabled),
        bannerMessage: row.banner_message,
        allowSelfRegistration: Boolean(row.allow_self_registration),
        requireEnrolledVerification: Boolean(row.require_enrolled_verification),
        supportEmail: row.support_email,
        officeHours: row.office_hours,
        updatedAt: row.updated_at,
      },
    });
  });

  // Portal Settings: Admin Update (Real-Time Broadcast)
  app.patch('/api/admin/portal-settings', requireAuth, requireAdmin, (req, res) => {
    const current = db.prepare("SELECT * FROM portal_settings WHERE id = 'default'").get() as {
      university_name: string;
      campus_name: string;
      portal_tagline: string;
      hero_headline: string;
      hero_description: string;
      banner_enabled: number;
      banner_message: string;
      allow_self_registration: number;
      require_enrolled_verification: number;
      support_email: string;
      office_hours: string;
      updated_at: string;
    };

    const body = req.body ?? {};
    const universityName =
      typeof body.universityName === 'string' && body.universityName.trim().length >= 3
        ? body.universityName.trim().slice(0, 120)
        : current.university_name;
    const campusName =
      typeof body.campusName === 'string' && body.campusName.trim().length >= 2
        ? body.campusName.trim().slice(0, 120)
        : current.campus_name;
    const portalTagline =
      typeof body.portalTagline === 'string' && body.portalTagline.trim().length >= 3
        ? body.portalTagline.trim().slice(0, 160)
        : current.portal_tagline;
    const heroHeadline =
      typeof body.heroHeadline === 'string' && body.heroHeadline.trim().length >= 4
        ? body.heroHeadline.trim().slice(0, 180)
        : current.hero_headline;
    const heroDescription =
      typeof body.heroDescription === 'string' && body.heroDescription.trim().length >= 8
        ? body.heroDescription.trim().slice(0, 500)
        : current.hero_description;
    const bannerEnabled =
      typeof body.bannerEnabled === 'boolean'
        ? body.bannerEnabled
          ? 1
          : 0
        : current.banner_enabled;
    const bannerMessage =
      typeof body.bannerMessage === 'string'
        ? body.bannerMessage.trim().slice(0, 300)
        : current.banner_message;
    const allowSelfRegistration =
      typeof body.allowSelfRegistration === 'boolean'
        ? body.allowSelfRegistration
          ? 1
          : 0
        : current.allow_self_registration;
    const requireEnrolledVerification =
      typeof body.requireEnrolledVerification === 'boolean'
        ? body.requireEnrolledVerification
          ? 1
          : 0
        : current.require_enrolled_verification;
    const supportEmail =
      typeof body.supportEmail === 'string' && isValidEmail(body.supportEmail.trim().toLowerCase())
        ? body.supportEmail.trim().toLowerCase()
        : current.support_email;
    const officeHours =
      typeof body.officeHours === 'string' && body.officeHours.trim().length >= 2
        ? body.officeHours.trim().slice(0, 120)
        : current.office_hours;

    const updatedAt = new Date().toISOString();

    db.prepare(
      `UPDATE portal_settings
       SET university_name = ?, campus_name = ?, portal_tagline = ?, hero_headline = ?,
           hero_description = ?, banner_enabled = ?, banner_message = ?,
           allow_self_registration = ?, require_enrolled_verification = ?, support_email = ?, office_hours = ?, updated_at = ?
       WHERE id = 'default'`
    ).run(
      universityName,
      campusName,
      portalTagline,
      heroHeadline,
      heroDescription,
      bannerEnabled,
      bannerMessage,
      allowSelfRegistration,
      requireEnrolledVerification,
      supportEmail,
      officeHours,
      updatedAt
    );

    const settings = {
      universityName,
      campusName,
      portalTagline,
      heroHeadline,
      heroDescription,
      bannerEnabled: Boolean(bannerEnabled),
      bannerMessage,
      allowSelfRegistration: Boolean(allowSelfRegistration),
      requireEnrolledVerification: Boolean(requireEnrolledVerification),
      supportEmail,
      officeHours,
      updatedAt,
    };

    broadcastPublic({ type: 'portal:updated', settings });
    res.json({ settings });
  });

  // Vite middleware in development, static dist/ in production
  const isProduction = process.env.NODE_ENV === 'production';
  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('/{*splat}', (req, res, next) => {
      if (req.path.startsWith('/api/')) {
        next();
        return;
      }
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build output not found. Run npm run build first.');
      }
    });
  }

  const port = Number(process.env.PORT || 3000);
  server.listen(port, '0.0.0.0', () => {
    console.log(`OMSU Mamburao Portal server listening on http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
