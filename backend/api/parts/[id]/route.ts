import { NextResponse } from 'next/server';
import { db } from '@backend/lib/db';
import { requireUser } from '@backend/lib/auth';
import { demoMode, demoParts } from '@backend/lib/demo-store';
import { logActivity } from '@backend/lib/activity';
import { calculateInventory } from '@backend/lib/inventory';

const fieldByRole = {
  Admin: ['part_no','description','supplier','amc_month_1','amc_month_2','amc_month_3','stock','back_order','eta','assigned_role','remark','comments'],
  Sales: ['part_no','description','supplier','back_order','assigned_role','remark','comments'],
  Planner: ['part_no','description','supplier','amc_month_1','amc_month_2','amc_month_3','stock','eta','assigned_role','remark','comments'],
  Purchase: ['part_no','description','supplier','eta','assigned_role','remark','comments'],
  Technical: ['part_no','description','supplier','eta','assigned_role','remark','comments']
} as const;
const names: Record<string,string> = {partNo:'part_no',description:'description',supplier:'supplier',amcMonth1:'amc_month_1',amcMonth2:'amc_month_2',amcMonth3:'amc_month_3',stock:'stock',backOrder:'back_order',eta:'eta',assignedRole:'assigned_role',remark:'remark',comments:'comments'};
const labels: Record<string,string> = {partNo:'Part no.',description:'Description',supplier:'Supplier',amcMonth1:'AMC month 1',amcMonth2:'AMC month 2',amcMonth3:'AMC month 3',stock:'Stock',backOrder:'Back order',eta:'ETA',assignedRole:'Sign to',remark:'Remark',comments:'Comments'};
const show=(v:unknown)=>v==null||v===''?'empty':String(v);

export async function PATCH(req: Request, context: {params: Promise<{id:string}>}) {
  try {
    const {id}=await context.params;
    const user=await requireUser();
    const input=await req.json();
    const allowed=new Set<string>(fieldByRole[user.role]);
    const keys=Object.keys(input).filter(k=>names[k]&&allowed.has(names[k]));
    if(!keys.length)return NextResponse.json({error:'Your role cannot edit those fields.'},{status:403});
    for(const key of ['amcMonth1','amcMonth2','amcMonth3'])if(input[key]!==undefined&&input[key]!==''&&(!Number.isFinite(Number(input[key]))||Number(input[key])<0))return NextResponse.json({error:'Monthly usage values must be non-negative numbers.'},{status:400});
    if(input.assignedRole&&!['Admin','Sales','Planner','Purchase','Technical'].includes(input.assignedRole))return NextResponse.json({error:'Select a valid role.'},{status:400});

    if(demoMode){
      const part=demoParts().find(p=>p.id===Number(id));
      if(!part)return NextResponse.json({error:'Part not found.'},{status:404});
      if(input.partNo&&demoParts().some(p=>p.id!==part.id&&p.partNo.toLowerCase()===String(input.partNo).toLowerCase()))return NextResponse.json({error:'Part number already exists.'},{status:400});
      const changed=keys.filter(k=>{const monthIndex=['amcMonth1','amcMonth2','amcMonth3'].indexOf(k);const current=monthIndex>=0?part.amcMonths[monthIndex]:(part as any)[k];return String(current??'')!==String(input[k]??'')});
      for(const key of changed){const monthIndex=['amcMonth1','amcMonth2','amcMonth3'].indexOf(key);const before=monthIndex>=0?part.amcMonths[monthIndex]:(part as any)[key];const value=input[key]===''?null:(key.startsWith('amcMonth')?Number(input[key]):input[key]);if(monthIndex>=0){part.amcMonths[monthIndex]=value}else (part as any)[key]=value;await logActivity(user,part.partNo,'Updated',`${labels[key]}: ${show(before)} → ${show(input[key])}`);}if(changed.some(key=>key.startsWith('amcMonth'))){const used=part.amcMonths.filter(value=>value!=null);part.amc=used.length?used.reduce((sum,value)=>sum+Number(value),0)/used.length:null}
      part.updatedAt=new Date().toISOString();
      return NextResponse.json({part:calculateInventory(part)});
    }

    const beforeResult=await db.query('SELECT * FROM parts WHERE id=$1',[id]);
    const before=beforeResult.rows[0];
    if(!before)return NextResponse.json({error:'Part not found.'},{status:404});
    const changed=keys.filter(k=>String(before[names[k]]??'')!==String(input[k]??''));
    const vals=keys.map(k=>input[k]===''?null:(k.startsWith('amcMonth')?Number(input[k]):input[k]));
    const sets=keys.map((k,i)=>`${names[k]}=$${i+1}`);
    sets.push(`updated_by=$${keys.length+1}`,'updated_at=NOW()');
    const {rows}=await db.query(`UPDATE parts SET ${sets.join(',')} WHERE id=$${keys.length+2} RETURNING id,part_no AS "partNo",description,supplier,ROUND((SELECT AVG(v) FROM (VALUES(amc_month_1),(amc_month_2),(amc_month_3)) AS usage_months(v)),2) AS amc,ARRAY[amc_month_1,amc_month_2,amc_month_3] AS "amcMonths",stock,back_order AS "backOrder",cov_days AS cov,eta,assigned_role AS "assignedRole",remark,comments,updated_at AS "updatedAt"`,[...vals,user.id,id]);
    for(const key of changed)await logActivity(user,rows[0].partNo,'Updated',`${labels[key]}: ${show(before[names[key]])} → ${show(input[key])}`);
    return NextResponse.json({part:calculateInventory(rows[0])});
  } catch(e) {
    return NextResponse.json({error:e instanceof Error&&e.message==='UNAUTHORIZED'?'Sign in required.':'Could not update part.'},{status:e instanceof Error&&e.message==='UNAUTHORIZED'?401:500});
  }
}

export async function DELETE(_req: Request, context: {params: Promise<{id:string}>}) {
  try {
    const {id}=await context.params;
    const user=await requireUser();
    if(user.role!=='Admin')return NextResponse.json({error:'Only Admin can delete parts.'},{status:403});
    if(demoMode){const parts=demoParts(),index=parts.findIndex(p=>p.id===Number(id));if(index<0)return NextResponse.json({error:'Part not found.'},{status:404});const [part]=parts.splice(index,1);await logActivity(user,part.partNo,'Deleted part','Row removed');}
    else {const {rows}=await db.query('DELETE FROM parts WHERE id=$1 RETURNING part_no AS "partNo"',[id]);if(!rows[0])return NextResponse.json({error:'Part not found.'},{status:404});await logActivity(user,rows[0].partNo,'Deleted part','Row removed');}
    return NextResponse.json({ok:true});
  } catch(e) {
    return NextResponse.json({error:e instanceof Error&&e.message==='UNAUTHORIZED'?'Sign in required.':'Could not delete part.'},{status:e instanceof Error&&e.message==='UNAUTHORIZED'?401:500});
  }
}
