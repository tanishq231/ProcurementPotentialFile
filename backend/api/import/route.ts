import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { db } from '@backend/lib/db';
import { requireUser } from '@backend/lib/auth';
import { demoMode,demoParts,nextDemoId } from '@backend/lib/demo-store';
import { logActivity } from '@backend/lib/activity';

const fieldNames:Record<string,string>={partNo:'part_no',description:'description',supplier:'supplier',amcMonth1:'amc_month_1',amcMonth2:'amc_month_2',amcMonth3:'amc_month_3',stock:'stock',backOrder:'back_order',eta:'eta',assignedRole:'assigned_role',remark:'remark',comments:'comments'};
const headers:Record<string,string>={partno:'partNo',partnumber:'partNo',part:'partNo',pn:'partNo',description:'description',desc:'description',supplier:'supplier',vendor:'supplier',stock:'stock',backorder:'backOrder',backorders:'backOrder',amcmonth1:'amcMonth1',month1usage:'amcMonth1',amcmonth2:'amcMonth2',month2usage:'amcMonth2',amcmonth3:'amcMonth3',month3usage:'amcMonth3',eta:'eta',estimatedarrival:'eta',assignedrole:'assignedRole',signto:'assignedRole',role:'assignedRole',remark:'remark',remarks:'remark',comment:'comments',comments:'comments'};
const access={Admin:['part_no','description','supplier','amc_month_1','amc_month_2','amc_month_3','stock','back_order','eta','assigned_role','remark','comments'],Sales:['part_no','description','supplier','back_order','assigned_role','remark','comments'],Planner:['part_no','description','supplier','amc_month_1','amc_month_2','amc_month_3','stock','eta','assigned_role','remark','comments'],Purchase:['part_no','description','supplier','eta','assigned_role','remark','comments'],Technical:['part_no','description','supplier','eta','assigned_role','remark','comments']} as const;
const labels:Record<string,string>={partNo:'Part no.',description:'Description',supplier:'Supplier',stock:'Stock',backOrder:'Back order',amcMonth1:'AMC month 1 usage',amcMonth2:'AMC month 2 usage',amcMonth3:'AMC month 3 usage',eta:'ETA',assignedRole:'Sign to',remark:'Remark',comments:'Comments'};
const cleanHeader=(v:unknown)=>String(v??'').normalize('NFKD').toLowerCase().replace(/[^a-z0-9]/g,'');
const cellText=(v:unknown)=>v instanceof Date?v.toISOString().slice(0,10):v&&typeof v==='object'&&'text'in v?String((v as {text:string}).text):String(v??'').trim();

function parseCsv(text:string){
  const rows:string[][]=[];let row:string[]=[],cell='',quoted=false;
  for(let i=0;i<text.length;i++){
    const char=text[i];
    if(quoted){if(char==='"'&&text[i+1]==='"'){cell+='"';i++}else if(char==='"')quoted=false;else cell+=char;continue}
    if(char==='"'){quoted=true;continue}
    if(char===','){row.push(cell);cell='';continue}
    if(char==='\n'||char==='\r'){if(char==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(v=>v.trim()))rows.push(row);row=[];cell='';continue}
    cell+=char;
  }
  row.push(cell);if(row.some(v=>v.trim()))rows.push(row);return rows;
}
async function parseFile(file:File){
  const name=file.name.toLowerCase();
  if(name.endsWith('.csv'))return parseCsv((await file.text()).replace(/^\uFEFF/,''));
  if(!name.endsWith('.xlsx'))throw new Error('Choose an Excel .xlsx file or a .csv file.');
  const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(Buffer.from(await file.arrayBuffer()) as any);
  const sheet=workbook.worksheets[0];if(!sheet)throw new Error('The workbook has no worksheet.');
  const rows:string[][]=[];sheet.eachRow({includeEmpty:false},row=>{const values:string[]=[];for(let i=1;i<=row.cellCount;i++)values.push(cellText(row.getCell(i).value));rows.push(values)});return rows;
}
function parseDate(value:string){if(!value)return null;const input=value.trim();const match=input.match(/^(?:(\d{4})-(\d{2})-(\d{2})|(\d{2})-(\d{2})-(\d{4}))$/);if(match){const year=Number(match[1]??match[6]),month=Number(match[2]??match[5]),day=Number(match[3]??match[4]);const date=new Date(Date.UTC(year,month-1,day));if(date.getUTCFullYear()===year&&date.getUTCMonth()===month-1&&date.getUTCDate()===day)return `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`}throw new Error('ETA must be a valid date in DD-MM-YYYY format.')}
function parseNumber(value:string,integer:boolean){if(!value)return null;const num=Number(value);if(!Number.isFinite(num)||(integer&&!Number.isInteger(num)))throw new Error(integer?'Stock and Back order must be whole numbers.':'Cover must be a number.');return num}

