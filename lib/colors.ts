// The app palette: display color, LDraw color code and BrickLink color ID.
export type ColorKey = "red" | "orange" | "blue" | "navy" | "black" | "gray" | "white" | "green" | "tan" | "yellow" | "brown" | "darkbrown" | "pink";
export const COLORS: Record<ColorKey, {name:string;hex:string;ldraw:number;bricklink:number}> = {
 yellow:{name:"Yellow",hex:"#f2cd37",ldraw:14,bricklink:3},brown:{name:"Reddish brown",hex:"#582a12",ldraw:70,bricklink:88},darkbrown:{name:"Dark brown",hex:"#352100",ldraw:308,bricklink:120},pink:{name:"Bright pink",hex:"#e4adc8",ldraw:29,bricklink:104},
 red:{name:"Red",hex:"#c92820",ldraw:4,bricklink:5},orange:{name:"Orange",hex:"#ed7825",ldraw:25,bricklink:4},blue:{name:"Blue",hex:"#0055bf",ldraw:1,bricklink:7},navy:{name:"Dark blue",hex:"#183b54",ldraw:272,bricklink:63},black:{name:"Black",hex:"#292f34",ldraw:0,bricklink:11},gray:{name:"Light bluish gray",hex:"#a9b1b8",ldraw:71,bricklink:86},white:{name:"White",hex:"#f3f0e5",ldraw:15,bricklink:1},green:{name:"Green",hex:"#3f7750",ldraw:2,bricklink:6},tan:{name:"Tan",hex:"#c6ab78",ldraw:19,bricklink:2}
};
