import Link from "next/link";

// A mistyped or deleted link gets a real 404 and a plain way back into the studio.
export default function SharedCreationNotFound(){
 return <main style={{minHeight:"70svh",display:"grid",placeContent:"center",justifyItems:"center",gap:16,padding:"32px 16px",textAlign:"center"}}>
  <h1 style={{fontSize:"clamp(1.6rem,4vw,2.25rem)",letterSpacing:"-.03em"}}>This shared creation isn’t here.</h1>
  <p style={{maxWidth:420,color:"var(--ink-2)"}}>The link may be mistyped, or its creator has removed it.</p>
  <Link className="button primary" href="/">Make your own</Link>
 </main>;
}