export async function POST(req:Request){
  let client:any;
  try{
    const user=await requireUser();const form=await req.formData();const file=form.get('file');
    if(!(file instanceof File))return NextResponse.json({error:'Choose a CSV or Excel file first.'},{status:400});
    if(file.size>4*1024*1024)return NextResponse.json({error:'Files must be 4 MB or smaller.'},{status:413});
    const rows=await parseFile(file);if(rows.length<2)return NextResponse.json({error:'The file needs a header row and at least one part row.'},{status:400});
    const headerMap=rows[0].map((value,index)=>({index,key:headers[cleanHeader(value)]})).filter(c=>c.key);
    if(!headerMap.some(c=>c.key==='partNo'))return NextResponse.json({error:'A Part no. or Part number column is required.'},{status:400});
    if(rows.length>5001)return NextResponse.json({error:'Import up to 5,000 parts at a time.'},{status:400});
    const allowed=new Set<string>(access[user.role]);const seen=new Set<string>();const valid:{row:number;data:Record<string,any>}[]=[];const errors:string[]=[];const restricted=new Set<string>();
    for(let i=1;i<rows.length;i++){
      const values=rows[i];const data:Record<string,any>={};
      for(const col of headerMap){const key=col.key!;const value=values[col.index]?.trim()??'';if(value!=='')data[key]=value;}
      if(!data.partNo){if(Object.values(data).some(Boolean)&&errors.length<20)errors.push(`Row ${i+1}: Part number is missing.`);continue;}
      // When the sheet does not specify a destination role, attribute the row
      // to the role that imported it (Admin, Sales, Planner, Purchase, or Technical).
      if(!data.assignedRole)data.assignedRole=user.role;
      data.partNo=String(data.partNo).trim();const identity=data.partNo.toLowerCase();if(seen.has(identity)){if(errors.length<20)errors.push(`Row ${i+1}: duplicate part number ${data.partNo}.`);continue}seen.add(identity);
      const blocked=Object.keys(data).filter(k=>fieldNames[k]&&!allowed.has(fieldNames[k]));blocked.forEach(k=>restricted.add(labels[k]));
      for(const key of ['stock','backOrder','amcMonth1','amcMonth2','amcMonth3'])if(data[key]!==undefined){try{data[key]=parseNumber(String(data[key]),['stock','backOrder'].includes(key))}catch(e){if(errors.length<20)errors.push(`Row ${i+1}: ${(e as Error).message}`);data.__invalid=true;break}}
      if(data.__invalid)continue;delete data.__invalid;for(const key of ['amcMonth1','amcMonth2','amcMonth3'])if(data[key]!=null&&data[key]<0){if(errors.length<20)errors.push(`Row ${i+1}: Monthly usage cannot be negative.`);data.__invalid=true;break}if(data.__invalid)continue;delete data.__invalid;
      if(data.eta!==undefined){try{data.eta=parseDate(String(data.eta))}catch(e){if(errors.length<20)errors.push(`Row ${i+1}: ${(e as Error).message}`);continue}}
      if(data.assignedRole!==undefined&&!['Admin','Sales','Planner','Purchase','Technical'].includes(data.assignedRole)){if(errors.length<20)errors.push(`Row ${i+1}: Sign to must be one of the app roles.`);continue}
      valid.push({row:i+1,data});
    }
    if(!valid.length)return NextResponse.json({error:'No importable rows were found.',errors,restrictedFields:[...restricted]},{status:400});
    let created=0,updated=0,skipped=0;const partNumbers:string[]=[];
    if(demoMode){
      const parts=demoParts();
      for(const {data} of valid){const allowedData=Object.fromEntries(Object.entries(data).filter(([key])=>allowed.has(fieldNames[key])));const existing=parts.find(p=>p.partNo.toLowerCase()===data.partNo.toLowerCase());if(existing){for(const [key,value] of Object.entries(allowedData))if(key!=='partNo'){const monthIndex=['amcMonth1','amcMonth2','amcMonth3'].indexOf(key);if(monthIndex>=0){existing.amcMonths[monthIndex]=value as number;const used=existing.amcMonths.filter(v=>v!=null);existing.amc=used.length?used.reduce((a,v)=>a+Number(v),0)/used.length:null}else(existing as any)[key]=value}existing.updatedAt=new Date().toISOString();updated++}else{const part:any={id:nextDemoId(),partNo:data.partNo,description:'',supplier:'',amc:null,amcMonths:[null,null,null],stock:null,backOrder:null,cov:null,eta:null,assignedRole:null,remark:'',comments:'',updatedAt:new Date().toISOString()};for(const [key,value] of Object.entries(allowedData)){const monthIndex=['amcMonth1','amcMonth2','amcMonth3'].indexOf(key);if(monthIndex>=0)part.amcMonths[monthIndex]=value as number;else(part as any)[key]=value}const vals=part.amcMonths.filter((v:any)=>v!=null).map(Number);part.amc=vals.length?vals.reduce((a:number,v:number)=>a+v,0)/vals.length:null;parts.push(part);created++}partNumbers.push(data.partNo)}
    }else{
      client=await db.connect();await client.query('BEGIN');
      for(const {data} of valid){
        const editable=Object.fromEntries(Object.entries(data).filter(([key])=>allowed.has(fieldNames[key])));
        const found=await client.query('SELECT id FROM parts WHERE lower(part_no)=lower($1)',[data.partNo]);
        if(found.rows[0]){
          const fields=Object.keys(editable).filter(k=>k!=='partNo');if(!fields.length){skipped++;continue}
          const values=fields.map(k=>editable[k]);const sets=fields.map((k,j)=>`${fieldNames[k]}=$${j+1}`);sets.push(`updated_by=$${fields.length+1}`,'updated_at=NOW()');
          await client.query(`UPDATE parts SET ${sets.join(',')} WHERE id=$${fields.length+2}`,[...values,user.id,found.rows[0].id]);updated++;
        }else{
          const fields=Object.keys(editable).filter(k=>k!=='partNo');const columns=['part_no',...fields.map(k=>fieldNames[k]),'updated_by'];const values=[data.partNo,...fields.map(k=>editable[k]),user.id];const slots=values.map((_,j)=>`$${j+1}`);
          await client.query(`INSERT INTO parts(${columns.join(',')}) VALUES(${slots.join(',')})`,values);created++;
        }
        partNumbers.push(data.partNo);
      }
      await client.query('COMMIT');
    }
    if(created||updated)await logActivity(user,'Spreadsheet import','Imported parts',`${created} new, ${updated} updated${partNumbers.length?`: ${partNumbers.slice(0,12).join(', ')}${partNumbers.length>12?'…':''}`:''}`);
    return NextResponse.json({created,updated,skipped,errors,restrictedFields:[...restricted]});
  }catch(e){if(client)await client.query('ROLLBACK').catch(()=>{});return NextResponse.json({error:e instanceof Error&&e.message==='UNAUTHORIZED'?'Sign in required.':e instanceof Error?e.message:'Could not import the file.'},{status:e instanceof Error&&e.message==='UNAUTHORIZED'?401:400});}
  finally{client?.release();}
}
