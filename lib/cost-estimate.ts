import {PRICED_MODELS,QUALITY_MODELS,tokenCost} from "./ai-budget";
import type {DesignBrief} from "./design-project";

// Planning estimates, not quotes: published rates × typical token counts measured from real request
// bodies in the 2026-10 cost audit (outputs are assumptions until the usage logs calibrate them).
// Lookup and review always run on Sol 6.1 Low; only the design pass uses the chosen tier's model.
export type Quality=NonNullable<DesignBrief["quality"]>;
type Call={model:string;input:number;output:number;searches?:number};
const LOOKUP:Call={model:"gpt-6.1-sol",input:17_400,output:1_200,searches:1},REVIEW:Call={model:"gpt-6.1-sol",input:8_500,output:2_300};
const DESIGN={input:13_700,output:14_000},CAREFUL_REASONING=12_000,REPAIR={input:22_300,output:6_000},REVISION={input:16_000,output:5_000};
const SEARCH_USD=.01;
const callUsd=(c:Call)=>tokenCost(c.input,c.output,0,PRICED_MODELS[c.model])/1e9+(c.searches||0)*SEARCH_USD;
const designCall=(q:Quality,extra=0):Call=>({model:QUALITY_MODELS[q],input:DESIGN.input,output:DESIGN.output+extra});

/** Typical USD for a first build at this tier: lookup, design and review. */
export function buildCostUsd(quality:Quality="sol_low"){
 return callUsd(LOOKUP)+callUsd(designCall(quality,quality==="sol_medium"?CAREFUL_REASONING:0))+callUsd(REVIEW);
}
/** One automatic repair when a first build has a clear problem: a design pass on the tier's own model, then the re-check. */
export const repairCostUsd=(quality:Quality="sol_low")=>callUsd({model:QUALITY_MODELS[quality],input:REPAIR.input,output:REPAIR.output+(quality==="sol_medium"?CAREFUL_REASONING:0)})+callUsd(REVIEW);

/** One send from the composer: a revision pass on the tier's model (only changed shapes come back), then its check. */
export const revisionCostUsd=(quality:Quality="sol_low")=>callUsd({model:QUALITY_MODELS[quality],input:REVISION.input,output:REVISION.output+(quality==="sol_medium"?CAREFUL_REASONING:0)})+callUsd(REVIEW);
/** Review again: the visual check alone. */
export const reviewCostUsd=()=>callUsd(REVIEW);
// Shown as a range: a second lookup, a longer scene or a repair moves the real figure.
const nickel=(usd:number)=>Math.max(.05,Math.round(usd*20)/20);
export function costRange(quality:Quality="sol_low"):[number,number]{const typical=buildCostUsd(quality);return [nickel(typical*.75),nickel(typical*1.5)];}
const usd=(v:number)=>`$${v.toFixed(2)}`;
export const costRangeLabel=(quality:Quality="sol_low")=>{const [low,high]=costRange(quality);return `≈ ${usd(low)}–${usd(high).slice(1)}`;};
export const repairCostLabel=(quality:Quality="sol_low")=>`≈ +${usd(nickel(repairCostUsd(quality)))}`;
export const revisionCostLabel=(quality:Quality="sol_low")=>`≈ ${usd(nickel(revisionCostUsd(quality)))}`;
export const reviewCostLabel=()=>`≈ ${usd(nickel(reviewCostUsd()))}`;

// The tiers people choose between. Legacy designers stay valid in saved briefs but are offered only under
// Advanced, and only on a personal key.
export const OUTCOME_TIERS=[{id:"sol_low",name:"Everyday",text:"Quick, faithful builds"},{id:"sol_medium",name:"Careful",text:"More thought for complex subjects"}] as const satisfies readonly {id:Quality;name:string;text:string}[];
export const LEGACY_TIERS=[{id:"standard",name:"Standard",text:"GPT-5.6 Terra"},{id:"better",name:"Better",text:"GPT-5.6 Sol"},{id:"best",name:"Best",text:"GPT-6 Astra"}] as const satisfies readonly {id:Quality;name:string;text:string}[];
export const isLegacyTier=(q:DesignBrief["quality"])=>LEGACY_TIERS.some(t=>t.id===q);
export const tierName=(q:DesignBrief["quality"])=>[...OUTCOME_TIERS,...LEGACY_TIERS].find(t=>t.id===(q||"sol_low"))!.name;
// A share keeps its creator's brief. Someone remixing it gets the matching outcome tier, never a hidden legacy
// designer on the studio key (Best on Astra costs several times Everyday, and Refine shows no tier).
export const studioTier=(q:DesignBrief["quality"]):Quality=>q==="best"||q==="better"?"sol_medium":!q||q==="standard"?"sol_low":q;
export function withStudioTier<T extends {design?:{brief:DesignBrief}}>(m:T):T{const d=m.design;return d&&isLegacyTier(d.brief.quality)?{...m,design:{...d,brief:{...d.brief,quality:studioTier(d.brief.quality)}}}:m;}
