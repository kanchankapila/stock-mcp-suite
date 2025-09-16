// Minimal shim so TS compiles even if bullmq package not yet installed
// Remove once bullmq dependency successfully installed.
declare module 'bullmq' {
  export class Queue { constructor(name:string, opts?:any); add(name:string, data?:any, opts?:any): Promise<any>; }
  export class Worker { constructor(name:string, processor:Function, opts?:any); }
  export class QueueEvents { constructor(name:string, opts?:any); }
}
