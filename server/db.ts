import Database from 'better-sqlite3';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const dataDir = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'campus.db');
export const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL DEFAULT '',
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('admin', 'resident', 'teacher')),
    unit TEXT NOT NULL DEFAULT '',
    email_notifications INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'suspended')),
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS enrolled_roster (
    id TEXT PRIMARY KEY,
    student_id TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    program_unit TEXT NOT NULL,
    member_type TEXT NOT NULL DEFAULT 'student' CHECK(member_type IN ('student', 'teacher')),
    campus TEXT NOT NULL DEFAULT 'Mamburao Campus',
    semester TEXT NOT NULL DEFAULT '2nd Sem AY 2026-2027',
    enrollment_status TEXT NOT NULL DEFAULT 'enrolled' CHECK(enrollment_status IN ('enrolled', 'inactive')),
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS announcements (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    category TEXT NOT NULL,
    priority TEXT NOT NULL CHECK(priority IN ('normal', 'important', 'urgent')),
    audience TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'published' CHECK(status IN ('published', 'archived')),
    pinned INTEGER NOT NULL DEFAULT 0,
    event_date TEXT NOT NULL DEFAULT '',
    author_id TEXT NOT NULL,
    author_name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS announcement_reads (
    announcement_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    read_at TEXT NOT NULL,
    PRIMARY KEY (announcement_id, user_id),
    FOREIGN KEY (announcement_id) REFERENCES announcements(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS email_dispatches (
    id TEXT PRIMARY KEY,
    announcement_id TEXT NOT NULL,
    announcement_title TEXT NOT NULL,
    triggered_by_name TEXT NOT NULL,
    recipient_count INTEGER NOT NULL,
    delivered_count INTEGER NOT NULL,
    failed_count INTEGER NOT NULL,
    delivery_mode TEXT NOT NULL,
    subject TEXT NOT NULL,
    html_preview TEXT NOT NULL,
    recipients_summary TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS portal_settings (
    id TEXT PRIMARY KEY,
    university_name TEXT NOT NULL,
    campus_name TEXT NOT NULL,
    portal_tagline TEXT NOT NULL,
    hero_headline TEXT NOT NULL,
    hero_description TEXT NOT NULL,
    banner_enabled INTEGER NOT NULL DEFAULT 0,
    banner_message TEXT NOT NULL DEFAULT '',
    allow_self_registration INTEGER NOT NULL DEFAULT 1,
    require_enrolled_verification INTEGER NOT NULL DEFAULT 1,
    support_email TEXT NOT NULL,
    office_hours TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_announcements_status_created ON announcements(status, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_users_role_status ON users(role, status);
  CREATE INDEX IF NOT EXISTS idx_roster_student_email ON enrolled_roster(student_id, email);
`);

function runMigrations(): void {
  const userCols = db.prepare('PRAGMA table_info(users)').all() as { name: string }[];
  if (!userCols.some((c) => c.name === 'student_id')) {
    db.exec("ALTER TABLE users ADD COLUMN student_id TEXT NOT NULL DEFAULT ''");
  }

  const usersSchema = db
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'")
    .get() as { sql?: string } | undefined;
  if (usersSchema?.sql && !usersSchema.sql.includes("'teacher'")) {
    db.pragma('foreign_keys = OFF');
    db.transaction(() => {
      db.exec(`
        CREATE TABLE users_migrated (
          id TEXT PRIMARY KEY,
          student_id TEXT NOT NULL DEFAULT '',
          name TEXT NOT NULL,
          email TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          role TEXT NOT NULL CHECK(role IN ('admin', 'resident', 'teacher')),
          unit TEXT NOT NULL DEFAULT '',
          email_notifications INTEGER NOT NULL DEFAULT 1,
          status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'suspended')),
          created_at TEXT NOT NULL
        );
        INSERT INTO users_migrated (id, student_id, name, email, password_hash, role, unit, email_notifications, status, created_at)
        SELECT id, student_id, name, email, password_hash, role, unit, email_notifications, status, created_at FROM users;
        DROP TABLE users;
        ALTER TABLE users_migrated RENAME TO users;
        CREATE INDEX IF NOT EXISTS idx_users_role_status ON users(role, status);
      `);
    })();
    db.pragma('foreign_keys = ON');
  }

  const rosterCols = db.prepare('PRAGMA table_info(enrolled_roster)').all() as { name: string }[];
  if (!rosterCols.some((c) => c.name === 'member_type')) {
    db.exec("ALTER TABLE enrolled_roster ADD COLUMN member_type TEXT NOT NULL DEFAULT 'student'");
  }

  const settingsCols = db.prepare('PRAGMA table_info(portal_settings)').all() as { name: string }[];
  if (!settingsCols.some((c) => c.name === 'require_enrolled_verification')) {
    db.exec('ALTER TABLE portal_settings ADD COLUMN require_enrolled_verification INTEGER NOT NULL DEFAULT 1');
  }
}

runMigrations();

function backfillMatchedStudentIds(): void {
  db.exec(`
    UPDATE users
    SET student_id = COALESCE(
      (SELECT r.student_id FROM enrolled_roster r WHERE LOWER(r.email) = LOWER(users.email) LIMIT 1),
      student_id
    )
    WHERE role IN ('resident', 'teacher') AND student_id = ''
  `);
}

function seedPortalSettings(): void {
  const existing = db
    .prepare("SELECT id FROM portal_settings WHERE id = 'default'")
    .get() as { id: string } | undefined;

  if (existing) {
    return;
  }

  db.prepare(
    `INSERT INTO portal_settings (
      id, university_name, campus_name, portal_tagline,
      hero_headline, hero_description, banner_enabled, banner_message,
      allow_self_registration, require_enrolled_verification, support_email, office_hours, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    'default',
    'Occidental Mindoro State University',
    'Mamburao Campus · Occidental Mindoro',
    'Official Enrolled Students & Campus Personnel Portal',
    'Official OMSU Mamburao announcements in one verified feed.',
    'Stay ahead of enrollment schedules, academic advisories, campus facilities updates, and student residence notices—exclusively for enrolled OMSU students and authorized staff.',
    1,
    'Second Semester Enrollment & Student Portal verification is open at the Mamburao Registrar Office.',
    1,
    1,
    'registrar.mamburao@omsu.edu.ph',
    'Mon–Fri, 8:00 AM – 5:00 PM',
    new Date().toISOString()
  );
}

function seedEnrolledRoster(): void {
  const now = new Date().toISOString();
  const insert = db.prepare(
    `INSERT OR IGNORE INTO enrolled_roster (
      id, student_id, full_name, email, program_unit, member_type, campus, semester, enrollment_status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'enrolled', ?)`
  );

  const countRow = db.prepare('SELECT COUNT(*) AS cnt FROM enrolled_roster').get() as { cnt: number };
  if (countRow.cnt === 0) {
    const sampleRoster = [
      {
        studentId: 'OMSU-2026-0001',
        fullName: 'Marco Santos',
        email: 'student@omsu-mamburao.edu.ph',
        programUnit: 'BSIT 1-B',
        memberType: 'student',
      },
      {
        studentId: 'FAC-2026-0001',
        fullName: 'Prof. Clarissa Dizon',
        email: 'teacher@omsu-mamburao.edu.ph',
        programUnit: 'CAST Faculty · BSIT Department',
        memberType: 'teacher',
      },
      {
        studentId: 'OMSU-2026-0002',
        fullName: 'Maria Clara Reyes',
        email: 'maria.reyes@omsu-mamburao.edu.ph',
        programUnit: 'BSED 2B · English',
        memberType: 'student',
      },
      {
        studentId: 'OMSU-2026-0003',
        fullName: 'Joshua Mendoza',
        email: 'joshua.mendoza@omsu-mamburao.edu.ph',
        programUnit: 'BSBA 4A · Marketing Management',
        memberType: 'student',
      },
      {
        studentId: 'OMSU-2026-0004',
        fullName: 'Angelica Villanueva',
        email: 'angelica.villanueva@omsu-mamburao.edu.ph',
        programUnit: 'BEED 1A · Elementary Education',
        memberType: 'student',
      },
      {
        studentId: 'OMSU-2026-0005',
        fullName: 'Carlo Bautista',
        email: 'carlo.bautista@omsu-mamburao.edu.ph',
        programUnit: 'BPA 3A · Public Administration',
        memberType: 'student',
      },
    ];

    const tx = db.transaction(() => {
      for (const row of sampleRoster) {
        insert.run(
          crypto.randomUUID(),
          row.studentId,
          row.fullName,
          row.email,
          row.programUnit,
          row.memberType,
          'Mamburao Campus',
          '2nd Sem AY 2026-2027',
          now
        );
      }
    });
    tx();
    return;
  }

  // Ensure default sample faculty teacher exists in existing rosters
  insert.run(
    crypto.randomUUID(),
    'FAC-2026-0001',
    'Prof. Clarissa Dizon',
    'teacher@omsu-mamburao.edu.ph',
    'CAST Faculty · BSIT Department',
    'teacher',
    'Mamburao Campus',
    '2nd Sem AY 2026-2027',
    now
  );
}

function seedInitialAnnouncements(): void {
  const existingSystemRows = db
    .prepare("SELECT COUNT(*) AS cnt FROM announcements WHERE author_id = 'system-bulletin'")
    .get() as { cnt: number };

  const totalRows = db.prepare('SELECT COUNT(*) AS cnt FROM announcements').get() as {
    cnt: number;
  };

  // Seed fresh OMSU Mamburao bulletins if empty, or refresh legacy generic system-bulletin seed rows
  const hasLegacyCrestviewSeed = db
    .prepare(
      "SELECT COUNT(*) AS cnt FROM announcements WHERE author_id = 'system-bulletin' AND body LIKE '%Oak Hall%'"
    )
    .get() as { cnt: number };

  if (totalRows.cnt > 0 && hasLegacyCrestviewSeed.cnt === 0) {
    return;
  }

  const now = Date.now();
  const isoOffset = (minutesAgo: number) => new Date(now - minutesAgo * 60_000).toISOString();

  const insert = db.prepare(`
    INSERT INTO announcements (
      id, title, body, category, priority, audience, status, pinned, event_date,
      author_id, author_name, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const initialBulletins = [
    {
      id: crypto.randomUUID(),
      title: 'OMSU Mamburao Campus Water Line Maintenance — Student Dormitory & Academic Wing',
      body: 'Campus Facilities Operations will conduct preventive main valve servicing at the Mamburao Campus quadrangle this Saturday from 7:00 AM to 11:30 AM. Water supply will be temporarily paused in the Mamburao Student Dormitory, Science Laboratory Annex, and Canteen Area. Refill stations will be available at the Guardhouse lobby starting at 6:30 AM.',
      category: 'Operations',
      priority: 'urgent',
      audience: 'Dorm & Housing',
      pinned: 1,
      eventDate: '2026-11-28',
      authorName: 'OMSU Mamburao Campus Operations',
      createdAt: isoOffset(45),
    },
    {
      id: crypto.randomUUID(),
      title: 'Final Examination Room Assignments & Extended Library Access',
      body: 'Room rosters for OMSU Mamburao final examinations are now posted through the Student Portal. Students must verify their room assignments and examination permits with the Registrar at least 48 hours prior to their exam schedule. The Mamburao Campus Library will extend study hours until 9:00 PM throughout finals week.',
      category: 'Academics',
      priority: 'important',
      audience: 'Students & Parents',
      pinned: 1,
      eventDate: '2026-12-07',
      authorName: 'Office of the Campus Registrar',
      createdAt: isoOffset(180),
    },
    {
      id: crypto.randomUUID(),
      title: 'OMSU Mamburao Student Research Colloquium & Academic Showcase',
      body: 'Join faculty, students, and resident families at the OMSU Mamburao Multi-Purpose Hall on December 4 at 1:30 PM for our annual Student Research Colloquium and Innovation Exhibit. Attendance certificates will be issued to registered student participants.',
      category: 'Events',
      priority: 'normal',
      audience: 'All Residents',
      pinned: 0,
      eventDate: '2026-12-04',
      authorName: 'Office of Student Affairs & Services',
      createdAt: isoOffset(720),
    },
    {
      id: crypto.randomUUID(),
      title: 'Unified Student Financial Assistance (UniFAST / TES) & Dormitory Clearance Schedule',
      body: 'The Cashier and Scholarship Unit reminds all OMSU Mamburao grantees and student residents that renewal requirements and dormitory clearance forms are due on December 1. Submit validated enrollment assessment slips directly at Window 2.',
      category: 'Financial',
      priority: 'important',
      audience: 'Students & Parents',
      pinned: 0,
      eventDate: '2026-12-01',
      authorName: 'Scholarship & Student Accounts Unit',
      createdAt: isoOffset(1440),
    },
    {
      id: crypto.randomUUID(),
      title: 'DRRM Campus Safety Orientation & Typhoon Preparedness Advisory',
      body: 'All class mayors, dormitory officers, and faculty coordinators are advised to attend the Disaster Risk Reduction & Management briefing next Monday at 9:00 AM. Updated emergency assembly maps have been posted across all Mamburao Campus buildings.',
      category: 'Health & Safety',
      priority: 'normal',
      audience: 'All Residents',
      pinned: 0,
      eventDate: '2026-11-30',
      authorName: 'Campus Safety & DRRM Office',
      createdAt: isoOffset(2880),
    },
  ];

  const tx = db.transaction(() => {
    if (existingSystemRows.cnt > 0 && hasLegacyCrestviewSeed.cnt > 0) {
      db.prepare("DELETE FROM announcements WHERE author_id = 'system-bulletin'").run();
    }
    for (const item of initialBulletins) {
      insert.run(
        item.id,
        item.title,
        item.body,
        item.category,
        item.priority,
        item.audience,
        'published',
        item.pinned,
        item.eventDate,
        'system-bulletin',
        item.authorName,
        item.createdAt,
        item.createdAt
      );
    }
  });
  tx();
}

seedPortalSettings();
seedEnrolledRoster();
backfillMatchedStudentIds();
seedInitialAnnouncements();
