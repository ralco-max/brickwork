import assert from 'node:assert/strict';
import test from 'node:test';
import {build} from 'esbuild';
const bundle=await build({entryPoints:['hooks/use-visual-viewport.ts'],bundle:true,platform:'node',format:'esm',write:false});
const {visualViewportStyle,trackVisualViewport}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const HEIGHT='--visual-viewport-height',TOP='--visual-viewport-top';

function target(values={}){
 const listeners=new Map();return {...values,addEventListener(type,listener){if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(listener);},removeEventListener(type,listener){listeners.get(type)?.delete(listener);},emit(type){for(const listener of listeners.get(type)||[])listener();},listenerCount(){return [...listeners.values()].reduce((count,set)=>count+set.size,0);}};
}
function fixture({visual=true}={}){
 const values=new Map(),priorities=new Map(),frames=new Map();let next=0;
 const style={getPropertyValue:key=>values.get(key)||'',getPropertyPriority:key=>priorities.get(key)||'',setProperty(key,value,priority=''){values.set(key,value);priorities.set(key,priority);},removeProperty(key){const previous=values.get(key)||'';values.delete(key);priorities.delete(key);return previous;}};
 const viewport=visual?target({height:780,offsetTop:0,scale:1}):null,media=target({matches:true}),win=target({innerWidth:390,innerHeight:844,visualViewport:viewport,matchMedia(query){assert.equal(query,'(max-width: 1024px)');return media;},requestAnimationFrame(callback){frames.set(++next,callback);return next;},cancelAnimationFrame(id){frames.delete(id);}});
 return {win,viewport,media,style,frames,flush(){const pending=[...frames.values()];frames.clear();pending.forEach(fn=>fn());}};
}

test('keyboard open/close and viewport panning produce compact overlay height and top offset',()=>{
 assert.deepEqual(visualViewportStyle({width:390,height:780,offsetTop:0,scale:1}),{[HEIGHT]:'780px',[TOP]:'0px'});
 assert.deepEqual(visualViewportStyle({width:390,height:352.125,offsetTop:87.5,scale:1}),{[HEIGHT]:'352.13px',[TOP]:'87.5px'});
 assert.deepEqual(visualViewportStyle({width:844,height:390,offsetTop:0,scale:1}),{[HEIGHT]:'390px',[TOP]:'0px'});
 assert.deepEqual(visualViewportStyle({width:932,height:430,offsetTop:0,scale:1}),{[HEIGHT]:'430px',[TOP]:'0px'});
 assert.deepEqual(visualViewportStyle({width:390,height:780,offsetTop:-.25}),{[HEIGHT]:'780px',[TOP]:'0px'});
});

test('SSR, desktop, pinch zoom and invalid measurements leave normal CSS layout in control',()=>{
 assert.deepEqual(visualViewportStyle(),{});
 for(const metrics of [{width:1025,height:780},{width:390,height:300,scale:2},{width:390,height:300,scale:.8},{width:0,height:780},{width:390,height:0},{width:390,height:NaN},{width:390,height:500,offsetTop:Infinity}])assert.deepEqual(visualViewportStyle(metrics),{});
 assert.equal(visualViewportStyle({width:390,height:500,scale:1.0001})[HEIGHT],'500px','tolerates normal floating-point scale noise');
});

test('one listener set coalesces keyboard events, resets after zoom/desktop and cancels cleanly',()=>{
 const f=fixture();f.style.setProperty(HEIGHT,'99vh','important');f.style.setProperty('--unrelated','keep');
 const stop=trackVisualViewport(f.win,f.style);assert.equal(f.style.getPropertyValue(HEIGHT),'780px');assert.equal(f.viewport.listenerCount(),2);assert.equal(f.win.listenerCount(),1);assert.equal(f.media.listenerCount(),1);
 f.viewport.height=350;f.viewport.offsetTop=64;f.viewport.emit('resize');f.viewport.emit('scroll');f.win.emit('resize');assert.equal(f.frames.size,1);f.flush();assert.equal(f.style.getPropertyValue(HEIGHT),'350px');assert.equal(f.style.getPropertyValue(TOP),'64px');
 f.viewport.scale=2;f.viewport.emit('resize');f.flush();assert.equal(f.style.getPropertyValue(HEIGHT),'');assert.equal(f.style.getPropertyValue(TOP),'');
 f.viewport.scale=1;f.viewport.height=780;f.viewport.offsetTop=0;f.viewport.emit('resize');f.flush();assert.equal(f.style.getPropertyValue(HEIGHT),'780px');
 f.win.innerWidth=1200;f.media.matches=false;f.media.emit('change');f.flush();assert.equal(f.style.getPropertyValue(HEIGHT),'');
 f.win.innerWidth=390;f.media.matches=true;f.media.emit('change');assert.equal(f.frames.size,1);stop();assert.equal(f.frames.size,0);assert.equal(f.viewport.listenerCount()+f.win.listenerCount()+f.media.listenerCount(),0);
 assert.equal(f.style.getPropertyValue(HEIGHT),'99vh');assert.equal(f.style.getPropertyPriority(HEIGHT),'important');assert.equal(f.style.getPropertyValue(TOP),'');assert.equal(f.style.getPropertyValue('--unrelated'),'keep');
 f.viewport.emit('resize');f.win.emit('resize');f.media.emit('change');assert.equal(f.frames.size,0);
});

test('browsers without visualViewport use the resized window height without an offset',()=>{
 const f=fixture({visual:false}),stop=trackVisualViewport(f.win,f.style);assert.equal(f.style.getPropertyValue(HEIGHT),'844px');assert.equal(f.style.getPropertyValue(TOP),'0px');
 f.win.innerHeight=360;f.win.emit('resize');f.flush();assert.equal(f.style.getPropertyValue(HEIGHT),'360px');stop();assert.equal(f.win.listenerCount()+f.media.listenerCount(),0);
});
