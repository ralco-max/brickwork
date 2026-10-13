// One plain-language verdict for the studio: "Solid ✓" or "Needs attention (n)", where n counts the kinds
// of problem the digital checks found (the same way the AI checks count flagged issues). The numbers stay
// behind the chip, in the parts list.
type Audit={overlaps:number;disconnected:readonly unknown[]};
type Clutch={overloaded:readonly unknown[]};
const plural=(n:number,one:string,many:string)=>`${n.toLocaleString("en-US")} ${n===1?one:many}`;
export function buildability(audit:Audit,clutch:Clutch){
 const issues=[
  audit.disconnected.length?plural(audit.disconnected.length,"loose piece","loose pieces"):"",
  audit.overlaps?plural(audit.overlaps,"overlapping cell","overlapping cells"):"",
  clutch.overloaded.length?plural(clutch.overloaded.length,"joint beyond its clutch","joints beyond their clutch"):"",
 ].filter(Boolean);
 return {solid:issues.length===0,issues,label:issues.length?`Needs attention (${issues.length})`:"Solid ✓"};
}
