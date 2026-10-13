// The app palette: display color, LDraw color code, BrickLink color ID and Rebrickable color ID.
// The Rebrickable ID is not always the LDraw code: Trans-Light Blue is Rebrickable 41, LDraw 43 and
// BrickLink 15, while Rebrickable 43 is Trans-Very Lt Blue. Join source data on rebrickable, never ldraw.
// Keys are stored in saved projects and shares: never rename or remove one.
export type ColorKey = "red" | "orange" | "blue" | "navy" | "black" | "gray" | "white" | "green" | "tan" | "yellow" | "brown" | "darkbrown" | "pink"
 | "darkgray" | "darktan" | "darkred" | "sandgreen" | "darkgreen" | "mediumazure" | "lime" | "mediumnougat" | "transclear" | "translightblue" | "pearlgold" | "flatsilver";
export type BrickColor={name:string;hex:string;ldraw:number;bricklink:number;rebrickable:number;transparent?:boolean;metallic?:boolean};
export const COLORS: Record<ColorKey, BrickColor> = {
 yellow:{name:"Yellow",hex:"#f2cd37",ldraw:14,bricklink:3,rebrickable:14},brown:{name:"Reddish brown",hex:"#582a12",ldraw:70,bricklink:88,rebrickable:70},darkbrown:{name:"Dark brown",hex:"#352100",ldraw:308,bricklink:120,rebrickable:308},pink:{name:"Bright pink",hex:"#e4adc8",ldraw:29,bricklink:104,rebrickable:29},
 red:{name:"Red",hex:"#c92820",ldraw:4,bricklink:5,rebrickable:4},orange:{name:"Orange",hex:"#ed7825",ldraw:25,bricklink:4,rebrickable:25},blue:{name:"Blue",hex:"#0055bf",ldraw:1,bricklink:7,rebrickable:1},navy:{name:"Dark blue",hex:"#183b54",ldraw:272,bricklink:63,rebrickable:272},black:{name:"Black",hex:"#292f34",ldraw:0,bricklink:11,rebrickable:0},gray:{name:"Light bluish gray",hex:"#a9b1b8",ldraw:71,bricklink:86,rebrickable:71},white:{name:"White",hex:"#f3f0e5",ldraw:15,bricklink:1,rebrickable:15},green:{name:"Green",hex:"#3f7750",ldraw:2,bricklink:6,rebrickable:2},tan:{name:"Tan",hex:"#c6ab78",ldraw:19,bricklink:2,rebrickable:19},
 darkgray:{name:"Dark bluish gray",hex:"#6c6e68",ldraw:72,bricklink:85,rebrickable:72},darktan:{name:"Dark tan",hex:"#958a73",ldraw:28,bricklink:69,rebrickable:28},darkred:{name:"Dark red",hex:"#720e0f",ldraw:320,bricklink:59,rebrickable:320},sandgreen:{name:"Sand green",hex:"#a0bcac",ldraw:378,bricklink:48,rebrickable:378},darkgreen:{name:"Dark green",hex:"#184632",ldraw:288,bricklink:80,rebrickable:288},mediumazure:{name:"Medium azure",hex:"#36aebf",ldraw:322,bricklink:156,rebrickable:322},lime:{name:"Lime",hex:"#bbe90b",ldraw:27,bricklink:34,rebrickable:27},mediumnougat:{name:"Medium nougat",hex:"#aa7d55",ldraw:84,bricklink:150,rebrickable:84},
 transclear:{name:"Trans-clear",hex:"#fcfcfc",ldraw:47,bricklink:12,rebrickable:47,transparent:true},translightblue:{name:"Trans-light blue",hex:"#aeefec",ldraw:43,bricklink:15,rebrickable:41,transparent:true},pearlgold:{name:"Pearl gold",hex:"#aa7f2e",ldraw:297,bricklink:115,rebrickable:297,metallic:true},flatsilver:{name:"Flat silver",hex:"#898788",ldraw:179,bricklink:95,rebrickable:179,metallic:true}
};
// The palette before October 2026. Legacy parts were never colour-restricted in these, so they stay
// allowed everywhere; newer colours are offered only where a part is evidenced in them.
export const CLASSIC_COLORS:readonly ColorKey[]=["yellow","brown","darkbrown","pink","red","orange","blue","navy","black","gray","white","green","tan"];
// Opaque colours: a photo pixel or mesh colour cannot ask for glass or metal, so matching uses these.
export const SOLID_COLORS=(Object.keys(COLORS) as ColorKey[]).filter(k=>!COLORS[k].transparent&&!COLORS[k].metallic);
// Minifigure heads and hands come in these skin tones.
export const SKIN_COLORS:readonly ColorKey[]=["yellow","tan","mediumnougat","brown","darkbrown"];

// How a colour is drawn. Trans elements blend over what is behind them without writing depth, so
// overlapping panes never hide each other; pearlescent ones get a soft metallic sheen. Renderers
// keep their own roughness for solid colours.
export type ColorFinish={kind:"solid"|"transparent"|"metallic";transparent:boolean;opacity:number;depthWrite:boolean;metalness:number;roughness?:number};
const TRANS_OPACITY=.55;
export function colorFinish(key:ColorKey):ColorFinish{
 const c=COLORS[key];
 return c.transparent?{kind:"transparent",transparent:true,opacity:TRANS_OPACITY,depthWrite:false,metalness:0,roughness:.08}:c.metallic?{kind:"metallic",transparent:false,opacity:1,depthWrite:true,metalness:.85,roughness:.35}:{kind:"solid",transparent:false,opacity:1,depthWrite:true,metalness:0};
}
// A CSS background for a swatch: trans colours over a checkerboard, pearlescent ones with a sheen.
export function colorSwatch(key:ColorKey):string{
 const {hex,transparent,metallic}=COLORS[key];
 return transparent?`linear-gradient(${hex}8c,${hex}8c),repeating-conic-gradient(#c3ccd3 0 25%,#ffffff 0 50%) 0 0/8px 8px`:metallic?`linear-gradient(135deg,#ffffffa6,#ffffff00 50%,#00000040),${hex}`:hex;
}
