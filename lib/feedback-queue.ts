export type FeedbackOutcome="completed"|"failed"|"stopped";
export type QueuedFeedback<T>={id:number;afterRun:number;status:"waiting"|"ready"|"paused";value:T};

// A single replaceable snapshot. Completion can unlock only feedback submitted
// for that run; a stale response, Stop, or review failure cannot start work.
export class FeedbackQueue<T>{
 private sequence=0;
 pending:QueuedFeedback<T>|null=null;
 submit(value:T,afterRun:number){this.pending={id:++this.sequence,afterRun,status:"waiting",value:structuredClone(value)};return this.pending;}
 settle(run:number,outcome:FeedbackOutcome){if(this.pending?.afterRun===run&&this.pending.status==="waiting")this.pending={...this.pending,status:outcome==="completed"?"ready":"paused"};return this.pending;}
 pause(){if(this.pending)this.pending={...this.pending,status:"paused"};return this.pending;}
 resume(){if(this.pending)this.pending={...this.pending,status:"ready"};return this.pending;}
 cancel(){this.pending=null;}
 takeReady(){if(this.pending?.status!=="ready")return null;const next=this.pending;this.pending=null;return next;}
 // A rejected start or failed queued pass can be retried manually. Never
 // replace newer feedback submitted while that queued pass was running.
 restorePaused(previous:QueuedFeedback<T>){if(!this.pending)this.pending={...previous,status:"paused"};return this.pending;}
}
/**
 * Try again after a failed pass. A queued (or panel-started) pass is retried as itself, never as the composer, which was
 * cleared when it was queued; a pass with a kept partial or a finished design retries as before (Continue, Retry review),
 * since those finish the same request. Either way the failed request's paused card goes, so it cannot run twice.
 */
export function retryFailed<T>(queue:FeedbackQueue<T>,failed:T|null|undefined,s:{reviewOnly:boolean;interrupted:boolean}):{submitted?:T}{
 if(failed&&queue.pending?.value===failed)queue.cancel();
 return failed&&!s.reviewOnly&&!s.interrupted?{submitted:failed}:{};
}
export function mayClearSubmittedFeedback(submittedVersion:number,currentVersion:number,reviewOnly:boolean){return !reviewOnly&&submittedVersion===currentVersion;}
// The queue card shows one line for the next pass: what was typed, or what the pass will do without words.
export function queuedLabel(v:{text:string;approved?:string[];region?:{components:string[]}},name=(component:string)=>component){
 if(v.text.trim())return v.text.trim();
 const n=v.approved?.length||0;if(n)return `Apply ${n} suggested change${n===1?"":"s"}`;
 if(v.region?.components.length)return `Change the ${v.region.components.slice(0,3).map(c=>name(c).toLowerCase()).join(", ")}`;
 return "Update the build with the attached photos";
}
