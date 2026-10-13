import {COLORS,PARTS,SLOPES,studCells,InventoryRow} from "@/lib/bridge";
import {isMinifig} from "@/lib/minifig";
import {colorFinish} from "@/lib/colors";
export default function PartImage({row}:{row:InventoryRow}){
 const p=PARTS[row.part],c=COLORS[row.color].hex,slope=SLOPES[row.part],finish=colorFinish(row.color).kind;
 // Trans pieces are drawn see-through with a faint edge; pearlescent ones catch a highlight on top.
 const glass=finish==="transparent"?{opacity:.62,stroke:"#7d8b96",strokeWidth:.7}:{},sheen=(points:string)=>finish==="metallic"&&<polygon points={points} fill="#fff" opacity=".3"/>;
 // A minifigure: yellow head with its stud, torso and arms in the row's color, darker hips and legs.
 if(isMinifig(row.part))return <svg viewBox="0 0 112 80" role="img" aria-label={`${COLORS[row.color].name} minifigure`}><rect x="51" y="4" width="10" height="4" rx="1" fill={COLORS.yellow.hex}/><rect x="46" y="8" width="20" height="17" rx="5" fill={COLORS.yellow.hex}/><polygon points="44,26 68,26 72,48 40,48" fill={c}/><polygon points="44,26 37,44 41,46 46,32" fill={c}/><polygon points="68,26 75,44 71,46 66,32" fill={c}/><circle cx="38" cy="47" r="3" fill={COLORS.yellow.hex}/><circle cx="74" cy="47" r="3" fill={COLORS.yellow.hex}/><rect x="40" y="48" width="32" height="5" fill={c}/><rect x="40" y="53" width="15" height="23" fill={c}/><rect x="57" y="53" width="15" height="23" fill={c}/><rect x="40" y="48" width="32" height="28" fill="#000" opacity=".18"/></svg>;
 const scale=62/(p.w+p.d),height=p.h===3?18:p.h===2?12:7;
 const point=(x:number,z:number,y=0)=>[48+(x-z)*scale,24+(x+z)*scale*.48-y];
 const pts=(coords:number[][])=>coords.map(v=>v.join(",")).join(" ");
 const a=point(0,0),b=point(p.w,0),d=point(0,p.d),e=point(p.w,p.d);
 const studs=[];for(const [x,z] of studCells({part:row.part,w:p.w,d:p.d,face:"pz"})){const q=point(x+.5,z+.5,height+2);studs.push(<g key={`${x}-${z}`}><ellipse cx={q[0]} cy={q[1]+2} rx={scale*.3} ry={scale*.16+1.2} fill={c} stroke="#000" strokeOpacity=".13"/><ellipse cx={q[0]} cy={q[1]} rx={scale*.3} ry={scale*.16} fill={c} stroke="#fff" strokeOpacity=".25"/></g>);}
 if(slope&&!slope.inverted){
  // A slope: the back rows keep the full height, the front run drops to a low lip.
  const flat=p.d-slope.run,lip=2,fa=point(0,flat),fb=point(p.w,flat),lowD=[d[0],d[1]-lip],lowE=[e[0],e[1]-lip];
  return <svg viewBox="0 0 112 80" role="img" aria-label={`${COLORS[row.color].name} ${p.name}`}><g {...glass}><polygon points={pts([a,b,e,d])} fill={c}/><polygon points={pts([b,fb,[fb[0],fb[1]-height],[b[0],b[1]-height]])} fill={c}/><polygon points={pts([b,fb,[fb[0],fb[1]-height],[b[0],b[1]-height]])} fill="#000" opacity=".18"/><polygon points={pts([fb,e,lowE,[fb[0],fb[1]-height]])} fill={c}/><polygon points={pts([fb,e,lowE,[fb[0],fb[1]-height]])} fill="#000" opacity=".26"/><polygon points={pts([[fa[0],fa[1]-height],[fb[0],fb[1]-height],lowE,lowD])} fill={c} stroke="#000" strokeOpacity=".12"/>{flat>0&&<polygon points={pts([a,b,fb,fa].map(v=>[v[0],v[1]-height]))} fill={c} stroke="#000" strokeOpacity=".10"/>}{sheen(pts([[fa[0],fa[1]-height],[fb[0],fb[1]-height],lowE,lowD]))}{studs}</g></svg>;
 }
 return <svg viewBox="0 0 112 80" role="img" aria-label={`${COLORS[row.color].name} ${p.name}`}><g {...glass}><polygon points={pts([a,b,e,d])} fill={c}/><polygon points={pts([b,e,[e[0],e[1]-height],[b[0],b[1]-height]])} fill={c}/><polygon points={pts([b,e,[e[0],e[1]-height],[b[0],b[1]-height]])} fill="#000" opacity=".18"/><polygon points={pts([d,e,[e[0],e[1]-height],[d[0],d[1]-height]])} fill={c}/><polygon points={pts([a,b,e,d].map(v=>[v[0],v[1]-height]))} fill={c} stroke="#000" strokeOpacity=".10"/>{sheen(pts([a,b,e,d].map(v=>[v[0],v[1]-height])))}{studs}</g></svg>;
}
