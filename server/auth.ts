import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { db } from './db.ts';

const SESSION_SECRET = process.env.SESSION_SECRET && process.env.SESSION_SECRET.trim().length > 0
  ? process.env.SESSION_SECRET
  : crypto.randomBytes(32).toString('hex');

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

export interface AuthenticatedUser {
  id: string;
  studentId: string;
  name: string;
  email: string;
  role: 'admin' | 'resident' | 'teacher';
  unit: string;
  emailNotifications: boolean;
  status: 'active' | 'suspended';
  createdAt: string;
}

export function isEnrolledVerificationRequired(): boolean {
  const row = db
    .prepare("SELECT require_enrolled_verification FROM portal_settings WHERE id = 'default'")
    .get() as { require_enrolled_verification: number } | undefined;
  return row ? row.require_enrolled_verification === 1 : true;
}

export function isStudentEnrolled(email: string, studentId?: string): boolean {
  const normalizedEmail = email.trim().toLowerCase();
  const normalizedStudentId = (studentId || '').trim().toUpperCase();
  const rosterRow = normalizedStudentId
    ? (db
        .prepare(
          'SELECT enrollment_status FROM enrolled_roster WHERE LOWER(email) = ? OR UPPER(student_id) = ? LIMIT 1'
        )
        .get(normalizedEmail, normalizedStudentId) as { enrollment_status: 'enrolled' | 'inactive' } | undefined)
    : (db
        .prepare('SELECT enrollment_status FROM enrolled_roster WHERE LOWER(email) = ? LIMIT 1')
        .get(normalizedEmail) as { enrollment_status: 'enrolled' | 'inactive' } | undefined);

  if (rosterRow) {
    return rosterRow.enrollment_status === 'enrolled';
  }
  return !isEnrolledVerificationRequired();
}

export interface AuthedRequest extends Request {
  user?: AuthenticatedUser;
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  if (!salt || !keyHex) return false;
  const expectedBuffer = Buffer.from(keyHex, 'hex');
  const derivedBuffer = crypto.scryptSync(password, salt, 64);
  if (expectedBuffer.length !== derivedBuffer.length) return false;
  return crypto.timingSafeEqual(expectedBuffer, derivedBuffer);
}

export function verifyConstantTime(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function signToken(userId: string, role: 'admin' | 'resident' | 'teacher'): string {
  const payload = Buffer.from(
    JSON.stringify({
      sub: userId,
      role,
      exp: Date.now() + TOKEN_TTL_MS,
    }),
    'utf8'
  ).toString('base64url');
  const sig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(payload)
    .digest('base64url');
  return `${payload}.${sig}`;
}

export function verifyToken(
  token: string
): { sub: string; role: 'admin' | 'resident' | 'teacher' } | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  if (!payload || !sig) return null;

  const expectedSig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(payload)
    .digest('base64url');

  const sigBuf = Buffer.from(sig, 'utf8');
  const expectedBuf = Buffer.from(expectedSig, 'utf8');
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }

  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      sub?: unknown;
      role?: unknown;
      exp?: unknown;
    };
    if (
      typeof decoded.sub !== 'string' ||
      (decoded.role !== 'admin' && decoded.role !== 'resident' && decoded.role !== 'teacher') ||
      typeof decoded.exp !== 'number' ||
      decoded.exp < Date.now()
    ) {
      return null;
    }
    return { sub: decoded.sub, role: decoded.role };
  } catch {
    return null;
  }
}

export function loadUserById(userId: string): AuthenticatedUser | null {
  const row = db
    .prepare(
      'SELECT id, student_id, name, email, role, unit, email_notifications, status, created_at FROM users WHERE id = ?'
    )
    .get(userId) as
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

  if (!row || row.status !== 'active') return null;

  if ((row.role === 'resident' || row.role === 'teacher') && !isStudentEnrolled(row.email, row.student_id)) {
    return null;
  }

  return {
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
}

export function extractBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  return header.slice(7).trim();
}

export function attachOptionalUser(req: AuthedRequest, _res: Response, next: NextFunction): void {
  const token = extractBearerToken(req);
  if (token) {
    const parsed = verifyToken(token);
    if (parsed) {
      const user = loadUserById(parsed.sub);
      if (user) {
        req.user = user;
      }
    }
  }
  next();
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  const token = extractBearerToken(req);
  if (!token) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }
  const parsed = verifyToken(token);
  if (!parsed) {
    res.status(401).json({ error: 'Session expired or invalid.' });
    return;
  }
  const user = loadUserById(parsed.sub);
  if (!user) {
    res.status(401).json({ error: 'Account is inactive or unavailable.' });
    return;
  }
  req.user = user;
  next();
}

export function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }
  if (req.user.role !== 'admin') {
    res.status(403).json({ error: 'Administrator privileges required.' });
    return;
  }
  next();
}
