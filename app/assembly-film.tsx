"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {Download,Film,Pause,Play,RotateCcw,Square} from "lucide-react";
import {Dialog,DialogContent,DialogDescription,DialogHeader,DialogTitle} from "@/components/ui/dialog";
import {Slider} from "@/components/ui/slider";
import Viewport from "./viewport";
import type {BuildModel} from "@/lib/models";

const DURATION=18;
export default function AssemblyFilm({model,onClose}:{model:BuildModel;onClose:()=>void}){
 const [progress,setProgress]=useState(0),[playing,setPlaying]=useState(false),[speed,setSpeed]=useState(1),[recording,setRecording]=useState(false),[ready,setReady]=useState(false),[error,setError]=useState(""),[supported,setSupported]=useState(false),[download,setDownload]=useState<{url:string;extension:string}|null>(null);
 const clock=useRef({time:0,playing:false,speed:1,last:0,lastUI:0}),canvas=useRef<HTMLCanvasElement|null>(null),record=useRef<{recorder:MediaRecorder;stream:MediaStream;output:HTMLCanvasElement;context:CanvasRenderingContext2D;chunks:Blob[];cancelled:boolean;stopping:boolean}|null>(null);
 const alive=useRef(true),downloadURL=useRef<string|null>(null),stopTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
 const play=(value:boolean)=>{clock.current.playing=value;clock.current.last=performance.now();setPlaying(value);};
 const seek=(time:number)=>{clock.current.time=time;clock.current.last=performance.now();setProgress(time);};
 const stopRecording=useCallback((cancelled=false)=>{if(stopTimer.current){clearTimeout(stopTimer.current);stopTimer.current=null;}const active=record.current;if(!active)return;active.cancelled=cancelled;if(active.recorder.state!=="inactive")active.recorder.stop();else{active.stream.getTracks().forEach(track=>track.stop());record.current=null;if(alive.current)setRecording(false);}if(cancelled&&alive.current){clock.current.playing=false;setPlaying(false);}},[]);
 useEffect(()=>{
  alive.current=true;setSupported(typeof MediaRecorder!=="undefined"&&typeof HTMLCanvasElement.prototype.captureStream==="function");
  const reduced=window.matchMedia("(prefers-reduced-motion: reduce)").matches;clock.current.time=reduced?1:0;setProgress(clock.current.time);play(!reduced);
  const visibility=()=>{clock.current.last=performance.now();if(document.hidden&&record.current){stopRecording(true);setError("Recording stopped when this tab was hidden. Keep it open and try again.");}};
  document.addEventListener("visibilitychange",visibility);
  return()=>{alive.current=false;clock.current.playing=false;if(stopTimer.current)clearTimeout(stopTimer.current);stopRecording(true);record.current?.stream.getTracks().forEach(track=>track.stop());if(downloadURL.current)URL.revokeObjectURL(downloadURL.current);document.removeEventListener("visibilitychange",visibility);};
 },[stopRecording]);
 const readTime=useCallback(()=>{const c=clock.current,now=performance.now(),elapsed=c.last?Math.min(.08,(now-c.last)/1000):0;c.last=now;if(c.playing)c.time=Math.min(1,c.time+elapsed*c.speed/DURATION);return c.time;},[]);
 const onFrame=useCallback((source:HTMLCanvasElement,time:number)=>{
  const c=clock.current,now=performance.now();if(now-c.lastUI>100||time===1&&c.playing){c.lastUI=now;setProgress(time);}if(time===1&&c.playing){c.playing=false;setPlaying(false);}
  const active=record.current;if(!active)return;const ctx=active.context,w=active.output.width,h=active.output.height;
  ctx.fillStyle="#ffffff";ctx.fillRect(0,0,w,h);const ratio=Math.min(w/source.width,h/source.height),dw=source.width*ratio,dh=source.height*ratio;ctx.drawImage(source,(w-dw)/2,(h-dh)/2,dw,dh);
  ctx.fillStyle="#202a32";ctx.font="600 21px system-ui";ctx.fillText("brickwork",38,43);ctx.fillStyle="#63717b";ctx.font="13px system-ui";ctx.fillText("by ralc",151,43);
  ctx.fillStyle="#202a32";ctx.font="500 20px system-ui";ctx.fillText(model.name.length>65?model.name.slice(0,62)+"…":model.name,38,h-48);ctx.fillStyle="#63717b";ctx.font="12px system-ui";ctx.fillText(`${model.pieces.length.toLocaleString()} PIECES  /  ASSEMBLY FILM`,38,h-25);
  if(time===1&&!active.stopping){active.stopping=true;stopTimer.current=setTimeout(()=>stopRecording(false),180);}
 },[model.name,model.pieces.length,stopRecording]);
 const onCanvas=useCallback((node:HTMLCanvasElement|null)=>{canvas.current=node;if(alive.current){setReady(Boolean(node));if(!node&&record.current){stopRecording(true);setError("The 3D canvas became unavailable. Reload the page to record again.");}}},[stopRecording]);
 function replay(){seek(0);play(true);}
 function exportVideo(){
  if(!canvas.current||!supported||record.current)return;setError("");if(downloadURL.current){URL.revokeObjectURL(downloadURL.current);downloadURL.current=null;setDownload(null);}
  let stream:MediaStream|undefined;
  try{
   const output=document.createElement("canvas");output.width=1280;output.height=720;const context=output.getContext("2d");if(!context)throw Error("Video export could not start in this browser.");context.fillStyle="#ffffff";context.fillRect(0,0,1280,720);
   const mime=["video/webm;codecs=vp9","video/webm;codecs=vp8","video/mp4"].find(type=>MediaRecorder.isTypeSupported(type));if(!mime)throw Error("This browser cannot record this animation. You can still watch and replay it here.");
   stream=output.captureStream(30);const recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:6000000}),active={recorder,stream,output,context,chunks:[] as Blob[],cancelled:false,stopping:false};record.current=active;
   recorder.ondataavailable=event=>{if(event.data.size)active.chunks.push(event.data);};
   recorder.onerror=()=>{if(record.current!==active)return;active.cancelled=true;if(alive.current)setError("The browser stopped recording. Try again or use another browser.");stopRecording(true);};
   recorder.onstop=()=>{active.stream.getTracks().forEach(track=>track.stop());if(record.current!==active)return;record.current=null;if(!alive.current)return;setRecording(false);if(active.cancelled)return;const blob=new Blob(active.chunks,{type:recorder.mimeType});if(!blob.size){setError("The browser returned an empty recording. Please try again.");return;}const url=URL.createObjectURL(blob);downloadURL.current=url;setDownload({url,extension:recorder.mimeType.includes("mp4")?"mp4":"webm"});};
   clock.current.speed=1;setSpeed(1);seek(0);setRecording(true);recorder.start(500);play(true);
  }catch(e){stream?.getTracks().forEach(track=>track.stop());record.current=null;setRecording(false);setError(e instanceof Error?e.message:"Video recording is unavailable.");}
 }
 const filename=(model.name.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")||"brickwork")+"-assembly";
 return <Dialog open onOpenChange={open=>{if(!open){stopRecording(true);onClose();}}}><DialogContent className="assembly-dialog"><DialogHeader className="assembly-heading"><div><p className="eyebrow"><Film size={13}/> THE ASSEMBLY FILM</p><DialogTitle>{model.name}</DialogTitle><DialogDescription>Watch every brick find its place.</DialogDescription></div><span className="film-brand">brickwork <small>by ralc</small></span></DialogHeader>
  <div className="assembly-screen"><Viewport pieces={model.pieces} length={model.length} width={model.width} height={model.height} modelKey={model.name+"-film"} explode={0} stage={100000} selected={null} view="perspective" reset={0} rotate={false} onPick={()=>{}} assembly={{time:readTime,onFrame}} onCanvas={onCanvas}/><div className="film-topline"><span><i/>{recording?"RECORDING":playing?"ASSEMBLING":progress===1?"EVERY PIECE, IN PLACE":"PAUSED"}</span><span>{model.pieces.length.toLocaleString()} PIECES</span></div><span className="film-caption">{progress<.25?"It starts with a few pieces.":progress<.7?"A little closer to your imagination.":progress<.9?"The finishing touches.":"Made of possibilities."}</span></div>
  <div className="assembly-controls"><button className="film-play" disabled={recording||!ready} onClick={()=>{if(progress===1)replay();else play(!playing);}} aria-label={playing?"Pause assembly":"Play assembly"}>{playing?<Pause size={18}/>:<Play size={18}/>}</button><button className="film-replay" disabled={recording||!ready} onClick={replay} aria-label="Replay assembly"><RotateCcw size={17}/></button><Slider aria-label="Assembly timeline" min={0} max={1000} step={1} value={[Math.round(progress*1000)]} disabled={recording||!ready} onValueChange={value=>{play(false);seek(value[0]/1000);}}/><span className="film-time">{Math.floor(progress*DURATION).toString().padStart(2,"0")} / {DURATION}s</span><button className="film-speed" disabled={recording} aria-label={`Playback speed ${speed} times`} onClick={()=>{const value=speed===1?2:speed===2?.5:1;clock.current.speed=value;setSpeed(value);}}>{speed}×</button></div>
  <div className="assembly-footer"><p>A visual celebration of your design.<br/><span>Animation order is not a verified building guide.</span></p>{recording?<button className="button secondary" onClick={()=>stopRecording(true)}><Square size={14}/>Cancel recording</button>:download?<a className="button primary" href={download.url} download={`${filename}.${download.extension}`}><Download size={16}/>Download video</a>:<button className="button primary" disabled={!ready||!supported} onClick={exportVideo}><Download size={16}/>Make video · {DURATION}s</button>}</div>
  {!supported&&<p className="film-note">Video download is unavailable in this browser. Playback and replay still work.</p>}{recording&&<p className="film-note" role="status">Recording the full animation. Keep this tab open; your download will be ready at the end.</p>}{error&&<p className="creation-error" role="alert">{error}</p>}
 </DialogContent></Dialog>;
}
