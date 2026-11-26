// 肝臓3Dアトラス：全階層×全種×全病態のジオメトリを事前ベイクして baked/*.bin（gzip）を生成する
// 使い方: node scripts/bake.js
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const crypto = require("crypto");
const zlib = require("zlib");

const ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(ROOT, "baked");
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

// Node.js 用の軽量ブラウザシム（js/three.min.js + js/sdf.js + js/levels.js をそのまま実行）
global.THREE = require(path.join(ROOT, "js", "three.min.js"));
global.window = global;
global.self = global;
global.document = { createElement: () => ({ getContext: () => null }) };
global.LiverApp = {};

vm.runInThisContext(fs.readFileSync(path.join(ROOT, "js", "sdf.js"), "utf8"), { filename: "js/sdf.js" });

const captured = new Map(); // key -> THREE.BufferGeometry
const keyToChunk = new Map();

function classifyChunk(key, lv, sp, pt) {
  if (key.startsWith("sh_")) return "shared";
  if (lv === 0) return (sp === "mouse" && pt === "normal") ? "l1_mouse_normal" : "l1_variants";
  return "l" + (lv + 1);
}

let curCtx = { lv: 0, sp: "mouse", pt: "normal" };
global.__BAKE_CAPTURE = {
  onGeo(key, geo) {
    if (!captured.has(key)) {
      captured.set(key, geo);
      keyToChunk.set(key, classifyChunk(key, curCtx.lv, curCtx.sp, curCtx.pt));
    } else if (curCtx.lv === 0 && curCtx.sp === "mouse" && curCtx.pt === "normal") {
      // デフォルト起動(L1 mouse/normal)に必要なものは必ず l1_mouse_normal に入れる
      keyToChunk.set(key, "l1_mouse_normal");
    }
  }
};

vm.runInThisContext(fs.readFileSync(path.join(ROOT, "js", "levels.js"), "utf8"), { filename: "js/levels.js" });

const tAll = performance.now();
const SPECIES = ["mouse", "human"];
const PATHS = ["normal", "bdl", "gallstone"];

// 必ず mouse/normal の L1 を最初に実行してデフォルト起動メッシュを l1_mouse_normal に分類する
for (const sp of SPECIES) {
  for (const pt of PATHS) {
    for (let lv = 0; lv < 5; lv++) {
      curCtx = { lv, sp, pt };
      const t0 = performance.now();
      global.LiverApp.buildLevel(lv, sp, pt);
      const ms = (performance.now() - t0).toFixed(1);
      process.stdout.write(`Captured L${lv + 1} ${sp}/${pt} (${ms} ms)\n`);
    }
  }
}

