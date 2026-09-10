# Brickwork by Ralc

A custom brick design studio using React, Three.js and Vinext.

## Prompt to design

1. Describe an idea on the landing page, then review the guided brief. Choose Desk, Shelf or Statement size; Essential, Detailed or Signature detail; required features; and optional exact stud/plate dimensions, piece limit, style and hollow interiors.
2. Connect your own OpenAI API key, or use a configured studio key. A personal key takes precedence. A key entered in the UI stays in React memory for this tab. It is sent through the same-origin server to OpenAI, never included in exports or application logs. API billing belongs to that account. An optional `OPENAI_API_KEY` Site secret provides the shared connection. Requests are pinned to `gpt-5.6-terra` with standard service so the budget has known rates; arbitrary `OPENAI_MODEL` overrides are no longer used.
3. The Responses API streams a bespoke scene program. Completed shapes compile in a browser worker into the same catalog pieces used by the editor and inventory. There is no preset fallback on this path.
4. Validate geometry, actual piece count, dimensions, ground connection and bottom-up support paths. Render the actual packed bricks from three angles for a separate visual critique of the original brief, required features and latest revision request.
5. With automatic improvement enabled, make up to two further geometry requests containing exact failed checks, affected piece locations and visual feedback. Recheck every candidate. Keep the best completed candidate; cancellation preserves it. Failed checks remain visible after the cap. API service/authentication errors do not trigger automatic paid retries.
6. Inspect the outcome. Only a model with passing digital checks and visual review gets “Continue to studio.” Other compiled models can be kept explicitly as working drafts. These checks do not certify physical strength, clutch fit, insertion access, mechanisms or live part availability.

A generation request has a 240-second server timeout (420 seconds for the Best designer, which reasons for a minute or more before it streams) and 32,000 output-token ceiling. A visual review has a 120-second timeout and 4,000 output-token ceiling. Requests use `store: false`. One run is one lookup call (real subjects only), one generation call and one review call.

## More detail and scoped revisions

The scene format supports boxes, ellipsoids, cylinders and cones along any axis (upright, left-to-right for wheels and logs, or front-to-back) and capsule beams with ordered addition/subtraction. On the wire the model reads and writes a compact form (short keys, vectors as arrays, nulls for unused fields) that is about half the tokens of the full form; `lib/generated-scene.ts` translates both ways, and the stream parser, locks and saved projects keep using the full form. A revision returns only new and changed shapes plus the ids it removed; the server merges them into the previous scene (changed shapes keep their place in the operation order, new ones append) and streams a base event so the live preview starts from the unchanged bricks. Each new shape has a stable ID and named component. A repeat operation adds up to 32 instances at positive offsets, for features such as windows, scales, railings and masonry.

Bounds: 240 definitions, 1,400 expanded instances, 80 × 160 × 80 cells, four million bounding-box evaluations, 200,000 occupied cells and 16,000 packed parts. X/Z are 8 mm studs and Y is 3.2 mm plate layers. Detailed prompts request 70–130 purposeful definitions; Signature requests 130–210 and reserves capacity for repair. These are design instructions, not guarantees of output quality.

Component locks enforce unchanged geometry/order and final occupied or carved cells. Overlapping edits are rejected. Hollow-mode changes require unlocking components; final hollow geometry is also checked for lock conflicts. Legacy scenes acquire deterministic IDs before revision. The review screen shows added, changed and removed shape counts.

Packing prefers larger catalog bricks while rewarding seams that span multiple supports. Continuous plate courses at expanding overhangs prevent wall bricks from cutting through roofs. Optional hollowing keeps exterior walls, vertical ribs and horizontal diaphragms, then runs the support audit again. It may increase piece count even when reducing material, so the actual packed count remains the budget gate.

## Editing, projects and shopping

Getting the bricks is one click from wherever a design is: Get the bricks under a finished design in the creation dialog opens the studio with the shopping sheet already open, and every card under Your designs on the landing has a Get the pieces action that does the same. The sheet leads with the exports (BrickLink wanted list, the BrickLink upload page, the parts CSV) before the owned-quantity and quote details.

Manual additions, recolors, erasures and support columns become protected volume overrides. Subsequent AI generation packs around the overrides and restores exact edited bricks. Undo/redo restores complete model context for up to 25 changes. A manual edit invalidates the previous visual review.

