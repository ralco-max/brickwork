import assert from "node:assert/strict";
import test from "node:test";
import {registerHooks} from "node:module";

test("renders Brickwork production metadata and its creation surface", async (t) => {
  // The built Worker imports its environment binding even on a public page.
  // Supply an empty test environment; no provider or database calls are made.
  const hooks=registerHooks({resolve(specifier,context,nextResolve){
    if(specifier==="cloudflare:workers")return {url:"data:text/javascript,export const env = {};",shortCircuit:true};
    return nextResolve(specifier,context);
  }});
  t.after(()=>hooks.deregister());
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  const response = await worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );

  assert.equal(response.status, 200);
  assert.match(
    response.headers.get("content-type") ?? "",
    /^text\/html\b/i,
  );
  const html=await response.text();
  assert.match(html,/<title>Brickwork by Ralc<\/title>/);
  assert.match(html,/Make it yours/);
});
