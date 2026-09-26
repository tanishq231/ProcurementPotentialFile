import { NextResponse } from 'next/server';
import { db } from '@backend/lib/db';
import { requireUser } from '@backend/lib/auth';
import { addDemoChatMessage, demoChatFile, demoChatMessages, demoMode } from '@backend/lib/demo-store';

const MAX_FILE_BYTES=8*1024*1024;
const MAX_FILES=5;
const MAX_TOTAL_BYTES=15*1024*1024;
const allowedTypes:Record<string,string>={
  jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',gif:'image/gif',webp:'image/webp',
  pdf:'application/pdf',txt:'text/plain',csv:'text/csv',
  doc:'application/msword',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls:'application/vnd.ms-excel',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt:'application/vnd.ms-powerpoint',pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation'
};
function safeFileName(name:string){return name.split(/[\\/]/).pop()?.replace(/[\r\n\0]/g,'').slice(0,180)||'attachment';}
function fileType(name:string){const extension=name.split('.').pop()?.toLowerCase()||'';return allowedTypes[extension]||null;}

export async function GET(){
  try{
    await requireUser();
    if(demoMode)return NextResponse.json({messages:demoChatMessages().slice(-100)});
    const {rows}=await db.query(`SELECT m.id,m.author_id AS "authorId",m.author_name AS "authorName",COALESCE(u.role::text,'Former member') AS role,m.body,m.created_at AS "createdAt" FROM (SELECT id,author_id,author_name,body,created_at FROM workspace_messages ORDER BY id DESC LIMIT 100) m LEFT JOIN app_users u ON u.id=m.author_id ORDER BY m.id ASC`);
    if(rows.length){const files=await db.query('SELECT id,message_id AS "messageId",file_name AS "fileName",content_type AS "contentType",file_size AS size FROM workspace_chat_files WHERE message_id=ANY($1::bigint[]) ORDER BY id',[rows.map((message:any)=>message.id)]);const byMessage=new Map<string,any[]>();for(const file of files.rows){const key=String(file.messageId);byMessage.set(key,[...(byMessage.get(key)||[]),file])}for(const message of rows)message.attachments=byMessage.get(String(message.id))||[]}
    return NextResponse.json({messages:rows});
  }catch(error){
    return NextResponse.json({error:error instanceof Error&&error.message==='UNAUTHORIZED'?'Sign in required.':'Could not load group chat.'},{status:error instanceof Error&&error.message==='UNAUTHORIZED'?401:500});
  }
}

export async function POST(request:Request){
  try{
    const user=await requireUser();
    const form=await request.formData();
    const rawBody=form.get('body');
    const body=typeof rawBody==='string'?rawBody.trim():'';
    if(body.length>2000)return NextResponse.json({error:'Messages can be up to 2,000 characters.'},{status:400});
    const uploads=form.getAll('files').filter((item):item is File=>item instanceof File&&item.size>0);
    if(!body&&!uploads.length)return NextResponse.json({error:'Write a message or attach a file before sending.'},{status:400});
    if(uploads.length>MAX_FILES)return NextResponse.json({error:`Attach up to ${MAX_FILES} files per message.`},{status:400});
    let totalBytes=0;
    const prepared:{file:File;name:string;contentType:string}[]=[];
    for(const file of uploads){
      const name=safeFileName(file.name);const contentType=fileType(name);
      if(!contentType)return NextResponse.json({error:`${name} is not a supported photo or document type.`},{status:400});
      if(file.size>MAX_FILE_BYTES)return NextResponse.json({error:`${name} is larger than 8 MB.`},{status:413});
      totalBytes+=file.size;prepared.push({file,name,contentType});
    }
    if(totalBytes>MAX_TOTAL_BYTES)return NextResponse.json({error:'Attachments must total 15 MB or less.'},{status:413});
    if(demoMode){const files=[];for(const item of prepared)files.push({fileName:item.name,contentType:item.contentType,data:new Uint8Array(await item.file.arrayBuffer())});return NextResponse.json({message:addDemoChatMessage(user,body,files)},{status:201});}
    const client=await db.connect();
    try{
      await client.query('BEGIN');
      const {rows}=await client.query(`INSERT INTO workspace_messages(author_id,author_name,body) VALUES($1,$2,$3) RETURNING id,author_id AS "authorId",author_name AS "authorName",$4::text AS role,body,created_at AS "createdAt"`,[user.id,user.name,body,user.role]);
      const message=rows[0];message.attachments=[];
      for(const item of prepared){const bytes=Buffer.from(await item.file.arrayBuffer());const file=await client.query('INSERT INTO workspace_chat_files(message_id,file_name,content_type,file_size,file_data) VALUES($1,$2,$3,$4,$5) RETURNING id,file_name AS "fileName",content_type AS "contentType",file_size AS size',[message.id,item.name,item.contentType,bytes.byteLength,bytes]);message.attachments.push(file.rows[0]);}
      await client.query('COMMIT');
      return NextResponse.json({message},{status:201});
    }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}finally{client.release()}
  }catch(error){
    return NextResponse.json({error:error instanceof Error&&error.message==='UNAUTHORIZED'?'Sign in required.':'Could not send group chat message.'},{status:error instanceof Error&&error.message==='UNAUTHORIZED'?401:500});
  }
}
