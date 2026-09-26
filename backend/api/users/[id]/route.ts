import { NextResponse } from 'next/server';
import { db } from '@backend/lib/db';
import { requireUser, roles } from '@backend/lib/auth';
import { demoMode,demoUsers } from '@backend/lib/demo-store';
export async function PATCH(req:Request,context:{params:Promise<{id:string}>}){try{const {id}=await context.params;const actor=await requireUser();if(actor.role!=='Admin')return NextResponse.json({error:'Admin access required.'},{status:403});const {role}=await req.json();if(!roles.includes(role))return NextResponse.json({error:'Select a valid role.'},{status:400});if(Number(id)===actor.id&&role!=='Admin')return NextResponse.json({error:'You cannot remove your own Admin role.'},{status:400});if(demoMode){const target=demoUsers.find(u=>u.id===Number(id));if(target)target.role=role;}else await db.query('UPDATE app_users SET role=$1 WHERE id=$2',[role,id]);return NextResponse.json({ok:true});}catch{return NextResponse.json({error:'Could not update role.'},{status:400});}}