Every custom model in the studio and every completed or kept draft in the creation dialog is autosaved to this browser's design library (IndexedDB, the twelve most recent). The landing lists them under Your designs with Open, Continue with AI and delete; drafts are marked In progress. Untouched landmark presets are not saved. The library lives only in this browser; export a project file to move a design elsewhere.

Version 3 project JSON saves the name, description, generation scene, original brief, revision history, component locks, manual overrides, owned quantities, element IDs, price overrides and recorded seller quotes. Reopening validates geometry and context and recomputes inventory, audit and instructions. Version 2 files remain importable as geometry-only projects. API keys are never serialized. There is no server autosave; the browser library keeps recent designs, and a project file is the portable copy.

The parts manifest drives the viewport, inventory, animation and exports. CSV and BrickLink wanted-list XML subtract owned quantities. Pick a Brick CSV uses manually entered color-specific element IDs. Seller quote entries record an HTTPS product URL, available quantity, unit price and check time. Coverage shows which quantities have sufficient stock in those user-entered quotes. Stock and prices are not fetched automatically, and no shopping cart or store account is connected. Shipping and taxes are outside the subtotal.

A photo can be sculpted with AI: the picture is downsized to a JPEG in the browser and sent with the brief as an image input, and the designer is instructed to recreate the pictured subject's silhouette, proportions, parts, colors and details. The photo is not stored with the design. PNG/JPG/WebP imports can still become browser-local flat mosaics in a twelve-color palette. STL/OBJ imports remain browser-local closed-mesh sculptures, up to 10 MB, 60,000 triangles and 32 studs. Twelve instant procedural presets and a blank brick canvas remain available under More ways to create.

## Clutch simulation and supports

A piece pressed onto the studs of a hanging piece (a slope or tile on an eave course) rides on it: its weight passes down into that piece, which then hangs with the extra load, instead of being reported as floating.

`lib/clutch.ts` estimates whether the bricks hold. Each piece weighs about 0.095 g per cell. Weight flows down through stud contacts to grounded pieces; a piece with nothing grounded beneath it hangs from the studs above and its load, plus everything hanging from it, is compared with 1.6 N per engaged stud; a grounded piece whose loaded centre lies outside its footing levers on those studs, and the moment is compared with the clutch couple across the footing. Tiles engage no studs. The parts audit reports the joints beyond clutch and those within a factor of two, and Show clutch map colors every rated piece green, amber or red in the 3D view. The same check feeds the design checks the AI repairs against. It is a first-order estimate, not a test build.

Add vertical supports tags every column it adds; Remove added supports strips exactly those, and both actions offer Undo on their toast as well as through the editor history.

## Assembly and instructions

The assembly is an intro that plays inside the interactive 3D view whenever a design opens in the studio, with a Skip control in its pill. A design already seen assembling in this session plays at double speed on every return. The Play button in the view controls plays it, pauses it mid-way, resumes, and replays once it has finished; the viewer can orbit and zoom throughout. The landing film also allows orbiting, and its slow camera sweep stops as soon as the viewer takes the camera. The download control in the view controls records the replay to a video. The live creation stage replays its brick arrivals. There is no separate film dialog or playback mode.

Every brick is in the air from the first frame of the intro, waiting at the far end of its own flight path, so the late arrivals are part of the picture from the start instead of appearing out of nowhere. Explode blows the model apart like a rubber-band ball: every brick moves straight out from the model's centre, in every direction, to up to 3.4 times its distance, tumbling on its intro spin; the expansion is about the centre of the base so the bottom row spreads outward and everything else lifts and spreads, and the camera pulls back to keep the whole cloud in frame.

The landing plays the same intro as the studio: the bricks fly in and assemble over 18 seconds, then the finished model stays in place for orbiting. The control beside the title pauses and resumes the intro and, once it has landed, plays it again. Inline pause and expand controls remain available. It advances only while visible and pauses behind dialogs. Reduced-motion preference shows the finished model unless the viewer explicitly resumes. Playback offers replay, pause, seek and 0.5×/1×/2× speed and does not need AI.

The landing, live creation and expanded film use a white stage with soft contact shadows and dark controls. Exported video uses the same white background and readable dark captions.

“Make video” records a complete 1280 × 720 clip in a browser-supported MediaRecorder format. The tab must remain visible; cancellation, hidden tabs and WebGL loss discard partial recordings. No camera or microphone is used.

