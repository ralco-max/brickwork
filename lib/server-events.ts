import {generationFailure} from "./generation-errors";

// Comments keep idle transports active while the model thinks or reviews images.
// They carry no pretend progress. Never log prompts, keys, images or raw errors.
export function eventResponse(request:Request,work:(signal:AbortSignal,send:(event:unknown)=>void)=>Promise<void>,options:{timeoutMs:number;heartbeatMs?:number}){
 const abort=new AbortController(),encoder=new TextEncoder();let heartbeat:ReturnType<typeof setInterval>|undefined,timer:ReturnType<typeof setTimeout>|undefined,closed=false;
 const cleanup=()=>{clearInterval(heartbeat);clearTimeout(timer);request.signal.removeEventListener("abort",cancel);};
 const cancel=()=>{closed=true;abort.abort();cleanup();};
 const stream=new ReadableStream<Uint8Array>({start(controller){
  const write=(text:string)=>{if(closed)return;try{controller.enqueue(encoder.encode(text));}catch{cancel();}};
  const send=(event:unknown)=>write(`data: ${JSON.stringify(event)}\n\n`);
  const finish=()=>{if(closed)return;closed=true;cleanup();try{controller.close();}catch{}};
  const report=(failure:ReturnType<typeof generationFailure>)=>{console.error(JSON.stringify({event:"brickwork_request_failed",route:new URL(request.url).pathname,requestId:request.headers.get("cf-ray")||undefined,code:failure.code,upstreamStatus:failure.upstreamStatus,upstreamRequestId:failure.upstreamRequestId}));send({type:"error",message:failure.message,code:failure.code});};
  request.signal.addEventListener("abort",cancel,{once:true});if(request.signal.aborted){cancel();controller.close();return;}
  write(": connected\n\n");heartbeat=setInterval(()=>write(": keepalive\n\n"),options.heartbeatMs??5000);
  timer=setTimeout(()=>{report({message:"The builder took too long to finish. Continue from your saved draft, or lower the detail level.",code:"TIMEOUT"});abort.abort();finish();},options.timeoutMs);
  void (async()=>{try{await work(abort.signal,send);}catch(error){if(!closed&&!abort.signal.aborted)report(generationFailure(error));}finally{finish();}})();
 },cancel});
 return new Response(stream,{headers:{"Content-Type":"text/event-stream","Cache-Control":"no-store, no-transform","X-Accel-Buffering":"no","X-Content-Type-Options":"nosniff"}});
}
