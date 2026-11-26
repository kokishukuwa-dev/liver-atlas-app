// 肝臓3Dアトラス v2：描画・カメラ・階層の切り替え・画面の部品
(function () {
  const A = window.LiverApp;
  const canvas = document.getElementById("gl");
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.04;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);

  // ===== 環境光（粘土〜樹脂の艶を出しつつ白飛びさせないスタジオ） =====
  (function makeEnv() {
    const es = new THREE.Scene();
    const g = new THREE.SphereGeometry(20, 36, 18);
    const pos = g.attributes.position, cols = [];
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) / 20;
      const c = y > 0
        ? [0.76 + 0.08 * y, 0.72 + 0.08 * y, 0.68 + 0.10 * y]
        : [0.58 - 0.18 * -y, 0.50 - 0.16 * -y, 0.44 - 0.14 * -y];
      cols.push(c[0], c[1], c[2]);
    }
    g.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3));
    es.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
    const box = (w, h, p, k) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(k, k * 0.97, k * 0.93), side: THREE.DoubleSide }));
      m.position.set(p[0], p[1], p[2]); m.lookAt(0, 0, 0); es.add(m);
    };
    box(8, 5, [7, 11, 8], 2.7);
    box(7, 7, [-11, 5, 5], 1.15);
    box(10, 4, [0, -3, -12], 0.95);
    box(5, 3, [0, 12, -2], 1.35);
    const pm = new THREE.PMREMGenerator(renderer);
    scene.environment = pm.fromScene(es, 0.035).texture;
    pm.dispose();
  })();
  scene.add(new THREE.HemisphereLight(0xfff5e8, 0xb59c84, 0.36));
  const key = new THREE.DirectionalLight(0xfff4e4, 1.25);
  key.position.set(5, 9, 7);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: 1, far: 30 });
  key.shadow.bias = -0.0005; key.shadow.normalBias = 0.025;
  scene.add(key); scene.add(key.target);
  const fill = new THREE.DirectionalLight(0xdbe8ff, 0.28); fill.position.set(-6, 3, 5); scene.add(fill);
  const rim = new THREE.DirectionalLight(0xffe7cf, 0.34); rim.position.set(-4, 6, -8); scene.add(rim);

  // 接地の影（柔らかい楕円）
  const shadowTex = (() => {
    const c = document.createElement("canvas"); c.width = c.height = 256;
    const x = c.getContext("2d");
    const g = x.createRadialGradient(128, 128, 10, 128, 128, 128);
    g.addColorStop(0, "rgba(85,62,42,0.28)");
    g.addColorStop(0.55, "rgba(85,62,42,0.11)");
    g.addColorStop(1, "rgba(85,62,42,0)");
    x.fillStyle = g; x.fillRect(0, 0, 256, 256);
    return new THREE.CanvasTexture(c);
  })();
  const blob = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
  blob.rotation.x = -Math.PI / 2; blob.scale.set(10, 6, 1); scene.add(blob);

  // ===== 状態 =====
  const state = { species: "mouse", path: "normal", level: 0, labels: true, playing: true, xray: false, drawerOpen: false, sel: null, tab: "s" };
  const XRAY_OPACITY = 0.25;
  const levels = [null, null, null, null, null];
  const keyOf = () => state.species + "/" + state.path;
  const cam = { yaw: 0, pitch: 0.2, dist: 10, target: new THREE.Vector3(), tYaw: 0, tPitch: 0.2, tDist: 10, tTarget: new THREE.Vector3(), lastInput: -10 };
  let trans = null, time = 0, lastDistScale = 1;

  function distScale() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (w > 900) return 1;
    const aspect = w / Math.max(1, h);
    return Math.max(1.12, Math.min(2.15, 1.00 / Math.max(0.38, aspect)));
  }

  function disposeLevel(L) {
    scene.remove(L.group);
    L.group.traverse((o) => {
      if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
    });
  }
  function ensure(i) {
    let L = levels[i];
    if (L && L.key === keyOf()) return L;
    if (L) disposeLevel(L);
    L = A.buildLevel(i, state.species, state.path);
    L.key = keyOf();
    L.group.visible = false;
    L.group.traverse((o) => {
      o.userData.baseCastShadow = o.castShadow;
      o.userData.baseRenderOrder = o.renderOrder || 0;
      if (o.material) {
        o.material.userData.baseOpacity = o.material.opacity;
        o.material.userData.baseTransparent = o.material.transparent;
        o.material.userData.baseDepthWrite = o.material.depthWrite;
        o.material.userData.baseClearcoat = o.material.clearcoat;
        o.material.userData.baseClearcoatRoughness = o.material.clearcoatRoughness;
        o.material.userData.baseEmissive = o.material.emissive ? o.material.emissive.getHex() : 0;
      }
    });
    scene.add(L.group);
    levels[i] = L;
    return L;
  }
  function setOpacity(L, a) {
    L.group.traverse((o) => {
      const m = o.material; if (!m) return;
      const xrayParen = !!(o.userData.parenchyma && state.xray);
      const baseOp = xrayParen ? XRAY_OPACITY : m.userData.baseOpacity;
      const baseTrans = xrayParen ? true : m.userData.baseTransparent;
      const baseDW = xrayParen ? false : m.userData.baseDepthWrite;
      if (a >= 1) { m.opacity = baseOp; m.transparent = baseTrans; m.depthWrite = baseDW; }
      else { m.transparent = true; m.opacity = baseOp * a; m.depthWrite = false; }
      m.needsUpdate = true;
    });
  }
  function applyXray(L) {
    if (!L) return;
    L.group.traverse((o) => {
      if (!o.userData.parenchyma) return;
      o.castShadow = state.xray ? false : o.userData.baseCastShadow;
      o.renderOrder = state.xray ? 2 : (o.userData.baseRenderOrder || 0);
      const m = o.material;
      if (m && m.clearcoat !== undefined) {
        m.clearcoat = state.xray ? 1.0 : m.userData.baseClearcoat;
        m.clearcoatRoughness = state.xray ? 0.14 : m.userData.baseClearcoatRoughness;
      }
    });
    if (!trans) setOpacity(L, 1);
  }
  function toggleXray(val) {
    if (state.level !== 0 || trans) return;
    state.xray = typeof val === "boolean" ? val : !state.xray;
    applyXray(levels[0]);
    syncNav();
  }
  function presetCam(L, instant, noScale) {
    const c = L.cam;
    const ds = noScale ? 1 : distScale();
    if (!noScale) lastDistScale = ds;
    cam.tYaw = c.yaw; cam.tPitch = c.pitch; cam.tDist = c.dist * ds; cam.tTarget.set(c.target[0], c.target[1], c.target[2]);
    if (instant) { cam.yaw = cam.tYaw; cam.pitch = cam.tPitch; cam.dist = cam.tDist; cam.target.copy(cam.tTarget); }
    blob.position.set(c.target[0], L.floorY, c.target[2]);
    key.target.position.set(c.target[0], c.target[1], c.target[2]);
    key.position.set(c.target[0] + 5, c.target[1] + 9, c.target[2] + 7);
  }

  // ===== 階層の移動（拡大・縮小しながら切り替える） =====
  function goLevel(i) {
    i = Math.max(0, Math.min(4, i));
    if (trans || i === state.level) return;
    const from = levels[state.level];
    const needBuild = !levels[i] || levels[i].key !== keyOf();
    const run = () => {
      const to = ensure(i);
      const dir = i > state.level ? 1 : -1;
      state.level = i; state.sel = null;
      presetCam(to, true);
      to.group.visible = true;
      applyXray(to);
      setOpacity(to, 0);
      trans = { from, to, dir, t: 0 };
      buildLabels(); renderPanel(); syncNav();
    };
    if (needBuild) { showLoader(true); setTimeout(() => { run(); showLoader(false); }, 30); } else run();
  }
  function stepTransition(dt) {
    if (!trans) return;
    trans.t = Math.min(1, trans.t + dt / 0.85);
    const e = trans.t * trans.t * (3 - 2 * trans.t);
    const out = trans.dir > 0 ? 1 + 1.6 * e : 1 - 0.6 * e;
    const inn = trans.dir > 0 ? 0.4 + 0.6 * e : 2.4 - 1.4 * e;
    if (trans.from) { trans.from.group.scale.setScalar(out); setOpacity(trans.from, 1 - e); }
    trans.to.group.scale.setScalar(inn); setOpacity(trans.to, e);
    labelsEl.style.opacity = trans.t > 0.85 ? (trans.t - 0.85) / 0.15 : 0;
    if (trans.t >= 1) {
      if (trans.from) { trans.from.group.visible = false; trans.from.group.scale.setScalar(1); setOpacity(trans.from, 1); }
      trans.to.group.scale.setScalar(1); setOpacity(trans.to, 1);
      labelsEl.style.opacity = 1;
      trans = null;
    }
  }

  // ===== 入力 =====
  let drag = null; const pointers = new Map(); let pinch0 = 0, wheelPush = 0;
  canvas.addEventListener("pointerdown", (e) => { canvas.setPointerCapture(e.pointerId); pointers.set(e.pointerId, [e.clientX, e.clientY]); drag = { x: e.clientX, y: e.clientY, moved: 0, pan: e.button === 2 || e.shiftKey }; cam.lastInput = time; if (pointers.size === 2) { const p = [...pointers.values()]; pinch0 = Math.hypot(p[0][0] - p[1][0], p[0][1] - p[1][1]); } });
  canvas.addEventListener("pointermove", (e) => {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, [e.clientX, e.clientY]);
    if (pointers.size === 2) { const p = [...pointers.values()]; const d = Math.hypot(p[0][0] - p[1][0], p[0][1] - p[1][1]); if (pinch0) zoomBy(pinch0 / d); pinch0 = d; return; }
    if (drag) {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY; drag.moved += Math.abs(dx) + Math.abs(dy);
      if (drag.pan) { const s = cam.dist * 0.0012; const r = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0), u = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1); cam.tTarget.addScaledVector(r, -dx * s).addScaledVector(u, dy * s); }
      else { cam.tYaw -= dx * 0.006; cam.tPitch = Math.max(-0.35, Math.min(1.35, cam.tPitch + dy * 0.005)); }
      cam.lastInput = time;
    } else hover(e);
  });
  const endPtr = (e) => { pointers.delete(e.pointerId); if (pointers.size < 2) pinch0 = 0; if (drag && drag.moved < 5 && e.type === "pointerup") click(e); drag = null; };
  canvas.addEventListener("pointerup", endPtr); canvas.addEventListener("pointercancel", endPtr);
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  function zoomBy(f) {
    const L = levels[state.level]; if (!L || trans) return;
    const ds = distScale();
    const minD = L.cam.min * ds, maxD = L.cam.max * ds;
    cam.tDist *= f; cam.lastInput = time;
    if (cam.tDist < minD) { wheelPush += (minD - cam.tDist); cam.tDist = minD; if (wheelPush > 1.2 && state.level < 4) { wheelPush = 0; goLevel(state.level + 1); } }
    else if (cam.tDist > maxD) { wheelPush -= (cam.tDist - maxD); cam.tDist = maxD; if (wheelPush < -1.6 && state.level > 0) { wheelPush = 0; goLevel(state.level - 1); } }
    else wheelPush *= 0.6;
  }
  canvas.addEventListener("wheel", (e) => { e.preventDefault(); zoomBy(Math.exp(e.deltaY * 0.0012)); }, { passive: false });

  // ===== 当たり判定 =====
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function pickAt(e) {
    const L = levels[state.level]; if (!L || trans) return null;
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hits = ray.intersectObjects(L.pick, false);
    if (!hits.length) return null;
    const h = hits[0]; let sid = h.object.userData.sid;
    if (h.object.userData.zone && L.zoneOf) sid = L.zoneOf(L.group.worldToLocal(h.point.clone()));
    return sid;
  }
  const tip = document.getElementById("tip");
  function hover(e) {
    const sid = pickAt(e);
    if (sid && A.STRUCTURES[sid]) { tip.textContent = A.STRUCTURES[sid].name; tip.style.left = e.clientX + 14 + "px"; tip.style.top = e.clientY + 14 + "px"; tip.classList.add("on"); canvas.style.cursor = "pointer"; }
    else { tip.classList.remove("on"); canvas.style.cursor = "grab"; }
  }
  function click(e) { const sid = pickAt(e); select(sid && A.STRUCTURES[sid] ? sid : null); }
  function select(sid) {
    state.sel = sid; renderPanel();
    if (sid && window.innerWidth <= 900) setDrawer(true);
    labelEls.forEach((l) => l.el.classList.toggle("sel", !!sid && l.sid === sid));
  }

  // ===== ラベル（UIカード・ラベル同士の重なりを自動回避） =====
  const labelsEl = document.getElementById("labels"), linesEl = document.getElementById("lines");
  let labelEls = [];
  function measureLabels() {
    for (let i = 0; i < labelEls.length; i++) {
      const l = labelEls[i];
      if (l.el.style.display === "none") { l.w = 0; l.h = 0; }
      else { l.w = l.el.offsetWidth || 80; l.h = l.el.offsetHeight || 20; }
    }
  }
  function buildLabels() {
    labelEls.forEach((l) => { l.el.remove(); l.line.remove(); l.dot.remove(); });
    labelEls = [];
    const L = levels[state.level]; if (!L) return;
    L.labels.forEach((lb) => {
      const el = document.createElement("button");
      el.className = "lbl" + (lb.sid ? "" : " plain"); el.textContent = lb.text;
      if (lb.sid) el.addEventListener("click", () => select(lb.sid));
      labelsEl.appendChild(el);
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line"); linesEl.appendChild(line);
      const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle"); dot.setAttribute("r", 3.2); linesEl.appendChild(dot);
      labelEls.push({ el, line, dot, sid: lb.sid, lb, w: el.offsetWidth || 80, h: el.offsetHeight || 20 });
    });
    measureLabels();
  }
  const tmpV = new THREE.Vector3();
  const safeBox = { x0: 270, x1: 1240, y0: 74, y1: 880 };
  function updateSafeBox() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    const wide = w > 900;
    const left = document.querySelector(".left").getBoundingClientRect();
    const right = panel.getBoundingClientRect();
    if (wide) {
      safeBox.x0 = Math.max(16, left.right + 14);
      safeBox.x1 = Math.min(w - 16, right.left - 14);
      safeBox.y0 = 72;
      safeBox.y1 = h - 78;
    } else {
      const topR = document.querySelector(".top").getBoundingClientRect();
      const zoomR = document.querySelector(".zoombar").getBoundingClientRect();
      safeBox.x0 = 8;
      safeBox.x1 = w - 8;
      safeBox.y0 = Math.max(64, topR.bottom + 8);
      safeBox.y1 = Math.max(safeBox.y0 + 120, Math.min(zoomR.top, left.top) - 8);
    }
  }
  function placeLabels() {
    const L = levels[state.level]; if (!L || !labelEls.length) return;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    const wide = w > 900;
    const kx = wide ? Math.min(1, w / 1400) : Math.min(0.85, (safeBox.x1 - safeBox.x0) / 860);
    const ky = wide ? Math.min(1, w / 1400) : Math.min(0.85, (safeBox.y1 - safeBox.y0) / 720);
    const items = [];
    for (let i = 0; i < labelEls.length; i++) {
      const l = labelEls[i];
      const p = typeof l.lb.pos === "function" ? l.lb.pos() : l.lb.pos;
      tmpV.set(p[0], p[1], p[2]); L.group.localToWorld(tmpV); tmpV.project(camera);
      const show = state.labels && tmpV.z < 1;
      l.el.style.display = l.line.style.display = l.dot.style.display = show ? "" : "none";
      if (!show) continue;
      if (l.w < 10) { l.w = l.el.offsetWidth || 80; l.h = l.el.offsetHeight || 20; }
      const sx = (tmpV.x * 0.5 + 0.5) * w, sy = (-tmpV.y * 0.5 + 0.5) * h;
      const hw = l.w * 0.5, hh = l.h * 0.5;
      let lx = sx + l.lb.off[0] * kx, ly = sy + l.lb.off[1] * ky;
      // 安全領域内に収める
      lx = Math.max(safeBox.x0 + hw, Math.min(safeBox.x1 - hw, lx));
      ly = Math.max(safeBox.y0 + hh, Math.min(safeBox.y1 - hh, ly));
      items.push({ l, sx, sy, lx, ly, hw, hh });
    }
    // ラベル同士の重なりを反復解消
    const padX = wide ? 8 : 4, padY = wide ? 6 : 4;
    const maxIter = wide ? 14 : 20;
    for (let iter = 0; iter < maxIter; iter++) {
      let moved = false;
      for (let i = 0; i < items.length; i++) {
        for (let j = i + 1; j < items.length; j++) {
          const a = items[i], b = items[j];
          const dx = b.lx - a.lx, dy = b.ly - a.ly;
          const ox = (a.hw + b.hw + padX) - Math.abs(dx);
          const oy = (a.hh + b.hh + padY) - Math.abs(dy);
          if (ox > 0 && oy > 0) {
            moved = true;
            if (oy < ox * 1.15) {
              const sgn = dy >= 0 ? 1 : -1;
              const shift = oy * 0.55;
              a.ly -= sgn * shift; b.ly += sgn * shift;
            } else {
              const sgn = dx >= 0 ? 1 : -1;
              const shift = ox * 0.52;
              a.lx -= sgn * shift; b.lx += sgn * shift;
            }
          }
        }
      }
      for (let i = 0; i < items.length; i++) {
        const a = items[i];
        a.lx = Math.max(safeBox.x0 + a.hw, Math.min(safeBox.x1 - a.hw, a.lx));
        a.ly = Math.max(safeBox.y0 + a.hh, Math.min(safeBox.y1 - a.hh, a.ly));
      }
      if (!moved) break;
    }
    for (let i = 0; i < items.length; i++) {
      const a = items[i];
      a.l.el.style.transform = `translate(${a.lx.toFixed(1)}px, ${a.ly.toFixed(1)}px) translate(-50%, -50%)`;
      a.l.line.setAttribute("x1", a.sx.toFixed(1)); a.l.line.setAttribute("y1", a.sy.toFixed(1));
      a.l.line.setAttribute("x2", a.lx.toFixed(1)); a.l.line.setAttribute("y2", a.ly.toFixed(1));
      a.l.dot.setAttribute("cx", a.sx.toFixed(1)); a.l.dot.setAttribute("cy", a.sy.toFixed(1));
    }
  }

  // ===== 画面の部品 =====
  const SW = {
    liver_lobe_mouse: "#942f26", liver_lobe_human: "#a83c2c", gallbladder: "#338c49", hepatic_ducts: "#2f8f56", cbd: "#2f8f56", oddi_sphincter: "#c4584e", portal_vein: "#5a4bc6", hepatic_artery: "#d1322a", hepatic_vein: "#2e5fb5", duodenum_ileum: "#de8274", bdl_ligature: "#ec7e1a", gallstone_gb: "#c89638", gallstone_cbd: "#c89638",
    lobule_array: "#d47c6c", portal_triad: "#e8d6c0", central_vein: "#2e5fb5", ductular_reaction: "#329e5c", collagen_fibers: "#b48ed4",
    zone1: "#d96348", zone2: "#e2a43c", zone3: "#5a77c9", sinusoid_flow: "#c82824", bile_flow_reverse: "#22a858",
    hepatocyte_cord: "#df8c72", lsec: "#e4889a", space_of_disse: "#f0d998", kupffer_cell: "#e86e1a", hsc: "#6d50b8", nk_nkt: "#0ea5c6", canal_of_hering: "#38a07a", portal_iga_plasma: "#b83c98", inflammatory_cells: "#e8a4b8",
    ntcp: "#285cc4", oatp: "#168c9e", bsep: "#1b9656", mrp2: "#70a820", tight_junction: "#e07018", bile_canaliculus: "#6cc474", bile_acid_pool: "#4c74d4"
  };
  const SP = { mouse: "マウス", human: "ヒト" }, PT = { normal: "正常", bdl: "総胆管結紮（BDL）", gallstone: "胆石" };
  const panel = document.getElementById("panel");
  const panelBody = document.getElementById("panelBody");
  const drawerBar = document.getElementById("drawerBar");
  const drawerTitle = document.getElementById("drawerTitle");
  const drawerChev = document.getElementById("drawerChev");
  function setDrawer(open) {
    state.drawerOpen = !!open;
    panel.classList.toggle("open", state.drawerOpen);
    drawerBar.setAttribute("aria-expanded", String(state.drawerOpen));
    drawerChev.textContent = state.drawerOpen ? "▼ 閉じる" : "▲ 開く";
    updateSafeBox();
  }
  drawerBar.addEventListener("click", () => setDrawer(!state.drawerOpen));
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const firstSentence = (s) => { const m = s.split("。")[0]; return m.length > 44 ? m.slice(0, 43) + "…" : m; };
  const refLinks = (ids) => ids.map((n) => { const r = A.REFERENCES[n]; return r ? `<a class="ref" href="${r.url}" target="_blank" rel="noopener"><span>[${n}]</span>${esc(r.short)}</a>` : ""; }).join("");

  function renderPanel() {
    const L = levels[state.level]; const LV = A.LEVELS[state.level];
    if (!L) return;
    drawerTitle.textContent = state.sel && A.STRUCTURES[state.sel] ? A.STRUCTURES[state.sel].name : `${LV.code} ${LV.name}`;
    let body = "";
    if (state.sel) {
      const s = A.STRUCTURES[state.sel];
      body = `<button class="back" id="back">‹ 一覧へ</button>
        <div class="d-head"><i style="background:${SW[state.sel] || "#ccc"}"></i><div><h2>${esc(s.name)}</h2><div class="en">${esc(s.en)}</div></div></div>
        <p class="d-desc">${esc(s.desc)}</p>
        ${s.speciesNote && s.speciesNote[state.species] ? `<div class="note sp"><b>${SP[state.species]}</b>${esc(s.speciesNote[state.species])}</div>` : ""}
        ${s.stateNote && s.stateNote[state.path] ? `<div class="note st"><b>${PT[state.path]}</b>${esc(s.stateNote[state.path])}</div>` : ""}
        ${s.schematic ? `<div class="note sc">この部分は経路を一望するための模式です。</div>` : ""}
        <div class="sub">出典</div><div class="refs">${refLinks(s.refs || [])}</div>`;
    } else if (state.tab === "s") {
      body = `<div class="list">` + L.structures.map((sid) => { const s = A.STRUCTURES[sid]; return `<button class="item" data-sid="${sid}"><i style="background:${SW[sid] || "#ccc"}"></i><span><b>${esc(s.name)}</b><em>${esc(firstSentence(s.desc))}</em></span><u>›</u></button>`; }).join("") + `</div>`;
    } else if (state.tab === "l") {
      body = `<div class="legend">` + LV.legend.map((g) => `<div><i style="background:${g.color}"></i>${esc(g.label)}</div>`).join("") + `</div><p class="scale-note">段階の間の大きさは模式です（段階の中の位置関係・極性・流れの向きは出典に基づく）。</p>`;
    } else {
      body = `<div class="refs">${refLinks(LV.refs)}</div><p class="scale-note">全24件の一覧と使った箇所は 出典.md にあります。</p>`;
    }
    const lsecNote = state.level === 3 && A.STRUCTURES.lsec && A.STRUCTURES.lsec.speciesNote ? A.STRUCTURES.lsec.speciesNote[state.species] : "";
    panelBody.innerHTML = `
      <div class="p-head"><span class="kicker">${LV.code} · ${esc(LV.subtitle)}</span><span class="count">0${state.level + 1} / 05</span></div>
      <h1>${esc(LV.name)}</h1>
      <p class="sum">${esc(LV.summary)}</p>
      <div class="meta">
        <div><span>大きさ</span><b>${esc(state.species === "human" ? LV.scaleHuman : LV.scaleMouse)}</b></div>
        <div><span>動物種</span><b>${SP[state.species]}</b></div>
        <div class="wide"><span>状態</span><b>${PT[state.path]}</b></div>
        ${lsecNote ? `<div class="wide"><span>LSEC 窓径</span><b>${esc(lsecNote)}</b></div>` : ""}
      </div>
      <div class="tabs">${[["s", "構造"], ["l", "凡例"], ["r", "出典"]].map((t) => `<button data-t="${t[0]}" class="${!state.sel && state.tab === t[0] ? "on" : ""}">${t[1]}</button>`).join("")}</div>
      <div class="p-body">${body}</div>`;
    panelBody.querySelectorAll(".item").forEach((b) => b.addEventListener("click", () => select(b.dataset.sid)));
    panelBody.querySelectorAll(".tabs button").forEach((b) => b.addEventListener("click", () => { state.tab = b.dataset.t; state.sel = null; renderPanel(); labelEls.forEach((l) => l.el.classList.remove("sel")); }));
    const bk = document.getElementById("back"); if (bk) bk.addEventListener("click", () => select(null));
  }

  const cards = document.getElementById("cards");
  function renderCards() {
    cards.innerHTML = A.LEVELS.map((lv, i) => `<button class="card" data-i="${i}"><img alt="" id="th${i}"><span><b>${esc(lv.name)}</b><em>${esc(lv.subtitle)}</em></span><u>›</u></button>`).join("") + `<div class="cards-foot">5 階層 · 臓器から分子まで</div>`;
    cards.querySelectorAll(".card").forEach((c) => c.addEventListener("click", () => goLevel(+c.dataset.i)));
  }
  function syncNav() {
    cards.querySelectorAll(".card").forEach((c) => c.classList.toggle("on", +c.dataset.i === state.level));
    if (window.innerWidth <= 900) {
      const act = cards.querySelector(".card.on");
      if (act) cards.scrollLeft = Math.max(0, act.offsetLeft - (cards.clientWidth - act.offsetWidth) * 0.5);
    }
    document.querySelectorAll("#ticks button").forEach((b) => b.classList.toggle("on", +b.dataset.i === state.level));
    document.getElementById("zr").value = state.level;
    document.querySelectorAll("#species button").forEach((b) => b.classList.toggle("on", b.dataset.v === state.species));
    document.querySelectorAll("#state button").forEach((b) => b.classList.toggle("on", b.dataset.v === state.path));
    const btnXray = document.getElementById("btnXray");
    btnXray.disabled = state.level !== 0;
    btnXray.classList.toggle("on", state.level === 0 && state.xray);
    btnXray.setAttribute("aria-pressed", String(state.level === 0 && state.xray));
    document.getElementById("btnLabels").classList.toggle("on", state.labels);
    document.getElementById("btnPlay").classList.toggle("on", state.playing);
    document.getElementById("btnPlay").textContent = state.playing ? "動き：再生中" : "動き：停止中";
  }
  function rebuildCurrent() {
    showLoader(true);
    setTimeout(() => {
      const L = ensure(state.level);
      L.group.visible = true; applyXray(L); setOpacity(L, 1);
      state.sel = null; buildLabels(); renderPanel(); syncNav();
      showLoader(false);
    }, 20);
  }
  document.querySelectorAll("#species button").forEach((b) => b.addEventListener("click", () => { if (state.species === b.dataset.v || trans) return; state.species = b.dataset.v; rebuildCurrent(); }));
  document.querySelectorAll("#state button").forEach((b) => b.addEventListener("click", () => { if (state.path === b.dataset.v || trans) return; state.path = b.dataset.v; rebuildCurrent(); }));
  document.getElementById("btnXray").addEventListener("click", () => toggleXray());
  document.getElementById("btnLabels").addEventListener("click", () => { state.labels = !state.labels; syncNav(); });
  document.getElementById("btnPlay").addEventListener("click", () => { state.playing = !state.playing; syncNav(); });
  document.getElementById("zr").addEventListener("input", (e) => goLevel(+e.target.value));
  document.querySelectorAll("#ticks button").forEach((b) => b.addEventListener("click", () => goLevel(+b.dataset.i)));
  document.getElementById("zin").addEventListener("click", () => goLevel(state.level + 1));
  document.getElementById("zout").addEventListener("click", () => goLevel(state.level - 1));
  document.getElementById("reset").addEventListener("click", () => { const L = levels[state.level]; if (L) presetCam(L, false); });
  window.addEventListener("keydown", (e) => { if (e.key === "ArrowRight" || e.key === "+") goLevel(state.level + 1); if (e.key === "ArrowLeft" || e.key === "-") goLevel(state.level - 1); if (e.key === "Escape") select(null); });

  const loader = document.getElementById("loader");
  window.addEventListener("keydown", (e) => {
    if (e.code === "KeyX") toggleXray();
    if (e.code === "Escape" && !state.sel && state.drawerOpen) setDrawer(false);
  });
  function showLoader(on, text) { loader.classList.toggle("on", on); if (text) loader.querySelector("span").textContent = text; }

  // ===== 大きさ =====
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const left = document.querySelector(".left").getBoundingClientRect(), right = panel.getBoundingClientRect();
    const wide = w > 900;
    const ds = distScale();
    if (Math.abs(ds - lastDistScale) > 0.001 && levels[state.level]) {
      const ratio = ds / lastDistScale;
      cam.tDist *= ratio; cam.dist *= ratio;
      lastDistScale = ds;
    }
    const cx = wide ? ((left.right + right.left) / 2 - w / 2) : 0;
    let cyOff = 0;
    if (!wide) {
      const topR = document.querySelector(".top").getBoundingClientRect();
      const zoomR = document.querySelector(".zoombar").getBoundingClientRect();
      const yTop = topR.bottom;
      const yBot = Math.min(zoomR.top, left.top);
      cyOff = h * 0.5 - (yTop + yBot) * 0.5;
    }
    camera.setViewOffset(w, h, -cx, cyOff, w, h);
    camera.updateProjectionMatrix();
    updateSafeBox();
    measureLabels();
  }
  window.addEventListener("resize", resize);

  // ===== 描画ループ =====
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (state.playing) time += dt;
    const realT = now / 1000;
    const L = levels[state.level];
    const idle = realT - cam.lastInputReal > 4;
    const k = 1 - Math.exp(-dt * 6);
    cam.yaw += (cam.tYaw + (idle && state.playing ? Math.sin(realT * 0.22) * 0.16 : 0) - cam.yaw) * (idle ? k * 0.25 : k);
    cam.pitch += (cam.tPitch - cam.pitch) * k; cam.dist += (cam.tDist - cam.dist) * k; cam.target.lerp(cam.tTarget, k);
    camera.position.set(cam.target.x + cam.dist * Math.sin(cam.yaw) * Math.cos(cam.pitch), cam.target.y + cam.dist * Math.sin(cam.pitch), cam.target.z + cam.dist * Math.cos(cam.yaw) * Math.cos(cam.pitch));
    camera.lookAt(cam.target);
    stepTransition(dt);
    const run = (LL) => { if (LL && LL.group.visible) LL.updaters.forEach((f) => f(time, state.playing ? dt : 0)); };
    run(L); if (trans && trans.from) run(trans.from);
    if (L) L.group.traverse((o) => {
      const m = o.material; if (!m || !m.emissive) return;
      if (state.sel && o.userData.sid === state.sel && !o.userData.zone) m.emissive.setRGB(0.22 + 0.12 * Math.sin(realT * 4), 0.17 + 0.09 * Math.sin(realT * 4), 0.08);
      else m.emissive.setHex(m.userData.baseEmissive || 0);
    });
    renderer.render(scene, camera);
    placeLabels();
    requestAnimationFrame(frame);
  }
  cam.lastInputReal = -10;
  ["pointerdown", "wheel"].forEach((ev) => canvas.addEventListener(ev, () => { cam.lastInputReal = performance.now() / 1000; }));

  // ===== 起動：5段階を組み立てて、カード用の小さな絵を撮る =====
  function thumb(i) {
    const L = levels[i];
    levels.forEach((o) => o && (o.group.visible = false));
    L.group.visible = true;
    presetCam(L, true, true);
    camera.position.set(cam.target.x + cam.dist * 0.88 * Math.sin(cam.yaw) * Math.cos(cam.pitch), cam.target.y + cam.dist * 0.88 * Math.sin(cam.pitch), cam.target.z + cam.dist * 0.88 * Math.cos(cam.yaw) * Math.cos(cam.pitch));
    camera.lookAt(cam.target);
    camera.clearViewOffset(); camera.aspect = 1; camera.updateProjectionMatrix();
    renderer.setSize(160, 160, false);
    renderer.render(scene, camera);
    document.getElementById("th" + i).src = canvas.toDataURL("image/png");
    L.group.visible = false;
  }
  renderCards();
  const bootStart = performance.now();
  let bi = 0;
  function boot() {
    showLoader(true, `立体を組み立て中… ${bi + 1} / 5`);
    setTimeout(() => {
      try { ensure(bi); thumb(bi); } catch (err) { console.error(err); showLoader(true, "組み立てに失敗しました：" + err.message); return; }
      bi++;
      if (bi < 5) boot();
      else {
        const L = levels[0]; L.group.visible = true; presetCam(L, true);
        state.level = 0; applyXray(L); buildLabels(); renderPanel(); syncNav(); resize();
        showLoader(false);
        window.__liver.bootMs = Math.round(performance.now() - bootStart);
        requestAnimationFrame(frame);
      }
    }, 10);
  }
  boot();
  window.__liver = { state, levels, goLevel, select, toggleXray, applyXray, setDrawer, resize, camera, renderer, bootMs: 0 };
})();