Build guides now have at most 24 parts per step and expose exact X/Y/Z coordinates, rotation and a per-step parts list. Ground and earlier-piece support paths are checked. Assembly animation is cinematic; the guide still needs physical validation for strength and hand access. LDraw exports contain these same steps.

## Lighting

The stage is lit by three lights on one material. Every brick and stud is a MeshStandardMaterial with roughness 0.3 and no metalness, so the plastic reads glossy without looking like metal. A hemisphere light gives the soft sky-and-ground fill, a cool blue fill from the back right keeps shadow sides from going black, and a warm directional sun is the key light that puts the highlights on stud tops and rounded brick edges and casts the soft shadows (PCF soft shadow map, with a small normal bias so the studs do not self-shadow). The key light sits on an arc over the model, low on the left at one end, overhead in the middle, low on the right at the other, warming slightly as it drops. During the assembly intro it travels across from the left to wherever the Light slider sits, so the bricks land under a moving light; afterwards the slider beside Explode moves it directly.

## Themes

Light, dark and follow-the-device themes are available from the toggle in the header, remembered in this browser. The stylesheet uses a shade system rather than raw greys: three surface levels, two line weights, three ink weights, glass, warning and accent-soft roles, each defined for both palettes, and the 3D stages read their background, fog and ground light from the same variables so the canvas changes with the theme.

## Builder craft

The design instructions carry guidance from experienced brick sculptors: brick math (2 studs of width equal 5 plates of height), footprint first then masses then texture, silhouette and proportion over fuss, an analogous palette with one complementary accent at the focal point, micro-texture with purpose, staggered courses and tied corners, returns for overhangs, an internal solid core in large volumes, finished bases and deliberate negative space. The visual reviewer judges with the same eye and asks for specific, buildable improvements.

Smooth finish, on by default in the brief, swaps every plate whose top is fully exposed for the tile of the same size (1 × 1 to 2 × 4), and splits exposed 2 × 8 and 4 × 8 plates into 2 × 4 tiles when every cell of them rests on something, so finished surfaces are not stud-heavy; the base keeps its studs. The catalog holds studs-up bricks, plates, tiles and slopes; the prompt tells the designer that SNOT brackets, hinges, Technic and large moulded parts are unavailable, and that curves modelled as true ellipsoids, cylinders and cones and roofs modelled as stepped courses come out with real slope parts.

## Working like an architect

A fresh design follows the workflow a LEGO architect uses rather than one shot at a finished model.

1. **Scale first.** When the subject is real, its metres become a target in studs and plates, and `shellPlan` works out how thick a hollow shell at that size can be and still fit the piece budget (cells pack at about nine per piece, the base costs a 4 × 8 plate per 16 cells, and 15 percent is held back for detail). The plan is shown under the reference sheet and sent to the designer with the rule to thin the skin before ever shrinking the footprint. When even 1-stud walls do not fit, the plan names the largest faithful size and the target is reduced to it, so the designer and the proportion check agree.
2. **Signature features.** The designer names the two to four features that make the subject recognizable at a glance in the scene header (`f` on the wire) before drawing, and is told to spend the budget on them first. They are shown with the result and the visual reviewer checks each one alongside the brief's required features, so a design whose own signature features are not visible is not finished.
3. **Massing before detail.** The first design call is a massing pass limited to about twelve shapes: the base, the primary masses at final size and position, the hollowing the plan calls for, and a Core component under every overhang. The blockout is packed, rendered from three sides and sent to `/api/review` with `stage: "massing"`, where an architect prompt judges only scale, proportions, layout, silhouette and whether every cantilever has a pier, returning up to five corrections in studs and plates. Texture and studs are not judged because they do not exist yet.
4. **Detail as a revision.** The detail pass receives the massing scene as `previous` together with the critique, applies the corrections to the masses (a corrected mass keeps its id), then adds all the detail as a diff. The canvas follows both passes live; the blockout is on screen while the detail arrives. If the massing pass fails geometry or the critique cannot run, the detail pass proceeds as a direct design, so the workflow never blocks a build.
5. **Structure first.** The instructions require a Core component of solid boxes, piers or spines inside the main masses and under every cantilever, reaching the base, and the build-order audit now accepts a piece hung from a placed piece above it (an eave plate, an inverted slope), which the clutch simulation then judges.

