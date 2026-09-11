"use client";
import {useEffect,useRef,useState} from "react";
import {KeyRound,LoaderCircle} from "lucide-react";
import {Input} from "@/components/ui/input";
import type {BudgetSnapshot} from "@/lib/ai-budget";

type Props={configured:boolean|null;apiKey:string;busy:boolean;expanded:boolean;onExpand:(value:boolean)=>void;setup:boolean;budget:BudgetSnapshot|null;onBudget:(budget:BudgetSnapshot|null)=>void;onConnect:(key:string)=>void;onForget:()=>void;active:boolean};
const usd=(value:number)=>`$${value.toFixed(2)}`;
export default function AIConnection({configured,apiKey,busy,expanded,onExpand,setup,budget,onBudget,onConnect,onForget,active}:Props){
 const connectionAbort=useRef<AbortController|null>(null);
 useEffect(()=>()=>connectionAbort.current?.abort(),[active]);
 const [keyInput,setKeyInput]=useState(""),[connecting,setConnecting]=useState(false),[error,setError]=useState("");
 useEffect(()=>{
  if(!active||busy||!apiKey&&!configured)return;
  const abort=new AbortController();
  void fetch("/api/budget",{cache:"no-store",signal:abort.signal,headers:apiKey?{"x-brickwork-api-key":apiKey}:{}}).then(async response=>{
   const data=await response.json();if(!response.ok)throw Error(data.error||"Your budget could not be checked.");
   onBudget(data.budget);setError("");
  }).catch(e=>{if(!abort.signal.aborted){onBudget(null);setError(e instanceof Error?e.message:"Your budget could not be checked.");}});
  return()=>abort.abort();
 },[active,apiKey,configured,busy,onBudget]);
 useEffect(()=>{if(!expanded||!active)setKeyInput("");},[expanded,active]);
 async function connect(){
  if(connecting||!active)return;setConnecting(true);setError("");const key=keyInput.trim(),abort=new AbortController();connectionAbort.current=abort;
  try{
   const response=await fetch("/api/budget",{cache:"no-store",signal:abort.signal,headers:{"x-brickwork-api-key":key}}),data=await response.json();
   if(!response.ok)throw Error(data.error||"Your budget could not be checked.");
   abort.signal.throwIfAborted();onBudget(data.budget);setKeyInput("");onConnect(key);
  }catch(e){if(!abort.signal.aborted)setError(e instanceof Error?e.message:"Your connection could not be saved.");}
  finally{setConnecting(false);}
 }
 return <div className="ai-connection">
  <div className="generation-connection"><span className={configured||apiKey?"is-connected":""}><i/>{apiKey?"Your API key":configured===null?"Checking AI connection…":configured?"Studio AI":"Your AI, your $10 budget"}</span><button disabled={busy||connecting} aria-expanded={expanded} onClick={()=>onExpand(!expanded)}><KeyRound size={13}/>{configured||apiKey?"Settings":"Connect"}</button></div>
  {(apiKey||configured)&&<div className="ai-budget" aria-label="Brickwork AI budget"><div><strong>{budget?usd(budget.remaining):"$10.00"}<small>{budget?"available":"total limit"}</small></strong><span>{budget?`${usd(budget.spent)} used · $10 limit`:"Checking budget…"}</span></div><meter min={0} max={10} value={budget?Math.min(10,budget.spent+budget.held):0} aria-label="AI budget used or held"/>{!!budget?.held&&<p>{usd(budget.held)} held for active or interrupted requests.</p>}</div>}
  {expanded&&<div className="connection-card"><strong>Your key. Room to create.</strong><p>Add an OpenAI API key. Brickwork stops new requests before they would exceed a $10 total budget for this key.</p>
   <label htmlFor="generation-key">OpenAI API key</label><Input id="generation-key" type="password" autoComplete="off" spellCheck={false} value={keyInput} onChange={e=>setKeyInput(e.target.value)} placeholder="sk-…" maxLength={512} disabled={connecting}/>
   <div className="connection-actions"><a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer">Get a key</a><button className="button secondary" disabled={keyInput.trim().length<20||connecting||busy} onClick={()=>void connect()}>{connecting?<><LoaderCircle size={14} className="spin"/>Checking budget</>:setup?"Connect & build":"Use this key"}</button></div>
   <details className="budget-details"><summary>How the $10 limit works</summary><p>Includes new designs, reference-based reviews and revisions. The budget persists across tabs and reloads. It starts with usage in Brickwork from this update; past usage, other apps and taxes are outside this limit.</p><p>We reserve each request’s maximum cost, then release the difference when OpenAI reports usage. If a request is interrupted without final usage, its reservation stays held. Costs use the published standard token rates for the selected model.</p><p>Your key stays in memory for this tab and is sent through Brickwork’s server to OpenAI. Only a one-way fingerprint and spending amounts are saved. <a href="https://developers.openai.com/api/docs/pricing" target="_blank" rel="noreferrer">View model pricing</a>.</p></details>
   {apiKey&&<button className="forget-key" disabled={busy||connecting} onClick={()=>{setKeyInput("");setError("");onForget();}}>Disconnect my key</button>}
  </div>}
  {error&&<p className="budget-error" role="alert">{error}</p>}
 </div>;
}
