// 肝臓3Dアトラス v2：描画・カメラ・階層の切り替え・画面の部品
(function () {
  const tScriptsDone = performance.now();
  const A = window.LiverApp;
  const BK = window.LiverBaked;
  const canvas = document.getElementById("gl");
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.04;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const tGlDone = performance.now();

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);

  // ===== 環境光（粘土〜樹脂の艶を出しつつ白飛びさせないスタジオ） =====
  (function makeEnv() {
    const es = new THREE.Scene();
    const g = new THREE.SphereGeometry(20, 16, 8);
    const pos = g.attributes.position, cols = [];
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) / 20;
      const c = y > 0
        ? [0.76 + 0.08 * y, 0.72 + 0.08 * y, 0.68 + 0.10 * y]
        : [0.58 - 0.18 * -y, 0.50 - 0.16 * -y, 0.44 - 0.14 * -y];
      cols.push(c[0], c[1], c[2]);
    }
    g.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3));
    const sm = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide });
    es.add(new THREE.Mesh(g, sm));
    const tmpGeo = [g], tmpMat = [sm];
    const box = (w, h, p, k) => {
      const pg = new THREE.PlaneGeometry(w, h);
      const pm2 = new THREE.MeshBasicMaterial({ color: new THREE.Color(k, k * 0.97, k * 0.93), side: THREE.DoubleSide });
      tmpGeo.push(pg); tmpMat.push(pm2);
      const m = new THREE.Mesh(pg, pm2);
      m.position.set(p[0], p[1], p[2]); m.lookAt(0, 0, 0); es.add(m);
    };
    box(8, 5, [7, 11, 8], 2.7);
    box(7, 7, [-11, 5, 5], 1.15);
    box(10, 4, [0, -3, -12], 0.95);
    box(5, 3, [0, 12, -2], 1.35);
    const pm = new THREE.PMREMGenerator(renderer);
    scene.environment = pm.fromScene(es, 0.035).texture;
    pm.dispose();
    tmpGeo.forEach((x) => x.dispose());
    tmpMat.forEach((x) => x.dispose());
  })();
  const tEnvDone = performance.now();
  scene.add(new THREE.HemisphereLight(0xfff5e8, 0xb59c84, 0.36));
  const key = new THREE.DirectionalLight(0xfff4e4, 1.25);
  key.position.set(5, 9, 7);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
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
  const state = { species: "mouse", path: "normal", level: 0, labels: true, playing: true, xray: false, drawerOpen: false, hudOpen: false, sel: null, tab: "s" };
  const XRAY_OPACITY = 0.25;
  const levels = [null, null, null, null, null];
  const buildMs = [0, 0, 0, 0, 0];
  const keyOf = () => state.species + "/" + state.path;
  const cam = { yaw: 0, pitch: 0.2, dist: 10, target: new THREE.Vector3(), tYaw: 0, tPitch: 0.2, tDist: 10, tTarget: new THREE.Vector3(), lastInput: -10 };
  let trans = null, time = 0, lastDistScale = 1;

  // ズーム遷移時に拡大先を光らせるリング
  const focusRing = new THREE.Mesh(
    new THREE.RingGeometry(0.32, 0.44, 36),
    new THREE.MeshBasicMaterial({ color: 0xffb830, transparent: true, opacity: 0, side: THREE.DoubleSide, depthTest: false })
  );
  focusRing.renderOrder = 20;
  focusRing.visible = false;
  scene.add(focusRing);

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
    const t0 = performance.now();
    L = A.buildLevel(i, state.species, state.path);
    const ms = Math.round(performance.now() - t0);
    buildMs[i] = ms;
    console.info(`[LiverAtlas] L${i + 1} (${state.species}/${state.path}) built in ${ms} ms`);
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
  let pendingNav = 0;
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
      if (dir > 0 && from && from.zoomSpot) {
        const sp = from.zoomSpot;
        focusRing.position.set(sp[0], sp[1], sp[2]);
        focusRing.visible = true;
      } else {
        focusRing.visible = false;
      }
      buildLabels(); renderPanel(); renderFlowHud(); syncNav();
      if (!document.getElementById("th" + i).classList.contains("ready")) thumb(i);
    };
    if (BK && !BK.isReadyFor(i, state.species, state.path)) {
      const navSeq = ++pendingNav;
      showLoader(true, `L${i + 1} を読み込み中…`);
      BK.ensureFor(i, state.species, state.path).then(() => {
        if (navSeq !== pendingNav || trans) { showLoader(false); return; }
        run(); showLoader(false);
      });
    } else if (needBuild && !BK) {
      showLoader(true, `L${i + 1} を組み立て中…`); setTimeout(() => { run(); showLoader(false); }, 20);
    } else {
      run();
    }
  }
  function stepTransition(dt) {
    if (!trans) return;
    trans.t = Math.min(1, trans.t + dt / 0.85);
    const e = trans.t * trans.t * (3 - 2 * trans.t);
    const out = trans.dir > 0 ? 1 + 1.6 * e : 1 - 0.6 * e;
    const inn = trans.dir > 0 ? 0.4 + 0.6 * e : 2.4 - 1.4 * e;
    if (trans.from) { trans.from.group.scale.setScalar(out); setOpacity(trans.from, 1 - e); }
    trans.to.group.scale.setScalar(inn); setOpacity(trans.to, e);
    if (focusRing.visible && trans.from && trans.from.zoomSpot) {
      const sp = trans.from.zoomSpot;
      focusRing.position.set(sp[0] * out, sp[1] * out, sp[2] * out);
      focusRing.lookAt(camera.position);
      const pulse = 1 + trans.t * 1.4;
      focusRing.scale.setScalar(pulse * (trans.from.zoomRingScale || 1));
      focusRing.material.opacity = Math.max(0, Math.sin(Math.min(1, trans.t * 1.6) * Math.PI) * 0.88);
    }
    labelsEl.style.opacity = trans.t > 0.85 ? (trans.t - 0.85) / 0.15 : 0;
    if (trans.t >= 1) {
      if (trans.from) { trans.from.group.visible = false; trans.from.group.scale.setScalar(1); setOpacity(trans.from, 1); }
      trans.to.group.scale.setScalar(1); setOpacity(trans.to, 1);
      focusRing.visible = false;
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
  function buildLabels(skipMeasure) {
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
      labelEls.push({ el, line, dot, sid: lb.sid, lb, w: 80, h: 20 });
    });
    if (!skipMeasure) measureLabels();
  }
  const tmpV = new THREE.Vector3();
  const safeBox = { x0: 270, x1: 1240, y0: 74, y1: 880 };
  const flowHud = document.getElementById("flowHud");
  function updateSafeBox() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    const wide = w > 900;
    const left = document.querySelector(".left").getBoundingClientRect();
    const hudR = flowHud.getBoundingClientRect();
    const right = panel.getBoundingClientRect();
    if (wide) {
      safeBox.x0 = Math.max(16, Math.max(left.right, hudR.right) + 14);
      safeBox.x1 = Math.min(w - 16, right.left - 14);
      safeBox.y0 = 72;
      safeBox.y1 = h - 78;
    } else {
      const topR = document.querySelector(".top").getBoundingClientRect();
      const zoomR = document.querySelector(".zoombar").getBoundingClientRect();
      safeBox.x0 = 8;
      safeBox.x1 = w - 8;
      safeBox.y0 = Math.max(64, Math.max(topR.bottom, hudR.bottom) + 8);
      safeBox.y1 = Math.max(safeBox.y0 + 120, Math.min(zoomR.top, left.top) - 8);
    }
  }
  function placeLabels() {
    const L = levels[state.level]; if (!L || !labelEls.length) return;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h || !isFinite(camera.aspect)) return;
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
    liver_lobe_mouse: "#942f26", liver_lobe_human: "#a83c2c", gallbladder: "#2aa85e", hepatic_ducts: "#2aa85e", cbd: "#2aa85e", oddi_sphincter: "#c4584e", portal_vein: "#6f5ed8", hepatic_artery: "#e03a32", hepatic_vein: "#3b72cc", duodenum_ileum: "#de8274", bdl_ligature: "#ec7e1a", gallstone_gb: "#c89638", gallstone_cbd: "#c89638",
    lobule_array: "#d47c6c", portal_triad: "#e8d6c0", central_vein: "#3b72cc", ductular_reaction: "#2aa85e", collagen_fibers: "#b48ed4",
    zone1: "#d96348", zone2: "#e2a43c", zone3: "#5a77c9", sinusoid_flow: "#e03a32", bile_flow_reverse: "#2aa85e",
    hepatocyte_cord: "#df8c72", lsec: "#e4889a", space_of_disse: "#f0d998", kupffer_cell: "#e86e1a", hsc: "#6d50b8", nk_nkt: "#0ea5c6", canal_of_hering: "#2aa85e", portal_iga_plasma: "#b83c98", inflammatory_cells: "#e8a4b8",
    ntcp: "#285cc4", oatp: "#168c9e", bsep: "#1b9656", mrp2: "#70a820", tight_junction: "#e07018", bile_canaliculus: "#2aa85e", bile_acid_pool: "#4c74d4"
  };

  // 全階層共通の血流・胆汁ルート凡例＋拡大現在地図
  const BLOOD_STEPS = ["門脈・肝動脈", "類洞", "中心静脈", "肝静脈"];
  const BILE_STEPS = ["毛細胆管", "ヘリング管", "細胆管", "小葉間胆管", "総胆管"];
  const LEVEL_FLOW = [
    {
      blood: [0, 3], bile: [3, 4],
      title: "L1 臓器全体", sub: "肝葉の中へズームすると小葉へ",
      svg: `<svg class="fh-svg" viewBox="0 0 52 38"><ellipse cx="22" cy="17" rx="14" ry="10" fill="#b94c3d"/><ellipse cx="34" cy="18" rx="9" ry="7" fill="#c75c4b"/><path d="M26 24v11" stroke="#6f5ed8" stroke-width="3" fill="none"/><path d="M21 24v11" stroke="#2aa85e" stroke-width="2.2" fill="none"/><path d="M31 24v9" stroke="#e03a32" stroke-width="1.8" fill="none"/><path d="M18 4v9" stroke="#3b72cc" stroke-width="3" fill="none"/><rect x="13" y="9" width="26" height="16" rx="4" fill="none" stroke="#ff9f1c" stroke-width="1.6"/></svg>`
    },
    {
      blood: [0, 1, 2], bile: [3],
      title: "L1 の肝実質を拡大", sub: "六角形の小葉が敷き詰まる",
      svg: `<svg class="fh-svg" viewBox="0 0 52 38"><ellipse cx="26" cy="19" rx="20" ry="13" fill="#d99484" opacity=".45"/><polygon points="26,9 34,14 34,24 26,29 18,24 18,14" fill="#df9b88" stroke="#b97564" stroke-width="1"/><circle cx="26" cy="19" r="2.6" fill="#3b72cc"/><circle cx="34" cy="14" r="1.8" fill="#6f5ed8"/><circle cx="18" cy="24" r="1.8" fill="#2aa85e"/><rect x="15" y="7" width="22" height="24" rx="4" fill="none" stroke="#ff9f1c" stroke-width="1.7"/></svg>`
    },
    {
      blood: [0, 1, 2], bile: [0, 1, 2, 3],
      title: "L2 の1つの小葉を拡大", sub: "血は外→中、胆汁は中→外",
      svg: `<svg class="fh-svg" viewBox="0 0 52 38"><polygon points="26,4 40,12 40,26 26,34 12,26 12,12" fill="#e5a076" stroke="#c07352" stroke-width="1.2"/><circle cx="26" cy="19" r="4" fill="#3b72cc"/><circle cx="40" cy="12" r="2.5" fill="#6f5ed8"/><circle cx="40" cy="26" r="2.5" fill="#2aa85e"/><path d="M37 14L30 18" stroke="#e03a32" stroke-width="1.6"/><path d="M30 21L37 25" stroke="#2aa85e" stroke-width="1.6"/><rect x="25" y="10" width="17" height="17" rx="3" fill="none" stroke="#ff9f1c" stroke-width="1.6"/></svg>`
    },
    {
      blood: [0, 1, 2], bile: [0, 1, 2, 3],
      title: "L3 の類洞・門脈域を拡大", sub: "右(門脈域)→左(中心静脈)へ血流",
      svg: `<svg class="fh-svg" viewBox="0 0 52 38"><rect x="4" y="4" width="32" height="8" rx="2" fill="#e49b82"/><rect x="4" y="26" width="32" height="8" rx="2" fill="#e49b82"/><rect x="4" y="14" width="32" height="10" rx="3" fill="#f1b4be"/><rect x="38" y="4" width="10" height="30" rx="3" fill="#e8d8c5"/><rect x="41" y="6" width="4" height="26" rx="1.5" fill="#2aa85e"/><path d="M37 19H9" stroke="#e03a32" stroke-width="1.8"/><path d="M12 8H40" stroke="#2aa85e" stroke-width="1.5"/><rect x="3" y="3" width="46" height="32" rx="4" fill="none" stroke="#ff9f1c" stroke-width="1.5"/></svg>`
    },
    {
      blood: [1], bile: [0],
      title: "L4 の肝細胞2個＋毛細胆管", sub: "左(類洞)から取込み→右(胆管)へ排出",
      svg: `<svg class="fh-svg" viewBox="0 0 52 38"><rect x="4" y="5" width="7" height="28" rx="2" fill="#f1b4be"/><rect x="13" y="5" width="34" height="13" rx="3" fill="#eab398"/><rect x="13" y="20" width="34" height="13" rx="3" fill="#eab398"/><circle cx="34" cy="19" r="5" fill="#2aa85e"/><path d="M11 19H27" stroke="#3b72cc" stroke-width="1.8"/><rect x="11" y="4" width="37" height="30" rx="4" fill="none" stroke="#ff9f1c" stroke-width="1.5"/></svg>`
    }
  ];
  function renderFlowHud() {
    const lv = LEVEL_FLOW[state.level] || LEVEL_FLOW[0];
    const blocked = state.path !== "normal";
    const mkChain = (steps, activeIdx, cls, isBile) => steps.map((s, idx) => {
      const isAct = activeIdx.includes(idx);
      const isBlk = isBile && blocked && ((state.level === 0 && idx === 4) || (state.level > 0 && isAct && idx === activeIdx[activeIdx.length - 1]));
      const c = isBlk ? "fh-node blk" : isAct ? `fh-node ${cls}` : "fh-node";
      return `<span class="${c}">${esc(s)}${isBlk ? "⊘" : ""}</span>` + (idx < steps.length - 1 ? `<span class="fh-arr">→</span>` : "");
    }).join("");
    const bileNote = state.path === "bdl" ? "結紮で停滞" : state.path === "gallstone" ? "結石で停滞" : "血と逆向き";
    flowHud.classList.toggle("open", !!state.hudOpen);
    flowHud.innerHTML = `
      <button class="fh-toggle" id="fhToggle" type="button" aria-expanded="${!!state.hudOpen}">
        <span class="fh-mini-dots">
          <span><i class="fh-dot" style="background:#6f5ed8"></i>門脈</span>
          <span><i class="fh-dot" style="background:#e03a32"></i>動脈</span>
          <span><i class="fh-dot" style="background:#3b72cc"></i>静脈</span>
          <span><i class="fh-dot" style="background:#2aa85e"></i>胆管</span>
        </span>
        <span class="fh-chev">${state.hudOpen ? "▲ 閉じる" : "▼ ルート"}</span>
      </button>
      <div class="fh-body">
        <div class="fh-colors">
          <div class="fh-c"><i class="fh-dot" style="background:#6f5ed8"></i>門脈（紫）</div>
          <div class="fh-c"><i class="fh-dot" style="background:#e03a32"></i>肝動脈（赤）</div>
          <div class="fh-c"><i class="fh-dot" style="background:#3b72cc"></i>中心・肝静脈（青）</div>
          <div class="fh-c"><i class="fh-dot" style="background:#2aa85e"></i>胆管系（緑）</div>
        </div>
        <div class="fh-routes">
          <div class="fh-row">
            <div class="fh-lbl"><span>血流（現在区間を強調）</span><span class="fh-dir">門脈域 → 中心</span></div>
            <div class="fh-chain">${mkChain(BLOOD_STEPS, lv.blood, "act-b", false)}</div>
          </div>
          <div class="fh-row">
            <div class="fh-lbl"><span>胆汁</span><span class="fh-dir">${bileNote}</span></div>
            <div class="fh-chain">${mkChain(BILE_STEPS, lv.bile, "act-g", true)}</div>
          </div>
        </div>
        <div class="fh-map">${lv.svg}<div class="fh-cap"><b>${esc(lv.title)}</b>${esc(lv.sub)}</div></div>
      </div>`;
    const tog = document.getElementById("fhToggle");
    if (tog) tog.addEventListener("click", () => { state.hudOpen = !state.hudOpen; renderFlowHud(); updateSafeBox(); });
  }
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
      const extraLegend = state.level === 3 ? [
        { color: "#b83c98", label: "二量体IgA（Y字×2＋J鎖）" },
        { color: "#30d4b0", label: "分泌型IgA（分泌成分付き・胆汁内）" }
      ] : [];
      body = `<div class="legend">` + LV.legend.concat(extraLegend).map((g) => `<div><i style="background:${g.color}"></i>${esc(g.label)}</div>`).join("") + `</div><p class="scale-note">段階の間の大きさは模式です（段階の中の位置関係・極性・流れの向きは出典に基づく）。</p>`;
    } else {
      body = `<div class="refs">${refLinks(LV.refs)}</div><p class="scale-note">全24件の一覧と使った箇所は 出典.md にあります。</p>`;
    }
    const lsecNote = state.level === 3 && A.STRUCTURES.lsec && A.STRUCTURES.lsec.speciesNote ? A.STRUCTURES.lsec.speciesNote[state.species] : "";
    const igaNote = state.level === 3 ? (state.species === "human" ? "主に胆管細胞がpIgRで輸送 → 分泌型IgA（SC付き）" : "肝細胞＋胆管細胞の両方がpIgRで輸送 → 分泌型IgA（SC付き）") : "";
    panelBody.innerHTML = `
      <div class="p-head"><span class="kicker">${LV.code} · ${esc(LV.subtitle)}</span><span class="count">0${state.level + 1} / 05</span></div>
      <h1>${esc(LV.name)}</h1>
      <p class="sum">${esc(LV.summary)}</p>
      <div class="meta">
        <div><span>大きさ</span><b>${esc(state.species === "human" ? LV.scaleHuman : LV.scaleMouse)}</b></div>
        <div><span>動物種</span><b>${SP[state.species]}</b></div>
        <div class="wide"><span>状態</span><b>${PT[state.path]}</b></div>
        ${lsecNote ? `<div class="wide"><span>LSEC 窓径</span><b>${esc(lsecNote)}</b></div>` : ""}
        ${igaNote ? `<div class="wide"><span>IgA輸送（pIgR）</span><b>${esc(igaNote)}</b></div>` : ""}
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
    const curLv = state.level, curSp = state.species, curPt = state.path;
    const apply = () => {
      if (state.level !== curLv || state.species !== curSp || state.path !== curPt) return;
      const L = ensure(state.level);
      L.group.visible = true; applyXray(L); setOpacity(L, 1);
      state.sel = null; buildLabels(); renderPanel(); renderFlowHud(); syncNav();
      thumb(state.level);
      showLoader(false);
    };
    if (BK && !BK.isReadyFor(curLv, curSp, curPt)) {
      showLoader(true, "切り替え中…");
      BK.ensureFor(curLv, curSp, curPt).then(apply);
    } else {
      apply();
    }
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
    // 最小化・非表示のタブでは幅か高さが0になり、縦横比がNaNになってラベル座標が壊れるので待つ
    if (!w || !h) return;
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

  // ===== サムネイル撮影（遅延初期化：起動パスから外し、L1表示後に生成） =====
  const TH_SIZE = 160;
  let thumbRT = null, thumbBuf = null, thumbCanvas = null, thumbCtx = null, thumbImg = null, thumbCam = null;
  function ensureThumbResources() {
    if (thumbRT) return;
    thumbRT = new THREE.WebGLRenderTarget(TH_SIZE, TH_SIZE, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, encoding: THREE.sRGBEncoding });
    thumbBuf = new Uint8Array(TH_SIZE * TH_SIZE * 4);
    thumbCanvas = document.createElement("canvas");
    thumbCanvas.width = thumbCanvas.height = TH_SIZE;
    thumbCtx = thumbCanvas.getContext("2d");
    thumbImg = thumbCtx.createImageData(TH_SIZE, TH_SIZE);
    thumbCam = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  }

  function thumb(i) {
    const L = levels[i];
    if (!L) return;
    ensureThumbResources();
    const prevVis = levels.map((o) => (o ? o.group.visible : false));
    const prevBlob = blob.position.clone();
    const prevRing = focusRing.visible;
    const prevKeyT = key.target.position.clone(), prevKeyP = key.position.clone();
    levels.forEach((o) => o && (o.group.visible = false));
    L.group.visible = true;
    focusRing.visible = false;
    const c = L.cam;
    const d = c.dist * 0.88;
    thumbCam.position.set(
      c.target[0] + d * Math.sin(c.yaw) * Math.cos(c.pitch),
      c.target[1] + d * Math.sin(c.pitch),
      c.target[2] + d * Math.cos(c.yaw) * Math.cos(c.pitch)
    );
    thumbCam.lookAt(c.target[0], c.target[1], c.target[2]);
    blob.position.set(c.target[0], L.floorY, c.target[2]);
    key.target.position.set(c.target[0], c.target[1], c.target[2]);
    key.position.set(c.target[0] + 5, c.target[1] + 9, c.target[2] + 7);
    const prevRT = renderer.getRenderTarget();
    renderer.setRenderTarget(thumbRT);
    renderer.clear();
    renderer.render(scene, thumbCam);
    renderer.readRenderTargetPixels(thumbRT, 0, 0, TH_SIZE, TH_SIZE, thumbBuf);
    renderer.setRenderTarget(prevRT);
    levels.forEach((o, k) => o && (o.group.visible = prevVis[k]));
    blob.position.copy(prevBlob);
    focusRing.visible = prevRing;
    key.target.position.copy(prevKeyT);
    key.position.copy(prevKeyP);
    // 上下反転＋背景クリーム色合成（sRGB出力済みなのでガンマ変換不要）
    const dst = thumbImg.data;
    const bgR = 244, bgG = 237, bgB = 228;
    for (let y = 0; y < TH_SIZE; y++) {
      const sy = (TH_SIZE - 1 - y) * TH_SIZE * 4;
      const dy = y * TH_SIZE * 4;
      for (let x = 0; x < TH_SIZE * 4; x += 4) {
        const a = thumbBuf[sy + x + 3] / 255;
        const ia = 1 - a;
        dst[dy + x] = Math.round(thumbBuf[sy + x] * a + bgR * ia);
        dst[dy + x + 1] = Math.round(thumbBuf[sy + x + 1] * a + bgG * ia);
        dst[dy + x + 2] = Math.round(thumbBuf[sy + x + 2] * a + bgB * ia);
        dst[dy + x + 3] = 255;
      }
    }
    thumbCtx.putImageData(thumbImg, 0, 0);
    const imgEl = document.getElementById("th" + i);
    if (imgEl) { imgEl.src = thumbCanvas.toDataURL("image/png"); imgEl.classList.add("ready"); }
  }

  // ===== 起動：事前ベイク済みL1を即描画・操作可能に → 残りL2〜L5は裏で1つずつ読み込み・構築 =====
  const scheduleIdle = (fn) => {
    if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(fn, { timeout: 120 });
    else setTimeout(fn, 35);
  };
  function buildRemaining(idx) {
    if (idx >= 5) {
      if (!window.__liver.allBuiltMs) {
        window.__liver.allBuiltMs = Math.round(performance.now());
        console.info(`[LiverAtlas] allBuiltMs (L1-L5 ready): ${window.__liver.allBuiltMs} ms`, buildMs);
      }
      // 種・病態切替も即応できるよう裏で l1_variants を先読み
      if (BK && !BK.isLoaded("l1_variants")) {
        scheduleIdle(() => BK.loadChunk("l1_variants"));
      }
      return;
    }
    scheduleIdle(() => {
      if (trans) { setTimeout(() => buildRemaining(idx), 120); return; }
      const snapKey = keyOf();
      const loadP = BK ? BK.ensureFor(idx, state.species, state.path) : Promise.resolve();
      loadP.then(() => {
        if (trans || keyOf() !== snapKey) { setTimeout(() => buildRemaining(idx), 120); return; }
        try {
          ensure(idx);
          thumb(idx);
        } catch (err) { console.error(err); }
        buildRemaining(idx + 1);
      });
    });
  }
  function finishBoot(tBakedStart) {
    try {
      const tBakedDone = performance.now();
      const L = ensure(0);
      const tL1Done = performance.now();
      L.group.visible = true;
      presetCam(L, true);
      state.level = 0;
      applyXray(L);
      renderCards();
      renderPanel();
      renderFlowHud();
      syncNav();
      buildLabels(true);
      resize();
      const tUiDone = performance.now();
      // 最初の1フレームを即座に描画して本当に描画・操作可能な状態で計測を確定する
      camera.position.set(
        cam.target.x + cam.dist * Math.sin(cam.yaw) * Math.cos(cam.pitch),
        cam.target.y + cam.dist * Math.sin(cam.pitch),
        cam.target.z + cam.dist * Math.cos(cam.yaw) * Math.cos(cam.pitch)
      );
      camera.lookAt(cam.target);
      renderer.render(scene, camera);
      placeLabels();
      showLoader(false);
      const tFirstRender = performance.now();
      const timing = {
        headMs: Math.round(window.__BOOT_HEAD_MS || 0),
        scriptsMs: Math.round(tScriptsDone),
        glInitMs: Math.round(tGlDone - tScriptsDone),
        envMs: Math.round(tEnvDone - tGlDone),
        bakedMs: Math.round(tBakedDone - tBakedStart),
        l1BuildMs: Math.round(tL1Done - tBakedDone),
        uiMs: Math.round(tUiDone - tL1Done),
        firstRenderMs: Math.round(tFirstRender - tUiDone),
        totalBootMs: Math.round(tFirstRender)
      };
      window.__liver.bootTiming = timing;
      window.__liver.bootMs = timing.totalBootMs;
      console.info(`[LiverAtlas] bootMs (navStart -> L1 drawn & interactive): ${timing.totalBootMs} ms`, timing);
      last = tFirstRender;
      requestAnimationFrame(frame);
      setTimeout(() => {
        try { thumb(0); } catch (err) { console.error(err); }
        buildRemaining(1);
      }, 60);
      setTimeout(() => {
        if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
          navigator.serviceWorker.register("sw.js").catch(() => {});
        }
      }, 1500);
    } catch (err) {
      console.error(err);
      showLoader(true, "組み立てに失敗しました：" + err.message);
    }
  }
  function boot() {
    const tBakedStart = performance.now();
    // file:// で <head> の先行ロードがすでに終わっていれば完全同期で即描画
    if (BK && BK.isFile && BK.consumeB64("l1_mouse_normal")) {
      finishBoot(tBakedStart);
      return;
    }
    if (BK) {
      BK.loadChunk("l1_mouse_normal").then(() => finishBoot(tBakedStart));
    } else {
      finishBoot(tBakedStart);
    }
  }
  window.__liver = { state, levels, goLevel, select, toggleXray, applyXray, setDrawer, resize, camera, renderer, bootMs: 0, allBuiltMs: 0, buildMs, bootTiming: null, isTransitioning: () => !!trans };
  boot();
})();