function quantizeGeo(geo) {
  const posAttr = geo.getAttribute("position");
  const norAttr = geo.getAttribute("normal");
  const colAttr = geo.getAttribute("color");
  const idxAttr = geo.getIndex();
  const nV = posAttr.count;
  const nV3 = nV * 3;
  const nI = idxAttr ? idxAttr.count : nV;

  // Bounding box
  let x0 = Infinity, y0 = Infinity, z0 = Infinity;
  let x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
  for (let i = 0; i < nV; i++) {
    const x = posAttr.getX(i), y = posAttr.getY(i), z = posAttr.getZ(i);
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
    if (z < z0) z0 = z; if (z > z1) z1 = z;
  }
  if (x1 === x0) x1 = x0 + 1e-5;
  if (y1 === y0) y1 = y0 + 1e-5;
  if (z1 === z0) z1 = z0 + 1e-5;

  const posU16 = new Uint16Array(nV3);
  const invX = 65535 / (x1 - x0), invY = 65535 / (y1 - y0), invZ = 65535 / (z1 - z0);
  for (let i = 0; i < nV; i++) {
    const i3 = i * 3;
    posU16[i3] = Math.max(0, Math.min(65535, Math.round((posAttr.getX(i) - x0) * invX)));
    posU16[i3 + 1] = Math.max(0, Math.min(65535, Math.round((posAttr.getY(i) - y0) * invY)));
    posU16[i3 + 2] = Math.max(0, Math.min(65535, Math.round((posAttr.getZ(i) - z0) * invZ)));
  }

  const norI8 = new Int8Array(nV3);
  for (let i = 0; i < nV; i++) {
    const i3 = i * 3;
    const nx = norAttr ? norAttr.getX(i) : 0;
    const ny = norAttr ? norAttr.getY(i) : 1;
    const nz = norAttr ? norAttr.getZ(i) : 0;
    norI8[i3] = Math.max(-127, Math.min(127, Math.round(nx * 127)));
    norI8[i3 + 1] = Math.max(-127, Math.min(127, Math.round(ny * 127)));
    norI8[i3 + 2] = Math.max(-127, Math.min(127, Math.round(nz * 127)));
  }

  let colU8 = null;
  if (colAttr) {
    colU8 = new Uint8Array(nV3);
    const invGamma = 1 / 2.2;
    for (let i = 0; i < nV; i++) {
      const i3 = i * 3;
      const r = Math.max(0, Math.min(1, colAttr.getX(i)));
      const g = Math.max(0, Math.min(1, colAttr.getY(i)));
      const b = Math.max(0, Math.min(1, colAttr.getZ(i)));
      colU8[i3] = Math.round(Math.pow(r, invGamma) * 255);
      colU8[i3 + 1] = Math.round(Math.pow(g, invGamma) * 255);
      colU8[i3 + 2] = Math.round(Math.pow(b, invGamma) * 255);
    }
  }

  const idxType = nV <= 65535 ? 2 : 4;
  const idxArr = idxType === 2 ? new Uint16Array(nI) : new Uint32Array(nI);
  if (idxAttr) {
    for (let i = 0; i < nI; i++) idxArr[i] = idxAttr.getX(i);
  } else {
    for (let i = 0; i < nI; i++) idxArr[i] = i;
  }

  if (!geo.boundingSphere) geo.computeBoundingSphere();
  const bs = [
    +geo.boundingSphere.center.x.toFixed(5),
    +geo.boundingSphere.center.y.toFixed(5),
    +geo.boundingSphere.center.z.toFixed(5),
    +geo.boundingSphere.radius.toFixed(5)
  ];

  // 形状ハッシュ（pos + nor + idx + bmin/bmax が同一なら色だけ差し替える ref 化で大幅に軽量化）
  const h = crypto.createHash("sha256");
  h.update(Buffer.from(new Float32Array([x0, y0, z0, x1, y1, z1]).buffer));
  h.update(Buffer.from(posU16.buffer, posU16.byteOffset, posU16.byteLength));
  h.update(Buffer.from(norI8.buffer, norI8.byteOffset, norI8.byteLength));
  h.update(Buffer.from(idxArr.buffer, idxArr.byteOffset, idxArr.byteLength));
  const geomHash = h.digest("hex");

  return {
    nV, nI, idxType,
    bmin: [+x0.toFixed(6), +y0.toFixed(6), +z0.toFixed(6)],
    bmax: [+x1.toFixed(6), +y1.toFixed(6), +z1.toFixed(6)],
    bs, posU16, norI8, colU8, idxArr, geomHash
  };
}

// チャンクごとに整理（必ず l1_mouse_normal を先に処理して l1_variants が安全に ref できるようにする）
const CHUNK_ORDER = ["l1_mouse_normal", "l1_variants", "shared", "l2", "l3", "l4", "l5"];
const chunks = Object.fromEntries(CHUNK_ORDER.map((c) => [c, []]));
for (const [key, geo] of captured.entries()) {
  const c = keyToChunk.get(key);
  chunks[c].push({ key, geo });
}

