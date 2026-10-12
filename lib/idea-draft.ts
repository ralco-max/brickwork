import {collectReferencePhotos,MAX_REFERENCE_PHOTOS} from "./reference-photos";

export type IdeaDraft={prompt:string;photos:string[]};
export const PHOTO_IDEA="Recreate the subject in these reference photos as a brick model, matching its shape, colors and details.";

export function canSubmitIdea(draft:IdeaDraft){
 const length=draft.prompt.trim().length;
 return length>=3||(length===0&&draft.photos.length>0);
}

// Apply decoded photos to the latest draft, never the text captured when the
// file picker opened. Typing can continue while images are being prepared.
export function addIdeaPhotos(draft:IdeaDraft,added:string[]):IdeaDraft{
 return {...draft,photos:collectReferencePhotos(undefined,[...draft.photos,...added]).slice(0,MAX_REFERENCE_PHOTOS)};
}

export function ideaForGeneration(draft:IdeaDraft):IdeaDraft{
 return {prompt:draft.prompt.trim()?draft.prompt:PHOTO_IDEA,photos:collectReferencePhotos(undefined,draft.photos).slice(0,MAX_REFERENCE_PHOTOS)};
}
