import { NextResponse } from 'next/server';
import { db } from '@backend/lib/db';
import { requireUser } from '@backend/lib/auth';
import { demoMode, demoParts } from '@backend/lib/demo-store';
import { logActivity } from '@backend/lib/activity';
import { calculateInventory } from '@backend/lib/inventory';

const columns:Record<string,string>={description:'description',supplier:'supplier',stock:'stock',backOrder:'back_order',eta:'eta',assignedRole:'assigned_role',remark:'remark',comments:'comments'};
const fieldLabels:Record<string,string>={description:'Description',supplier:'Supplier',stock:'Stock',backOrder:'Back order',eta:'ETA',assignedRole:'Sign to',remark:'Remark',comments:'Comments'};
const access={
  Admin:['description','supplier','stock','backOrder','eta','assignedRole','remark','comments'],
  Sales:['description','supplier','backOrder','assignedRole','remark','comments'],
  Planner:['description','supplier','stock','eta','assignedRole','remark','comments'],
  Purchase:['description','supplier','eta','assignedRole','remark','comments'],
  Technical:['description','supplier','eta','assignedRole','remark','comments']
} as const;
const validRoles=['Admin','Sales','Planner','Purchase','Technical'];

export async function DELETE(request:Request){
  try{
    const user=await requireUser();
    if(user.role!=='Admin')return NextResponse.json({error:'Only Admin can delete parts.'},{status:403});
    const body=await request.json();
    const ids=Array.isArray(body.ids)?[...new Set(body.ids.map(Number).filter((id:number)=>Number.isSafeInteger(id)&&id>0))]:[];
    if(!ids.length||ids.length>500)return NextResponse.json({error:'Select between 1 and 500 parts.'},{status:400});
    if(demoMode){
      const parts=demoParts();
      const removed=parts.filter(part=>ids.includes(part.id));
      for(const part of removed)await logActivity(user,part.partNo,'Deleted part','Removed in bulk');
      const removedIds=new Set(removed.map(part=>part.id));
      for(let index=parts.length-1;index>=0;index--)if(removedIds.has(parts[index].id))parts.splice(index,1);
      return NextResponse.json({deletedIds:[...removedIds]});
    }
    const {rows}=await db.query('DELETE FROM parts WHERE id=ANY($1::bigint[]) RETURNING id,part_no AS "partNo"',[ids]);
    for(const part of rows)await logActivity(user,part.partNo,'Deleted part','Removed in bulk');
    return NextResponse.json({deletedIds:rows.map((part:any)=>Number(part.id))});
  }catch(error){
    return NextResponse.json({error:error instanceof Error&&error.message==='UNAUTHORIZED'?'Sign in required.':'Could not delete selected parts.'},{status:error instanceof Error&&error.message==='UNAUTHORIZED'?401:500});
  }
}

export async function POST(request:Request){
  try{
    const user=await requireUser();
    const body=await request.json();
    const ids=Array.isArray(body.ids)?[...new Set(body.ids.map(Number).filter((id:number)=>Number.isSafeInteger(id)&&id>0))]:[];
    const field=String(body.field||'');
    const value=String(body.value??'');
    if(!ids.length||ids.length>500)return NextResponse.json({error:'Select between 1 and 500 parts.'},{status:400});
    if(!columns[field])return NextResponse.json({error:'Choose a valid field to update.'},{status:400});
    if(!(access[user.role] as readonly string[]).includes(field))return NextResponse.json({error:'Your role cannot edit that field.'},{status:403});
    if(value.trim()==='')return NextResponse.json({error:'Enter a value to apply.'},{status:400});
    if(field==='assignedRole'&&!validRoles.includes(value))return NextResponse.json({error:'Choose a valid role for Sign to.'},{status:400});
    if(['stock','backOrder'].includes(field)&&(!Number.isInteger(Number(value))))return NextResponse.json({error:'Stock and Back order must be whole numbers.'},{status:400});
    if(field==='eta'&&(!/^\d{4}-\d{2}-\d{2}$/.test(value)||Number.isNaN(Date.parse(`${value}T00:00:00Z`))))return NextResponse.json({error:'ETA must be a valid date.'},{status:400});

    const normalized=['stock','backOrder'].includes(field)?Number(value):value;
    if(demoMode){
      const chosen=demoParts().filter(part=>ids.includes(part.id));
      if(!chosen.length)return NextResponse.json({error:'No selected parts were found.'},{status:404});
      for(const part of chosen){
        const before=(part as any)[field];
        if(String(before??'')===String(normalized))continue;
        (part as any)[field]=normalized;
        part.updatedAt=new Date().toISOString();
        await logActivity(user,part.partNo,'Bulk updated',`${fieldLabels[field]}: ${before??'empty'} → ${normalized}`);
      }
      return NextResponse.json({parts:chosen.map(calculateInventory)});
    }

    const column=columns[field];
    const before=await db.query(`SELECT id,part_no AS "partNo",${column} AS value FROM parts WHERE id=ANY($1::bigint[])`,[ids]);
    if(!before.rows.length)return NextResponse.json({error:'No selected parts were found.'},{status:404});
    const {rows}=await db.query(`UPDATE parts SET ${column}=$1,updated_by=$2,updated_at=NOW() WHERE id=ANY($3::bigint[]) RETURNING id,part_no AS "partNo",description,supplier,ROUND((SELECT AVG(v) FROM (VALUES(amc_month_1),(amc_month_2),(amc_month_3)) AS usage_months(v)),2) AS amc,ARRAY[amc_month_1,amc_month_2,amc_month_3] AS "amcMonths",stock,back_order AS "backOrder",cov_days AS cov,eta,assigned_role AS "assignedRole",remark,comments,updated_at AS "updatedAt"`,[normalized,user.id,ids]);
    const oldById=new Map<number,any>(before.rows.map((row:any)=>[Number(row.id),row]));
    for(const part of rows){
      const old=oldById.get(Number(part.id));
      if(String(old?.value??'')!==String(normalized))await logActivity(user,part.partNo,'Bulk updated',`${fieldLabels[field]}: ${old?.value??'empty'} → ${normalized}`);
    }
    return NextResponse.json({parts:rows.map(calculateInventory)});
  }catch(error){
    return NextResponse.json({error:error instanceof Error&&error.message==='UNAUTHORIZED'?'Sign in required.':'Could not update selected parts.'},{status:error instanceof Error&&error.message==='UNAUTHORIZED'?401:500});
  }
}
