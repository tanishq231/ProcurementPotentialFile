import pg from 'pg';
import { readFile } from 'node:fs/promises';
import bcrypt from 'bcryptjs';
import nextEnv from '@next/env';
const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());
const { Pool } = pg;
if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL before running db:setup');
const localDatabase = /localhost|127\.0\.0\.1|\[::1\]/.test(process.env.DATABASE_URL);
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: localDatabase ? false : { rejectUnauthorized: false } });
try {
  await pool.query(await readFile(new URL('../schema.sql', import.meta.url), 'utf8'));
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME || 'Administrator';
  if (email && password) {
    const hash = await bcrypt.hash(password, 12);
    await pool.query('INSERT INTO app_users(name,email,password_hash,role) VALUES($1,$2,$3,\'Admin\') ON CONFLICT(email) DO NOTHING', [name,email,hash]);
    console.log(`Admin account ready: ${email}`);
  }
  console.log('Database schema is ready.');
} finally { await pool.end(); }
