import { Pool } from 'pg';
const globalForPg = globalThis as unknown as { pool?: Pool };
const localDatabase=process.env.DATABASE_URL?.includes('localhost')||process.env.DATABASE_URL?.includes('127.0.0.1')||process.env.DATABASE_URL?.includes('[::1]');
export const db = globalForPg.pool ?? new Pool({ connectionString: process.env.DATABASE_URL, ssl: localDatabase ? false : { rejectUnauthorized: false } });
if (process.env.NODE_ENV !== 'production') globalForPg.pool = db;
