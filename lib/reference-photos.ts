import {z} from "zod";

export const MAX_REFERENCE_PHOTOS=4;
export const referencePhotoSchema=z.string().max(1500000).regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/);
export const referencePhotosSchema=z.array(referencePhotoSchema).max(MAX_REFERENCE_PHOTOS);

// Keep the original first and do not send the same evidence twice.
export function collectReferencePhotos(reference?:string,photos?:string[]):string[]{
 return [...new Set([...(reference?[reference]:[]),...(photos||[])])];
}
