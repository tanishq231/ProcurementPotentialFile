import { NextResponse } from 'next/server';
import { db } from '@backend/lib/db';
import { requireUser } from '@backend/lib/auth';
import { demoMode, demoParts, nextDemoId } from '@backend/lib/demo-store';
import { logActivity } from '@backend/lib/activity';
import { calculateInventory } from '@backend/lib/inventory';

const partProjection = `id,part_no AS "partNo",description,supplier,
  ROUND((SELECT AVG(v) FROM (VALUES(amc_month_1),(amc_month_2),(amc_month_3)) AS usage_months(v)),2) AS amc,
  ARRAY[amc_month_1,amc_month_2,amc_month_3] AS "amcMonths",
  stock,back_order AS "backOrder",eta,assigned_role AS "assignedRole",remark,comments,updated_at AS "updatedAt"`;

export async function GET() {
  try {
    await requireUser();
    if (demoMode) return NextResponse.json({ parts: demoParts().map(calculateInventory) });
    const { rows } = await db.query(`SELECT ${partProjection} FROM parts ORDER BY part_no`);
    return NextResponse.json({ parts: rows.map(calculateInventory) });
  } catch (error) {
    const unauthorized = error instanceof Error && error.message === 'UNAUTHORIZED';
    return NextResponse.json({ error: unauthorized ? 'Sign in required.' : 'Could not load parts.' }, { status: unauthorized ? 401 : 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await request.json();
    if (!String(body.partNo || '').trim()) return NextResponse.json({ error: 'Part number is required.' }, { status: 400 });
    const canStock = ['Admin', 'Planner'].includes(user.role);
    const canBackOrder = ['Admin', 'Sales'].includes(user.role);
    const canEta = ['Admin', 'Planner', 'Technical', 'Purchase'].includes(user.role);
    if (demoMode) {
      const parts = demoParts();
      if (parts.some(part => part.partNo.toLowerCase() === String(body.partNo).toLowerCase())) return NextResponse.json({ error: 'Part number already exists.' }, { status: 400 });
      const part: any = { id: nextDemoId(), partNo: String(body.partNo), description: body.description || '', supplier: body.supplier || '', amc: null, amcMonths: [null, null, null], stock: canStock ? (body.stock ?? null) : null, backOrder: canBackOrder ? (body.backOrder ?? null) : null, cov: null, eta: canEta ? (body.eta || null) : null, assignedRole: body.assignedRole || null, remark: body.remark || '', comments: body.comments || '', updatedAt: new Date().toISOString() };
      parts.unshift(part);
      await logActivity(user, part.partNo, 'Added part', part.description || 'New part created');
      return NextResponse.json({ part: calculateInventory(part) }, { status: 201 });
    }
    const { rows } = await db.query(
      `INSERT INTO parts(part_no,description,supplier,stock,back_order,eta,assigned_role,remark,comments,updated_by)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING ${partProjection}`,
      [body.partNo, body.description || '', body.supplier || '', canStock ? (body.stock ?? null) : null, canBackOrder ? (body.backOrder ?? null) : null, canEta ? (body.eta || null) : null, body.assignedRole || null, body.remark || '', body.comments || '', user.id]
    );
    await logActivity(user, rows[0].partNo, 'Added part', rows[0].description || 'New part created');
    return NextResponse.json({ part: calculateInventory(rows[0]) }, { status: 201 });
  } catch (error) {
    const unauthorized = error instanceof Error && error.message === 'UNAUTHORIZED';
    return NextResponse.json({ error: unauthorized ? 'Sign in required.' : 'Part number already exists, or the part could not be saved.' }, { status: unauthorized ? 401 : 400 });
  }
}
