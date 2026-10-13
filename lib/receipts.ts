// A paid AI call's receipt: what the server charged for it and which model and tier ran, signed with a server secret.
// A build rating cites the receipts of the run it rates, so the owner's ratings by model and cost come from real runs,
// never from what a client claims. The secret is the gallery admin token (the only reader of ratings); without one,
// no receipts are issued and there is no ratings view to protect.
export type ReceiptStage="research"|"design"|"review";
export type Receipt={id:string;stage:ReceiptStage;model:string;tier?:string;nanos:number;at:number};
export const RECEIPT_MAX_AGE_MS=2*86_400_000;
const STAGES:readonly ReceiptStage[]=["research","design","review"];
const encoder=new TextEncoder();
const b64url=(bytes:Uint8Array)=>btoa(String.fromCharCode(...bytes)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
const unb64url=(text:string)=>Uint8Array.from(atob(text.replace(/-/g,"+").replace(/_/g,"/")),c=>c.charCodeAt(0));
const hmacKey=(secret:string)=>crypto.subtle.importKey("raw",encoder.encode(`bricks-receipt:${secret}`),{name:"HMAC",hash:"SHA-256"},false,["sign","verify"]);

export async function signReceipt(secret:string,r:Omit<Receipt,"id"|"at">,now=Date.now()):Promise<string>{
 const body=b64url(encoder.encode(JSON.stringify({i:crypto.randomUUID(),s:r.stage,m:r.model,...(r.tier?{t:r.tier}:{}),n:Math.max(0,Math.round(r.nanos)),a:now})));
 return `${body}.${b64url(new Uint8Array(await crypto.subtle.sign("HMAC",await hmacKey(secret),encoder.encode(body))))}`;
}
/** The receipt, when its signature is this server's and it is under two days old; otherwise null. */
export async function readReceipt(secret:string,token:unknown,now=Date.now()):Promise<Receipt|null>{
 if(typeof token!=="string"||token.length>600)return null;
 const [body,sig,...rest]=token.split(".");if(!body||!sig||rest.length)return null;
 try{
  if(!await crypto.subtle.verify("HMAC",await hmacKey(secret),unb64url(sig),encoder.encode(body)))return null;
  const v=JSON.parse(new TextDecoder().decode(unb64url(body))) as {i?:unknown;s?:unknown;m?:unknown;t?:unknown;n?:unknown;a?:unknown};
  if(typeof v.i!=="string"||!STAGES.includes(v.s as ReceiptStage)||typeof v.m!=="string"||!Number.isSafeInteger(v.n)||!Number.isSafeInteger(v.a))return null;
  if((v.a as number)>now+60_000||now-(v.a as number)>RECEIPT_MAX_AGE_MS)return null;
  return {id:v.i,stage:v.s as ReceiptStage,model:v.m,...(typeof v.t==="string"?{tier:v.t}:{}),nanos:v.n as number,at:v.a as number};
 }catch{return null;}
}
/** A route's usage callback with the call's receipt attached (unchanged when no secret is configured). */
export function withReceipt(secret:string|undefined,stage:ReceiptStage,tier?:string){
 return async<U extends {cost:number;model:string}>(usage:U):Promise<U&{receipt?:string}>=>secret?{...usage,receipt:await signReceipt(secret,{stage,model:usage.model,...(tier?{tier}:{}),nanos:usage.cost*1e9})}:usage;
}