// チャンク間で参照可能なベース形状（l1_variants -> l1_mouse_normal のみ許可、それ以外は同一チャンク内のみ）
const l1BaseHashes = new Map();
let totalBinBytes = 0;

for (const cname of CHUNK_ORDER) {
  const entries = chunks[cname];
  const localHashes = new Map();
  const meshMetas = [];
  const bodyParts = [];
  let bodyOff = 0;

  const appendAligned = (buf) => {
    const off = bodyOff;
    bodyParts.push(buf);
    bodyOff += buf.length;
    const rem = bodyOff & 3;
    if (rem) {
      const pad = 4 - rem;
      bodyParts.push(Buffer.alloc(pad));
      bodyOff += pad;
    }
    return off;
  };

  for (const { key, geo } of entries) {
    const q = quantizeGeo(geo);
    let refKey = localHashes.get(q.geomHash) || null;
    if (!refKey && cname === "l1_variants") {
      refKey = l1BaseHashes.get(q.geomHash) || null;
    }
    if (refKey) {
      const colOff = q.colU8 ? appendAligned(Buffer.from(q.colU8.buffer, q.colU8.byteOffset, q.colU8.byteLength)) : 0;
      meshMetas.push({
        k: key,
        ref: refKey,
        nV: q.nV,
        hasColor: q.colU8 ? 1 : 0,
        colOff
      });
    } else {
      localHashes.set(q.geomHash, key);
      if (cname === "l1_mouse_normal") l1BaseHashes.set(q.geomHash, key);
      const posOff = appendAligned(Buffer.from(q.posU16.buffer, q.posU16.byteOffset, q.posU16.byteLength));
      const norOff = appendAligned(Buffer.from(q.norI8.buffer, q.norI8.byteOffset, q.norI8.byteLength));
      const colOff = q.colU8 ? appendAligned(Buffer.from(q.colU8.buffer, q.colU8.byteOffset, q.colU8.byteLength)) : 0;
      const idxOff = appendAligned(Buffer.from(q.idxArr.buffer, q.idxArr.byteOffset, q.idxArr.byteLength));
      meshMetas.push({
        k: key,
        nV: q.nV,
        nI: q.nI,
        idxType: q.idxType,
        hasColor: q.colU8 ? 1 : 0,
        bmin: q.bmin,
        bmax: q.bmax,
        bs: q.bs,
        posOff, norOff, colOff, idxOff
      });
    }
  }

  let jsonBuf = Buffer.from(JSON.stringify({ meshes: meshMetas }), "utf8");
  const jRem = jsonBuf.length & 3;
  if (jRem) jsonBuf = Buffer.concat([jsonBuf, Buffer.alloc(4 - jRem, 0x20)]);

  const head = Buffer.alloc(8);
  head.write("LVB2", 0, "ascii");
  head.writeUInt32LE(jsonBuf.length, 4);

  const rawBuf = Buffer.concat([head, jsonBuf, ...bodyParts]);
  // gzip で保存し、ブラウザ側で DecompressionStream により展開する
  const binBuf = zlib.gzipSync(rawBuf, { level: 9 });
  totalBinBytes += binBuf.length;

  const binPath = path.join(OUT_DIR, `${cname}.bin`);
  fs.writeFileSync(binPath, binBuf);
  const oldJs = path.join(OUT_DIR, `${cname}.js`);
  if (fs.existsSync(oldJs)) fs.unlinkSync(oldJs);

  const refCnt = meshMetas.filter((m) => m.ref).length;
  console.log(`Wrote baked/${cname}.bin (${(binBuf.length / 1024).toFixed(1)} KB gz, raw ${(rawBuf.length / 1024).toFixed(1)} KB) | ${meshMetas.length} meshes (${refCnt} color-only refs)`);
}

console.log(`\nDone in ${((performance.now() - tAll) / 1000).toFixed(2)} s. Total .bin: ${(totalBinBytes / 1024 / 1024).toFixed(2)} MB across ${captured.size} unique keys.`);
