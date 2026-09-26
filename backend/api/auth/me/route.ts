import { NextResponse } from 'next/server';
import { currentUser } from '@backend/lib/auth';
export async function GET(){return NextResponse.json({user:await currentUser()});}
