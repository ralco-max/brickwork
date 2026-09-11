import type {CompactScene} from "./generated-scene";

// Worked examples in the wire format. Each shows one construction done the way it packs and reads
// well: named components, real proportions, every signature feature as its own shape, wheels as
// wheel elements, leaning members as leans, roofs as stepped courses. Two are chosen per brief by
// subject so the designer imitates a concrete pattern instead of following a rule.
export type DesignExample={id:string;about:string;tags:string[];scene:CompactScene};
const box=(i:string,c:string,l:string,col:string,p:[number,number,number],s:[number,number,number],extra:Partial<CompactScene["sh"][number]>={})=>({i,c,l,k:"box" as const,o:"add" as const,a:null,col:col as CompactScene["sh"][number]["col"],p,s,e:null,r:null,rep:null,...extra});
export const DESIGN_EXAMPLES:DesignExample[]=[
 {id:"car",about:"A compact hatchback, 20 studs long, designed in the round: real wheel elements in carved arches on black axle boxes that reach up into the body, a body 2.3 times as long as wide with ground clearance, a nose with grille, headlights, bumper and a hood step, a cabin set back behind a raked windscreen lean with wing mirrors rooted in the pillars, and a tail with hatch window, tail lights and bumper.",tags:["vehicle","car","truck","bus","van","wheel"],scene:{n:"Hatchback",d:"A small red hatchback: body, set-back cabin, four wheel elements in arches on axle boxes, headlights and tail lights.",f:["long low body with carved wheel arches","raked windscreen and set-back cabin","four black wheels with grey hubs"],dim:[26,24,14],rm:[],sh:[
  box("base","Base","Display base","gray",[0,0,0],[26,2,14]),
  box("body","Body","Lower body with ground clearance","red",[3,8,3],[20,6,8]),
  {i:"arch-front",c:"Body",l:"Front wheel arch",k:"cylinder",o:"subtract",a:"z",col:"red",p:[5,2,1],s:[5,10,12],e:null,r:null,rep:null},
  {i:"arch-rear",c:"Body",l:"Rear wheel arch",k:"cylinder",o:"subtract",a:"z",col:"red",p:[16,2,1],s:[5,10,12],e:null,r:null,rep:null},
  box("axle-front","Axles","Front axle box, reaching up into the body","black",[6,5,2],[3,7,10]),
  box("axle-rear","Axles","Rear axle box, reaching up into the body","black",[17,5,2],[3,7,10]),
  {i:"wheel-fl",c:"Wheels",l:"Front left wheel",k:"wheel",o:"add",a:"z",col:"black",p:[7.5,7,2],s:[4,0,0],e:null,r:null,rep:null},
  {i:"wheel-fr",c:"Wheels",l:"Front right wheel",k:"wheel",o:"add",a:"z",col:"black",p:[7.5,7,12],s:[4,0,0],e:null,r:null,rep:null},
  {i:"wheel-rl",c:"Wheels",l:"Rear left wheel",k:"wheel",o:"add",a:"z",col:"black",p:[18.5,7,2],s:[4,0,0],e:null,r:null,rep:null},
  {i:"wheel-rr",c:"Wheels",l:"Rear right wheel",k:"wheel",o:"add",a:"z",col:"black",p:[18.5,7,12],s:[4,0,0],e:null,r:null,rep:null},
  box("bonnet","Body","Bonnet","red",[3,14,4],[8,2,6]),
  box("cabin","Cabin","Cabin","red",[11,14,3],[11,5,8]),
  {i:"windscreen",c:"Cabin",l:"Raked windscreen",k:"lean",o:"add",a:null,col:"navy",p:[10.5,14,7],s:[6,1,0],e:[12.5,19,7],r:null,rep:null},
  box("side-windows","Cabin","Side windows","navy",[13,15,3],[7,3,1],{rep:[2,0,0,7]}),
  box("roof","Cabin","Roof","red",[12,19,4],[10,1,6]),
  box("grille","Nose","Black grille between the headlights","black",[3,10,5],[1,3,4]),
  box("bumper-front","Nose","Front bumper, one stud proud, tucked under the body","gray",[2,6,3],[3,2,8]),
  box("headlights","Nose","Headlights","yellow",[3,11,4],[1,2,1],{rep:[2,0,0,5]}),
  box("hood-step","Nose","Hood stepping down to the grille","red",[3,13,4],[2,1,6]),
  box("bumper-rear","Tail","Rear bumper, one stud proud, tucked under the body","gray",[21,6,3],[3,2,8]),
  box("taillights","Tail","Tail lights","orange",[22,11,4],[1,2,1],{rep:[2,0,0,5]}),
  box("hatch-window","Tail","Rear hatch window","navy",[21,15,4],[1,3,6]),
  box("mirror-l","Cabin","Wing mirror rooted in the pillar","black",[11,15,2],[1,1,2]),
  box("mirror-r","Cabin","Wing mirror rooted in the pillar","black",[11,15,10],[1,1,2]),
 ]}},
 {id:"cottage",about:"A brick cottage: walls with inset windows and a door, a pitched roof built as stepped courses (one stud in per three plates) with eaves that overhang the walls by one stud, and a chimney.",tags:["building","house","cottage","home","roof","barn","church"],scene:{n:"Cottage",d:"A tan cottage with a red pitched roof, inset windows, a door and a chimney.",f:["pitched roof with overhanging eaves","inset windows either side of the door","chimney on the ridge"],dim:[24,40,20],rm:[],sh:[
  box("base","Base","Display base","green",[0,0,0],[24,2,20]),
  box("walls","Walls","Walls","tan",[4,2,4],[16,18,12]),
  box("door","Openings","Front door","brown",[10,2,15],[3,8,1]),
  box("window-l","Openings","Front windows","navy",[6,8,15],[2,4,1],{rep:[2,9,0,0]}),
  box("window-b","Openings","Back windows","navy",[6,8,4],[2,4,1],{rep:[3,5,0,0]}),
  box("roof-0","Roof","Roof course 1 with eaves","red",[3,20,3],[18,3,14]),
  box("roof-1","Roof","Roof course 2","red",[3,23,4],[18,3,12]),
  box("roof-2","Roof","Roof course 3","red",[3,26,5],[18,3,10]),
  box("roof-3","Roof","Roof course 4","red",[3,29,6],[18,3,8]),
  box("roof-4","Roof","Roof course 5","red",[3,32,7],[18,3,6]),
  box("ridge","Roof","Ridge","red",[3,35,8],[18,2,4]),
  box("chimney","Roof","Chimney","gray",[16,30,8],[2,10,2]),
 ]}},
 {id:"lattice",about:"An open lattice tower 24 studs square and 100 plates tall: four splayed legs as leans, X braces as one-stud leans with air between them, two platforms, a tapering upper shaft and a mast, a Core of piers under the platforms.",tags:["tower","lattice","monument","bridge","crane","pylon","eiffel","mast"],scene:{n:"Lattice tower",d:"An open iron lattice tower: four splayed leg leans, X braces, two platforms, a tapering shaft and a mast.",f:["four splayed legs meeting under the first platform","open crisscross bracing with air between members","tapering shaft to a needle mast"],dim:[28,110,28],rm:[],sh:[
  box("base","Base","Display base","gray",[0,0,0],[28,2,28]),
  {i:"leg-1",c:"Legs",l:"Leg",k:"lean",o:"add",a:null,col:"darkbrown",p:[4,2,4],s:[2,3,0],e:[10,40,10],r:null,rep:null},
  {i:"leg-2",c:"Legs",l:"Leg",k:"lean",o:"add",a:null,col:"darkbrown",p:[24,2,4],s:[2,3,0],e:[18,40,10],r:null,rep:null},
  {i:"leg-3",c:"Legs",l:"Leg",k:"lean",o:"add",a:null,col:"darkbrown",p:[4,2,24],s:[2,3,0],e:[10,40,18],r:null,rep:null},
  {i:"leg-4",c:"Legs",l:"Leg",k:"lean",o:"add",a:null,col:"darkbrown",p:[24,2,24],s:[2,3,0],e:[18,40,18],r:null,rep:null},
  {i:"brace-f1",c:"Bracing",l:"Front X brace",k:"lean",o:"add",a:null,col:"darkbrown",p:[5,8,5],s:[1,3,0],e:[19,32,9],r:null,rep:null},
  {i:"brace-f2",c:"Bracing",l:"Front X brace",k:"lean",o:"add",a:null,col:"darkbrown",p:[23,8,5],s:[1,3,0],e:[9,32,9],r:null,rep:null},
  {i:"brace-b1",c:"Bracing",l:"Back X brace",k:"lean",o:"add",a:null,col:"darkbrown",p:[5,8,23],s:[1,3,0],e:[19,32,19],r:null,rep:null},
  {i:"brace-b2",c:"Bracing",l:"Back X brace",k:"lean",o:"add",a:null,col:"darkbrown",p:[23,8,23],s:[1,3,0],e:[9,32,19],r:null,rep:null},
  box("platform-1","Platforms","First platform","darkbrown",[7,40,7],[14,2,14]),
  box("core-1","Core","Pier under the first platform","darkbrown",[12,2,12],[4,38,4]),
  {i:"shaft-1",c:"Shaft",l:"Shaft edge",k:"lean",o:"add",a:null,col:"darkbrown",p:[8,42,8],s:[1,3,0],e:[13,96,13],r:null,rep:null},
  {i:"shaft-2",c:"Shaft",l:"Shaft edge",k:"lean",o:"add",a:null,col:"darkbrown",p:[20,42,8],s:[1,3,0],e:[15,96,13],r:null,rep:null},
  {i:"shaft-3",c:"Shaft",l:"Shaft edge",k:"lean",o:"add",a:null,col:"darkbrown",p:[8,42,20],s:[1,3,0],e:[13,96,15],r:null,rep:null},
  {i:"shaft-4",c:"Shaft",l:"Shaft edge",k:"lean",o:"add",a:null,col:"darkbrown",p:[20,42,20],s:[1,3,0],e:[15,96,15],r:null,rep:null},
  box("platform-2","Platforms","Second platform","darkbrown",[10,66,10],[8,2,8]),
  box("core-2","Core","Shaft core","darkbrown",[13,42,13],[2,54,2]),
  box("summit","Shaft","Summit room","darkbrown",[12,96,12],[4,4,4]),
  {i:"mast",c:"Shaft",l:"Mast",k:"beam",o:"add",a:null,col:"gray",p:[14,100,14],s:[1,1,1],e:[14,108,14],r:.5,rep:null},
 ]}},
 {id:"animal",about:"A standing dog 20 studs long: a body as an ellipsoid, four legs as boxes that reach the base, a head with muzzle, ears, eyes as single accents and a tail as a lean, in two analogous colours with one accent.",tags:["animal","dog","cat","horse","dinosaur","creature","character","figure"],scene:{n:"Dog",d:"A standing brown dog with a white chest, floppy ears, a raised tail and black eyes and nose.",f:["four legs planted on the base","raised tail","floppy ears and a muzzle"],dim:[24,30,14],rm:[],sh:[
  box("base","Base","Display base","green",[0,0,0],[24,2,14]),
  box("legs","Legs","Legs","brown",[6,2,3],[3,8,3],{rep:[2,9,0,0]}),
  box("legs-b","Legs","Far legs","brown",[6,2,8],[3,8,3],{rep:[2,9,0,0]}),
  {i:"body",c:"Body",l:"Body",k:"ellipsoid",o:"add",a:null,col:"brown",p:[4,8,2],s:[15,11,10],e:null,r:null,rep:null},
  box("chest","Body","White chest","white",[5,9,5],[3,6,4]),
  {i:"head",c:"Head",l:"Head",k:"ellipsoid",o:"add",a:null,col:"brown",p:[2,15,3],s:[7,9,8],e:null,r:null,rep:null},
  box("muzzle","Head","Muzzle","tan",[1,16,5],[3,4,4]),
  box("nose","Head","Nose","black",[1,19,6],[1,1,2]),
  box("eyes","Head","Eyes","black",[4,20,4],[1,1,1],{rep:[2,0,0,5]}),
  box("ear-l","Head","Floppy ear, rooted in the head","brown",[6,17,2],[2,6,2]),
  box("ear-r","Head","Floppy ear, rooted in the head","brown",[6,17,10],[2,6,2]),
  {i:"tail",c:"Tail",l:"Raised tail",k:"lean",o:"add",a:null,col:"brown",p:[19,14,7],s:[1,3,0],e:[22,24,7],r:null,rep:null},
 ]}},
];
// Two examples nearest the brief: by the reference sheet's kind and the words in the idea.
export function pickExamples(idea:string,kind?:string):DesignExample[]{
 const words=`${idea} ${kind||""}`.toLowerCase();
 const scored=DESIGN_EXAMPLES.map(e=>({e,score:e.tags.reduce((n,t)=>n+(words.includes(t)?(t===kind?3:1):0),0)})).sort((a,b)=>b.score-a.score);
 const chosen=scored.filter(x=>x.score>0).slice(0,2).map(x=>x.e);
 return chosen.length?chosen:[DESIGN_EXAMPLES[1],DESIGN_EXAMPLES[3]];
}
