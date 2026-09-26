import type { Role, User } from './auth';
export const demoMode=!process.env.DATABASE_URL&&process.env.NODE_ENV!=='production';
export const demoUsers: (User&{password:string})[]=[
  {id:1,name:'Avery Morgan',email:'admin@demo.local',role:'Admin',password:'demo1234'},
  {id:2,name:'Sam Rivera',email:'sales@demo.local',role:'Sales',password:'demo1234'},
  {id:3,name:'Jamie Chen',email:'planner@demo.local',role:'Planner',password:'demo1234'},
  {id:4,name:'Taylor Brooks',email:'purchase@demo.local',role:'Purchase',password:'demo1234'},
  {id:5,name:'Riley Patel',email:'technical@demo.local',role:'Technical',password:'demo1234'}
];
export type DemoPart={id:number;partNo:string;description:string;supplier:string;amc:number|null;amcMonths:(number|null)[];stock:number|null;backOrder:number|null;cov:number|null;eta:string|null;assignedRole:Role|null;remark:string;comments:string;updatedAt:string};
export type DemoActivity={id:number;actorName:string;partNo:string;action:string;details:string;createdAt:string};
export type DemoChatAttachment={id:number;fileName:string;contentType:string;size:number};
export type DemoChatMessage={id:number;authorId:number;authorName:string;role:Role;body:string;createdAt:string;attachments:DemoChatAttachment[]};
const initial:DemoPart[]=[];
const state=globalThis as typeof globalThis&{partsPlannerDemoParts?:DemoPart[];partsPlannerDemoNext?:number;partsPlannerDemoNotifications?:Record<number,boolean>;partsPlannerDemoSeen?:Record<number,number>};
export const demoParts=()=>state.partsPlannerDemoParts??(state.partsPlannerDemoParts=initial);
export const nextDemoId=()=>{state.partsPlannerDemoNext=(state.partsPlannerDemoNext??0)+1;return state.partsPlannerDemoNext};
const activityState=globalThis as typeof globalThis&{partsPlannerDemoActivity?:DemoActivity[];partsPlannerDemoActivityNext?:number};
export const demoActivity=()=>activityState.partsPlannerDemoActivity??(activityState.partsPlannerDemoActivity=[]);
export function addDemoActivity(actorName:string,partNo:string,action:string,details:string){activityState.partsPlannerDemoActivityNext=(activityState.partsPlannerDemoActivityNext??0)+1;demoActivity().unshift({id:activityState.partsPlannerDemoActivityNext,actorName,partNo,action,details,createdAt:new Date().toISOString()});}
const chatState=globalThis as typeof globalThis&{partsPlannerDemoChat?:DemoChatMessage[];partsPlannerDemoChatNext?:number;partsPlannerDemoChatFileNext?:number;partsPlannerDemoChatFiles?:Record<number,{fileName:string;contentType:string;size:number;data:Uint8Array}>};
export const demoChatMessages=()=>chatState.partsPlannerDemoChat??(chatState.partsPlannerDemoChat=[]);
export function addDemoChatMessage(author:{id:number;name:string;role:Role},body:string,files:{fileName:string;contentType:string;data:Uint8Array}[]=[]){chatState.partsPlannerDemoChatNext=(chatState.partsPlannerDemoChatNext??0)+1;const attachments=files.map(file=>{chatState.partsPlannerDemoChatFileNext=(chatState.partsPlannerDemoChatFileNext??0)+1;const id=chatState.partsPlannerDemoChatFileNext;(chatState.partsPlannerDemoChatFiles??={})[id]={...file,size:file.data.byteLength};return{id,fileName:file.fileName,contentType:file.contentType,size:file.data.byteLength}});const message={id:chatState.partsPlannerDemoChatNext,authorId:author.id,authorName:author.name,role:author.role,body,createdAt:new Date().toISOString(),attachments};demoChatMessages().push(message);if(demoChatMessages().length>200)demoChatMessages().shift();return message;}
export const demoChatFile=(id:number)=>chatState.partsPlannerDemoChatFiles?.[id];
export const demoNotifications=(id:number)=>state.partsPlannerDemoNotifications?.[id]??true;
export function setDemoNotifications(id:number,value:boolean){state.partsPlannerDemoNotifications??={};state.partsPlannerDemoNotifications[id]=value;}
export const demoSeen=(id:number)=>state.partsPlannerDemoSeen?.[id]??0;
export function setDemoSeen(id:number,value:number){state.partsPlannerDemoSeen??={};state.partsPlannerDemoSeen[id]=value;}
export function demoUser(user:User){return demoUsers.find(u=>u.id===user.id)}
