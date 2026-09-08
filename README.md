# Brickwork by Ralc

A custom brick design studio using React, Three.js and Vinext.

## Prompt to design

1. Describe an idea on the landing page, then review the guided brief. Choose Desk, Shelf or Statement size; Essential, Detailed or Signature detail; required features; and optional exact stud/plate dimensions, piece limit, style and hollow interiors.
2. Connect your own OpenAI API key, or use a configured studio key. A personal key takes precedence. A key entered in the UI stays in React memory for this tab. It is sent through the same-origin server to OpenAI, never included in exports or application logs. API billing belongs to that account. An optional `OPENAI_API_KEY` Site secret provides the shared connection. Requests are pinned to `gpt-5.6-terra` with standard service so the budget has known rates; arbitrary `OPENAI_MODEL` overrides are no longer used.
3. The Responses API streams a bespoke scene program. Completed shapes compile in a browser worker into the same catalog pieces used by the editor and inventory. There is no preset fallback on this path.
4. Validate geometry, actual piece count, dimensions, ground connection and bottom-up support paths. Render the actual packed bricks from three angles for a separate visual critique of the original brief, required features and latest revision request.
5. With automatic improvement enabled, make up to two further geometry requests containing exact failed checks, affected piece locations and visual feedback. Recheck every candidate. Keep the best completed candidate; cancellation preserves it. Failed checks remain visible after the cap. API service/authentication errors do not trigger automatic paid retries.
6. Inspect the outcome. Only a model with passing digital checks and visual review gets “Continue to studio.” Other compiled models can be kept explicitly as working drafts. These checks do not certify physical strength, clutch fit, insertion access, mechanisms or live part availability.

A generation request has a 240-second server timeout and 32,000 output-token ceiling. A visual review has a 120-second timeout and 4,000 output-token ceiling. Requests use `store: false`. Auto improvement can use up to three generation calls plus three visual review calls; the UI explains this before starting.

## More detail and scoped revisions

The scene format supports boxes, ellipsoids, vertical cylinders/cones and capsule beams with ordered addition/subtraction. Each new shape has a stable ID and named component. A repeat operation adds up to 32 instances at positive offsets, for features such as windows, scales, railings and masonry.

Bounds: 240 definitions, 1,400 expanded instances, 80 × 160 × 80 cells, four million bounding-box evaluations, 200,000 occupied cells and 16,000 packed parts. X/Z are 8 mm studs and Y is 3.2 mm plate layers. Detailed prompts request 70–130 purposeful definitions; Signature requests 130–210 and reserves capacity for repair. These are design instructions, not guarantees of output quality.

Component locks enforce unchanged geometry/order and final occupied or carved cells. Overlapping edits are rejected. Hollow-mode changes require unlocking components; final hollow geometry is also checked for lock conflicts. Legacy scenes acquire deterministic IDs before revision. The review screen shows added, changed and removed shape counts.

Packing prefers larger catalog bricks while rewarding seams that span multiple supports. Continuous plate courses at expanding overhangs prevent wall bricks from cutting through roofs. Optional hollowing keeps exterior walls, vertical ribs and horizontal diaphragms, then runs the support audit again. It may increase piece count even when reducing material, so the actual packed count remains the budget gate.

## Editing, projects and shopping

Manual additions, recolors, erasures and support columns become protected volume overrides. Subsequent AI generation packs around the overrides and restores exact edited bricks. Undo/redo restores complete model context for up to 25 changes. A manual edit invalidates the previous visual review.

Version 3 project JSON saves the name, description, generation scene, original brief, revision history, component locks, manual overrides, owned quantities, element IDs, price overrides and recorded seller quotes. Reopening validates geometry and context and recomputes inventory, audit and instructions. Version 2 files remain importable as geometry-only projects. API keys are never serialized. There is no server autosave; save the complete project before refreshing or leaving.

The parts manifest drives the viewport, inventory, animation and exports. CSV and BrickLink wanted-list XML subtract owned quantities. Pick a Brick CSV uses manually entered color-specific element IDs. Seller quote entries record an HTTPS product URL, available quantity, unit price and check time. Coverage shows which quantities have sufficient stock in those user-entered quotes. Stock and prices are not fetched automatically, and no shopping cart or store account is connected. Shipping and taxes are outside the subtotal.

