/**
 * Seed an admin user for local testing.
 * Role: admin (below creator).
 * Status: active (no approval needed).
 *
 * Usage: npx tsx scripts/seed-admin.ts
 */
import 'dotenv/config';
import bcrypt from 'bcrypt';
import { getDb } from '../server/db';
import { users } from '../drizzle/schema';
import { eq } from 'drizzle-orm';

const ADMIN_EMAIL = 'antigravity@intelltech.ai';
const ADMIN_PASSWORD = 'Admin@2026!';
const ADMIN_NAME = 'Antigravity (Admin)';
const BCRYPT_ROUNDS = 12;

async function seedAdmin() {
  console.log('🔐 Seeding admin user...');
  const db = await getDb();
  if (!db) {
    console.error('❌ Database not available. Check DATABASE_URL in .env');
    process.exit(1);
  }

  // Check if already exists
  const existing = await db
    .select({ id: users.id, role: users.role, status: users.status })
    .from(users)
    .where(eq(users.email, ADMIN_EMAIL))
    .limit(1);

  if (existing.length > 0) {
    console.log(`⚠️  User ${ADMIN_EMAIL} already exists (role: ${existing[0].role}, status: ${existing[0].status}).`);
    // Ensure it's admin + active
    if (existing[0].role !== 'admin' || existing[0].status !== 'active') {
      await db.update(users).set({ role: 'admin', status: 'active' }).where(eq(users.id, existing[0].id));
      console.log('✅ Updated to role=admin, status=active');
    } else {
      console.log('✅ Already configured correctly.');
    }
    process.exit(0);
  }

  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, BCRYPT_ROUNDS);
  const openId = `native_admin_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

  await db.insert(users).values({
    openId,
    name: ADMIN_NAME,
    username: ADMIN_NAME,
    email: ADMIN_EMAIL,
    passwordHash,
    loginMethod: 'email_password',
    role: 'admin',
    status: 'active',
    lastSignedIn: new Date(),
  });

  console.log('✅ Admin user created successfully!');
  console.log(`   Email:    ${ADMIN_EMAIL}`);
  console.log(`   Password: ${ADMIN_PASSWORD}`);
  console.log(`   Role:     admin`);
  console.log(`   Status:   active`);
  process.exit(0);
}

seedAdmin().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
