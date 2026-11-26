// 肝臓3Dアトラス：事前ベイク済みジオメトリの高速ローダー（baked/*.bin を fetch して gzip 展開。file:// では読めず実行時生成に切り替わる）
(function () {
  const geoCache = new Map();
  const loadedChunks = new Set();
  const chunkPromises = new Map();

  // sRGB Uint8 (0..255) -> Linear Float32 LUT
  const SRGB_U8_LUT = new Float32Array(256);
  for (let i = 0; i < 256; i++) SRGB_U8_LUT[i] = Math.pow(i / 255, 2.2);

  // gzip（先頭 1f 8b）なら DecompressionStream で展開する
  function gunzip(buf) {
    const u = new Uint8Array(buf, 0, 2);
    if (u[0] !== 0x1f || u[1] !== 0x8b) return Promise.resolve(buf);
    if (typeof DecompressionStream === "undefined") return Promise.reject(new Error("DecompressionStream unsupported"));
    return new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
  }

  function parseBin(buf) {
    const dv = new DataView(buf);
    // Magic "LVB2"
    if (dv.getUint8(0) !== 0x4c || dv.getUint8(1) !== 0x56 || dv.getUint8(2) !== 0x42 || dv.getUint8(3) !== 0x32) {
      throw new Error("Invalid baked geometry header");
    }
    const jsonLen = dv.getUint32(4, true);
    const jsonBytes = new Uint8Array(buf, 8, jsonLen);
    let jsonStr;
    if (typeof TextDecoder !== "undefined") {
      jsonStr = new TextDecoder("utf-8").decode(jsonBytes);
    } else {
      jsonStr = "";
      for (let i = 0; i < jsonBytes.length; i++) jsonStr += String.fromCharCode(jsonBytes[i]);
    }
    const meta = JSON.parse(jsonStr);
    const bodyBase = 8 + jsonLen;

    for (let m = 0; m < meta.meshes.length; m++) {
      const info = meta.meshes[m];
      if (geoCache.has(info.k)) continue;
      const g = new THREE.BufferGeometry();
      if (info.ref) {
        const base = geoCache.get(info.ref);
        if (!base) throw new Error("Missing baked geometry ref: " + info.ref);
        g.setAttribute("position", base.getAttribute("position"));
        g.setAttribute("normal", base.getAttribute("normal"));
        g.setIndex(base.getIndex());
        g.boundingSphere = base.boundingSphere ? base.boundingSphere.clone() : null;
      } else {
        const nV = info.nV;
        const nV3 = nV * 3;
        // Position: Uint16 quantized in [bmin, bmax] -> Float32
        const posU16 = new Uint16Array(buf, bodyBase + info.posOff, nV3);
        const posF32 = new Float32Array(nV3);
        const bx = info.bmin[0], by = info.bmin[1], bz = info.bmin[2];
        const sx = (info.bmax[0] - bx) / 65535;
        const sy = (info.bmax[1] - by) / 65535;
        const sz = (info.bmax[2] - bz) / 65535;
        for (let i = 0; i < nV3; i += 3) {
          posF32[i] = bx + posU16[i] * sx;
          posF32[i + 1] = by + posU16[i + 1] * sy;
          posF32[i + 2] = bz + posU16[i + 2] * sz;
        }
        g.setAttribute("position", new THREE.BufferAttribute(posF32, 3));

        // Normal: Int8 normalized [-127..127] -> direct zero-copy view
        const norView = new Int8Array(buf, bodyBase + info.norOff, nV3);
        g.setAttribute("normal", new THREE.BufferAttribute(norView, 3, true));

        // Index: Uint16 or Uint32 direct zero-copy view
        const idxArr = info.idxType === 2
          ? new Uint16Array(buf, bodyBase + info.idxOff, info.nI)
          : new Uint32Array(buf, bodyBase + info.idxOff, info.nI);
        g.setIndex(new THREE.BufferAttribute(idxArr, 1));

        if (info.bs) {
          g.boundingSphere = new THREE.Sphere(new THREE.Vector3(info.bs[0], info.bs[1], info.bs[2]), info.bs[3]);
        } else {
          g.computeBoundingSphere();
        }
      }
      if (info.hasColor) {
        const nV3 = info.nV * 3;
        const colU8 = new Uint8Array(buf, bodyBase + info.colOff, nV3);
        const colF32 = new Float32Array(nV3);
        for (let i = 0; i < nV3; i++) colF32[i] = SRGB_U8_LUT[colU8[i]];
        g.setAttribute("color", new THREE.BufferAttribute(colF32, 3));
      }
      g.userData.shared = true;
      geoCache.set(info.k, g);
    }
  }

  function loadChunk(name) {
    if (loadedChunks.has(name)) return Promise.resolve();
    if (chunkPromises.has(name)) return chunkPromises.get(name);
    const pre = window.__BAKED_PREFETCH && window.__BAKED_PREFETCH[name];
    const fetchP = pre
      ? (delete window.__BAKED_PREFETCH[name], pre)
      : fetch("baked/" + name + ".bin").then((r) => {
          if (!r.ok) throw new Error("HTTP " + r.status + " for baked/" + name + ".bin");
          return r.arrayBuffer();
        });
    let p = fetchP.then(gunzip).then((buf) => {
      parseBin(buf);
      loadedChunks.add(name);
    });
    p = p.catch((err) => {
      chunkPromises.delete(name);
      console.warn("[LiverBaked] fallback to live SDF for chunk " + name + ":", err.message || err);
    });
    chunkPromises.set(name, p);
    return p;
  }

  function chunksFor(levelIdx, sp, pt) {
    if (levelIdx === 0) {
      return (sp === "mouse" && pt === "normal") ? ["l1_mouse_normal"] : ["l1_mouse_normal", "l1_variants"];
    }
    return ["shared", "l" + (levelIdx + 1)];
  }

  function isReadyFor(levelIdx, sp, pt) {
    const req = chunksFor(levelIdx, sp, pt);
    for (let i = 0; i < req.length; i++) if (!loadedChunks.has(req[i])) return false;
    return true;
  }

  function ensureFor(levelIdx, sp, pt) {
    const req = chunksFor(levelIdx, sp, pt);
    // l1_variants references l1_mouse_normal, so ensure order when both needed
    if (req.length === 2 && req[1] === "l1_variants" && !loadedChunks.has("l1_mouse_normal")) {
      return loadChunk("l1_mouse_normal").then(() => loadChunk("l1_variants"));
    }
    const pending = req.filter((c) => !loadedChunks.has(c));
    if (!pending.length) return Promise.resolve();
    return Promise.all(pending.map(loadChunk));
  }

  window.LiverBaked = {
    get: (k) => geoCache.get(k) || null,
    has: (k) => geoCache.has(k),
    isLoaded: (c) => loadedChunks.has(c),
    loadChunk,
    chunksFor,
    isReadyFor,
    ensureFor,
  };
})();
