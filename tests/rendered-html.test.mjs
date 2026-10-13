import assert from "node:assert/strict";
import test from "node:test";
import {registerHooks} from "node:module";

test("renders Bricks production metadata and its creation surface", async (t) => {
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
  assert.match(html,/<title>Bricks by Ralc<\/title>/);
  // First run: the bundled bridge is a demo, so nothing acts on it yet. The idea bar, a one-line
  // pitch, photo drop and ideas to try are what a newcomer sees, plus the community gallery.
  assert.match(html,/Describe anything or add a few photos\./);
  assert.match(html,/<span>Create<\/span>/,'Create keeps its label (the phone CSS no longer hides it)');
  assert.match(html,/TRY AN IDEA/);assert.match(html,/or drop them here/);
  assert.match(html,/<a class="button secondary gallery-link" href="\/gallery"/);
  assert.doesNotMatch(html,/class="button secondary share-button"|aria-label="Get the pieces"|aria-label="Download"/,'no Share, Download or Get the pieces before the person has a model');
  assert.doesNotMatch(html,/Pin this build|Edit bricks|Feature this build|Save \/ export|Make it yours/);
  assert.match(html,/Remix with AI/);
  // Duplicate entry points are gone from the first screen: no empty My builds, no demo settings.
  assert.doesNotMatch(html,/class="drawer-toggle"|class="tools-toggle"/);
});