PNG/JPG/WebP imports remain browser-local flat mosaics in a twelve-color palette. STL/OBJ imports remain browser-local closed-mesh sculptures, up to 10 MB, 60,000 triangles and 32 studs. Twelve instant procedural presets and a blank brick canvas remain available under More ways to create.

## Assembly and instructions

The assembly plays inside the model's own canvas. In the studio, Play assembly (or the expand button on the landing) switches the 3D view into playback with a floating bar for play, pause, replay, scrubbing, speed and Make video; Done returns to the interactive model. The live creation stage has the same inline playback for a finished draft. There is no separate film dialog.

The landing first shows the completed model, then smoothly releases the bricks into an automatic 18-second assembly. A short hold joins each loop without a blank cut. Inline pause and expand controls remain available. It advances only while visible and pauses behind dialogs. Reduced-motion preference shows the finished model unless the viewer explicitly resumes. Playback offers replay, pause, seek and 0.5×/1×/2× speed and does not need AI.

The landing, live creation and expanded film use a white stage with soft contact shadows and dark controls. Exported video uses the same white background and readable dark captions.

“Make video” records a complete 1280 × 720 clip in a browser-supported MediaRecorder format. The tab must remain visible; cancellation, hidden tabs and WebGL loss discard partial recordings. No camera or microphone is used.

Build guides now have at most 24 parts per step and expose exact X/Y/Z coordinates, rotation and a per-step parts list. Ground and earlier-piece support paths are checked. Assembly animation is cinematic; the guide still needs physical validation for strength and hand access. LDraw exports contain these same steps.

## Sizes and piece limits

Desk allows up to 200 pieces in 16 × 16 studs by 40 plates, Shelf up to 600 pieces in 24 × 24 by 64, and Statement up to 4,000 pieces in 48 × 40 by 120. Fine-tune limits can raise any of these. The design instructions explain that pieces come from occupied cells, about 8 to 12 cells per piece for solid masses and one per cell for thin details, and give the designer a cell budget for each size so it plans volume rather than shape count.

## Landmark presets

