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
