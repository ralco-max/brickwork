// Draws the committed placeholder "photos" for the accuracy harness's photo cases.
// They are labelled drawings, not photographs: they exercise the photo plumbing
// (data URLs, photo counts, review/judge inputs) at $0. Real fidelity needs real
// photos; see README.md. Run: node tests/fixtures/accuracy/photos/make-placeholders.mjs
import {writeFile,mkdir} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const here=dirname(fileURLToPath(import.meta.url));
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'/opt/node22/lib/node_modules/playwright/index.mjs');
const browser=await chromium.launch();
try{
 const page=await browser.newPage();
 const shots=await page.evaluate(()=>{
  const out={};
  const draw=(name,fn)=>{const c=document.createElement('canvas');c.width=1024;c.height=768;const g=c.getContext('2d');fn(g);g.fillStyle='rgba(0,0,0,.55)';g.fillRect(0,728,1024,40);g.fillStyle='#fff';g.font='22px sans-serif';g.fillText('PLACEHOLDER DRAWING for the Bricks accuracy harness. Replace with a real photo.',16,756);out[name]=c.toDataURL('image/jpeg',.86);};
  const sky=(g,a,b)=>{const s=g.createLinearGradient(0,0,0,768);s.addColorStop(0,a);s.addColorStop(1,b);g.fillStyle=s;g.fillRect(0,0,1024,768);};
  const rect=(g,c,x,y,w,h)=>{g.fillStyle=c;g.fillRect(x,y,w,h);};
  const poly=(g,c,pts)=>{g.fillStyle=c;g.beginPath();g.moveTo(...pts[0]);for(const p of pts.slice(1))g.lineTo(...p);g.closePath();g.fill();};
  const disc=(g,c,x,y,rx,ry=rx)=>{g.fillStyle=c;g.beginPath();g.ellipse(x,y,rx,ry,0,0,Math.PI*2);g.fill();};
  // A two-storey house: tan siding, red roof with two dormers, covered porch with white columns.
  draw('photo-house/1.jpg',g=>{sky(g,'#9cc7ef','#e8f2fb');rect(g,'#5f9b45',0,560,1024,208);rect(g,'#d8c39a',230,300,560,270);poly(g,'#9b2f25',[[200,300],[820,300],[700,150],[320,150]]);
   for(const x of [380,560]){rect(g,'#d8c39a',x,190,90,80);poly(g,'#9b2f25',[[x-12,192],[x+102,192],[x+45,150]]);rect(g,'#2c3e57',x+20,210,50,45);}
   rect(g,'#f3f0e8',250,420,520,14);for(const x of [260,420,600,750])rect(g,'#f3f0e8',x,434,14,136);rect(g,'#5b3a22',480,450,70,120);for(const x of [300,640])rect(g,'#2c3e57',x,460,80,70);for(const x of [300,640])rect(g,'#2c3e57',x,330,80,60);rect(g,'#b9b2a6',440,570,150,22);});
  // A sitting dog: reddish-brown coat, white chest, floppy ears, curled tail.
  draw('photo-pet/1.jpg',g=>{sky(g,'#efe6d8','#cdbfa8');rect(g,'#8c7b66',0,600,1024,168);disc(g,'#8a4b24',520,470,150,170);disc(g,'#f1e7d6',470,450,60,110);disc(g,'#8a4b24',470,260,110,100);disc(g,'#5a2e14',380,280,40,85);disc(g,'#5a2e14',560,280,40,85);disc(g,'#c98d5c',430,300,55,40);disc(g,'#111',412,290,12);disc(g,'#111',462,240,10);disc(g,'#111',520,240,10);
   for(const x of [430,520])rect(g,'#8a4b24',x,560,50,80);for(const x of [430,520])disc(g,'#f1e7d6',x+25,642,32,14);g.strokeStyle='#8a4b24';g.lineWidth=34;g.lineCap='round';g.beginPath();g.moveTo(650,560);g.bezierCurveTo(760,560,780,430,700,420);g.stroke();});
  // A blue hatchback, side view, black roof rack, two visible wheels.
  draw('photo-vehicle/1.jpg',g=>{sky(g,'#bcd3e6','#e9eef2');rect(g,'#555b61',0,560,1024,208);rect(g,'#ddd',0,640,1024,8);poly(g,'#1f5fa8',[[160,520],[860,520],[880,430],[760,410],[660,300],[360,300],[260,410],[150,440]]);
   poly(g,'#22303d',[[380,320],[500,320],[500,410],[300,410]]);poly(g,'#22303d',[[520,320],[640,320],[730,410],[520,410]]);rect(g,'#111',360,282,300,10);for(const x of [390,500,610])rect(g,'#111',x,282,10,22);
   for(const x of [300,720]){disc(g,'#111',x,540,70);disc(g,'#aab1b8',x,540,32);}rect(g,'#f4e9a8',845,450,25,20);rect(g,'#c33',152,450,18,20);});
  // A DC Metro-style station: coffered concrete vault, side platforms, silver train on the left track.
  const metro=(g,shift)=>{sky(g,'#2a2724','#4a443d');
   for(let r=0;r<7;r++){const y=40+r*48;for(let k=-6;k<=6;k++){const w=900-r*110,x=512+shift-w/2+(k+6)*w/13;rect(g,`rgb(${120-r*8},${112-r*8},${100-r*8})`,x+4,y+4,w/13-8,40);rect(g,`rgb(${70-r*5},${64-r*5},${58-r*5})`,x+14,y+14,w/13-28,20);}}
   poly(g,'#7c6253',[[0,768],[300+shift,430],[400+shift,430],[260,768]]);poly(g,'#7c6253',[[1024,768],[724+shift,430],[624+shift,430],[764,768]]);rect(g,'#f6e7a1',0,700,1024,4);
   poly(g,'#2b2b2b',[[260,768],[400+shift,430],[624+shift,430],[764,768]]);poly(g,'#c9ccd0',[[230,700],[380+shift,420],[470+shift,420],[440,700]]);for(let i=0;i<5;i++)rect(g,'#1c2a3a',300+i*26+shift*.5,520-i*18,18,40);rect(g,'#b22',250,610,170,10);
   for(let i=0;i<8;i++)disc(g,'#ffe9a0',280+i*14+shift*.3,740-i*40,5);};
  draw('photo-dc-metro/1.jpg',g=>metro(g,0));
  draw('photo-dc-metro/2.jpg',g=>metro(g,90));
  return out;
 });
 for(const [name,url] of Object.entries(shots)){const file=join(here,name);await mkdir(dirname(file),{recursive:true});await writeFile(file,Buffer.from(url.split(',')[1],'base64'));console.log(name,Math.round(url.length/1024),'KB data URL');}
}finally{await browser.close();}