The four quick picks on the landing are real landmarks sculpted in `lib/landmarks.ts` at true-ish proportions: the Golden Gate Bridge (stepped Art Deco towers with portal struts, parabolic main cables with suspenders, anchorages, the stiffening truss, Fort Point and the headlands), Neuschwanstein Castle (the Palas with its north and south towers, courtyard wings, stair tower and the red-brick gatehouse on its rock), the Cape Hatteras Lighthouse (brick base, the black-and-white spiral daymark, gallery, lantern room and keepers' quarters) and the Saturn V (all three stages with roll patterns, the Apollo spacecraft and escape tower, on the mobile launcher beside the umbilical tower). The bridge keeps the studio's size, color, bay and shoreline controls. Small, medium and large sizes scale every landmark; the Saturn V caps its scale so the large size stays under the 240-layer ceiling.

## Brick packing and cleanup

The catalog includes 1 × 2 to 1 × 8 bricks and 1 × 4 to 1 × 8 plates, so thin walls, ledges and bridging courses pack into single pieces. Within each layer the packer places overhanging cells first and gives each one the piece that reaches back over something already placed, preferring placements that bridge the most unsupported span. Arches, eaves, lintels and cantilevers are anchored to the mass behind them instead of ending as loose plates. Before packing an AI scene, `tidyVoxels` deletes cells with nothing above or below and at most one side neighbour, then any cluster no longer connected to the ground; these are slivers left by curved subtractions and were the stray bricks in generated arches. Project files exported before this change may fail the saved-brick check when reopened because the same scene now packs differently.

## Generation flow

Only the first pass streams into the canvas. Auto-refine keeps the finished draft on screen while it reviews the model and reworks it, and swaps in the improved result once it compiles, so the model is never rebuilt from the foundation in view. The interface no longer counts passes; it reports composing, checking, refining and finished states. When a run finishes, the status bar under the canvas reads Finished and carries the actions to open the design in the studio, review again or repair remaining issues. Generation and visual review are pinned to `gpt-5.6-terra` with the standard service tier.

## Deploying to Cloudflare

Brickwork runs as a Cloudflare Worker with static assets, using the D1 database in `wrangler.jsonc` for the spending ledger. Production lives at https://brickwork.ryan-c-alcorn.workers.dev.

1. `npx wrangler login` once, then `npx wrangler d1 migrations apply brickwork-db --remote` whenever `drizzle/` gains a migration.
2. `npx wrangler secret put OPENAI_API_KEY` to set or rotate the shared studio key. The $10 budget is tracked per key fingerprint, so every visitor who uses the studio key shares one $10 pool; rotating the key starts a fresh pool. Also set a matching hard limit on the OpenAI project itself as a backstop.
3. `npm run deploy` builds with vinext and deploys with Wrangler.

## Verification

Run `node --test tests/landmarks.test.mjs tests/design-workflow.test.mjs tests/generation.test.mjs tests/assembly.test.mjs` for landmark presets, packer anchoring, voxel cleanup, support/overlap, protected edit and export round trips, locks, repeated features, hollow interiors, schema/stream failures, visual review contracts, inventory parity and deterministic assembly placement. The production build uses the Sites build helper.

Six varied evaluation briefs live in `tests/design-benchmarks.json`. Use the same size/limits across revisions and record recognizability, required-feature coverage, grounded/support counts, piece count, total generation time, revision fidelity and export/reopen fidelity. Live AI evaluations were not run because no API key is configured. Tests use authored geometry and mocked API responses. Browser playback, video export and physical construction were not tested. Standalone TypeScript checking retains the starter's missing Cloudflare runtime type declarations; production bundling succeeds.

## API references

- [Structured output](https://developers.openai.com/api/docs/guides/structured-outputs)
- [Image input and visual review](https://developers.openai.com/api/docs/guides/images-vision)
- [Streaming responses](https://developers.openai.com/api/docs/guides/streaming-responses)

Independent creation. Not affiliated with the LEGO Group.

## Phone layout

At 800 px and below, the studio collapses model settings, uses full-screen safe-area-aware dialogs, and separates the design preview from refinement controls. Fields are at least 16 px, primary touch controls are at least 44 px, and assembly playback has a full-width timeline. On coarse pointers, the 3D canvas starts in page-scroll mode; tap “Touch to rotate or edit” to interact, then “Done” to scroll again. Offscreen canvases stop rendering, and touch devices use reduced pixel density and shadow resolution. Browser/device QA has not been performed.

## Live creation stage

Creation now starts with a real two-layer catalog-brick foundation, supplied as the initial scene to the AI designer. Streaming previews use a bounded queue with one active compilation and one latest pending snapshot, paced to limit GPU rebuilds. The final pending snapshot is flushed before final compilation. Preview failures are surfaced; idle and failed states never show a perpetual loading spinner.

The creation viewport shares the assembly film’s rigid brick/stud transforms and a white studio stage with soft contact shadows. A geometry-keyed arrival ledger preserves settled and in-flight bricks through snapshot repacking; only new or changed bricks animate into place. Pause stops the animation clock while generation continues. Replay restarts the current arrangement. Reduced-motion settings settle bricks immediately. Refinement controls, history and audit details are secondary to the model, on desktop and phones.

`tests/live-arrivals.test.mjs` covers stable arrivals, geometry replacement, reduced motion, fast-stream final previews, cancellation, recovery and real foundation geometry. These checks use authored geometry and mocked asynchronous work. Live AI and browser animation testing still require the corresponding connection and browser test pass.

## Interrupted generation and recovery

Generation and visual review both return immediate event streams with five-second comment heartbeats while the upstream service is quiet. Heartbeats contain no fabricated progress. Deadlines abort the upstream request and emit one typed error. Errors distinguish rejected keys, exhausted credits, rate limits, inaccessible models, invalid requests, incomplete output, geometry failures, and lost connections. Server diagnostics record only route, code, status and request IDs, never keys, prompts, images or raw provider errors.

The AI JSON schema now carries the same string lengths, integer dimensions, coordinate ranges and radius bounds as the local validator. Geometry errors remain eligible for the existing limited repair passes. Service and account failures require a user retry and never silently trigger extra paid requests.

A successfully compiled streaming snapshot with subject geometry can be kept after interruption or Stop. A foundation alone is not presented as an unfinished custom design. Locked components are validated before a snapshot becomes recoverable. The recovery action is visible beside the canvas and continues with the original brief and the saved scene. Incomplete drafts are marked unfinished and cannot pass the final review gate. Draft state remains in the open design session; export a working project before leaving or refreshing.

`tests/generation-resilience.test.mjs` covers quiet streams, typed failures and redacted diagnostics, deadlines, cancellation, partial geometry and continuation, streamed visual review, final-frame parsing, and landing autoplay, looping, pause and reduced motion. Live logs showed a generation request canceled after 30,022 ms on 2026-09-08; they did not contain the earlier request’s in-stream error, so an idle timeout cannot be confirmed as the sole cause. No production AI key is configured. Verification uses mocked upstream responses, not a live account or browser test.

## Designs first

The home screen now opens directly on the current build's autoplaying 3D assembly. The marketing headline, introductory prose, prompt suggestions, and repeated assembly promotion have been removed from the landing. A compact prompt field sits below the model. Four quick picks expose the existing Bridge, Castle, Lighthouse, and Rocket designs immediately; choosing one updates the actual studio model and retains the previous project in undo history. Edit this build jumps directly to the studio. Build descriptions stay collapsed until requested. On phones the canvas comes immediately after the compact header, with no introduction above it.

## Focused, continuous experience

The landing and working studio are now separate in-page surfaces, sharing the same current project. Open studio reveals editing, inventory and guide controls without another copy of the landing above them. Back to designs returns to the current build, and clicking the brand does not reload or discard the project. Imports and accepted AI drafts open the studio automatically. The hidden studio is unmounted, avoiding a second idle WebGL canvas while browsing.

Initial setup is a compact sheet with the idea, scale and a reachable sticky build action. Detail level, required features, dimensions and style remain under optional disclosures. The text-only onboarding side panel and repeated progress headings have been removed. Connecting a key during setup can start the build in the same action; that exact in-memory key is forwarded to generation and review. No key is stored or added to project files.

The landing clock opens at the finished design, eases through a two-second disassembly, then assembles the same real parts over 18 seconds. Sample changes fade between models, and rapid choices cancel superseded transitions. Camera view changes ease over 520 ms and yield to pointer input. Each mounted viewport retains one WebGL renderer across incoming geometry snapshots, disposing obsolete scene geometry, materials and shadows while preserving the existing arrival ledger and camera. Renderer cleanup happens on unmount. Reduced-motion preferences skip transitions and keep the finished model visible.

Animation, stream and recovery checks pass with authored geometry and mocked responses. Production bundling is the validation gate; browser/device visual QA and live account generation have not been performed.

## Personal AI budget

A fixed $10 USD budget applies to Brickwork token usage per API key from this version onward. It includes generation, visual reviews, every automatic repair and manual retry. It does not reset on refresh, closing the dialog or disconnecting/reconnecting the same key. It does not include earlier calls, usage outside this Site, taxes or custom account pricing. The key remains in tab memory. D1 stores only a SHA-256 fingerprint, timestamps and monetary ledger entries, never the raw key, prompt or images.

Before a Responses request, count text and image input using OpenAI's input-token endpoint, add the output schema's byte length plus a 4,096-token formatting margin, and atomically reserve the uncached input cost plus the maximum allowed output cost. Prices are GPT-5.6 Terra standard rates checked 2026-09-08: $2/M input, $0.20/M cached input and $12/M output. Inputs above 272K use 2× input and 1.5× output rates. Explicit standard service prevents priority routing costs. Recheck published pricing before changing the model or rates.

An atomic conditional SQLite insert prevents parallel requests spending the same balance. Completed/incomplete responses with valid usage settle once and release the difference. Uncertain network failures, cancellations or missing usage retain the full reservation permanently; any HTTP error reply from the API, including rate limits and outages, releases it because nothing was generated. There is no automatic reset/refill endpoint. Missing storage, unpriced models, invalid token counts and insufficient funds stop paid calls. The maximum for the next request must fit, so generation may stop with a small balance remaining.

`node --test tests/ai-budget.test.mjs tests/generation-resilience.test.mjs` exercises the real migration/SQLite queries, concurrent reservations, persistence, secret-free ledger, provider errors, cached-token settlement, incomplete streams, and both generation/review routes with mocked OpenAI responses. No live paid API calls or browser tests were performed.

- [GPT-5.6 Terra pricing](https://developers.openai.com/api/docs/models/gpt-5.6-terra)
- [Input token counting](https://developers.openai.com/api/docs/guides/token-counting)
