import {COLORS,PARTS,InventoryRow} from "@/lib/bridge";
export default function PartImage({row}:{row:InventoryRow}){
 const p=PARTS[row.part],c=COLORS[row.color].hex;
 const scale=62/(p.w+p.d),height=p.h===3?18:7;
 const point=(x:number,z:number,y=0)=>[48+(x-z)*scale,24+(x+z)*scale*.48-y];
 const pts=(coords:number[][])=>coords.map(v=>v.join(",")).join(" ");
 const a=point(0,0),b=point(p.w,0),d=point(0,p.d),e=point(p.w,p.d);
 const studs=[];if(!row.part.startsWith("306"))for(let x=0;x<p.w;x++)for(let z=0;z<p.d;z++){const q=point(x+.5,z+.5,height+2);studs.push(<g key={`${x}-${z}`}><ellipse cx={q[0]} cy={q[1]+2} rx={scale*.3} ry={scale*.16+1.2} fill={c} stroke="#000" strokeOpacity=".13"/><ellipse cx={q[0]} cy={q[1]} rx={scale*.3} ry={scale*.16} fill={c} stroke="#fff" strokeOpacity=".25"/></g>);}
 return <svg viewBox="0 0 112 80" role="img" aria-label={`${COLORS[row.color].name} ${p.name}`}><polygon points={pts([a,b,e,d])} fill={c}/><polygon points={pts([b,e,[e[0],e[1]-height],[b[0],b[1]-height]])} fill={c}/><polygon points={pts([b,e,[e[0],e[1]-height],[b[0],b[1]-height]])} fill="#000" opacity=".18"/><polygon points={pts([d,e,[e[0],e[1]-height],[d[0],d[1]-height]])} fill={c}/><polygon points={pts([a,b,e,d].map(v=>[v[0],v[1]-height]))} fill={c} stroke="#000" strokeOpacity=".10"/>{studs}</svg>;
}
