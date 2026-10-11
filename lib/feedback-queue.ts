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
export function mayClearSubmittedFeedback(submittedVersion:number,currentVersion:number,reviewOnly:boolean){return !reviewOnly&&submittedVersion===currentVersion;}
