import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { db } from '@backend/lib/db';
import { createSession } from '@backend/lib/auth';
import { demoMode, demoUsers } from '@backend/lib/demo-store';
export async function POST(req:Request){
  const {email,password,role}=await req.json();
  if(demoMode){const account=demoUsers.find(user=>user.role===role&&user.email.toLowerCase()===String(email||'').trim().toLowerCase()&&user.password===password);if(!account)return NextResponse.json({error:'For the demo, use the matching role email and password demo1234.'},{status:401});const user={id:account.id,name:account.name,email:account.email,role:account.role};await createSession(user);return NextResponse.json({user});}
  const result=await db.query('SELECT id,name,email,password_hash,role FROM app_users WHERE lower(email)=lower($1)',[String(email||'').trim()]);
  const row=result.rows[0];
  if(!row || !await bcrypt.compare(String(password||''),row.password_hash)) return NextResponse.json({error:'Email or password is incorrect.'},{status:401});
  await createSession({id:Number(row.id),name:row.name,email:row.email,role:row.role});
  return NextResponse.json({user:{id:Number(row.id),name:row.name,email:row.email,role:row.role}});
}
