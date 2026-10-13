import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({
  appType: "custom",
  configFile: false,
  root,
  resolve: { alias: { "@": root } },
  server: { middlewareMode: true },
});

after(async () => {
  await vite.close();
});

async function readCssTree(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const contents = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        return readCssTree(entryPath);
      }
      return entry.name.endsWith(".css") ? readFile(entryPath, "utf8") : "";
    }),
  );
  return contents.join("\n");
}

test("emits the catalog's animation and scrolling utilities", async () => {
  const css = await readCssTree(path.join(root, "dist"));

  assert.match(css, /--tw-enter-opacity/);
  assert.match(css, /scrollbar-width:\s*thin/);
  assert.match(css, /scrollbar-width:\s*none/);
  assert.match(css, /scrollbar-gutter:\s*stable/);
  assert.match(css, /scroll-fade-reveal-b/);
  assert.match(css, /mask-image:/);
  assert.match(css, /tw-shimmer/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
});

test("forwards progress semantics to the primitive", async () => {
  const { Progress } = await vite.ssrLoadModule("/components/ui/progress.tsx");
  const html = renderToStaticMarkup(React.createElement(Progress, { value: 37 }));

  assert.match(html, /aria-valuenow="37"/);
  assert.match(html, /aria-valuetext="37%"/);
  assert.match(html, /data-state="loading"/);
});

test("emits chart themes for the starter's media dark mode", async () => {
  const { ChartStyle } = await vite.ssrLoadModule("/components/ui/chart.tsx");
  const html = renderToStaticMarkup(
    React.createElement(ChartStyle, {
      id: "contract",
      config: {
        latency: { theme: { light: "#ffffff", dark: "#000000" } },
      },
    }),
  );

  assert.match(html, /\[data-chart=contract\]/);
  assert.match(html, /@media \(prefers-color-scheme: dark\)/);
  assert.doesNotMatch(html, /\.dark/);
});

test("renders sidebar skeletons deterministically", async () => {
  const { SidebarMenuSkeleton } = await vite.ssrLoadModule(
    "/components/ui/sidebar.tsx",
  );
  const first = renderToStaticMarkup(React.createElement(SidebarMenuSkeleton));
  const second = renderToStaticMarkup(React.createElement(SidebarMenuSkeleton));

  assert.equal(first, second);
  assert.match(first, /--skeleton-width:70%/);
});

// Streamlined studio: the first-run idea bar, the outcome tiers in the brief and the shared-link viewer.
const markup = (component, props) => renderToStaticMarkup(React.createElement(component, props));

test("the first-run idea bar pitches the app, offers ideas and a photo drop, and carries the build plan chip", async () => {
  const { IdeaBar } = await vite.ssrLoadModule("/app/create-build.tsx");
  const props = { draft: { prompt: "", photos: [] }, onDraftChange() {}, preparingPhotos: false, onPreparingPhotos() {}, onGenerate() {}, onOpen() {}, inline: true };
  const landing = markup(IdeaBar, { ...props, landing: true });
  assert.match(landing, /class="quick-create is-landing"/);
  assert.match(landing, /Describe anything or add a few photos\./);
  assert.match(landing, /TRY AN IDEA/);
  for (const idea of ["Dragon", "Record player", "Astronaut"]) assert.ok(landing.includes(idea));
  assert.match(landing, /or drop them here/);
  const typed = markup(IdeaBar, { ...props, landing: true, draft: { prompt: "A red bus", photos: [] }, brief: React.createElement("button", { className: "brief-chip" }, "Shelf · ~600 pieces") });
  assert.doesNotMatch(typed, /TRY AN IDEA/, "the ideas step aside once something is typed");
  assert.match(typed, /<button class="brief-chip">Shelf · ~600 pieces<\/button>/);
  const returning = markup(IdeaBar, props);
  assert.doesNotMatch(returning, /quick-create-pitch|TRY AN IDEA|or drop them here/);
  // The idea bar is the one place to describe an idea; More ways no longer repeats it.
  const src = await readFile(path.join(root, "app/create-build.tsx"), "utf8");
  assert.doesNotMatch(src, /Idea & photos|creation-alternatives|value="describe"/);
});

test("the brief offers two outcome tiers with estimated ranges, never model names, and keeps the rest under Advanced", async () => {
  const BriefForm = (await vite.ssrLoadModule("/app/design-brief.tsx")).default;
  const { defaultBrief } = await vite.ssrLoadModule("/lib/design-project.ts");
  const html = markup(BriefForm, { brief: defaultBrief("A red bus"), onChange() {} });
  assert.match(html, /<strong>Everyday<\/strong>/);
  assert.match(html, /<strong>Careful<\/strong>/);
  assert.match(html, /≈ \$0\.20–0\.40 per build/);
  assert.match(html, /≈ \$0\.30–0\.60 per build/);
  assert.match(html, /Estimates for a first build/);
  assert.doesNotMatch(html, /Sol 6\.1|GPT|Astra|Terra|<strong>Best<\/strong>|<strong>Better<\/strong>/);
  const advanced = html.indexOf("brief-advanced-settings");
  assert.ok(advanced > 0);
  assert.doesNotMatch(html.slice(0, advanced), /Width · studs|Maximum pieces|Hollow large interiors/);
  assert.match(html.slice(advanced), /Width · studs/);
  assert.match(html.slice(advanced), /Fix obvious problems automatically \(≈ \+\$0\.10 when needed\)/);
  // The older designers appear only for a personal key, or when a saved brief already uses one.
  const personal = markup(BriefForm, { brief: defaultBrief("A red bus"), onChange() {}, personalKey: true });
  assert.match(personal.slice(personal.indexOf("brief-advanced-settings")), /GPT-6 Astra/);
  const saved = markup(BriefForm, { brief: { ...defaultBrief("A red bus"), quality: "best" }, onChange() {} });
  assert.match(saved, /Kept from this saved project/);
  assert.match(saved, /<strong>Best<\/strong>/);
});

test("a shared link opens in a lean viewer: the model first, then its name and three actions", async () => {
  const studio = await vite.ssrLoadModule("/app/studio.tsx");
  const html = markup(studio.default, { sharedId: "AbCdEfGhIj", sharedSummary: { name: "Corner café", pieceCount: 107 } });
  assert.match(html, /<h1 id="viewer-title">Corner café<\/h1>/);
  assert.match(html, /Loading 107 pieces…/);
  for (const label of ["Get the pieces", "Remix with AI", "Make your own"]) assert.ok(html.includes(label), label);
  assert.ok(html.indexOf("studio-model-canvas") < html.indexOf("viewer-title"), "the model comes first");
  assert.doesNotMatch(html, /command-bar|quick-create|stage-hud|share-button|tools-toggle|shared-banner/);
  assert.match(html, /href="\/gallery"/);
});

test("the arrow pad is grouped for keyboard reveal, Fit stays, and the theme toggle has two states", async () => {
  const Viewport = (await vite.ssrLoadModule("/app/viewport.tsx")).default;
  const html = markup(Viewport, { pieces: [], length: 24, width: 16, height: 20, explode: 0, stage: 100000, selected: null, view: "perspective", reset: 0, rotate: false, onPick() {}, arrivals: { epoch: 1, paused: false } });
  assert.match(html, /<span class="camera-pad">(<button[^>]*class="camera-pan"[^>]*>.*?<\/button>){4}<\/span>/);
  assert.match(html, /aria-label="Fit the whole model in view"/);
  assert.match(html, /Right-drag to pan · Scroll to zoom/, "the server assumes a mouse; touch wording follows on the device");
  const css = await readFile(path.join(root, "app/globals.css"), "utf8");
  assert.match(css, /\.camera-navigation:not\(:has\(:focus-visible\)\) \.camera-pan/);
  const theme = await readFile(path.join(root, "app/theme.tsx"), "utf8");
  assert.doesNotMatch(theme, /ORDER=\["system"/);
  assert.match(theme, /setTheme\(dark\?"light":"dark"\)/);
});
