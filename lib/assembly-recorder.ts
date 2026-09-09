"use client";
import {useCallback,useEffect,useRef,useState} from "react";

type Options={name:string;pieces:number;onStart:()=>void;onDone:(done:()=>void)=>void};
type Active={recorder:MediaRecorder;stream:MediaStream;output:HTMLCanvasElement;context:CanvasRenderingContext2D;chunks:Blob[];cancelled:boolean;stopping:boolean};

// Records the interactive viewport while the intro assembly replays, and hands
// back a downloadable clip. The viewport itself is untouched: frames are copied
// from its canvas as the assembly clock advances.
export function useAssemblyRecorder({name,pieces,onStart,onDone}:Options){
 const canvas=useRef<HTMLCanvasElement|null>(null),active=useRef<Active|null>(null),alive=useRef(true),url=useRef<string|null>(null),stopTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
 const [recording,setRecording]=useState(false),[supported,setSupported]=useState(false),[download,setDownload]=useState<{url:string;filename:string}|null>(null),[error,setError]=useState("");
 const stop=useCallback((cancelled:boolean)=>{
  if(stopTimer.current){clearTimeout(stopTimer.current);stopTimer.current=null;}
  const current=active.current;if(!current)return;current.cancelled=cancelled;
  if(current.recorder.state!=="inactive")current.recorder.stop();else{current.stream.getTracks().forEach(track=>track.stop());active.current=null;if(alive.current)setRecording(false);}
 },[]);
 useEffect(()=>{
  alive.current=true;setSupported(typeof MediaRecorder!=="undefined"&&typeof HTMLCanvasElement.prototype.captureStream==="function");
  const visibility=()=>{if(document.hidden&&active.current){stop(true);setError("Recording stopped when this tab was hidden. Keep it open and try again.");}};
  document.addEventListener("visibilitychange",visibility);
  return()=>{alive.current=false;stop(true);if(url.current)URL.revokeObjectURL(url.current);document.removeEventListener("visibilitychange",visibility);};
 },[stop]);
 const onCanvas=useCallback((node:HTMLCanvasElement|null)=>{canvas.current=node;if(!node&&active.current){stop(true);if(alive.current)setError("The 3D canvas became unavailable. Reload the page to record again.");}},[stop]);
 const onFrame=useCallback((source:HTMLCanvasElement,time:number)=>{
  const current=active.current;if(!current)return;const ctx=current.context,w=current.output.width,h=current.output.height;
  ctx.fillStyle="#ffffff";ctx.fillRect(0,0,w,h);const ratio=Math.min(w/source.width,h/source.height),dw=source.width*ratio,dh=source.height*ratio;ctx.drawImage(source,(w-dw)/2,(h-dh)/2,dw,dh);
  ctx.fillStyle="#202a32";ctx.font="600 21px system-ui";ctx.fillText("brickwork",38,43);ctx.fillStyle="#63717b";ctx.font="13px system-ui";ctx.fillText("by ralc",151,43);
  ctx.fillStyle="#202a32";ctx.font="500 20px system-ui";ctx.fillText(name.length>65?name.slice(0,62)+"…":name,38,h-48);ctx.fillStyle="#63717b";ctx.font="12px system-ui";ctx.fillText(`${pieces.toLocaleString()} PIECES  /  ASSEMBLY`,38,h-25);
  if(time>=1&&!current.stopping){current.stopping=true;stopTimer.current=setTimeout(()=>stop(false),180);}
 },[name,pieces,stop]);
 const start=useCallback(()=>{
  if(!canvas.current||active.current)return;setError("");if(url.current){URL.revokeObjectURL(url.current);url.current=null;setDownload(null);}
  let stream:MediaStream|undefined;
  try{
   const output=document.createElement("canvas");output.width=1280;output.height=720;const context=output.getContext("2d");if(!context)throw Error("Video export could not start in this browser.");
   const mime=["video/webm;codecs=vp9","video/webm;codecs=vp8","video/mp4"].find(type=>MediaRecorder.isTypeSupported(type));if(!mime)throw Error("This browser cannot record the animation.");
   stream=output.captureStream(30);const recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:6000000}),current:Active={recorder,stream,output,context,chunks:[],cancelled:false,stopping:false};active.current=current;
   recorder.ondataavailable=event=>{if(event.data.size)current.chunks.push(event.data);};
   recorder.onerror=()=>{if(active.current!==current)return;current.cancelled=true;if(alive.current)setError("The browser stopped recording. Try again or use another browser.");stop(true);};
   recorder.onstop=()=>{current.stream.getTracks().forEach(track=>track.stop());if(active.current!==current)return;active.current=null;if(!alive.current)return;setRecording(false);if(current.cancelled)return;const blob=new Blob(current.chunks,{type:recorder.mimeType});if(!blob.size){setError("The browser returned an empty recording. Please try again.");return;}const link=URL.createObjectURL(blob);url.current=link;const filename=(name.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")||"brickwork")+"-assembly."+(recorder.mimeType.includes("mp4")?"mp4":"webm");setDownload({url:link,filename});};
   setRecording(true);recorder.start(500);onDone(()=>{/* the frame at time 1 stops the recorder */});onStart();
  }catch(e){stream?.getTracks().forEach(track=>track.stop());active.current=null;setRecording(false);setError(e instanceof Error?e.message:"Video recording is unavailable.");}
 },[name,onDone,onStart,stop]);
 return {supported,recording,download,error,start,cancel:()=>stop(true),onCanvas,onFrame};
}
