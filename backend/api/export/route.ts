import { NextResponse } from 'next/server';
import { db } from '@backend/lib/db';
import { requireUser } from '@backend/lib/auth';
import { demoMode,demoParts } from '@backend/lib/demo-store';
import { calculateInventory } from '@backend/lib/inventory';

function csv(v:unknown){const s=v==null?'':String(v);return `"${s.replaceAll('"','""')}"`;}
function formatDateDMY(value:unknown){if(value==null||value==='')return '';const raw=value instanceof Date?value.toISOString().slice(0,10):String(value).slice(0,10);const match=raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);return match?`${match[3]}-${match[2]}-${match[1]}`:raw;}

export async function GET(){
  try{
    await requireUser();
    const source=demoMode
      ?demoParts().map(p=>({part_no:p.partNo,description:p.description,supplier:p.supplier,amc:p.amc,stock:p.stock,backOrder:p.backOrder,eta:p.eta,assignedRole:p.assignedRole,remark:p.remark,comments:p.comments,updatedAt:p.updatedAt}))
      :(await db.query('SELECT part_no,description,supplier,ROUND((SELECT AVG(v) FROM (VALUES(amc_month_1),(amc_month_2),(amc_month_3)) AS usage_months(v)),2) AS amc,stock,back_order AS "backOrder",eta,assigned_role AS "assignedRole",remark,comments,updated_at AS "updatedAt" FROM parts ORDER BY part_no')).rows;
    const rows=source.map(calculateInventory);
    const header=['Part no.','Description','Supplier','AMC','Stock','Back order','Actual stock','Coverage (days)','ETA','Sign to','Remark','Comments','Updated at'];
    const body=rows.map((r:any)=>[r.part_no??r.partNo,r.description,r.supplier,r.amc,r.stock,r.backOrder,r.actualStock,r.cov,r.eta,r.assignedRole,r.remark,r.comments,r.updatedAt].map((value,index)=>csv(index===8||index===12?formatDateDMY(value):value)).join(','));
    return new NextResponse([header.map(csv).join(','),...body].join('\r\n'),{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="parts-planner-export.csv"'}});
  }catch{return NextResponse.json({error:'Sign in required.'},{status:401});}
}
