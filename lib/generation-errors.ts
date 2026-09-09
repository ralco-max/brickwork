export class GenerationError extends Error{
 constructor(message:string,public code:string,public upstreamStatus?:number,public upstreamRequestId?:string){super(message);this.name="GenerationError";}
}
export async function upstreamError(response:Response){
 let code="";try{code=(await response.json()).error?.code||"";}catch{}
 const status=response.status,id=response.headers.get("x-request-id")||undefined;
 if(status===401)return new GenerationError("Your API key was rejected. Open AI settings and reconnect with a valid key.","AI_AUTH",status,id);
 if(status===429)return new GenerationError(code==="insufficient_quota"?"This API account has no available credits. Add credits in OpenAI billing, then continue your design.":"The AI account is temporarily rate limited. Wait a moment, then continue your design.",code==="insufficient_quota"?"AI_QUOTA":"AI_RATE_LIMIT",status,id);
 if(status===403||status===404)return new GenerationError("This API account cannot access the studio’s AI model. Check model access in your OpenAI account.","AI_MODEL_ACCESS",status,id);
 if(status===400)return new GenerationError("The AI service rejected the design request. Your draft is kept. Please report this message so we can fix the request.","AI_REQUEST",status,id);
 return new GenerationError("The AI service is unavailable. Your draft is kept. Try again in a moment.","AI_UNAVAILABLE",status,id);
}
function describeZod(error:Error){const issues=(error as unknown as {issues?:{path?:(string|number)[];message?:string}[]}).issues||[];const first=issues[0];if(!first)return "schema mismatch";return `${(first.path||[]).join(".")||"shape"} ${String(first.message||"").slice(0,80)}`.trim();}
export function generationFailure(error:unknown){
 if(error instanceof GenerationError)return {message:error.message,code:error.code,upstreamStatus:error.upstreamStatus,upstreamRequestId:error.upstreamRequestId};
 if(error instanceof TypeError||error instanceof Error&&/network|fetch|connection|terminated/i.test(error.message))return {message:"The connection to the builder was interrupted. Continue from the saved draft when you’re ready.",code:"CONNECTION_LOST"};
 if(error instanceof Error&&(/outside the build area|no volume|too complex|duplicate shape IDs|repeats too many|shape limit|incomplete design|too large/.test(error.message)||error.name==="ZodError"||error instanceof SyntaxError))return {message:error.name==="ZodError"?`A generated shape was invalid: ${describeZod(error)}. The builder needs to repair the geometry.`:error instanceof SyntaxError?"A generated shape was invalid. The builder needs to repair the geometry.":error.message,code:"INVALID_GEOMETRY"};
 return {message:"The builder could not finish this request. Your existing draft is kept. Try again.",code:"GENERATION_FAILED"};
}
