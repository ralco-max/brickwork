// The runtime provides this module inside Workers; this keeps the standalone type-check honest.
declare module "cloudflare:workers" {
  export const env: Record<string, unknown>;
}
