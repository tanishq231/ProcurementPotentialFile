import { NextResponse } from 'next/server';
import { currentUser } from '@backend/lib/auth';
import { db } from '@backend/lib/db';
import { demoActivity,demoMode,demoNotifications,demoSeen,setDemoNotifications,setDemoSeen } from '@backend/lib/demo-store';

export async function GET(){
  const user=await currentUser();if(!user)return NextResponse.json({error:'Sign in required.'},{status:401});
  if(demoMode){const cutoff=Date.now()-40*24*60*60*1000;const history=demoActivity();for(let i=history.length-1;i>=0;i--)if(new Date(history[i].createdAt).getTime()<cutoff)history.splice(i,1);const events=history.slice(0,50);return NextResponse.json({events,enabled:demoNotifications(user.id),unread:demoNotifications(user.id)?history.filter(e=>e.id>demoSeen(user.id)).length:0});}
  await db.query("DELETE FROM activity_log WHERE created_at < NOW() - INTERVAL '40 days'");
  const [{rows:events},{rows:settings}]=await Promise.all([
    db.query('SELECT id,actor_name AS "actorName",part_no AS "partNo",action,details,created_at AS "createdAt" FROM activity_log ORDER BY id DESC LIMIT 50'),
    db.query('SELECT notifications_enabled AS enabled,last_activity_seen_id AS "lastSeen" FROM app_users WHERE id=$1',[user.id])
  ]);
  const enabled=Boolean(settings[0]?.enabled),lastSeen=Number(settings[0]?.lastSeen||0);
  const {rows:counts}=await db.query('SELECT COUNT(*)::int AS unread FROM activity_log WHERE id>$1',[lastSeen]);
  return NextResponse.json({events,enabled,unread:enabled?counts[0].unread:0});
}

export async function PATCH(req:Request){
  const user=await currentUser();if(!user)return NextResponse.json({error:'Sign in required.'},{status:401});
  const body=await req.json();
  if(typeof body.enabled==='boolean'){
    if(demoMode)setDemoNotifications(user.id,body.enabled);
    else await db.query('UPDATE app_users SET notifications_enabled=$1 WHERE id=$2',[body.enabled,user.id]);
  }
  if(body.seen===true){
    if(demoMode)setDemoSeen(user.id,demoActivity()[0]?.id||demoSeen(user.id));
    else await db.query('UPDATE app_users SET last_activity_seen_id=(SELECT COALESCE(MAX(id),0) FROM activity_log) WHERE id=$1',[user.id]);
  }
  return NextResponse.json({ok:true});
}
