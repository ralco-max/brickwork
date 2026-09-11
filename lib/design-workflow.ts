// The paid path has one reference lookup, one design and one review.
// Compilation is local. A failed lookup/design stops subsequent paid work;
// a failed review preserves the completed candidate for an explicit retry.
export async function runDesignWorkflow<Reference, Scene, Model, Review>(steps:{
 reference?:Reference;
 lookup:()=>Promise<Reference>;
 design:(reference:Reference)=>Promise<Scene>;
 compile:(scene:Scene,reference:Reference)=>Promise<Model>;
 review:(model:Model,scene:Scene,reference:Reference)=>Promise<Review>;
 signal:AbortSignal;
}){
 const alive=()=>steps.signal.throwIfAborted();
 alive();const reference=steps.reference??await steps.lookup();alive();
 const scene=await steps.design(reference);alive();
 const model=await steps.compile(scene,reference);alive();
 try{const review=await steps.review(model,scene,reference);alive();return {reference,scene,model,review,reviewError:undefined};}
 catch(reviewError){alive();return {reference,scene,model,review:null,reviewError};}
}
