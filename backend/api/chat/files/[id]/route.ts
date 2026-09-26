import { NextResponse } from 'next/server';
import { db } from '@backend/lib/db';
import { requireUser } from '@backend/lib/auth';
import { demoChatFile, demoMode } from '@backend/lib/demo-store';

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireUser();
    const id = Number((await context.params).id);
    if (!Number.isSafeInteger(id) || id < 1) return NextResponse.json({ error: 'Attachment not found.' }, { status: 404 });
    const file = demoMode
      ? demoChatFile(id)
      : (await db.query('SELECT file_name AS "fileName", content_type AS "contentType", file_size AS size, file_data AS data FROM workspace_chat_files WHERE id=$1', [id])).rows[0];
    if (!file) return NextResponse.json({ error: 'Attachment not found.' }, { status: 404 });
    const bytes = file.data instanceof Uint8Array ? file.data : new Uint8Array(file.data);
    const inline = file.contentType.startsWith('image/') || file.contentType === 'application/pdf';
    return new Response(new Blob([bytes], { type: file.contentType }), { headers: {
      'Content-Type': file.contentType,
      'Content-Length': String(file.size),
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, max-age=3600',
    } });
  } catch (error) {
    const unauthorized = error instanceof Error && error.message === 'UNAUTHORIZED';
    return NextResponse.json({ error: unauthorized ? 'Sign in required.' : 'Could not load attachment.' }, { status: unauthorized ? 401 : 500 });
  }
}
