// Only unambiguous, local appearance/size edits may bypass a fresh lookup.
// Unknown wording deliberately falls back to research; identity, photo, scope,
// feature-list and readiness checks still run in the caller.
export function isLocalDesignEdit(feedback:string):boolean{
 const text=feedback.trim().toLowerCase().replace(/[.!]+$/,"").replace(/\s+/g," ").replace(/^please /,"");
 const target="(?:the )?(?:roof|walls?|windows?|doors?|base|building|tower|sign|facade|model)";
 const color="(?:(?:dark|light) )?(?:blue|green|red|gray|grey|brown|tan|yellow|orange|pink|purple|black|white)";
 return new RegExp(`^make ${target} (?:a (?:little|bit) )?(?:darker|lighter|taller|shorter|wider|narrower|thicker|thinner|larger|smaller|${color})$`).test(text)
  ||new RegExp(`^(?:paint|recolor) ${target} (?:${color})$`).test(text)
  ||new RegExp(`^change (?:the )?(?:color|colour) of ${target} to ${color}$`).test(text);
}

// Null fields in the compact scene mean "not applicable". Omit them only in
// input context; the generated output retains its strict schema and all fields.
export function compactSceneContext(scene:unknown):unknown{
 return JSON.parse(JSON.stringify(scene,(_key,value)=>value===null?undefined:value));
}

// Cache the stable instructions and the reference sheet, never a changing
// request suffix. partCatalog and examples are chosen from each request's own
// wording, so they differ between revisions; placing them behind a breakpoint
// would pay the cache-write premium on every call without ever being read.
// Preserve role boundaries: source data remains user content.
export function cacheStableContext(request:Record<string,any>):Record<string,any>{
 if(!["gpt-6.1-sol","gpt-5.6-terra","gpt-5.6-sol","gpt-6-astra"].includes(request.model)||typeof request.instructions!=="string"||!Array.isArray(request.input))return request;
 const {instructions,...rest}=request;
 const breakpoint={mode:"explicit"};
 const prefix:any[]=[{role:"developer",content:[{type:"input_text",text:instructions,prompt_cache_breakpoint:breakpoint}]}];
 const input=request.input.map((message:any)=>({...message,content:Array.isArray(message.content)?message.content.map((block:any)=>({...block})):message.content}));
 const first=input[0];
 if(first?.role==="user"&&first.content?.[0]?.type==="input_text"){
  try{
   const data=JSON.parse(first.content[0].text),stable:Record<string,unknown>={};
   for(const key of ["referenceSheet"]){if(data[key]!==undefined){stable[key]=data[key];delete data[key];}}
   if(Object.keys(stable).length){prefix.push({role:"user",content:[{type:"input_text",text:JSON.stringify(stable),prompt_cache_breakpoint:breakpoint}]});first.content[0].text=JSON.stringify(data);}
  }catch{/* Plain-text requests retain their original content. */}
 }
 return {...rest,prompt_cache_options:{mode:"explicit"},input:[...prefix,...input]};
}