Revisions, repairs and continuations skip the massing pass and revise the existing scene as before. The massing call is cheap (a few hundred output tokens) and the critique sends its three views at low detail.

## Looking the subject up

Before the first design of a new idea, `/api/research` asks GPT-5.6 Terra whether the idea names a specific real subject (a landmark, vehicle model, species, product, character). If it does, the model runs up to two web searches through the Responses API's built-in tool and returns a reference sheet: real length, width and height in metres, a proportions sentence, colors mapped to the palette, silhouette features, distinctive details and up to four sources. The sheet is shown under the brief and passed to the designer as ground truth. The lookup also classifies the subject (building, monument, bridge, site, vehicle, aircraft, ship, animal, plant, character, object). Its metres are converted to a target size in studs and plates that fits the brief's envelope; sites, bridges and anything more than eight times longer than tall fill the footprint and have their heights exaggerated up to three times, the way architectural models do, and the sheet says so; the designer must hit that target within 10 percent, and the design checks measure the finished model against it and flag a proportion issue when it is more than 15 percent off, so a squashed or stretched subject is a failed check the designer is told to fix. Generic or imaginary ideas skip the lookup. A failed lookup is not fatal; the design proceeds without it. The budget guard prices the lookup at $10 per thousand search calls plus a 30,000-token allowance for page content at input rates, reserving for the calls allowed and settling on the calls that actually ran.

## Sizes and piece limits

Desk allows up to 200 pieces within 32 × 32 studs by 64 plates, Shelf up to 600 pieces within 48 × 48 by 96, and Statement up to 4,000 pieces within 80 × 80 by 160. Footprints are square so a subject can run its length in either direction; the designer is told to run the longest dimension left to right with the front toward the camera, and to keep the real subject's length, width and height ratios within about 20 percent. The reviewer measures those ratios first and fails a model that comes out wider than long or flatter than the real thing. These envelopes are ceilings, not targets: the designer is told to choose the footprint and height that suit the subject, long and low or tall and narrow, and to set the scene dimensions to the design's real extents. The starting foundation is a 12 × 12 placeholder the designer resizes; it no longer seeds a square base. The design instructions explain that pieces come from occupied cells, about 8 to 12 cells per piece for solid masses and one per cell for thin details, and give the designer a cell budget for each size so it plans volume rather than shape count.

## Landmark presets

