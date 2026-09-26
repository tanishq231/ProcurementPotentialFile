import { db } from './db';
import { addDemoActivity,demoMode } from './demo-store';

export async function logActivity(user:{id:number;name:string},partNo:string,action:string,details:string){
  if(demoMode)addDemoActivity(user.name,partNo,action,details);
  else await db.query('INSERT INTO activity_log(actor_id,actor_name,part_no,action,details) VALUES($1,$2,$3,$4,$5)',[user.id,user.name,partNo,action,details]);
}
