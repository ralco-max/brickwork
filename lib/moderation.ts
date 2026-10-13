// Names shown in the public gallery. The check is deliberately small and conservative: it
// stops obvious slurs, profanity and link spam, and leaves the rest to reports and the admin.
// Words are matched whole after folding accents and leetspeak, so "Scunthorpe", "Cocktail
// bar" or "Maine Coon" pass; only the few roots that never occur inside innocent words are
// matched anywhere in a word.
export const MAX_GALLERY_NAME=80;
export type NameCheck={ok:true;name:string}|{ok:false;reason:"empty"|"link"|"blocked";message:string};

// rot13, so the source does not read as a list of slurs.
const rot13=(s:string)=>s.replace(/[a-z]/g,c=>String.fromCharCode((c.charCodeAt(0)-97+13)%26+97));
const WORDS=new Set("fuvg fuvgf fuvggl fuvgurnq fuvgubyr ohyyfuvg phag phagf gjng gjngf jnax jnaxre jnaxref ovgpu ovgpurf juber juberf fyhg fyhgf fyhggl cbea cbeab encr encvfg qvyqb ergneq ergneqf ergneqrq snt sntf snttbgf fcvp fcvpf xvxr xvxrf tbbx tbbxf jrgonpx jrgonpxf genaal genaavrf".split(" ").map(rot13));
const ROOTS="shpx cuhpx avttre avttn snttbg".split(" ").map(rot13);
const LEET:Record<string,string>={"0":"o","1":"i","3":"e","4":"a","5":"s","7":"t","8":"b","@":"a","$":"s","!":"i","|":"i","+":"t","€":"e"};

/** Display form: NFKC, no control, format (zero-width, bidi override) or private-use characters, single spaces, at most 80 characters. */
export function cleanText(raw:unknown,max=MAX_GALLERY_NAME){
 // Whitespace (tabs and newlines are control characters too) becomes a space before the rest are dropped.
 const text=String(raw??"").normalize("NFKC").replace(/\s+/g," ").replace(/[\p{Cc}\p{Cf}\p{Co}\p{Cn}]/gu,"").replace(/ {2,}/g," ").trim();
 // Cut by code point so an emoji is never split in half.
 const points=Array.from(text);return points.length>max?points.slice(0,max).join("").trimEnd():text;
}

/** Lowercase letters only: accents dropped, leetspeak read as letters, runs of 3+ repeats collapsed. */
export function foldForMatch(text:string){
 return text.normalize("NFKD").replace(/\p{M}/gu,"").toLowerCase().replace(/[0134578@$!|+€]/g,c=>LEET[c]).replace(/[^a-z]+/g," ").replace(/([a-z])\1{2,}/g,"$1").trim();
}

function blocked(folded:string){
 const words=folded.split(" ").filter(Boolean),spelled:string[]=[];
 // "f u c k" and "f.u.c.k" fold to single letters; read each run of them as one word too.
 let run="";for(const w of [...words,""]){if(w.length===1){run+=w;continue;}if(run.length>1)spelled.push(run);run="";}
 return [...words,...spelled].some(w=>WORDS.has(w)||ROOTS.some(root=>w.includes(root)));
}

export function moderateName(raw:unknown):NameCheck{
 const name=cleanText(raw);
 if(!/[\p{L}\p{N}].*[\p{L}\p{N}]/u.test(name))return {ok:false,reason:"empty",message:"Give your build a name of at least two letters before showing it in the gallery."};
 if(/https?:|www\.|\.(com|net|org|io|ly|gg|xyz|ru|co|me|app)\b/i.test(name))return {ok:false,reason:"link",message:"Gallery names can’t include links. Rename your build and try again."};
 if(blocked(foldForMatch(name)))return {ok:false,reason:"blocked",message:"This name can’t be shown in the public gallery. Rename your build and try again."};
 return {ok:true,name};
}

/**
 * The network a visitor's address belongs to, for limits and report counting: an IPv4 address as
 * is, an IPv6 one cut to its first `bits` (one home or phone is handed a whole /64, often a /56 or
 * /48, so every address in it is the same visitor). IPv4-mapped addresses read as IPv4; anything
 * unparseable is kept whole, and a missing address is "local".
 */
export function networkOf(ip:string|null|undefined,bits=64){
 const raw=String(ip??"").trim().toLowerCase().replace(/%.*$/,"");
 if(!raw.includes(":"))return raw||"local";
 // A dotted tail (::ffff:1.2.3.4, 64:ff9b::1.2.3.4) is the last two groups.
 const text=raw.replace(/(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/,(_,a,b,c,d)=>`${(+a<<8|+b).toString(16)}:${(+c<<8|+d).toString(16)}`);
 const halves=text.split("::");if(halves.length>2)return raw;
 const part=(s:string)=>s?s.split(":"):[],left=part(halves[0]),right=part(halves[1]??"");
 const groups=halves.length===2?[...left,...Array(Math.max(0,8-left.length-right.length)).fill("0"),...right]:left;
 if(groups.length!==8||!groups.every(g=>/^[0-9a-f]{1,4}$/.test(g)))return raw;
 const n=groups.map(g=>parseInt(g,16));
 if(n.slice(0,5).every(x=>x===0)&&n[5]===0xffff)return [n[6]>>8,n[6]&255,n[7]>>8,n[7]&255].join(".");
 const kept=n.slice(0,Math.ceil(bits/16)).map((x,i)=>(x&0xffff<<Math.max(0,16*(i+1)-bits)&0xffff).toString(16));
 return `${kept.join(":")}::/${bits}`;
}
