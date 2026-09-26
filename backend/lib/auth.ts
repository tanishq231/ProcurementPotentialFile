import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { db } from './db';
import { demoMode, demoUser } from './demo-store';
export const roles = ['Admin','Sales','Planner','Purchase','Technical'] as const;
export type Role = typeof roles[number];
export type User = { id: number; name: string; email: string; role: Role };
const secret = () => {
  const value=process.env.SESSION_SECRET;
  if(!value&&process.env.NODE_ENV==='production') throw new Error('SESSION_SECRET must be configured in production.');
  return new TextEncoder().encode(value||'development-only-change-this-session-secret');
};
export async function createSession(user: User) {
  const token = await new SignJWT(user).setProtectedHeader({alg:'HS256'}).setIssuedAt().setExpirationTime('7d').sign(secret());
  (await cookies()).set('parts_session',token,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/',maxAge:60*60*24*7});
}
export async function currentUser(): Promise<User|null> {
  const token = (await cookies()).get('parts_session')?.value;
  if (!token) return null;
  try {
    const {payload}=await jwtVerify(token,secret());
    if(demoMode){const user={id:Number(payload.id),name:String(payload.name),email:String(payload.email),role:payload.role as Role};const latest=demoUser(user);return latest?{id:latest.id,name:latest.name,email:latest.email,role:latest.role}:null;}
    const result=await db.query('SELECT id,name,email,role FROM app_users WHERE id=$1',[Number(payload.id)]);
    const row=result.rows[0];
    return row?{id:Number(row.id),name:row.name,email:row.email,role:row.role}:null;
  } catch { return null; }
}
export async function requireUser() { const user=await currentUser(); if(!user) throw new Error('UNAUTHORIZED'); return user; }
export async function listUsers() { return (await db.query('SELECT id,name,email,role,created_at FROM app_users ORDER BY name')).rows; }
