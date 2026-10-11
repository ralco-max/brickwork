import type {RequestUsage} from "@/lib/ai-budget";
export type UsageStage="research"|"design"|"review";
export type RunUsageEntry=RequestUsage&{stage:UsageStage};
const stages:UsageStage[]=["research","design","review"];
const names={research:"Research",design:"Design",review:"Review"};
export default function RunUsage({entries,referenceReused}:{entries:RunUsageEntry[];referenceReused:boolean}){
 return <details className="run-usage"><summary>Cost breakdown</summary><div className="run-usage-content">
 {referenceReused&&<p>Saved references reused · no new research charge</p>}
 {stages.map(stage=>{const rows=entries.filter(row=>row.stage===stage);if(!rows.length)return null;const sum=(key:keyof RequestUsage)=>rows.reduce((total,row)=>total+(typeof row[key]==="number"?row[key] as number:0),0);return <div className="run-usage-stage" key={stage}><strong>{names[stage]} <span>${sum("cost").toFixed(3)}</span></strong><small>{rows.length} {rows.length===1?"call":"calls"} · {sum("inputTokens").toLocaleString()} input · {sum("outputTokens").toLocaleString()} output tokens</small><small>{sum("cachedTokens").toLocaleString()} cached · {sum("cacheWriteTokens").toLocaleString()} written to cache · {sum("reasoningTokens").toLocaleString()} reasoning tokens{sum("searchCalls")>0?` · ${sum("searchCalls")} searches`:""}</small></div>;})}
 <p>Cached tokens are included in input; reasoning is included in output. Completed calls only; the budget may also hold funds for unfinished requests.</p>
 </div></details>;
}
