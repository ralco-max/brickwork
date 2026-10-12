import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {createConnectorCompiler} from "../scripts/ldcad-connectors.mjs";

const identity = "1 0 0 0 1 0 0 0 1";
const reference = (name, matrix = identity, position = "0 0 0") =>
  `1 16 ${position} ${matrix} ${name}.dat\n`;
const stud = "0 !LDCAD SNAP_CYL [id=stud] [gender=M] [caps=one] [secs=R 6 4]\n";
const socket = "0 !LDCAD SNAP_CYL [id=socket] [gender=F] [caps=one] [secs=R 6 4] [pos=0 8 0]\n";

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "brickwork-connector-test-"));
  const source = path.join(directory, "source"), shadow = path.join(directory, "shadow");
  fs.mkdirSync(path.join(source, "parts"), {recursive: true});
  fs.mkdirSync(path.join(shadow, "parts"), {recursive: true});
  t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
  const write = (root, name, content) => fs.writeFileSync(path.join(root, "parts", `${name}.dat`), content);
  return {
    source: (name, content) => write(source, name, content),
    shadow: (name, content) => write(shadow, name, content),
    compiler: () => createConnectorCompiler(source, shadow),
  };
}

const positions = (connectors, gender) => connectors
  .filter(connector => !gender || connector.gender === gender)
  .map(connector => connector.position);

test("centered grids retain real sockets instead of filling an arch opening", t => {
  const f = fixture(t);
  f.shadow("stud", stud);
  f.source("beam", [-30, -10, 10, 30].map(x => reference("stud", identity, `${x} 0 0`)).join(""));
  f.shadow("beam", "0 !LDCAD SNAP_CYL [gender=F] [caps=one] [secs=S 6 20] [pos=0 24 0] [grid=C 4 1 20 0]\n");
  f.source("arch", reference("beam"));
  f.shadow("arch", "0 !LDCAD SNAP_CLEAR\n"
    + "0 !LDCAD SNAP_CYL [gender=M] [caps=one] [secs=R 6 4] [grid=C 4 1 20 0]\n"
    + "0 !LDCAD SNAP_CYL [gender=F] [caps=one] [secs=S 6 20] [pos=0 24 0] [grid=C 2 1 60 0]\n");
  const c = f.compiler();
  assert.deepEqual(positions(c.load("beam"), "F"), [-30, -10, 10, 30].map(x => [x, 24, 0]));
  assert.deepEqual(positions(c.load("arch"), "M"), [-30, -10, 10, 30].map(x => [x, 0, 0]));
  assert.deepEqual(positions(c.load("arch"), "F"), [[-30, 24, 0], [30, 24, 0]]);
});

test("mirrored geometry inherits connectors only when its mirror policy permits", t => {
  const f = fixture(t);
  f.shadow("stud", stud.replace("[secs=R 6 4]", "[secs=R 6 4] [pos=20 0 0]"));
  f.shadow("unmirrorable", stud.replace("[secs=R 6 4]", "[secs=R 6 4] [mirror=none]"));
  f.source("mirror", reference("stud", "-1 0 0 0 1 0 0 0 1"));
  f.source("denied", reference("unmirrorable", "-1 0 0 0 1 0 0 0 1"));
  f.source("upside-down", reference("stud", "1 0 0 0 -1 0 0 0 -1"));
  const c = f.compiler();
  assert.deepEqual(positions(c.load("mirror")), [[-20, 0, 0]]);
  assert.deepEqual(c.load("denied"), []);
  assert.deepEqual(c.load("upside-down"), []);
});

test("SNAP_CLEAR removes selected inherited IDs or all inherited connectors", t => {
  const f = fixture(t);
  f.shadow("stud", stud);
  f.shadow("socket", socket);
  const inherited = reference("stud") + reference("socket");
  f.source("selective", inherited);
  f.shadow("selective", "0 !LDCAD SNAP_CLEAR [id=stud]\n");
  f.source("all", inherited);
  f.shadow("all", "0 !LDCAD SNAP_CLEAR\n");
  const c = f.compiler();
  assert.deepEqual(c.load("selective").map(connector => connector.gender), ["F"]);
  assert.deepEqual(c.load("all"), []);
});

test("SNAP_INCL rotates a centered grid without inheriting referenced geometry", t => {
  const f = fixture(t);
  f.shadow("socket", socket);
  f.source("donor", reference("socket"));
  f.shadow("donor", stud.replace("[secs=R 6 4]", "[secs=R 6 4] [pos=20 0 0]"));
  f.shadow("included", "0 !LDCAD SNAP_INCL [ref=donor.dat] [pos=100 0 0] [ori=0 0 1 0 1 0 -1 0 0] [grid=C 2 C 2 20 40]\n");
  const connectors = f.compiler().load("included");
  assert.deepEqual(positions(connectors), [[80, 0, -10], [80, 0, -30], [120, 0, -10], [120, 0, -30]]);
  assert.ok(connectors.every(connector => connector.gender === "M"));
});

test("inherited scaling honors none and YOnly policies", t => {
  const f = fixture(t);
  f.shadow("stud", stud);
  f.shadow("socket", socket.replace("[secs=R 6 4]", "[secs=R 6 4] [scale=YOnly]"));
  f.source("scaled-stud", reference("stud", "1 0 0 0 2 0 0 0 1"));
  f.source("scaled-socket", reference("socket", "1 0 0 0 2 0 0 0 1"));
  f.source("widened-socket", reference("socket", "2 0 0 0 1 0 0 0 2"));
  const c = f.compiler();
  assert.deepEqual(c.load("scaled-stud"), []);
  assert.deepEqual(positions(c.load("scaled-socket")), [[0, 16, 0]]);
  assert.deepEqual(c.load("widened-socket"), []);
});

test("underside tube primitives do not invent ordinary stud sockets", t => {
  const f = fixture(t);
  f.shadow("stud3", "0 !LDCAD SNAP_CYL [id=stud3] [gender=M] [caps=one] [secs=R 4 4] [scale=YOnly]\n");
  f.shadow("stud4", "0 //!LDCAD SNAP_CYL [id=aStud] [gender=F] [caps=one] [secs=R 6 4]\n");
  f.source("tubes", reference("stud3") + reference("stud4"));
  assert.deepEqual(f.compiler().load("tubes"), []);
});

test("6141-style compound cylinder contributes its stud, not its wider plate body", t => {
  const f = fixture(t);
  f.shadow("stud", stud);
  f.source("round-plate", reference("stud"));
  f.shadow("round-plate", "0 !LDCAD SNAP_CLEAR\n"
    + "0 !LDCAD SNAP_CYL [gender=F] [caps=one] [secs=R 6 5] [pos=0 8 0]\n"
    + "0 !LDCAD SNAP_CYL [gender=M] [caps=none] [secs=R 10 3   R 6 4] [slide=true] [pos=0 3 0]\n"
    + "0 !LDCAD SNAP_CYL [gender=M] [caps=none] [secs=R 10 3   R 8 5] [slide=true] [ori=-1 0 0 0 -1 0 0 0 1]\n");
  const connectors = f.compiler().load("round-plate");
  assert.equal(connectors.length, 2);
  assert.deepEqual(positions(connectors, "M"), [[0, 0, 0]]);
  assert.deepEqual(positions(connectors, "F"), [[0, 8, 0]]);
});
