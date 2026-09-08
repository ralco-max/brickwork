// Both the provider stream and the browser stream are SSE. Handle arbitrary
// network chunk boundaries, CRLF, multiple data lines and UTF-8 safely.
export async function* readEvents(body:ReadableStream<Uint8Array>){
 const reader=body.getReader(),decoder=new TextDecoder();let buffer="";
 try{while(true){const {done,value}=await reader.read();buffer+=done?decoder.decode():decoder.decode(value,{stream:true});buffer=buffer.replace(/\r\n/g,"\n");if(done&&buffer.trim())buffer+="\n\n";
  let boundary;while((boundary=buffer.indexOf("\n\n"))!==-1){const frame=buffer.slice(0,boundary);buffer=buffer.slice(boundary+2);const data=frame.split("\n").filter(line=>line.startsWith("data:")).map(line=>line.slice(5).trimStart()).join("\n");if(data&&data!=="[DONE]")yield JSON.parse(data);}
  if(buffer.length>250000)throw Error("The response stream exceeded its limit.");if(done)break;
 }}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
}
