// The Workers runtime provides these; declaring the parts this app touches keeps the
// standalone type-check honest without pulling in the full runtime type package.
declare module "cloudflare:workers" {
  export const env: { DB?: D1Database; OPENAI_API_KEY?: string; ASSETS?: Fetcher } & Record<string, unknown>;
}
type Fetcher = { fetch(input: Request | string, init?: RequestInit): Promise<Response> };
interface D1PreparedStatement {
  bind(...values: (string | number | null)[]): D1PreparedStatement;
  run(): Promise<{ meta: { changes?: number } }>;
  first<T>(): Promise<T | null>;
}
interface D1Database { prepare(query: string): D1PreparedStatement }