The four quick picks on the landing are real landmarks sculpted in `lib/landmarks.ts`. The Golden Gate Bridge is built from a measured blueprint (see below), Neuschwanstein Castle (the Palas with its north and south towers, courtyard wings, stair tower and the red-brick gatehouse on its rock), the Cape Hatteras Lighthouse (brick base, the black-and-white spiral daymark, gallery, lantern room and keepers' quarters) and the Saturn V (all three stages with roll patterns, the Apollo spacecraft and escape tower, on the mobile launcher beside the umbilical tower). The bridge keeps the studio's size, color, bay and shoreline controls. Small, medium and large sizes scale every landmark, and large is the default in the studio; the Saturn V caps its scale so the large size stays under the 240-layer ceiling.

## Golden Gate blueprint

The bridge is generated from fixed figures published by the bridge district: 4,200 ft main span, 1,125 ft side spans, towers 746 ft above water, deck 220 ft above water, roadway 90 ft wide. The 6,450 ft suspended length is laid out as 80 studs (one stud is 80.6 ft), so the towers sit 52 studs apart with 14-stud side spans and 8-stud approaches. Two choices are explicit and exposed in the studio's Proportions control: True scale keeps heights 1:1 (towers 23 plates above water, deck 7, a 2-stud road, 1-plate deck) and Display doubles heights (46 and 14) with a 6-stud road, because the real roadway is 1.1 studs wide at this scale and any buildable road is an exaggeration. Each tower is one construction placed twice: paired legs, a strut under the deck and four above at the real strut heights, with a saddle over the cable line. Each cable is one continuous one-stud path over both saddles, dipping to the deck at mid-span, with suspenders every two studs (three at true scale). Water, headlands and Fort Point come last.

`goldenGateReport` measures the finished voxels against the blueprint from the side: tower spacing, side span, tower-to-deck height ratio, roadway width against the true width, deck thickness, cable gaps and suspender count, and a test holds those within tolerance and checks that packing keeps every suspender column.

What the methodology cannot certify: the deck hangs from the cables, and neither the bottom-up support audit nor the clutch simulation models tension in stud-by-stud plate cables, so the deck and cables report as unsupported and floating. That is a limit of the checks, not the blueprint. A physical build would need a stiffer deck or discreet piers.

## Brick packing and cleanup

The catalog includes 1 × 2 to 1 × 8 bricks, 1 × 4 to 1 × 8 plates and tiles from 1 × 1 to 2 × 4, so thin walls, ledges and bridging courses pack into single pieces. Within each layer the packer places overhanging cells first and gives each one the piece that reaches back over something already placed, preferring placements that bridge the most unsupported span. Arches, eaves, lintels and cantilevers are anchored to the mass behind them instead of ending as loose plates. Before packing an AI scene, `tidyVoxels` deletes cells with nothing above or below and at most one side neighbour, then any small cluster (under 48 cells) no longer connected to the ground, while large floating masses are kept for the support checks to report; these are slivers left by curved subtractions and were the stray bricks in generated arches. Project files exported before this change may fail the saved-brick check when reopened because the same scene now packs differently.

## Slopes

Studs-up bricks alone make every curve a staircase, which is why a bean looked like a bunker. Before the packer runs, `carveSlopes` in `lib/slopes.ts` looks for the staircase patterns a voxelized curve or pitch leaves behind and swaps each for the slope part that matches its rise and run: a 3-plate step with the staircase rising behind it becomes a 45° slope (2 × 1, or the 2 × 2 with its studded back row when the column behind is solid), a 2-plate step a cheese slope (1 × 1 or 1 × 2), two 1-plate steps over two studs a curved slope (1 × 2 or 2 × 2), a 3-plate rise over two studs a 33° slope (3 × 1 or 3 × 2), and the same step on an underside an inverted 45° slope held by the course above. A slope is fitted only where the surface keeps rising behind it, so a flat roof edge stays square, only where it rests on something, and only where the column directly behind the step is solid, because on a one-stud curved skin carving the step just fragments the skin into small pieces with less clutch; an inverted pair is refused when it would strand a neighbouring overhang cell that needs those cells to bridge back into the mass. The cells a slope takes leave the voxel map and the packer fills the rest, so coverage and overlap checks still hold. Each slope piece carries a `face` (the direction its slope descends) and `rotated` follows from it, so project files, the design library, manual edits and the LDraw export (orientation approximate for slopes) all round-trip. Stud contact, in the audit, the clutch simulation and the renderers, comes from `studCells`: bricks and plates everywhere, tiles nowhere, studded slopes only on their flat back row, inverted slopes across their top. The viewport and the review renderer build slope geometry from `lib/brick-geometry.ts`, so the visual critic sees the same wedges the viewer does. Slopes add pieces (roughly 15 to 30 percent on a curved surface); the scale plan's 15 percent reserve covers it. Landmark presets are packed without the slope pass so their fixtures stay as designed.

## Generation flow

A fresh run is massing, blockout critique, detail, pack, check, one visual review, finished (see Working like an architect); a revision is one pass. There are no automatic repair passes. Under the result sits a text box to say what is wrong or what should change in your own words; Revise design sends that with the failed checks and the review to the designer as a revision of the same scene, and leaving it blank repairs only the flagged checks. Review again re-runs the visual review, Rebuild bigger starts over at Statement size with the same idea and facts, and Open in studio (or Keep as working draft) hands the model to the studio. Generation runs on `gpt-5.6-terra` by default; the brief's Designer choice switches the design call to `gpt-5.6-sol` (Better, twice the price per token) or `gpt-6-astra` (Best, five times), while the lookup and the review stay on Terra. Both models are priced in the ledger at their published standard rates.

## Deploying to Cloudflare

Brickwork runs as a Cloudflare Worker with static assets, using the D1 database in `wrangler.jsonc` for the spending ledger. Production lives at https://brickwork.ryan-c-alcorn.workers.dev.

1. `npx wrangler login` once, then `npx wrangler d1 migrations apply brickwork-db --remote` whenever `drizzle/` gains a migration.
2. `npx wrangler secret put OPENAI_API_KEY` to set or rotate the shared studio key. The $10 budget is tracked per key fingerprint, so every visitor who uses the studio key shares one $10 pool; rotating the key starts a fresh pool. Also set a matching hard limit on the OpenAI project itself as a backstop.
3. `npm run deploy` type-checks, builds with vinext and deploys with Wrangler. A type error stops the deploy.

## Verification

Run `node --test tests/landmarks.test.mjs tests/design-workflow.test.mjs tests/generation.test.mjs tests/assembly.test.mjs` for landmark presets, packer anchoring, voxel cleanup, support/overlap, protected edit and export round trips, locks, repeated features, hollow interiors, schema/stream failures, visual review contracts, inventory parity and deterministic assembly placement. The production build uses the Sites build helper.

Six varied evaluation briefs live in `tests/design-benchmarks.json`. Use the same size/limits across revisions and record recognizability, required-feature coverage, grounded/support counts, piece count, total generation time, revision fidelity and export/reopen fidelity. Live AI evaluations were not run because no API key is configured. Tests use authored geometry and mocked API responses. Browser playback, video export and physical construction were not tested. `types/cloudflare-workers.d.ts` declares the `cloudflare:workers` module so the standalone type-check is clean, and the deploy script runs it first.

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

There is one stage. The page opens on the current model assembling itself in the same 3D view the studio uses, with the designs drawer open beside it: the four landmark presets and everything saved in this browser, drafts included. Choosing a landmark or opening a saved design swaps the model in place and plays its assembly; nothing leaves the page. A command bar under the top bar holds the three things you can always do: open or close the designs drawer (collapsed by default), describe something new (the idea field, with an import button for photos, 3D models and project files), and Make it yours, which opens or closes the tools.


## Focused, continuous experience

Opening the tools does not change pages. The tools panel slides in on the right, the drawer folds away to make room, and the 3D view stays exactly where it was, camera included. The model's name, piece count, build details and the Refine with AI and Edit bricks actions sit on the stage itself as a HUD in the top left, mirroring the playback and camera controls on the right, so nothing stacks above the view: the assembly intro only plays when a new model arrives, never because a panel opened. With the tools open the stage gains the brick editor, the model metrics and the Parts audit and Build guide sections below it, and the settings panel (size, colors, dimensions, estimated cost) beside it. Clicking the model while the tools are closed opens them; a drag still orbits. The slow camera sweep during the intro runs only while the tools are closed, so the stage reads as a presentation until you start working. Both panels can be reopened at any time; below 1240px an open drawer floats over the stage while the tools are open, and on a phone both stack above and below the stage instead.


## Personal AI budget

A fixed $10 USD budget applies to Brickwork token usage per API key from this version onward. It includes generation, visual reviews, every automatic repair and manual retry. It does not reset on refresh, closing the dialog or disconnecting/reconnecting the same key. It does not include earlier calls, usage outside this Site, taxes or custom account pricing. The key remains in tab memory. D1 stores only a SHA-256 fingerprint, timestamps and monetary ledger entries, never the raw key, prompt or images.

Before a Responses request, count text and image input using OpenAI's input-token endpoint, add the output schema's byte length plus a 4,096-token formatting margin, and atomically reserve the uncached input cost plus the maximum allowed output cost. Prices are GPT-5.6 Terra standard rates checked 2026-09-08: $2/M input, $0.20/M cached input and $12/M output. Inputs above 272K use 2× input and 1.5× output rates. Explicit standard service prevents priority routing costs. Recheck published pricing before changing the model or rates.

An atomic conditional SQLite insert prevents parallel requests spending the same balance. Completed/incomplete responses with valid usage settle once and release the difference. Uncertain network failures, cancellations or missing usage retain the full reservation permanently; any HTTP error reply from the API, including rate limits and outages, releases it because nothing was generated. There is no automatic reset/refill endpoint. Missing storage, unpriced models, invalid token counts and insufficient funds stop paid calls. The maximum for the next request must fit, so generation may stop with a small balance remaining.

`node --test tests/ai-budget.test.mjs tests/generation-resilience.test.mjs` exercises the real migration/SQLite queries, concurrent reservations, persistence, secret-free ledger, provider errors, cached-token settlement, incomplete streams, and both generation/review routes with mocked OpenAI responses. No live paid API calls or browser tests were performed.

- [GPT-5.6 Terra pricing](https://developers.openai.com/api/docs/models/gpt-5.6-terra)
- [Input token counting](https://developers.openai.com/api/docs/guides/token-counting)
