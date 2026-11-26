// 肝臓3Dアトラス v2：5段階の立体（臓器 → 小葉の並び → 1小葉 → 細胞 → 毛細胆管と輸送体）
(function () {
  const S = window.SDF;
  const A = window.LiverApp;
  const H = S.hex;

  // ===== 共通の部品・質感（粘土〜樹脂の厚みと艶・白飛び抑制） =====
  const MAT = {
    clay:  { roughness: 0.54, clearcoat: 0.28, clearcoatRoughness: 0.45, envMapIntensity: 0.52 },
    wet:   { roughness: 0.36, clearcoat: 0.78, clearcoatRoughness: 0.20, envMapIntensity: 0.58 },
    gloss: { roughness: 0.24, clearcoat: 1.0,  clearcoatRoughness: 0.12, envMapIntensity: 0.68 },
    soft:  { roughness: 0.74, clearcoat: 0.08, clearcoatRoughness: 0.65, envMapIntensity: 0.42 }
  };
  function linCol(hex) {
    return new THREE.Color(hex).convertSRGBToLinear();
  }
  function mat(kind, extra) {
    const o = Object.assign({ vertexColors: true, metalness: 0 }, MAT[kind || "clay"], extra || {});
    if (o.color !== undefined && !(o.color instanceof THREE.Color)) o.color = linCol(o.color);
    if (o.emissive !== undefined && !(o.emissive instanceof THREE.Color)) o.emissive = linCol(o.emissive);
    return new THREE.MeshPhysicalMaterial(o);
  }
  function matSolid(kind, color, extra) {
    const o = Object.assign({ vertexColors: false, color: linCol(color), metalness: 0 }, MAT[kind || "clay"], extra || {});
    if (o.emissive !== undefined && !(o.emissive instanceof THREE.Color)) o.emissive = linCol(o.emissive);
    return new THREE.MeshPhysicalMaterial(o);
  }
  function bbPts(pts, pad) {
    const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
    pts.forEach((p) => { for (let i = 0; i < 3; i++) { mn[i] = Math.min(mn[i], p[i] - pad); mx[i] = Math.max(mx[i], p[i] + pad); } });
    return { bmin: mn, bmax: mx };
  }
  function boxOverlap(aMin, aMax, bMin, bMax, pad) {
    return aMin[0] - pad <= bMax[0] && aMax[0] + pad >= bMin[0] &&
           aMin[1] - pad <= bMax[1] && aMax[1] + pad >= bMin[1] &&
           aMin[2] - pad <= bMax[2] && aMax[2] + pad >= bMin[2];
  }

  // スプラインに沿った滑らかな管（頂点カラー付き／単色）
  function makeTube(pts, r, segs, radSegs, colorHex, kind, extra) {
    const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p[0], p[1], p[2])));
    const g = new THREE.TubeGeometry(curve, segs || 24, r, radSegs || 12, false);
    const m = new THREE.Mesh(g, matSolid(kind || "wet", colorHex, extra));
    m.castShadow = extra && extra.transparent ? false : true;
    m.receiveShadow = true;
    return m;
  }
  // 可変半径の滑らかな管（共有マテリアル対応）
  function makeTaperTube(pts, rA, rB, segs, radSegs, colorHex, kind, extra, sharedMat, noShadow) {
    const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p[0], p[1], p[2])));
    const g = new THREE.TubeGeometry(curve, segs || 22, 1, radSegs || 12, false);
    const pos = g.attributes.position, frames = curve.computeFrenetFrames(segs || 22, false);
    const ringN = (radSegs || 12) + 1;
    for (let i = 0; i <= (segs || 22); i++) {
      const t = i / (segs || 22);
      const rad = rA + (rB - rA) * t;
      const center = curve.getPointAt(t);
      const N = frames.normals[i], Bn = frames.binormals[i];
      for (let j = 0; j < ringN; j++) {
        const idx = i * ringN + j;
        const th = (j / (radSegs || 12)) * Math.PI * 2;
        const c = Math.cos(th), s = Math.sin(th);
        pos.setXYZ(idx, center.x + rad * (c * N.x + s * Bn.x), center.y + rad * (c * N.y + s * Bn.y), center.z + rad * (c * N.z + s * Bn.z));
      }
    }
    pos.needsUpdate = true;
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, sharedMat || matSolid(kind || "wet", colorHex, extra));
    m.castShadow = noShadow ? false : !(extra && extra.transparent);
    m.receiveShadow = !noShadow;
    return m;
  }
  // 垂直な中空円筒（門脈枝・肝動脈枝・胆管・中心静脈に高速・高精細で使う）
  function hollowCylGeo(rOut, rIn, h, segs, colorOuter, colorInner) {
    const shape = new THREE.Shape();
    shape.absarc(0, 0, rOut, 0, Math.PI * 2, false);
    if (rIn > 0.001) {
      const hole = new THREE.Path();
      hole.absarc(0, 0, rIn, 0, Math.PI * 2, true);
      shape.holes.push(hole);
    }
    const bevel = Math.min(rOut - rIn, 0.04) * 0.32;
    const g = new THREE.ExtrudeGeometry(shape, { depth: Math.max(0.01, h - bevel * 2), bevelEnabled: bevel > 0.002, bevelThickness: bevel, bevelSize: bevel * 0.75, bevelSegments: 2, curveSegments: segs || 20 });
    g.rotateX(-Math.PI / 2);
    g.translate(0, -h * 0.5 + bevel, 0);
    if (colorOuter && colorInner) {
      const pos = g.attributes.position, n = pos.count, col = new Float32Array(n * 3);
      const co = H(colorOuter), ci = H(colorInner), mid = (rOut + rIn) * 0.5;
      for (let i = 0; i < n; i++) {
        const r = Math.hypot(pos.getX(i), pos.getZ(i));
        const c = r < mid ? ci : co;
        col[i * 3] = S.toLin(c[0]); col[i * 3 + 1] = S.toLin(c[1]); col[i * 3 + 2] = S.toLin(c[2]);
      }
      g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    }
    g.computeVertexNormals();
    return g;
  }

  class Path {
    constructor(p) {
      this.p = p; this.c = [0];
      for (let i = 1; i < p.length; i++) this.c.push(this.c[i - 1] + Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1], p[i][2] - p[i - 1][2]));
      this.len = this.c[this.c.length - 1];
    }
    at(s, o) {
      const p = this.p;
      if (s <= 0) return o.set(p[0][0], p[0][1], p[0][2]);
      if (s >= this.len) { const q = p[p.length - 1]; return o.set(q[0], q[1], q[2]); }
      let i = 1; while (this.c[i] < s) i++;
      const t = (s - this.c[i - 1]) / ((this.c[i] - this.c[i - 1]) || 1);
      const a = p[i - 1], b = p[i];
      return o.set(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t);
    }
    tangentAt(s, o) {
      const p = this.p;
      let i = 1;
      const sc = Math.max(0, Math.min(this.len, s));
      while (i < p.length - 1 && this.c[i] < sc) i++;
      const a = p[i - 1], b = p[i];
      o.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      const l = o.length();
      return l > 1e-6 ? o.multiplyScalar(1 / l) : o.set(1, 0, 0);
    }
  }

  class Builder {
    constructor() {
      this.specs = []; this.group = new THREE.Group(); this.pick = [];
      this.labels = []; this.updaters = [];
    }
    part(s) { this.specs.push(s); return s; }
    label(sid, text, pos, off) { this.labels.push({ sid, text, pos, off: off || [0, -70] }); }
    onUpdate(fn) { this.updaters.push(fn); }
    add(obj, sid) { this.group.add(obj); if (sid) { obj.userData.sid = sid; this.pick.push(obj); } return obj; }
    build() {
      const aoItems = this.specs.filter((s) => s.ao !== false).map((s) => ({
        s, f: S.bounded(s.f, s.bmin, s.bmax, 0.32), bmin: s.bmin, bmax: s.bmax
      }));
      for (const s of this.specs) {
        const aoDist = s.aoDist || 0.22;
        let aoFn = null;
        if (s.ao !== false) {
          const near = aoItems.filter((it) => boxOverlap(s.bmin, s.bmax, it.bmin, it.bmax, aoDist + 0.1)).map((it) => it.f);
          aoFn = near.length === 1 ? near[0] : (x, y, z) => { let d = 1e9; for (let i = 0; i < near.length; i++) { const v = near[i](x, y, z); if (v < d) d = v; } return d; };
        }
        const g = S.mesh(s.f, s.bmin, s.bmax, s.res || 84, { color: s.color, ao: aoFn, aoDist, aoMin: s.aoMin, skipInterior: s.skipInterior });
        const m = new THREE.Mesh(g, s.material || mat(s.mat, s.matx));
        m.castShadow = s.cast !== false; m.receiveShadow = true;
        s.mesh = m;
        if (s.zone) m.userData.zone = true;
        if (s.parenchyma) m.userData.parenchyma = true;
        this.add(m, s.sid);
      }
    }
    // 粒子の流れ（InstancedMesh・流れ方向に沿った向き付け対応）
    flow(o) {
      const im = new THREE.InstancedMesh(o.geom, o.mat, o.n);
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.castShadow = false; im.receiveShadow = false; im.frustumCulled = false;
      const ps = [];
      for (let i = 0; i < o.n; i++) {
        const p = { i, s: 0, v: 0.4, off: [0, 0, 0], block: Infinity, rot: new THREE.Euler(S.rand() * 6, S.rand() * 6, S.rand() * 6), spin: (S.rand() - 0.5) * 2, roll: S.rand() * 6.28 };
        o.spawn(p, i, true); ps.push(p);
      }
      if (o.colorOf) { const c = new THREE.Color(); ps.forEach((p, i) => { c.set(o.colorOf(p, i)); im.setColorAt(i, c); }); }
      const dummy = new THREE.Object3D(), v = new THREE.Vector3(), tan = new THREE.Vector3(), xAxis = new THREE.Vector3(1, 0, 0), qRoll = new THREE.Quaternion();
      const sc = o.scale || 1;
      const step = (dt) => {
        for (const p of ps) {
          if (p.s < p.block) {
            p.s += p.v * dt;
            if (p.s >= p.block) p.s = p.block;
            else if (p.s > p.path.len) { o.spawn(p, p.i, false); }
          }
          p.path.at(p.s, v);
          const jit = p.s >= p.block ? 0.012 : 0;
          dummy.position.set(v.x + p.off[0] + (jit ? (S.rand() - 0.5) * jit : 0), v.y + p.off[1], v.z + p.off[2]);
          if (o.alignFlow) {
            p.path.tangentAt(p.s, tan);
            dummy.quaternion.setFromUnitVectors(xAxis, tan);
            if (o.rollSpeed) {
              p.roll += o.rollSpeed * dt;
              qRoll.setFromAxisAngle(xAxis, p.roll);
              dummy.quaternion.multiply(qRoll);
            }
          } else {
            if (o.spin !== false) { p.rot.x += p.spin * dt; p.rot.y += p.spin * dt * 0.7; }
            dummy.rotation.copy(p.rot);
          }
          dummy.scale.setScalar(sc * (p.scale || 1));
          dummy.updateMatrix();
          im.setMatrixAt(p.i, dummy.matrix);
        }
        im.instanceMatrix.needsUpdate = true;
      };
      step(0);
      this.onUpdate((t, dt) => step(dt));
      this.add(im, o.sid);
      return { im, ps };
    }
  }

  // ===== 共有ジオメトリ（キャッシュ：高速化＆手本風オルガネラ造形） =====
  const GEO = {};
  const shared = (g) => { g.userData.shared = true; return g; };
  function geoSphere(r, seg) { const k = "s" + r + "_" + (seg || 14); return GEO[k] || (GEO[k] = shared(new THREE.SphereGeometry(r, seg || 14, Math.max(8, Math.round((seg || 14) * 0.75))))); }
  function geoDisc() { // 赤血球（両凹円盤）
    if (GEO.rbc) return GEO.rbc;
    const f = (x, y, z) => {
      const q = Math.hypot(x, z);
      const ring = Math.hypot(q - 0.11, y) - 0.06;
      const disc = Math.max(q - 0.15, Math.abs(y) - 0.028);
      return S.smin(ring, disc, 0.04);
    };
    return (GEO.rbc = shared(S.mesh(f, [-0.2, -0.1, -0.2], [0.2, 0.1, 0.2], 30, { color: H(0xffffff) })));
  }
  function geoBlob(r, amp, seed) {
    const k = "b" + r + amp + seed; if (GEO[k]) return GEO[k];
    const f = S.displace(S.sphere([0, 0, 0], r), amp, 6 / r * 0.25 + seed);
    return (GEO[k] = shared(S.mesh(f, [-r * 1.4, -r * 1.4, -r * 1.4], [r * 1.4, r * 1.4, r * 1.4], 34, { color: H(0xffffff) })));
  }
  // 手本風：切り欠きミトコンドリア（鮮やかなオレンジ外膜＋内側のクリステ皺）
  function geoMito() {
    if (GEO.mito) return GEO.mito;
    const outer = S.capsule([-0.105, 0, 0], [0.105, 0, 0], 0.068);
    const f = (x, y, z) => {
      let d = outer(x, y, z);
      // 正面(+z)を浅く切り欠いてクリステの波を見せる
      if (z > 0.015) {
        const inner = S.capsule([-0.088, 0, 0], [0.088, 0, 0], 0.052)(x, y, z);
        const crista = Math.sin(x * 78 + Math.sin(y * 38) * 1.1) * 0.014;
        d = Math.max(d, Math.min(z - (0.028 + crista), -inner));
      }
      return d;
    };
    return (GEO.mito = shared(S.mesh(f, [-0.2, -0.095, -0.095], [0.2, 0.095, 0.095], 44, {
      color: (x, y, z) => {
        if (z > 0.018 && Math.abs(y) < 0.048 && Math.abs(x) < 0.14) {
          const w = Math.sin(x * 78 + Math.sin(y * 38) * 1.1);
          return w > 0.15 ? H(0xffcf7a) : H(0xc94d18);
        }
        return S.mix(H(0xe46828), H(0xf58e42), S.noise(x * 16, y * 16, z * 16));
      },
      aoDist: 0.06
    })));
  }
  // 手本風：1/4切り欠き核（核膜孔・クロマチン断面・核小体）
  function geoNucleus() {
    if (GEO.nuc) return GEO.nuc;
    const f = (x, y, z) => {
      const sp = Math.hypot(x, y, z) - 0.27;
      // 右上(+x,+y,+z)を切り欠く
      const cut = Math.min(x + 0.01, y + 0.01, z + 0.02);
      const shell = Math.max(sp, cut);
      const nucleolus = Math.hypot(x - 0.02, y - 0.02, z - 0.02) - 0.092;
      return Math.min(shell, nucleolus);
    };
    return (GEO.nuc = shared(S.mesh(f, [-0.31, -0.31, -0.31], [0.31, 0.31, 0.31], 56, {
      color: (x, y, z) => {
        const r = Math.hypot(x - 0.02, y - 0.02, z - 0.02);
        if (r < 0.102) return S.mix(H(0x43207a), H(0x6338a8), S.noise(x * 36, y * 36, z * 36));
        const r0 = Math.hypot(x, y, z);
        if (r0 < 0.245) {
          // 切り欠き断面：繊細なクロマチン粒状模様
          const ch = S.fbm(x * 28, y * 28, z * 28);
          return S.mix(H(0x8860cf), H(0xc2a4f5), ch);
        }
        // 外膜：核膜孔の微小な窪み色
        const pore = S.cellPattern(x * 16, y * 16, z * 16);
        const base = S.mix(H(0x6e42bd), H(0x8c62d9), S.noise(x * 14, y * 14, z * 14));
        return pore > 0.42 ? S.mix(base, H(0x4b288f), 0.55) : base;
      },
      aoDist: 0.12, aoMin: 0.34
    })));
  }
  // 手本風：核を取り巻く粗面小胞体（鮮やかなコバルトブルーの層状リボン）
  function geoRER() {
    if (GEO.rer) return GEO.rer;
    const f = (x, y, z) => {
      let d = 1e9;
      const r = Math.hypot(x, y), a = Math.atan2(y, x);
      const wave = 0.012 * Math.sin(a * 14);
      for (const R0 of [0.33, 0.395, 0.46]) {
        const arc = Math.hypot(r - (R0 + wave), z) - 0.023;
        d = Math.min(d, arc);
      }
      // 半周＋折り返し
      const da = Math.abs(a - 2.35);
      return Math.max(d, da - 1.15);
    };
    return (GEO.rer = shared(S.mesh(f, [-0.56, -0.35, -0.06], [0.22, 0.56, 0.06], 62, {
      color: (x, y, z) => {
        const ribo = S.noise(x * 64, y * 64, z * 64);
        return ribo > 0.68 ? H(0x9fc2ff) : S.mix(H(0x3f67cc), H(0x648be8), S.noise(x * 18, y * 18, z * 18));
      },
      aoDist: 0.08
    })));
  }
  // 手本風：ゴルジ体（ピンク〜コーラルの重なりリボン）
  function geoGolgi() {
    if (GEO.golgi) return GEO.golgi;
    const f = (x, y, z) => {
      let d = 1e9;
      for (let k = 0; k < 4; k++) {
        const y0 = (k - 1.5) * 0.044;
        const len = 0.11 - Math.abs(k - 1.5) * 0.015;
        const bend = 0.032 * (x * x) / (len * len + 0.001);
        const dx = Math.max(Math.abs(x) - len, 0);
        d = Math.min(d, Math.hypot(dx, y - (y0 + bend), z) - 0.016);
      }
      return d;
    };
    return (GEO.golgi = shared(S.mesh(f, [-0.16, -0.12, -0.05], [0.16, 0.15, 0.05], 40, {
      color: (x, y) => S.mix(H(0xe86d8a), H(0xf7a4b4), 0.5 + y * 3),
      aoDist: 0.06
    })));
  }

  // 流れの向きを示す滑らかな3D矢印（+X向き）
  function geoArrow() {
    if (GEO.arrow) return GEO.arrow;
    const shaft = S.capsule([-0.085, 0, 0], [0.015, 0, 0], 0.018, 0.018);
    const head = S.capsule([0.005, 0, 0], [0.095, 0, 0], 0.044, 0.004);
    return (GEO.arrow = shared(S.mesh(S.union([shaft, head], 0.012), [-0.115, -0.058, -0.058], [0.115, 0.058, 0.058], 24, { color: H(0xffffff) })));
  }

  // IgA抗体ジオメトリ（単量体Y字×2をFc側でJ鎖結合した二量体IgA、pIgR結合型、分泌成分SC巻き付きSIgA）
  function makeDimerIgAFn() {
    const segs = [];
    for (const dir of [-1, 1]) {
      // Fc幹
      segs.push(S.capsule([0.014 * dir, 0, 0], [0.056 * dir, 0, 0], 0.0145, 0.0155));
      // 2本のFab腕（Y字の開き）
      segs.push(S.capsule([0.052 * dir, 0, 0], [0.116 * dir, 0.054, 0], 0.014, 0.016));
      segs.push(S.capsule([0.052 * dir, 0, 0], [0.116 * dir, -0.054, 0], 0.014, 0.016));
    }
    // J鎖（Fc同士をつなぐ中央の結び目）
    segs.push(S.capsule([-0.020, -0.006, 0], [0.020, -0.006, 0], 0.0165, 0.0165));
    return S.union(segs, 0.012);
  }
  function geoDimericIgA() {
    if (GEO.dIga) return GEO.dIga;
    const f = makeDimerIgAFn();
    return (GEO.dIga = shared(S.mesh(f, [-0.145, -0.085, -0.042], [0.145, 0.085, 0.042], 34, {
      color: (x, y) => {
        if (Math.abs(x) < 0.024 && y < 0.016) return H(0xf2be38); // J鎖（金黄）
        return Math.abs(x) > 0.068 ? H(0xd64cb2) : H(0x9c3d8a);   // Fab腕・Fc幹（#9c3d8a系）
      },
      aoDist: 0.04, skipInterior: true
    })));
  }
  function geoIgApIgR() {
    if (GEO.igaPigr) return GEO.igaPigr;
    const base = makeDimerIgAFn();
    // pIgR（受容体：Fc・J鎖側を抱え込むティール色の柄）
    const pigr = S.union([
      S.capsule([-0.042, -0.025, 0], [0.042, -0.025, 0], 0.012, 0.012),
      S.capsule([0, -0.025, 0], [0, -0.072, 0], 0.011, 0.013)
    ], 0.01);
    return (GEO.igaPigr = shared(S.mesh((x, y, z) => S.smin(base(x, y, z), pigr(x, y, z), 0.008), [-0.145, -0.095, -0.045], [0.145, 0.085, 0.045], 34, {
      color: (x, y, z) => {
        if (pigr(x, y, z) < base(x, y, z) + 0.003) return H(0x28b8a0); // pIgR（ミントティール）
        if (Math.abs(x) < 0.024 && y < 0.016) return H(0xf2be38);
        return Math.abs(x) > 0.068 ? H(0xd64cb2) : H(0x9c3d8a);
      },
      aoDist: 0.04, skipInterior: true
    })));
  }
  function geoSecretoryIgA() {
    if (GEO.sIga) return GEO.sIga;
    const base = makeDimerIgAFn();
    // 分泌成分（SC）：二量体の中央Fc・J鎖まわりを斜めに巻く細い帯（明るいアクアティール）
    const scBand = S.union([
      S.xf(S.torus([0, 0, 0], 0.026, 0.0095, "x"), [-0.018, 0, 0], [0, 26, 18]),
      S.xf(S.torus([0, 0, 0], 0.026, 0.0095, "x"), [0.018, 0, 0], [0, -26, -18]),
      S.capsule([-0.044, 0.018, 0.018], [0.044, -0.018, 0.018], 0.0095, 0.0095),
      S.capsule([-0.044, -0.018, -0.018], [0.044, 0.018, -0.018], 0.0095, 0.0095)
    ], 0.008);
    return (GEO.sIga = shared(S.mesh((x, y, z) => S.smin(base(x, y, z), scBand(x, y, z), 0.006), [-0.145, -0.085, -0.052], [0.145, 0.085, 0.052], 36, {
      color: (x, y, z) => {
        if (scBand(x, y, z) < base(x, y, z) + 0.003) return H(0x2ce0b8); // 分泌成分SC（明るいシアン緑の帯）
        if (Math.abs(x) < 0.024 && y < 0.016) return H(0xf2be38);
        return Math.abs(x) > 0.068 ? H(0xd64cb2) : H(0x9c3d8a);
      },
      aoDist: 0.04, skipInterior: true
    })));
  }

  // 肝実質の色（小葉模様のかすかな斑＋自然な色調むら）
  function liverSurfaceColor(base, light, tint, amt, freq) {
    const b = H(base), l = H(light), tn = tint ? H(tint) : null, fq = freq || 2.0;
    return (x, y, z) => {
      const n = S.fbm(x * fq + 3, y * fq + 1, z * fq + 7);
      let c = S.mix(b, l, n);
      // かすかな多角形の小葉模様（グリソン被膜越しの繊細な斑）
      const lob = S.cellPattern(x * 11.5, y * 11.5, z * 11.5);
      const edge = S.smooth(0.05, 0.24, lob);
      c = S.mix([c[0] * 0.91, c[1] * 0.90, c[2] * 0.89], [c[0] * 1.03, c[1] * 1.02, c[2] * 1.01], edge);
      const micro = S.noise(x * 24, y * 24, z * 24);
      if (micro > 0.72) c = S.mix(c, [c[0] * 0.94, c[1] * 0.92, c[2] * 0.91], 0.35);
      if (tn && amt) c = S.mix(c, tn, amt);
      return c;
    };
  }

  // =====================================================================
  // L1 臓器：肝臓・胆嚢・胆管・血管（枝分かれ）・十二指腸・腸肝循環
  // =====================================================================
  function buildL1(sp, pt) {
    const B = new Builder();
    S.seed(101);
    const human = sp === "human", bdl = pt === "bdl", gs = pt === "gallstone";
    let liver, lbm, lbx;
    if (human) {
      const rl = S.ellipsoid([-0.92, 0.16, 0], [1.75, 1.32, 1.35]);
      const ll = S.ellipsoid([1.02, 0.44, 0.12], [1.55, 0.72, 1.0]);
      const tip = S.ellipsoid([2.22, 0.52, 0.1], [0.85, 0.32, 0.55]);
      const quad = S.ellipsoid([0.05, -0.35, 0.75], [0.46, 0.4, 0.46]);
      const caud = S.ellipsoid([-0.15, 0.05, -0.78], [0.48, 0.55, 0.36]);
      const base = S.union([rl, ll, tip, quad, caud], 0.5);
      const n = [-0.29, 0.957, 0], c0 = n[0] * -0.9 + n[1] * -0.98;
      const above = (x, y, z) => -(x * n[0] + y * n[1] - c0);
      const fossa = S.ellipsoid([-0.46, -0.96, 0.75], [0.39, 0.36, 0.62]);
      const falc = S.capsule([0.36, 1.55, 0.96], [0.3, 0.12, 1.38], 0.07);
      const f = (x, y, z) => {
        let d = S.smax(base(x, y, z), above(x, y, z), 0.42);
        d = S.smax(d, -(z + 1.05), 0.38);
        d = S.smax(d, -fossa(x, y, z), 0.14);
        return S.smax(d, -falc(x, y, z), 0.08);
      };
      liver = S.displace(f, 0.045, 1.7);
      lbm = [-2.82, -1.38, -1.28]; lbx = [3.18, 1.72, 1.52];
    } else {
      // マウス：深く分かれた4葉（内側葉［左右分枝］・外側左葉・右側葉・尾状葉）
      const LLL = S.lens([1.06, -0.05, 0.25], 1.42, 1.16, 0.37, [8, -18, -12], 0.22);
      const ML0 = S.union([
        S.lens([-0.74, 0.32, 0.80], 0.80, 1.00, 0.33, [0, 10, 6], 0.22),
        S.lens([0.06, 0.39, 0.85], 0.64, 0.92, 0.31, [0, -6, -4], 0.22)
      ], 0.08);
      const notch = S.ellipsoid([-0.32, -0.75, 0.85], [0.27, 0.56, 0.72]);
      const MLc = (x, y, z) => S.smax(ML0(x, y, z), -notch(x, y, z), 0.1);
      const RL = S.lens([-1.56, -0.08, -0.05], 0.86, 1.06, 0.41, [0, 38, 12], 0.22);
      const RL2 = S.lens([-1.12, -0.76, -0.55], 0.84, 0.62, 0.35, [-20, 22, 0], 0.22);
      const CL = S.lens([0.32, -0.72, -0.45], 0.60, 0.40, 0.27, [-40, 0, 0], 0.22);
      liver = S.displace(S.union([LLL, MLc, RL, RL2, CL], 0.06), 0.032, 2.3);
      lbm = [-2.62, -1.72, -1.28]; lbx = [2.68, 1.48, 1.48];
    }
    const tintAmt = bdl ? 0.42 : gs ? 0.14 : 0;
    const baseLiverCol = human ? liverSurfaceColor(0x943225, 0xc4513c, 0xb09036, tintAmt) : liverSurfaceColor(0x82251e, 0xb24234, 0xa88632, tintAmt);
    B.part({
      sid: human ? "liver_lobe_human" : "liver_lobe_mouse", parenchyma: true, f: liver, bmin: lbm, bmax: lbx, res: 90, skipInterior: true, mat: "wet",
      color: human ? (x, y, z) => {
        let c = baseLiverCol(x, y, z);
        // 鎌状間膜の自然な真珠色結合組織ひだ（前面の溝に馴染ませる）
        if (z > 0.65 && y > -0.35 && y < 1.38) {
          const cx = 0.31 + 0.03 * ((y + 0.35) / 1.73);
          const dist = Math.abs(x - cx);
          const band = 1 - S.smooth(0.015, 0.075, dist);
          if (band > 0.01) c = S.mix(c, H(0xeedbcb), band * 0.62);
        }
        return c;
      } : baseLiverCol
    });

    // 胆嚢（艶やかなエメラルド・オリーブの樹脂感）
    const gbR = (human ? 0.35 : 0.24) * (bdl ? 1.42 : 1);
    const fundus = human ? [-0.56, -1.24, 1.02] : [-0.30, -0.76, 1.12];
    const neck = human ? [-0.28, -0.78, 0.42] : [-0.22, -0.98, 0.62];
    const gbF = S.displace(S.union([S.sphere(fundus, gbR), S.capsule(fundus, neck, gbR * 0.84, 0.105)], 0.12), 0.012, 8);
    const gbT = gs || !human;
    B.part({
      sid: "gallbladder", f: gbF, ...bbPts([fundus, neck], gbR + 0.12), res: 48, skipInterior: true, mat: "gloss",
      color: (x, y, z) => S.mix(H(bdl ? 0x227036 : 0x2aa85e), H(0x7fd172), S.fbm(x * 3.5, y * 3.5, z * 3.5) * 0.7),
      matx: gbT ? { transparent: true, opacity: 0.56, depthWrite: false, clearcoat: 1.0, roughness: 0.14 } : { clearcoat: 1.0, roughness: 0.16 }, cast: !gbT
    });
    if (gs) {
      const st = [[0, 0, 0], [0.11, 0.07, -0.04], [-0.09, 0.09, 0.05], [0.03, -0.10, 0.07]].map((o) => [fundus[0] + o[0], fundus[1] + o[1], fundus[2] + o[2]]);
      const stones = S.displace(S.union(st.map((c, i) => S.sphere(c, 0.098 - i * 0.011)), 0), 0.038, 10);
      B.part({ sid: "gallstone_gb", f: stones, ...bbPts(st, 0.16), res: 42, mat: "clay", color: (x, y, z) => S.mix(H(0xd8a23e), H(0x724f1e), S.noise(x * 20, y * 20, z * 20)) });
    }

    // 胆管系（肝内分枝→左右肝管→総肝管＋胆嚢管→総胆管：解剖通り画面左・右寄り）
    const r0 = 0.058, up = bdl ? 0.112 : gs ? 0.084 : 0.058;
    const hilumR = [-0.52, -0.60, 0.20], hilumL = [0.35, -0.58, 0.20], chd0 = [-0.18, -0.90, 0.32], jn = [-0.14, -1.30, 0.38];
    const lig = [-0.10, -1.70, 0.34];
    const papilla = [-0.38, -2.60, 0.32];
    const cyst = human ? [neck, [-0.24, -1.10, 0.45], jn] : [neck, [-0.18, -1.12, 0.50], jn];
    // 胆管系・門脈・肝動脈・肝静脈の共有マテリアル（ドローコール＆シェーダ初期化を大幅削減）
    const bileMatX = { roughness: 0.16, clearcoat: 1.0 };
    const pvCol = 0x6f5ed8, haCol = 0xe03a32, ivcCol = 0x3b72cc, bdCol = 0x2aa85e;
    const mBileHD = matSolid("gloss", bdCol, bileMatX);
    const mBileCBD = matSolid("gloss", bdCol, bileMatX);
    const mPV = matSolid("wet", pvCol);
    const mHA = matSolid("wet", haCol);
    const mHV = matSolid("wet", ivcCol);
    const addBileBranch = (pts, ra, rb, sid, segs, intra) => B.add(makeTaperTube(pts, ra, rb, segs || 14, intra ? 8 : 10, bdCol, "gloss", bileMatX, sid === "cbd" ? mBileCBD : mBileHD, intra), sid);
    // 左右肝管＋肝内への枝分かれ（門脈・肝動脈と並走するグリソン鞘系統）
    addBileBranch([hilumR, chd0, jn], up, up, "hepatic_ducts");
    addBileBranch([hilumL, chd0], up * 0.92, up, "hepatic_ducts");
    addBileBranch(cyst, up * 0.78, up * 0.85, "hepatic_ducts");
    // 総胆管（BDLでは結紮部上流が拡張・下流は細い、胆石では結石上流が拡張）
    const cbdSegs = [
      { pts: [jn, lig], ra: up, rb: up },
      { pts: [lig, [-0.08, -1.86, 0.33], [-0.14, -2.34, 0.30]], ra: bdl ? r0 : up, rb: bdl ? r0 : gs ? up * 0.95 : r0 },
      { pts: [[-0.14, -2.34, 0.30], papilla], ra: r0, rb: r0 * 0.92 }
    ];
    cbdSegs.forEach((sg) => addBileBranch(sg.pts, sg.ra, sg.rb, "cbd"));

    // 門脈（後ろ側 z<0・肝門部で左右枝＋さらに区域枝へ分枝）
    const pv = [[0.40, -3.55, -0.22], [0.35, -2.80, -0.28], [0.16, -2.00, -0.24], [0.06, -1.20, -0.18], [0.02, -0.74, -0.12]];
    const smv = [[1.25, -3.85, 0.0], [0.62, -3.70, -0.15], [0.40, -3.55, -0.22]];
    const spl = [[0.35, -2.80, -0.28], [1.02, -2.68, -0.46], [1.78, -2.52, -0.56]];
    const imv = [[1.02, -2.68, -0.46], [1.10, -3.15, -0.44], [1.16, -3.52, -0.40]];
    const capEnd = (pos, r, mMat, sid) => { const m = new THREE.Mesh(geoSphere(r, 10), mMat); m.position.set(pos[0], pos[1], pos[2]); B.add(m, sid); };
    B.add(makeTaperTube(pv, 0.145, 0.135, 20, 12, pvCol, "wet", null, mPV), "portal_vein");
    B.add(makeTaperTube(smv, 0.095, 0.12, 12, 10, pvCol, "wet", null, mPV), "portal_vein");
    B.add(makeTaperTube(spl, 0.11, 0.085, 12, 10, pvCol, "wet", null, mPV), "portal_vein");
    B.add(makeTaperTube(imv, 0.068, 0.048, 10, 10, pvCol, "wet", null, mPV), "portal_vein");
    capEnd(spl[2], 0.084, mPV, "portal_vein"); capEnd(imv[2], 0.047, mPV, "portal_vein");

    // 固有肝動脈（解剖通り画面右・左寄り：左右肝動脈＋胆嚢動脈枝＋胃十二指腸動脈枝）
    const ha = [[1.62, -2.25, -0.04], [0.92, -1.98, 0.06], [0.38, -1.58, 0.16], [0.22, -1.14, 0.22], [0.14, -0.74, 0.18]];
    B.add(makeTaperTube(ha, 0.056, 0.046, 18, 10, haCol, "wet", null, mHA), "hepatic_artery");
    capEnd(ha[0], 0.055, mHA, "hepatic_artery");
    B.add(makeTaperTube([[0.38, -1.58, 0.16], [0.24, -1.92, 0.26], [0.16, -2.28, 0.24]], 0.042, 0.028, 10, 8, haCol, "wet", null, mHA), "hepatic_artery");
    // 胆嚢動脈（右肝動脈→胆嚢頸部）
    B.add(makeTaperTube([[-0.22, -0.64, 0.18], [-0.28, -0.78, 0.36], [neck[0] + 0.04, neck[1] - 0.05, neck[2] + 0.06]], 0.024, 0.016, 8, 8, haCol, "wet", null, mHA), "hepatic_artery");

    // 肝内の門脈域分枝（門脈・肝動脈・胆管が並走：透過モードで立体的に見える。肝内なので影投影はオフ）
    const bileDil = 1 + (up / r0 - 1) * 0.68;
    const shiftPts = (pts, dx, dy, dz) => pts.map((p) => [p[0] + dx, p[1] + dy, p[2] + dz]);
    const capTip = (pt, r, mMat, sid) => { const m = new THREE.Mesh(geoSphere(r, 8), mMat); m.position.set(pt[0], pt[1], pt[2]); B.add(m, sid); };
    const addTriad = (pts, pvA, pvB, haA, haB, bdA, bdB, segs) => {
      const nSeg = Math.max(8, Math.round((segs || 12) * 0.8));
      const haPts = shiftPts(pts, 0.040, -0.022, 0.054);
      const bdPts = shiftPts(pts, -0.030, 0.034, 0.064);
      B.add(makeTaperTube(pts, pvA, pvB, nSeg, 8, pvCol, "wet", null, mPV, true), "portal_vein");
      B.add(makeTaperTube(haPts, haA, haB, nSeg, 7, haCol, "wet", null, mHA, true), "hepatic_artery");
      addBileBranch(bdPts, bdA * bileDil, bdB * bileDil, "hepatic_ducts", nSeg, true);
      const end = pts.length - 1;
      capTip(pts[end], pvB * 0.96, mPV, "portal_vein");
      capTip(haPts[end], haB * 0.96, mHA, "hepatic_artery");
      capTip(bdPts[end], bdB * bileDil * 0.96, mBileHD, "hepatic_ducts");
    };
    // 肝門部から左右の1次枝へ滑らかに接続
    B.add(makeTaperTube([[0.02, -0.74, -0.12], [-0.36, -0.58, -0.12], [-0.72, -0.46, -0.12]], 0.118, 0.095, 10, 10, pvCol, "wet", null, mPV, true), "portal_vein");
    B.add(makeTaperTube([[0.02, -0.74, -0.12], [0.38, -0.58, -0.11], [0.76, -0.44, -0.10]], 0.110, 0.088, 10, 10, pvCol, "wet", null, mPV, true), "portal_vein");
    B.add(makeTaperTube([[0.14, -0.74, 0.18], [-0.38, -0.56, 0.14], [-0.68, -0.48, -0.06]], 0.042, 0.032, 10, 8, haCol, "wet", null, mHA, true), "hepatic_artery");
    B.add(makeTaperTube([[0.14, -0.74, 0.18], [0.50, -0.54, 0.12], [0.80, -0.46, -0.04]], 0.040, 0.030, 10, 8, haCol, "wet", null, mHA, true), "hepatic_artery");
    addBileBranch([hilumR, [-0.64, -0.50, 0.06], [-0.75, -0.42, -0.05]], up * 0.78, up * 0.62, "hepatic_ducts", 10, true);
    addBileBranch([hilumL, [0.56, -0.48, 0.08], [0.73, -0.40, -0.03]], up * 0.72, up * 0.58, "hepatic_ducts", 10, true);

    // 肝静脈（別系統：小葉間・区域間を走り下大静脈 IVC へ注ぐ）
    const ivcMesh = new THREE.Mesh(hollowCylGeo(0.25, 0.18, 5.42, 20, ivcCol, 0x1e3c72), mat("wet"));
    ivcMesh.position.set(-0.60, -0.73, -0.94); ivcMesh.castShadow = true; ivcMesh.receiveShadow = true;
    B.add(ivcMesh, "hepatic_vein");
    const addHV = (pts, ra, rb, segs) => {
      B.add(makeTaperTube(pts, ra, rb, Math.max(8, Math.round((segs || 12) * 0.8)), 8, ivcCol, "wet", null, mHV, true), "hepatic_vein");
      capTip(pts[pts.length - 1], rb * 0.96, mHV, "hepatic_vein");
    };

    if (human) {
      // ヒト肝内グリソン鞘（右前S8/S5・右後S7/S6・左外側S2/S3・左内側S4＋自然な曲線3次枝）
      addTriad([[-0.72, -0.46, -0.12], [-1.14, 0.02, 0.18], [-1.36, 0.62, 0.34], [-1.22, 0.96, 0.24]], 0.088, 0.024, 0.030, 0.011, 0.036, 0.013, 14);
      addTriad([[-1.14, 0.02, 0.18], [-0.94, 0.36, 0.36], [-0.82, 0.74, 0.42]], 0.052, 0.020, 0.020, 0.009, 0.024, 0.011, 10);
      addTriad([[-1.14, 0.02, 0.18], [-1.52, -0.26, 0.34], [-1.86, -0.52, 0.20]], 0.056, 0.020, 0.021, 0.009, 0.025, 0.011, 10);
      addTriad([[-0.72, -0.46, -0.12], [-1.34, -0.08, -0.22], [-1.96, 0.24, -0.22], [-2.22, 0.48, -0.14]], 0.084, 0.024, 0.028, 0.010, 0.034, 0.012, 14);
      addTriad([[-1.34, -0.08, -0.22], [-1.54, 0.38, -0.22], [-1.68, 0.84, -0.14]], 0.050, 0.020, 0.019, 0.009, 0.023, 0.010, 10);
      addTriad([[-1.34, -0.08, -0.22], [-1.62, -0.32, -0.28], [-1.88, -0.56, -0.30]], 0.052, 0.020, 0.020, 0.009, 0.024, 0.010, 10);
      addTriad([[0.76, -0.44, -0.10], [1.28, 0.10, 0.02], [1.94, 0.42, 0.08], [2.42, 0.52, 0.08]], 0.082, 0.022, 0.028, 0.010, 0.033, 0.012, 14);
      addTriad([[1.28, 0.10, 0.02], [1.44, 0.44, -0.04], [1.58, 0.78, -0.08]], 0.048, 0.018, 0.018, 0.008, 0.022, 0.010, 10);
      addTriad([[1.28, 0.10, 0.02], [1.52, 0.18, 0.22], [1.74, 0.28, 0.34]], 0.046, 0.018, 0.018, 0.008, 0.021, 0.010, 10);
      addTriad([[0.76, -0.44, -0.10], [0.58, 0.16, 0.30], [0.64, 0.72, 0.32]], 0.058, 0.020, 0.022, 0.009, 0.025, 0.011, 12);
      addTriad([[0.58, 0.16, 0.30], [0.36, 0.14, 0.46], [0.16, 0.08, 0.54]], 0.040, 0.016, 0.016, 0.008, 0.019, 0.009, 10);
      // ヒト肝静脈（右・中・左＋区域間分枝）
      addHV([[-0.60, 1.38, -0.92], [-1.25, 1.08, -0.54], [-1.76, 0.56, -0.12], [-2.12, -0.10, 0.04]], 0.125, 0.028, 14);
      addHV([[-1.25, 1.08, -0.54], [-1.52, 0.46, -0.54], [-1.62, -0.18, -0.52]], 0.072, 0.024, 10);
      addHV([[-1.76, 0.56, -0.12], [-1.72, 0.30, 0.22], [-1.58, 0.06, 0.46]], 0.058, 0.020, 10);
      addHV([[-0.60, 1.40, -0.92], [-0.25, 1.02, -0.28], [-0.08, 0.48, 0.26], [-0.14, -0.12, 0.52]], 0.105, 0.026, 14);
      addHV([[-0.25, 1.02, -0.28], [-0.52, 0.92, 0.06], [-0.78, 0.80, 0.34]], 0.058, 0.020, 10);
      addHV([[-0.08, 0.48, 0.26], [0.18, 0.52, 0.38], [0.42, 0.54, 0.42]], 0.054, 0.020, 10);
      addHV([[-0.60, 1.42, -0.92], [0.22, 1.18, -0.50], [0.95, 0.80, -0.12], [1.86, 0.56, 0.04]], 0.118, 0.026, 14);
      addHV([[0.95, 0.80, -0.12], [1.08, 0.62, 0.14], [1.18, 0.44, 0.34]], 0.056, 0.020, 10);
    } else {
      // マウス肝内グリソン鞘（右側葉・右下葉・内側葉左右・外側左葉・尾状葉＋自然な曲線3次枝）
      addTriad([[-0.72, -0.46, -0.12], [-1.32, -0.16, -0.05], [-1.76, 0.38, -0.12]], 0.078, 0.024, 0.026, 0.010, 0.032, 0.012, 12);
      addTriad([[-1.32, -0.16, -0.05], [-1.56, -0.34, 0.03], [-1.80, -0.48, 0.10]], 0.048, 0.018, 0.019, 0.008, 0.022, 0.010, 10);
      addTriad([[-0.72, -0.46, -0.12], [-1.14, -0.74, -0.50], [-1.56, -0.82, -0.52]], 0.060, 0.020, 0.022, 0.009, 0.025, 0.010, 10);
      addTriad([[-0.72, -0.46, -0.12], [-0.74, 0.14, 0.70], [-0.96, 0.72, 0.74]], 0.064, 0.022, 0.023, 0.009, 0.026, 0.011, 12);
      addTriad([[-0.74, 0.14, 0.70], [-0.62, 0.46, 0.76], [-0.52, 0.76, 0.78]], 0.042, 0.018, 0.017, 0.008, 0.020, 0.009, 10);
      addTriad([[0.76, -0.44, -0.10], [0.12, 0.22, 0.76], [0.24, 0.76, 0.78]], 0.058, 0.020, 0.021, 0.009, 0.024, 0.010, 12);
      addTriad([[0.12, 0.22, 0.76], [-0.02, 0.52, 0.80], [-0.14, 0.76, 0.80]], 0.038, 0.016, 0.016, 0.008, 0.018, 0.009, 10);
      addTriad([[0.76, -0.44, -0.10], [1.16, -0.06, 0.20], [1.62, 0.16, 0.14], [1.96, 0.28, 0.06]], 0.082, 0.024, 0.028, 0.010, 0.032, 0.012, 14);
      addTriad([[1.16, -0.06, 0.20], [1.26, 0.28, 0.22], [1.34, 0.58, 0.22]], 0.050, 0.018, 0.019, 0.008, 0.023, 0.010, 10);
      addTriad([[1.16, -0.06, 0.20], [1.44, -0.28, 0.22], [1.74, -0.48, 0.18]], 0.050, 0.018, 0.019, 0.008, 0.023, 0.010, 10);
      addTriad([[0.02, -0.74, -0.12], [0.20, -0.73, -0.30], [0.38, -0.72, -0.44]], 0.044, 0.018, 0.016, 0.008, 0.019, 0.009, 10);
      // マウス肝静脈（各葉から下大静脈 IVC へ還流）
      addHV([[-0.60, 1.38, -0.92], [-1.22, 0.72, -0.32], [-1.58, 0.14, -0.08], [-1.70, -0.34, 0.02]], 0.120, 0.028, 14);
      addHV([[-1.22, 0.72, -0.32], [-1.20, 0.12, -0.42], [-1.18, -0.44, -0.50]], 0.065, 0.022, 10);
      addHV([[-0.60, 1.40, -0.92], [-0.36, 0.92, 0.12], [-0.54, 0.72, 0.52], [-0.66, 0.48, 0.74]], 0.098, 0.026, 12);
      addHV([[-0.36, 0.92, 0.12], [-0.14, 0.76, 0.54], [0.06, 0.56, 0.80]], 0.068, 0.022, 10);
      addHV([[-0.60, 1.42, -0.92], [0.22, 0.95, -0.32], [0.95, 0.44, 0.16], [1.78, -0.04, 0.10]], 0.115, 0.028, 14);
      addHV([[0.95, 0.44, 0.16], [1.02, 0.04, 0.24], [1.08, -0.42, 0.26]], 0.062, 0.022, 10);
    }

    // 十二指腸・Oddi・回腸（シームレスな1本管で自然な粘膜ひだ）
    const giPts = [[1.02, -1.85, 0.20], [0.20, -1.98, 0.30], [-0.46, -2.16, 0.32], [-0.66, -2.70, 0.32], [-0.38, -3.20, 0.30], [0.40, -3.32, 0.25], [1.20, -3.15, 0.20], [1.76, -3.30, 0.18], [2.15, -3.60, 0.10], [1.85, -3.92, 0.05], [1.25, -3.85, 0.0]];
    const giRadii = [0.23, 0.23, 0.23, 0.23, 0.23, 0.225, 0.21, 0.20, 0.195, 0.195, 0.195];
    B.part({
      sid: "duodenum_ileum", f: S.tube(giPts, giRadii, 0.16), ...bbPts(giPts, 0.36), res: 64, skipInterior: true, mat: "wet",
      color: (x, y, z) => { const r = 0.5 + 0.5 * Math.sin((x * 0.7 + y) * 26); return S.mix(H(0xd27065), H(0xec9e8e), r * 0.52 + S.fbm(x * 3, y * 3, z * 3) * 0.3); }
    });
    B.part({ sid: "oddi_sphincter", f: S.torus([papilla[0] - 0.02, papilla[1], papilla[2]], 0.078, 0.042, "x"), bmin: [-0.54, -2.76, 0.16], bmax: [-0.24, -2.44, 0.48], res: 34, mat: "clay", color: H(0xbf5147) });

    // 病態：結紮・結石
    if (bdl) {
      B.part({ sid: "bdl_ligature", f: S.union([S.torus(lig, 0.095, 0.034, "y"), S.sphere([lig[0] + 0.105, lig[1], lig[2] + 0.06], 0.048)], 0.02), bmin: [lig[0] - 0.22, lig[1] - 0.11, lig[2] - 0.22], bmax: [lig[0] + 0.24, lig[1] + 0.11, lig[2] + 0.22], res: 38, mat: "gloss", color: H(0xec7e1a) });
    }
    if (gs) {
      const sc = [-0.14, -2.33, 0.30];
      B.part({ sid: "gallstone_cbd", f: S.displace(S.sphere(sc, 0.105), 0.04, 9), bmin: [sc[0] - 0.17, sc[1] - 0.17, sc[2] - 0.17], bmax: [sc[0] + 0.17, sc[1] + 0.17, sc[2] + 0.17], res: 34, mat: "clay", color: (x, y, z) => S.mix(H(0xd29c3a), H(0x6e4b1c), S.noise(x * 20, y * 20, z * 20)) });
    }
    B.build();

    // 腸肝循環の胆汁酸粒子（不透明胆管・消化管・門脈の前面に沿って視認性を確保）
    const bzUp = up + 0.012, bzDn = r0 + 0.012;
    const ehc = new Path([
      [hilumR[0], hilumR[1], hilumR[2] + bzUp],
      [chd0[0], chd0[1], chd0[2] + bzUp],
      [jn[0], jn[1], jn[2] + bzUp],
      [lig[0], lig[1], lig[2] + bzUp],
      [-0.08, -1.86, 0.33 + (bdl ? bzDn : bzUp)],
      [-0.14, -2.34, 0.30 + (bdl ? bzDn : gs ? up * 0.95 + 0.012 : bzDn)],
      [papilla[0], papilla[1], papilla[2] + bzDn],
      [-0.56, -2.72, 0.62], [-0.36, -3.20, 0.60], [0.40, -3.34, 0.54], [1.20, -3.16, 0.48], [1.76, -3.30, 0.42], [2.15, -3.60, 0.34], [1.85, -3.92, 0.28], [1.25, -3.85, 0.22],
      [0.62, -3.70, 0.04], [0.40, -3.55, -0.02], [0.35, -2.80, -0.08], [0.16, -2.00, -0.04], [0.06, -1.20, 0.04], [0.02, -0.74, 0.10],
      [hilumR[0], hilumR[1], hilumR[2] + bzUp]
    ]);
    const blockS = bdl ? ehc.c[3] : gs ? ehc.c[5] - 0.08 : Infinity;
    const N = 52;
    B.flow({
      geom: geoSphere(0.046, 12), mat: matSolid("gloss", 0xf5b800, { emissive: 0x6b3e00, emissiveIntensity: 0.45 }), n: N,
      spawn: (p, i, init) => {
        p.path = ehc; p.v = 0.55;
        p.s = init ? (i / N) * ehc.len : 0;
        if (blockS < Infinity) {
          p.block = Math.max(0.08, blockS - (i % 9) * 0.065 - 0.03);
          if (p.s > p.block) p.s = p.block * S.rand();
        }
      }
    });

    B.label(human ? "liver_lobe_human" : "liver_lobe_mouse", human ? "肝臓（右葉・左葉）" : "肝臓（マウス4葉）", human ? [1.75, 0.85, 0.65] : [1.35, 0.55, 0.62], [110, -75]);
    B.label("gallbladder", "胆嚢", fundus, [-175, 18]);
    B.label("hepatic_ducts", "左右肝管・総肝管", chd0, [-195, -55]);
    B.label("cbd", "総胆管", [-0.09, -1.96, 0.33], [-185, 15]);
    B.label("oddi_sphincter", "Oddi括約筋（十二指腸乳頭）", papilla, [-185, 65]);
    B.label("portal_vein", "門脈（血流の約75%）", [0.32, -2.75, -0.22], [185, 25]);
    B.label("hepatic_artery", "固有肝動脈（約25%）", [0.62, -1.84, 0.10], [185, -35]);
    B.label("hepatic_vein", "肝静脈・下大静脈", [-0.60, 1.85, -0.95], [-135, -25]);
    B.label("duodenum_ileum", "回腸で約95%再吸収（模式）", [2.00, -3.55, 0.25], [100, 55]);
    if (bdl) B.label("bdl_ligature", "総胆管結紮（BDL）", lig, [-195, -18]);
    if (gs) B.label("gallstone_cbd", "総胆管結石", [-0.14, -2.33, 0.30], [-185, 28]);
    if (gs) B.label("gallstone_gb", "胆嚢結石", [fundus[0] - 0.05, fundus[1] + 0.06, fundus[2]], [-185, -22]);

    return {
      B, cam: { target: [0.08, -1.15, 0], dist: 15.8, min: 10, max: 21, yaw: 0.08, pitch: 0.10 },
      structures: [human ? "liver_lobe_human" : "liver_lobe_mouse", "gallbladder", "hepatic_ducts", "cbd", "oddi_sphincter", "portal_vein", "hepatic_artery", "hepatic_vein", "duodenum_ileum"].concat(bdl ? ["bdl_ligature"] : [], gs ? ["gallstone_gb", "gallstone_cbd"] : []),
      floorY: -4.25,
      zoomSpot: human ? [-0.55, 0.20, 0.95] : [0.95, 0.15, 0.72],
      zoomRingScale: 1.8
    };
  }

  // =====================================================================
  // L2 小葉の並び：六角柱の小葉・中心静脈・門脈域（三つ組）
  // =====================================================================
  function buildL2(sp, pt) {
    const B = new Builder();
    S.seed(202);
    const human = sp === "human", bdl = pt === "bdl", gs = pt === "gallstone";
    const R = 0.9, gap = human ? 0.078 : 0.032, top = 0.55;
    const centers = [];
    for (let q = -4; q <= 4; q++) for (let r = -4; r <= 4; r++) {
      const x = 1.5 * R * q, z = Math.sqrt(3) * R * (r + q / 2);
      if (Math.abs(x) < 3.3 && Math.abs(z) < 2.8) centers.push([x, z]);
    }
    const inside = (x, z) => Math.abs(x) < 2.78 && Math.abs(z) < 2.12;
    const chunk = S.roundBox([0, 0, 0], [2.9, top, 2.25], 0.22);
    const hexd = (dx, dz, rr) => { const ax = Math.abs(dx), az = Math.abs(dz); return Math.max(az, az * 0.5 + ax * 0.8660254) - rr * 0.8660254; };
    const nearest = (x, z) => { let bi = 0, bd = 1e9; for (let i = 0; i < centers.length; i++) { const d = (x - centers[i][0]) ** 2 + (z - centers[i][1]) ** 2; if (d < bd) { bd = d; bi = i; } } return centers[bi]; };
    const tissue = (x, y, z) => {
      const c = nearest(x, z);
      const lob = hexd(x - c[0], z - c[1], R - gap);
      const hole = Math.hypot(x - c[0], z - c[1]) - 0.16;
      const d = Math.max(chunk(x, y, z), Math.min(lob, -(y - (top - 0.14))));
      return S.smax(d, -hole, 0.03);
    };
    B.part({
      sid: "lobule_array", f: tissue, bmin: [-3.0, -0.65, -2.35], bmax: [3.0, 0.65, 2.35], res: 112, skipInterior: true, mat: "wet",
      color: (x, y, z) => {
        const c = nearest(x, z);
        const rho = Math.min(1, Math.max(Math.abs(z - c[1]), Math.abs(z - c[1]) * 0.5 + Math.abs(x - c[0]) * 0.866) / (R * 0.866));
        let col = S.mix(H(0xb86272), H(0xe28d70), S.smooth(0.18, 0.92, rho));
        if (bdl) col = S.mix(col, H(0xbc9836), 0.30 * S.smooth(0.45, 1, rho));
        else if (gs) col = S.mix(col, H(0xc4a246), 0.12 * S.smooth(0.55, 1, rho));
        const th = Math.atan2(z - c[1], x - c[0]);
        // 滑らかな放射状類洞の濃淡（白飛びなし）
        const ray = 0.5 + 0.5 * Math.cos(th * 22);
        let stripe = y > top - 0.06 ? 0.86 + 0.14 * ray : 0.92 + 0.08 * Math.sin(y * 34);
        if (y > top - 0.06) stripe *= 1 - (human ? 0.22 : 0.10) * S.smooth(0.84, 0.99, rho);
        const n = 0.95 + 0.08 * S.noise(x * 10, y * 10, z * 10);
        return [col[0] * stripe * n, col[1] * stripe * n, col[2] * stripe * n];
      }
    });
    B.build();

    // 高速・高精細なインスタンス円筒で中心静脈・門脈域三つ組を配置（全階層共通色：門脈紫・動脈赤・中心静脈青・胆管緑）
    const dm = new THREE.Object3D();
    const cvC = centers.filter((c) => inside(c[0], c[1]));
    const cvGeo = hollowCylGeo(0.16, 0.095, top * 2 + 0.08, 22, 0x3b72cc, 0x1e3c72);
    const cvIM = new THREE.InstancedMesh(cvGeo, mat("gloss"), cvC.length);
    cvIM.castShadow = true; cvIM.receiveShadow = true;
    cvC.forEach((c, i) => { dm.position.set(c[0], 0, c[1]); dm.rotation.set(0, 0, 0); dm.scale.setScalar(1); dm.updateMatrix(); cvIM.setMatrixAt(i, dm.matrix); });
    B.add(cvIM, "central_vein");

    // 門脈域（三つ組）
    const verts = [];
    centers.forEach((c) => {
      for (let k = 0; k < 6; k++) {
        const a = k * Math.PI / 3;
        const v = [c[0] + R * Math.cos(a), c[1] + R * Math.sin(a)];
        if (inside(v[0], v[1]) && !verts.some((w) => Math.hypot(w[0] - v[0], w[1] - v[1]) < 0.05)) verts.push(v);
      }
    });
    const nearV = (x, z) => { let bi = 0, bd = 1e9; for (let i = 0; i < verts.length; i++) { const d = (x - verts[i][0]) ** 2 + (z - verts[i][1]) ** 2; if (d < bd) { bd = d; bi = i; } } return verts[bi]; };
    const shR = human ? 0.25 : 0.18;
    const bdR = bdl ? 0.085 : gs ? 0.066 : 0.050;
    const addTriadInst = (geo, material, ox, oz) => {
      const im = new THREE.InstancedMesh(geo, material, verts.length);
      im.castShadow = true; im.receiveShadow = true;
      verts.forEach((v, i) => { dm.position.set(v[0] + ox, 0, v[1] + oz); dm.rotation.set(0, 0, 0); dm.scale.setScalar(1); dm.updateMatrix(); im.setMatrixAt(i, dm.matrix); });
      B.add(im, "portal_triad");
    };
    addTriadInst(hollowCylGeo(shR, 0, top * 2 - 0.02, 18), matSolid("soft", bdl ? 0xd9c2e0 : human ? 0xebdccb : 0xf0e5d8), 0, 0);
    addTriadInst(hollowCylGeo(0.095, 0.055, top * 2 + 0.09, 16, 0x6f5ed8, 0x382a88), mat("gloss"), 0, 0);
    addTriadInst(hollowCylGeo(0.044, 0.020, top * 2 + 0.13, 14, 0xe03a32, 0x7d1410), mat("gloss"), 0.125, 0.065);
    addTriadInst(hollowCylGeo(bdR, bdR * 0.48, top * 2 + 0.11, 16, 0x2aa85e, 0x135931), mat("gloss"), -0.105, 0.085);

    if (bdl) {
      // 胆管増生（滑らかな緑の蛇行管）と線維性隔壁
      verts.forEach((v) => {
        for (let k = 0; k < 3; k++) {
          const a = S.rand() * 6.28, b = a + 0.9 + S.rand() * 0.9;
          const m = makeTube([
            [v[0] + 0.17 * Math.cos(a), top + 0.02, v[1] + 0.17 * Math.sin(a)],
            [v[0] + 0.30 * Math.cos((a + b) / 2), top + 0.045, v[1] + 0.30 * Math.sin((a + b) / 2)],
            [v[0] + 0.25 * Math.cos(b), top + 0.02, v[1] + 0.25 * Math.sin(b)]
          ], 0.032, 14, 8, 0x2ca860, "gloss");
          B.add(m, "ductular_reaction");
        }
      });
      verts.forEach((a, i) => verts.forEach((b, j) => {
        if (j > i && Math.abs(Math.hypot(a[0] - b[0], a[1] - b[1]) - R) < 0.05 && S.rand() < 0.58) {
          const mid = [(a[0] + b[0]) * 0.5, top + 0.022, (a[1] + b[1]) * 0.5];
          B.add(makeTube([[a[0], top + 0.015, a[1]], mid, [b[0], top + 0.015, b[1]]], 0.046, 10, 8, 0xb38dd6, "clay"), "collagen_fibers");
        }
      }));
    }

    // 血流（門脈域→中心）と胆汁（中心→門脈域・逆向き）の粒子
    const pairs = [];
    centers.forEach((c) => {
      if (!inside(c[0], c[1])) return;
      for (let k = 0; k < 6; k++) {
        const a = k * Math.PI / 3;
        const v = [c[0] + R * Math.cos(a), c[1] + R * Math.sin(a)];
        if (inside(v[0], v[1])) pairs.push([c, v]);
      }
    });
    B.flow({
      geom: geoDisc(), mat: matSolid("gloss", 0xc82220), n: 120, scale: 0.44, spin: false,
      spawn: (p, i, init) => {
        const pr = pairs[Math.floor(S.rand() * pairs.length)], c = pr[0], v = pr[1];
        const j = (S.rand() - 0.5) * 0.35;
        const ex = v[0] + (c[1] - v[1]) * j * 0.3, ez = v[1] - (c[0] - v[0]) * j * 0.3;
        p.path = new Path([[ex, top + 0.022, ez], [c[0] + (ex - c[0]) * 0.2, top + 0.022, c[1] + (ez - c[1]) * 0.2]]);
        p.v = 0.20 + S.rand() * 0.08; p.s = init ? S.rand() * p.path.len : 0;
        p.rot.set(0, S.rand() * 6, 0);
      }
    });
    B.flow({
      geom: geoSphere(0.030, 10), mat: matSolid("gloss", 0x24b85e, { emissive: 0x0a4220, emissiveIntensity: 0.45 }), n: bdl ? 85 : 64,
      spawn: (p, i, init) => {
        const pr = pairs[Math.floor(S.rand() * pairs.length)], c = pr[0], v = pr[1];
        const a = Math.atan2(v[1] - c[1], v[0] - c[0]) + 0.26;
        p.path = new Path([[c[0] + 0.24 * Math.cos(a), top + 0.028, c[1] + 0.24 * Math.sin(a)], [c[0] + 0.72 * Math.cos(a), top + 0.028, c[1] + 0.72 * Math.sin(a)]]);
        p.v = bdl ? 0.06 : gs ? 0.06 : 0.13 + S.rand() * 0.04;
        p.block = bdl ? p.path.len * (0.55 + 0.40 * S.rand()) : (gs && S.rand() < 0.45 ? p.path.len * (0.65 + 0.30 * S.rand()) : Infinity);
        p.s = init ? Math.min(p.block, S.rand() * p.path.len) : 0;
      }
    });

    const c0 = nearest(0, 0);
    // 中央小葉の上面に血流（門脈域→中心静脈）と胆汁（中心→門脈域・逆向き）の3D方向矢印
    const c0Pairs = [];
    for (let k = 0; k < 6; k++) {
      const a = k * Math.PI / 3;
      c0Pairs.push([a, [c0[0] + R * Math.cos(a), c0[1] + R * Math.sin(a)]]);
    }
    B.flow({
      geom: geoArrow(), mat: matSolid("gloss", 0xe03a32, { emissive: 0x580c08, emissiveIntensity: 0.35 }),
      n: 12, scale: 0.92, alignFlow: true,
      spawn: (p, i, init) => {
        const pr = c0Pairs[i % 6], a = pr[0], v = pr[1];
        p.path = new Path([[v[0] - 0.14 * Math.cos(a), top + 0.065, v[1] - 0.14 * Math.sin(a)], [c0[0] + 0.22 * Math.cos(a), top + 0.065, c0[1] + 0.22 * Math.sin(a)]]);
        p.v = 0.24; p.s = init ? ((Math.floor(i / 6) * 0.5 + 0.25) % 1) * p.path.len : 0;
      }
    });
    B.flow({
      geom: geoArrow(), mat: matSolid("gloss", 0x24c766, { emissive: 0x0a4220, emissiveIntensity: 0.4 }),
      n: 12, scale: 0.85, alignFlow: true,
      spawn: (p, i, init) => {
        const pr = c0Pairs[i % 6], a = pr[0] + 0.24;
        p.path = new Path([[c0[0] + 0.26 * Math.cos(a), top + 0.062, c0[1] + 0.26 * Math.sin(a)], [c0[0] + 0.80 * Math.cos(a), top + 0.062, c0[1] + 0.80 * Math.sin(a)]]);
        p.v = bdl ? 0.05 : gs ? 0.06 : 0.18;
        p.block = bdl ? p.path.len * 0.68 : (gs ? p.path.len * 0.82 : Infinity);
        p.s = init ? Math.min(p.block, ((Math.floor(i / 6) * 0.5 + 0.15) % 1) * p.path.len) : 0;
      }
    });

    const vR = nearV(c0[0] + R, c0[1]);
    B.label("central_vein", "中心静脈（青・血が集まる）", [c0[0], top + 0.06, c0[1]], [40, -125]);
    B.label("portal_triad", "門脈域（紫:門脈・赤:動脈・緑:胆管）", [vR[0], top + 0.06, vR[1]], [155, -70]);
    const cl = nearest(-1.4, 0.8);
    B.label("lobule_array", "肝小葉（六角柱）", [cl[0] - 0.4, top, cl[1] + 0.2], [-145, -85]);
    if (bdl) {
      const v2 = nearV(-1.4, -1.5);
      B.label("ductular_reaction", "胆管増生", [v2[0], top + 0.05, v2[1]], [-115, -75]);
      B.label("collagen_fibers", "線維性隔壁", [vR[0] - 0.3, top + 0.04, vR[1] + 0.7], [150, 70]);
    }
    return {
      B, cam: { target: [0, -0.15, 0], dist: 12.6, min: 8, max: 17, yaw: 0.42, pitch: 0.68 },
      structures: ["lobule_array", "central_vein", "portal_triad"].concat(bdl ? ["ductular_reaction", "collagen_fibers"] : []),
      floorY: -1.0,
      zoomSpot: [c0[0], top + 0.08, c0[1]],
      zoomRingScale: 2.1
    };
  }

  // =====================================================================
  // L3 1つの小葉：放射状の肝細胞板・類洞・ゾーン1/2/3・逆向きの胆汁
  // =====================================================================
  function buildL3(sp, pt) {
    const B = new Builder();
    S.seed(303);
    const human = sp === "human", bdl = pt === "bdl", gs = pt === "gallstone";
    const R = 2.3, hh = 1.0, w = 0.078;
    const NA = 18, stA = Math.PI * 2 / NA;
    const base = S.hexPrismY([0, 0, 0], R, hh, 0.1);
    const slotD = (x, z) => {
      const r = Math.hypot(x, z), th = Math.atan2(z, x);
      const kA = Math.round(th / stA), dA0 = r * Math.abs(Math.sin(th - kA * stA)) - w / 2;
      const dA = Math.max(dA0, 0.45 - r, r - 1.95);
      const thB = th - stA / 2, kB = Math.round(thB / stA), dB0 = r * Math.abs(Math.sin(thB - kB * stA)) - w / 2;
      const dB = Math.max(dB0, 1.05 - r, r - 1.95);
      return Math.min(dA, dB);
    };
    const cut = (x, y, z) => Math.min(x, y, z); // x>0,y>0,z>0 を1/4切り取る
    const tissue = (x, y, z) => {
      let d = base(x, y, z);
      d = S.smax(d, -slotD(x, z), 0.014);
      d = Math.max(d, -(Math.hypot(x, z) - 0.46));
      return Math.max(d, cut(x, y, z));
    };
    const rhoOf = (x, z) => Math.min(1.2, Math.max(Math.abs(z), Math.abs(z) * 0.5 + Math.abs(x) * 0.866) / (R * 0.866));
    // 鮮やかなゾーン1/2/3の帯（上面でも切り欠き断面でも一目瞭然に）
    const z3 = H(0x5274cc), z2 = H(0xe3a53a), z1 = H(0xd86246);
    B.part({
      sid: "zone1", zone: true, f: tissue, bmin: [-2.42, -1.08, -2.08], bmax: [2.42, 1.08, 2.08], res: 116, mat: "wet",
      color: (x, y, z) => {
        const rho = rhoOf(x, z);
        let c = S.mix(z3, z2, S.smooth(0.35, 0.41, rho));
        c = S.mix(c, z1, S.smooth(0.65, 0.71, rho));
        if (bdl) c = S.mix(c, H(0xb8962c), 0.24);
        else if (gs) c = S.mix(c, H(0xc4a23e), 0.10);
        // 肝細胞板の細かな細胞粒感
        const cell = 0.90 + 0.13 * S.noise(x * 11, y * 11, z * 11);
        return [c[0] * cell, c[1] * cell, c[2] * cell];
      }
    });
    // 中心静脈（1/4切り欠きで内腔を見せる・共通青）
    B.part({
      sid: "central_vein",
      f: (x, y, z) => { const r = Math.hypot(x, z); return Math.max(Math.max(r - 0.46, 0.35 - r), Math.abs(y) - (hh + 0.05), cut(x, y, z)); },
      bmin: [-0.55, -1.12, -0.55], bmax: [0.55, 1.12, 0.55], res: 54, mat: "gloss",
      color: (x, y, z) => Math.hypot(x, z) < 0.41 ? H(0x1e3c72) : H(0x3b72cc)
    });
    B.build();

    // 門脈域（6頂点）：高速・高精細な円筒配置（共通色：門脈紫・動脈赤・胆管緑）
    const V = []; for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; V.push([R * Math.cos(a), R * Math.sin(a), a]); }
    const shR = human ? 0.29 : 0.23;
    const bdo = bdl ? 0.148 : gs ? 0.116 : 0.092;
    const vOff = (v, t, o) => [v[0] + Math.cos(v[2]) * o - Math.sin(v[2]) * t, v[1] + Math.sin(v[2]) * o + Math.cos(v[2]) * t];
    const shMat = matSolid("soft", bdl ? 0xc8a4d4 : human ? 0xe0c8b2 : 0xe8d8c6);
    const pvMat = mat("gloss"), haMat = mat("gloss"), bdMat = mat("gloss");
    const pvGeoFull = hollowCylGeo(0.165, 0.105, hh * 2 + 0.12, 18, 0x6f5ed8, 0x382a88);
    const haGeoFull = hollowCylGeo(0.072, 0.036, hh * 2 + 0.18, 16, 0xe03a32, 0x7a1410);
    const bdGeoFull = hollowCylGeo(bdo, bdo * 0.56, hh * 2 + 0.15, 18, 0x2aa85e, 0x135931);
    const shGeoFull = hollowCylGeo(shR, 0, hh * 2 - 0.06, 20);
    const pvGeoHalf = hollowCylGeo(0.165, 0.105, hh + 0.02, 18, 0x6f5ed8, 0x382a88);
    const haGeoHalf = hollowCylGeo(0.072, 0.036, hh + 0.06, 16, 0xe03a32, 0x7a1410);
    const bdGeoHalf = hollowCylGeo(bdo, bdo * 0.56, hh + 0.04, 18, 0x2aa85e, 0x135931);
    const shGeoHalf = hollowCylGeo(shR, 0, hh - 0.02, 20);
    V.forEach((v) => {
      const inCut = v[0] > -0.05 && v[1] > -0.05;
      const yMid = inCut ? -hh * 0.5 : 0;
      const put = (g, m, px, pz) => { const mesh = new THREE.Mesh(g, m); mesh.position.set(px, yMid, pz); mesh.castShadow = true; mesh.receiveShadow = true; B.add(mesh, "portal_triad"); };
      put(inCut ? shGeoHalf : shGeoFull, shMat, v[0], v[1]);
      const pPv = vOff(v, 0, 0.04), pHa = vOff(v, 0.21, 0.02), pBd = vOff(v, -0.21, 0.02);
      put(inCut ? pvGeoHalf : pvGeoFull, pvMat, pPv[0], pPv[1]);
      put(inCut ? haGeoHalf : haGeoFull, haMat, pHa[0], pHa[1]);
      put(inCut ? bdGeoHalf : bdGeoFull, bdMat, pBd[0], pBd[1]);
      // 三つ組と小葉内部を1本につなぐ導入枝（門脈枝・肝動脈枝→類洞、毛細胆管→ヘリング管→小葉間胆管）
      const yConn = inCut ? 0.008 : hh + 0.008;
      const a0 = v[2];
      // 門脈終末枝（紫）→ 類洞入口
      B.add(makeTaperTube([[pPv[0], yConn, pPv[1]], [2.04 * Math.cos(a0), yConn, 2.04 * Math.sin(a0)], [1.80 * Math.cos(a0), yConn - 0.015, 1.80 * Math.sin(a0)]], 0.062, 0.034, 8, 8, 0x6f5ed8, "gloss"), "sinusoid_flow");
      // 肝動脈終末枝（赤）→ 類洞入口で合流
      B.add(makeTaperTube([[pHa[0], yConn + 0.012, pHa[1]], [2.04 * Math.cos(a0 + 0.08), yConn + 0.004, 2.04 * Math.sin(a0 + 0.08)], [1.84 * Math.cos(a0), yConn - 0.010, 1.84 * Math.sin(a0)]], 0.032, 0.020, 8, 8, 0xe03a32, "gloss"), "sinusoid_flow");
      // 毛細胆管 → ヘリング管 → 小葉間胆管（緑で途切れず接続）
      for (const da of [-0.14, 0.08]) {
        const angC = a0 + da;
        const rStart = 1.84;
        B.add(makeTaperTube([
          [rStart * Math.cos(angC), yConn + 0.004, rStart * Math.sin(angC)],
          [2.05 * Math.cos(a0 - 0.07), yConn + 0.012, 2.05 * Math.sin(a0 - 0.07)],
          [pBd[0], yConn + 0.010, pBd[1]]
        ], bdl ? 0.036 : 0.025, bdl ? 0.052 : 0.036, 8, 8, 0x2aa85e, "gloss"), "bile_flow_reverse");
      }
    });

    // 毛細胆管（上面と切断面に見える滑らかな緑の管：InstancedMeshで超高速・高精細！）
    const canR = bdl ? 0.036 : 0.025;
    const mids = [];
    for (let k = 0; k < NA; k++) {
      mids.push([(k + 0.5) * stA, 0.54, 1.02]);
      mids.push([(k + 0.25) * stA, 1.08, 1.92]);
      mids.push([(k + 0.75) * stA, 1.08, 1.92]);
    }
    const canSegs = [];
    for (const yy of [hh + 0.008, 0.008]) {
      const inQ = yy < 0.5;
      for (const m of mids) {
        if (inQ && !(m[0] > 0.05 && m[0] < Math.PI / 2 - 0.05)) continue;
        if (!inQ && m[0] > 0 && m[0] < Math.PI / 2) continue;
        canSegs.push([m[0], m[1], m[2], yy]);
      }
    }
    const unitCyl = new THREE.CylinderGeometry(canR, canR, 1, 10, 1);
    unitCyl.rotateZ(Math.PI / 2);
    const canIM = new THREE.InstancedMesh(unitCyl, matSolid("gloss", 0x22a656), canSegs.length);
    const dm = new THREE.Object3D();
    canSegs.forEach((sg, i) => {
      const [ang, r1, r2, yy] = sg, midR = (r1 + r2) * 0.5, len = r2 - r1;
      dm.position.set(midR * Math.cos(ang), yy, midR * Math.sin(ang));
      dm.rotation.set(0, -ang, 0);
      dm.scale.set(len, 1, 1);
      dm.updateMatrix();
      canIM.setMatrixAt(i, dm.matrix);
    });
    B.add(canIM, "bile_flow_reverse");

    if (bdl) {
      // 胆管増生と門脈間線維化（高速・滑らかなTubeGeometry）
      V.forEach((v) => {
        if (v[0] > 0.05 && v[1] > 0.05) return;
        for (let k = 0; k < 4; k++) {
          const a = S.rand() * 6.28, b = a + 0.8 + S.rand() * 0.8;
          B.add(makeTube([
            [v[0] + 0.36 * Math.cos(a), hh + 0.01, v[1] + 0.36 * Math.sin(a)],
            [v[0] + 0.52 * Math.cos((a + b) / 2), hh + 0.05, v[1] + 0.52 * Math.sin((a + b) / 2)],
            [v[0] + 0.42 * Math.cos(b), hh + 0.01, v[1] + 0.42 * Math.sin(b)]
          ], 0.04, 12, 8, 0x2eb062, "gloss"), "ductular_reaction");
        }
      });
      for (let k = 0; k < 6; k++) {
        const a = V[k], b = V[(k + 1) % 6];
        // 上辺の線維帯は切り欠き象限(x>=0, z>=0)を避けて断面端で厳密に止める
        const clipCut = (p0, p1) => {
          const in0 = p0[0] >= -0.02 && p0[1] >= -0.02;
          const in1 = p1[0] >= -0.02 && p1[1] >= -0.02;
          if (in0 && in1) return null;
          if (!in0 && !in1) return [p0, p1];
          const q0 = in0 ? p1 : p0, q1 = in0 ? p0 : p1;
          let t = 1;
          if (q1[0] > 0 && q0[0] < 0) t = Math.min(t, (0 - q0[0]) / (q1[0] - q0[0]));
          if (q1[1] > 0 && q0[1] < 0) t = Math.min(t, (0 - q0[1]) / (q1[1] - q0[1]));
          if (t < 0.04) return null;
          return [q0, [q0[0] + (q1[0] - q0[0]) * t, q0[1] + (q1[1] - q0[1]) * t]];
        };
        const segTop = clipCut(a, b);
        if (segTop) B.add(makeTube([[segTop[0][0], hh + 0.01, segTop[0][1]], [segTop[1][0], hh + 0.01, segTop[1][1]]], 0.062, 8, 8, 0xa378cc, "clay"), "collagen_fibers");
        B.add(makeTube([[a[0], -hh * 0.3, a[1]], [b[0], -hh * 0.3, b[1]]], 0.062, 8, 8, 0xa378cc, "clay"), "collagen_fibers");
      }
    }

    // 類洞の血流（外→中心）：鮮やかな赤血球
    const slotAngles = [];
    for (let k = 0; k < NA; k++) { slotAngles.push([k * stA, 0.5]); slotAngles.push([k * stA + stA / 2, 1.08]); }
    const visible = (a, y) => { let t = a % (Math.PI * 2); if (t < 0) t += Math.PI * 2; const inQ = t > 0.02 && t < Math.PI / 2 - 0.02; return y > 0.5 ? !inQ : inQ; };
    B.flow({
      geom: geoDisc(), mat: matSolid("gloss", 0xc82220), n: 155, scale: 0.46,
      spawn: (p, i, init) => {
        let a, y;
        for (let tries = 0; tries < 20; tries++) { const s = slotAngles[Math.floor(S.rand() * slotAngles.length)]; a = s[0]; y = S.rand() < 0.55 ? hh - 0.06 - S.rand() * 0.06 : -0.06 - S.rand() * 0.06; if (visible(a, y)) break; }
        p.path = new Path([[1.95 * Math.cos(a), y, 1.95 * Math.sin(a)], [0.5 * Math.cos(a), y, 0.5 * Math.sin(a)], [0.05 * Math.cos(a), y - 0.6, 0.05 * Math.sin(a)]]);
        p.v = 0.34 + S.rand() * 0.12; p.s = init ? S.rand() * p.path.len : 0;
      }
    });
    // 胆汁（中心→外・逆向き）：鮮やかなエメラルドの粒（BDLで停滞・蓄積）
    B.flow({
      geom: geoSphere(0.036, 10), mat: matSolid("gloss", 0x26c762, { emissive: 0x0a421e, emissiveIntensity: 0.45 }), n: bdl ? 165 : 115,
      spawn: (p, i, init) => {
        let m, yy;
        for (let tries = 0; tries < 20; tries++) { m = mids[Math.floor(S.rand() * mids.length)]; yy = S.rand() < 0.6 ? hh : 0; const inQ = m[0] > 0.05 && m[0] < Math.PI / 2 - 0.05; if (yy === 0 ? inQ : !inQ) break; }
        p.path = new Path([[m[1] * Math.cos(m[0]), yy + canR + 0.015, m[1] * Math.sin(m[0])], [m[2] * Math.cos(m[0]), yy + canR + 0.015, m[2] * Math.sin(m[0])]]);
        p.v = bdl ? 0.08 : gs ? 0.07 : 0.16;
        p.block = bdl ? p.path.len * (0.48 + 0.48 * S.rand()) : (gs && S.rand() < 0.45 ? p.path.len * (0.62 + 0.34 * S.rand()) : Infinity);
        p.s = init ? Math.min(p.block, S.rand() * p.path.len) : 0;
      }
    });

    // 血流・胆汁の3D方向矢印（切断面と上面で逆向きの2つの流れを一目で示す）
    const bloodArrowAngles = [
      [0.36, 0.06], [0.78, 0.06], [1.22, 0.06], // 切断面（手前）
      [2.09, hh + 0.06], [3.14, hh + 0.06], [4.19, hh + 0.06], [5.24, hh + 0.06] // 上面
    ];
    B.flow({
      geom: geoArrow(), mat: matSolid("gloss", 0xe03a32, { emissive: 0x580c08, emissiveIntensity: 0.35 }),
      n: bloodArrowAngles.length * 2, scale: 1.35, alignFlow: true, sid: "sinusoid_flow",
      spawn: (p, i, init) => {
        const [a, yy] = bloodArrowAngles[i % bloodArrowAngles.length];
        p.path = new Path([[2.08 * Math.cos(a), yy, 2.08 * Math.sin(a)], [0.56 * Math.cos(a), yy, 0.56 * Math.sin(a)]]);
        p.v = 0.42; p.s = init ? ((Math.floor(i / bloodArrowAngles.length) * 0.5 + 0.2) % 1) * p.path.len : 0;
      }
    });
    const bileArrowAngles = [
      [0.54, 0.07], [1.02, 0.07], // 切断面（手前）
      [1.82, hh + 0.07], [2.86, hh + 0.07], [3.92, hh + 0.07], [5.02, hh + 0.07] // 上面
    ];
    B.flow({
      geom: geoArrow(), mat: matSolid("gloss", 0x26d46c, { emissive: 0x0a4a24, emissiveIntensity: 0.42 }),
      n: bileArrowAngles.length * 2, scale: 1.25, alignFlow: true, sid: "bile_flow_reverse",
      spawn: (p, i, init) => {
        const [a, yy] = bileArrowAngles[i % bileArrowAngles.length];
        p.path = new Path([[0.64 * Math.cos(a), yy, 0.64 * Math.sin(a)], [2.06 * Math.cos(a), yy, 2.06 * Math.sin(a)]]);
        p.v = bdl ? 0.08 : gs ? 0.09 : 0.28;
        p.block = bdl ? p.path.len * 0.65 : (gs ? p.path.len * 0.80 : Infinity);
        p.s = init ? Math.min(p.block, ((Math.floor(i / bileArrowAngles.length) * 0.5 + 0.15) % 1) * p.path.len) : 0;
      }
    });

    const at = (a, r, y) => [r * Math.cos(a * Math.PI / 180), y, r * Math.sin(a * Math.PI / 180)];
    B.label("zone3", "Zone 3（中心静脈周囲・低O₂）", at(135, 0.78, hh), [-175, -55]);
    B.label("zone2", "Zone 2（中間帯）", at(124, 1.35, hh), [-185, 8]);
    B.label("zone1", "Zone 1（門脈周囲・高O₂）", at(112, 1.95, hh), [-175, 72]);
    B.label("central_vein", "中心静脈（青）", [0, hh + 0.05, 0], [55, -120]);
    B.label("portal_triad", "門脈域（三つ組）", [V[5][0], hh + 0.05, V[5][1]], [135, -65]);
    B.label("sinusoid_flow", "類洞血流（門脈域→中心）", at(38, 1.48, -0.02), [160, 28]);
    B.label("bile_flow_reverse", "胆汁（中心→ヘリング管→胆管）", at(65, 1.65, 0.03), [120, 115]);
    if (bdl) {
      B.label("ductular_reaction", "胆管増生", [V[3][0] + 0.35, hh + 0.04, V[3][1] + 0.15], [-110, -85]);
      B.label("collagen_fibers", "線維化", [(V[1][0] + V[2][0]) / 2, hh + 0.04, (V[1][1] + V[2][1]) / 2], [-150, 125]);
    }
    return {
      B, cam: { target: [0, -0.15, 0], dist: 13.8, min: 9, max: 18, yaw: 0.78, pitch: 0.55 },
      structures: ["zone1", "zone2", "zone3", "central_vein", "portal_triad", "sinusoid_flow", "bile_flow_reverse"].concat(bdl ? ["ductular_reaction", "collagen_fibers"] : []),
      floorY: -1.5,
      zoomSpot: [1.55, 0.14, 1.15],
      zoomRingScale: 1.6,
      zoneOf: (p) => { if (Math.hypot(p.x, p.z) < 0.48) return "central_vein"; const r = rhoOf(p.x, p.z); return r < 0.38 ? "zone3" : r < 0.69 ? "zone2" : "zone1"; }
    };
  }

  // =====================================================================
  // L4 細胞：肝細胞索・類洞内皮（窓）・ディッセ腔・クッパー・星細胞・NK/NKT・胆管・IgA
  // =====================================================================
  function buildL4(sp, pt) {
    const B = new Builder();
    S.seed(404);
    const human = sp === "human", bdl = pt === "bdl", gs = pt === "gallstone";
    const XS = [-2.72, -1.36, 0, 1.36, 2.72], ROW = 1.5, HX = 0.62, HY = 0.62, HZ = 0.9, CZ = -0.5, CUT = 0.35;

    // 単一の高精細肝細胞シェルを1回だけSDF生成し、10細胞に配置（高速＆高精細！）
    if (!GEO.hepCell) {
      const box = S.roundBox([0, 0, 0], [HX, HY, HZ], 0.22);
      const scoop = S.roundBox([0, 0, 0], [HX - 0.10, HY - 0.10, 0.26], 0.16);
      const oneF = (x, y, z) => {
        let d = box(x, y, z - CZ);
        d = Math.max(d, -scoop(x, y, z - CUT));
        // 類洞側(-y面)の微絨毛
        const fy = -y - (HY - 0.04);
        if (fy > -0.06 && fy < 0.06 && z < CUT - 0.04) d -= 0.032 * Math.max(0, Math.sin(x * 46) * Math.sin(z * 46));
        return Math.max(d, z - CUT);
      };
      GEO.hepCell = shared(S.mesh(oneF, [-HX - 0.08, -HY - 0.08, CZ - HZ - 0.06], [HX + 0.08, HY + 0.08, CUT + 0.06], 62, {
        color: (x, y, z) => {
          const rim = z > CUT - 0.055;
          const cavity = z > 0.05 && Math.abs(x) < HX - 0.08 && Math.abs(y) < HY - 0.08;
          const base = rim ? H(0xde876c) : cavity ? H(0xf5c8b0) : H(0xd97d63);
          const n = 0.92 + 0.12 * S.noise(x * 13, y * 13, z * 13);
          return [base[0] * n, base[1] * n, base[2] * n];
        },
        aoDist: 0.24, aoMin: 0.36
      }));
    }
    const dm = new THREE.Object3D();
    const hepIM = new THREE.InstancedMesh(GEO.hepCell, mat("wet"), 10);
    hepIM.castShadow = true; hepIM.receiveShadow = true;
    const nucPos = [];
    let ci = 0;
    XS.forEach((cx) => [ROW, -ROW].forEach((cy) => {
      dm.position.set(cx, cy, 0);
      dm.rotation.set(0, 0, cy > 0 ? 0 : Math.PI);
      dm.scale.set(1, 1, 1);
      dm.updateMatrix();
      hepIM.setMatrixAt(ci++, dm.matrix);
      nucPos.push([cx + (S.rand() - 0.5) * 0.14, cy + (S.rand() - 0.5) * 0.12, 0.14]);
    }));
    B.add(hepIM, "hepatocyte_cord");

    // 細胞内小器官（手本風：切り欠き紫核・コバルト粗面小胞体・切り欠きミトコンドリア・ゴルジ体）
    const nucIM = new THREE.InstancedMesh(geoNucleus(), mat("gloss"), nucPos.length);
    nucIM.castShadow = true;
    nucPos.forEach((n, i) => { dm.position.set(n[0], n[1], n[2]); dm.rotation.set(0, 0, 0); dm.scale.setScalar(0.95); dm.updateMatrix(); nucIM.setMatrixAt(i, dm.matrix); });
    B.add(nucIM, "hepatocyte_cord");

    const rerIM = new THREE.InstancedMesh(geoRER(), mat("gloss"), nucPos.length);
    nucPos.forEach((n, i) => { dm.position.set(n[0], n[1], n[2] + 0.02); dm.rotation.set(0, 0, (i % 2 === 0 ? 0.2 : 3.3) + (S.rand() - 0.5) * 0.5); dm.scale.setScalar(0.95); dm.updateMatrix(); rerIM.setMatrixAt(i, dm.matrix); });
    B.add(rerIM, "hepatocyte_cord");

    const golgiIM = new THREE.InstancedMesh(geoGolgi(), mat("gloss"), nucPos.length);
    nucPos.forEach((n, i) => {
      const cy = i % 2 === 0 ? ROW : -ROW;
      dm.position.set(n[0] + (i % 4 < 2 ? 0.30 : -0.30), cy + (cy > 0 ? 0.24 : -0.24), 0.19);
      dm.rotation.set(0, 0, (S.rand() - 0.5) * 0.8);
      dm.scale.setScalar(0.92);
      dm.updateMatrix();
      golgiIM.setMatrixAt(i, dm.matrix);
    });
    B.add(golgiIM, "hepatocyte_cord");

    const mitos = [];
    XS.forEach((cx, xi) => [ROW, -ROW].forEach((cy, yi) => {
      const n = nucPos[xi * 2 + yi];
      for (let k = 0; k < 5; k++) {
        let x, y;
        for (let tries = 0; tries < 30; tries++) {
          x = cx + (S.rand() - 0.5) * 0.82; y = cy + (S.rand() - 0.5) * 0.82;
          if (Math.hypot(x - n[0], y - n[1]) > 0.36) break;
        }
        mitos.push([x, y, 0.17, S.rand() * 3.14]);
      }
    }));
    const mitoIM = new THREE.InstancedMesh(geoMito(), mat("gloss"), mitos.length);
    mitos.forEach((m, i) => { dm.position.set(m[0], m[1], m[2]); dm.rotation.set(0, 0, m[3]); dm.scale.setScalar(0.92); dm.updateMatrix(); mitoIM.setMatrixAt(i, dm.matrix); });
    B.add(mitoIM, "hepatocyte_cord");

    // 毛細胆管（隣接肝細胞の間から頂端側外縁へ出てヘリング管→小葉間胆管へ1本につなぐ：核の前面は遮らない）
    const canR = bdl ? 0.095 : gs ? 0.078 : 0.064;
    const canCyl = new THREE.CylinderGeometry(canR, canR, 1.72, 14);
    canCyl.rotateX(Math.PI / 2);
    const canIM = new THREE.InstancedMesh(canCyl, matSolid("gloss", 0x2aa85e), 8);
    let bi = 0;
    const canMatL4 = matSolid("gloss", 0x2aa85e);
    [-2.04, -0.68, 0.68, 2.04].forEach((mx) => [ROW, -ROW].forEach((my) => {
      dm.position.set(mx, my, -0.5); dm.rotation.set(0, 0, 0); dm.scale.setScalar(1); dm.updateMatrix(); canIM.setMatrixAt(bi++, dm.matrix);
      // 隣接肝細胞間から外縁の連続毛細胆管コレクターへ立ち上げる枝
      const yRim = my > 0 ? ROW + 0.64 : -ROW - 0.64;
      B.add(makeTaperTube([[mx, my, 0.30], [mx, yRim, 0.24]], canR * 0.72, canR * 0.68, 6, 8, 0x2aa85e, "gloss", null, canMatL4), "canal_of_hering");
    }));
    B.add(canIM, "canal_of_hering");
    // 上下それぞれの肝細胞索外縁を走り右のヘリング管へつなぐ連続コレクター管
    const colR = bdl ? 0.066 : gs ? 0.054 : 0.044;
    B.add(makeTaperTube([[-2.04, ROW + 0.64, 0.24], [0.0, ROW + 0.64, 0.24], [2.04, ROW + 0.64, 0.24], [3.08, ROW + 0.56, 0.26], [3.34, 1.45, 0.28]], colR * 0.85, colR * 1.15, 20, 10, 0x2aa85e, "gloss", null, canMatL4), "canal_of_hering");
    B.add(makeTaperTube([[-2.04, -ROW - 0.64, 0.24], [0.0, -ROW - 0.64, 0.24], [2.04, -ROW - 0.64, 0.24], [3.08, -ROW - 0.56, 0.26], [3.34, -1.45, 0.28]], colR * 0.85, colR * 1.15, 20, 10, 0x2aa85e, "gloss", null, canMatL4), "canal_of_hering");

    // 類洞内皮（LSEC）：篩板状の窓（fenestrae）を持つ温かなローズピンクの内皮管
    const holeR = human ? 0.026 : 0.036, holeStep = 0.11;
    const lsOut = S.roundBox([-0.15, 0, -0.45], [3.25, 0.7, 0.85], 0.42);
    const lsIn = S.roundBox([-0.15, 0, -0.45], [3.20, 0.65, 0.80], 0.37);
    const fen = (x, y, z) => {
      let u, v;
      if (Math.abs(y) > 0.45) { u = x; v = z; } else { u = x; v = y; }
      const mask = S.noise(u * 1.7 + 5, v * 1.7 + 2, 0.5);
      if (mask < (bdl ? 0.68 : 0.40)) return 1;
      const gu = Math.round(u / holeStep) * holeStep, gv = Math.round(v / holeStep) * holeStep;
      return Math.hypot(u - gu, v - gv) - holeR;
    };
    const lsecF = (x, y, z) => {
      let d = Math.max(lsOut(x, y, z), -lsIn(x, y, z), Math.abs(x + 0.15) - 3.2);
      d = S.smin(d, S.ellipsoid([0.9, 0.62, -0.3], [0.32, 0.08, 0.22])(x, y, z), 0.05);
      d = Math.max(d, -fen(x, y, z));
      return Math.max(d, z - CUT);
    };
    B.part({
      sid: "lsec", f: lsecF, bmin: [-3.42, -0.76, -1.36], bmax: [3.12, 0.76, 0.40], res: 142, mat: "wet",
      color: (x, y, z) => S.mix(H(0xe07e92), H(0xf2adba), S.noise(x * 6, y * 6, z * 6))
    });

    // 類洞左端：中心静脈（青）側へ流れ込む出口カラー
    const cvCollar = new THREE.Mesh(hollowCylGeo(0.56, 0.42, 0.42, 20, 0x3b72cc, 0x1e3c72), mat("gloss"));
    cvCollar.rotation.z = Math.PI / 2;
    cvCollar.position.set(-3.48, 0, -0.45);
    B.add(cvCollar, "lsec");

    // 星細胞（ディッセ腔・静止期は鮮やかな金色ビタミンA滴、BDLで活性化・コラーゲン沈着）
    const hy = -0.79;
    const hscBody = bdl ? S.ellipsoid([0.8, hy, 0.12], [0.55, 0.075, 0.24]) : S.ellipsoid([0.8, hy, 0.12], [0.40, 0.075, 0.24]);
    const proc = [
      S.capsule([0.8, hy, 0.12], [-0.8, hy, 0.20], 0.044, 0.020),
      S.capsule([0.8, hy, 0.12], [2.2, hy, -0.40], 0.044, 0.020),
      S.capsule([0.8, hy, 0.12], [1.1, hy, -1.05], 0.038, 0.016),
      S.capsule([0.1, hy, 0.18], [-0.3, -0.7, -0.6], 0.028, 0.014)
    ];
    if (bdl) proc.push(S.capsule([0.8, hy, 0.12], [-1.8, hy, -0.2], 0.044, 0.022), S.capsule([1.6, hy, -0.1], [2.9, hy, 0.2], 0.038, 0.016));
    B.part({ sid: "hsc", f: (x, y, z) => Math.max(S.union([hscBody].concat(proc), 0.06)(x, y, z), z - CUT), bmin: [-2.0, -0.92, -1.15], bmax: [3.0, -0.66, 0.40], res: 98, skipInterior: true, mat: "wet", color: H(bdl ? 0x583c9e : 0x6f52bf) });
    if (!bdl) {
      const drops = [[0.60, hy + 0.01, 0.26], [0.80, hy + 0.01, 0.30], [0.98, hy + 0.01, 0.22], [0.72, hy + 0.01, 0.06], [0.95, hy + 0.01, 0.02], [0.52, hy + 0.01, 0.02]];
      const vitIM = new THREE.InstancedMesh(geoSphere(0.062, 12), matSolid("gloss", 0xf7b914, { emissive: 0x523400, emissiveIntensity: 0.25 }), drops.length);
      drops.forEach((c, i) => { dm.position.set(c[0], c[1], c[2]); dm.rotation.set(0, 0, 0); dm.scale.setScalar(1); dm.updateMatrix(); vitIM.setMatrixAt(i, dm.matrix); });
      B.add(vitIM, "hsc");
    }

    // ディッセ腔の当たり判定（半透明の淡黄色帯・軽量BoxGeometry）
    const disseMat = matSolid("soft", 0xf7e09a, { transparent: true, opacity: 0.32, depthWrite: false });
    [0.79, -0.79].forEach((yy) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(6.1, 0.03, 1.55), disseMat);
      m.position.set(-0.15, yy, -0.45);
      B.add(m, "space_of_disse");
    });
    if (bdl) {
      for (let k = 0; k < 8; k++) {
        const x0 = -2.9 + k * 0.74;
        B.add(makeTube([[x0, -0.80, 0.30], [x0 + 0.26, -0.77, 0.02], [x0 + 0.52, -0.81, -0.40]], 0.022, 12, 8, 0xb87ec8, "clay"), "collagen_fibers");
        B.add(makeTube([[x0, 0.80, 0.30], [x0 + 0.30, 0.78, -0.08], [x0 + 0.54, 0.81, -0.46]], 0.022, 12, 8, 0xb87ec8, "clay"), "collagen_fibers");
      }
    }

    // 門脈域：胆管（立方状胆管細胞＋一次線毛）・門脈枝（紫）・肝動脈枝（赤）・上下ヘリング管・IgA形質細胞
    const DX = 4.22, DZ = -0.05, rIn = bdl ? 0.26 : 0.20, rOut = bdl ? 0.45 : 0.40;
    const ductF = (x, y, z) => {
      const r = Math.hypot(x - DX, z - DZ), th = Math.atan2(z - DZ, x - DX);
      let d = Math.max(Math.max(r - rOut, rIn - r), Math.abs(y) - 1.98);
      const st = Math.PI / 4, kk = Math.round(th / st);
      const g1 = r * Math.abs(Math.sin(th - kk * st)) - 0.015;
      const gy = Math.abs(y - Math.round(y / 0.42) * 0.42) - 0.015;
      d = S.smax(d, -Math.min(g1, gy), 0.01);
      return Math.max(d, z - DZ);
    };
    B.part({ sid: "canal_of_hering", f: ductF, bmin: [DX - 0.52, -2.05, DZ - 0.52], bmax: [DX + 0.52, 2.05, DZ + 0.08], res: 92, mat: "wet", color: (x, y, z) => Math.hypot(x - DX, z - DZ) < rIn + 0.035 ? H(0x74d1a3) : H(0x2aa85e) });
    // 門脈域の門脈枝（紫）＋肝動脈枝（赤）から類洞右端へ直結する流入枝（結合組織内にすっきり収める）
    const pvBranch = new THREE.Mesh(hollowCylGeo(0.23, 0.14, 3.65, 16, 0x6f5ed8, 0x382a88), mat("gloss"));
    pvBranch.position.set(3.58, 0, -0.80); pvBranch.castShadow = true; pvBranch.receiveShadow = true;
    B.add(pvBranch, "portal_triad");
    B.add(makeTaperTube([[3.58, -0.16, -0.72], [3.26, -0.10, -0.45], [2.98, -0.06, -0.32]], 0.14, 0.10, 10, 10, 0x6f5ed8, "gloss"), "portal_triad");
    const haBranch = new THREE.Mesh(hollowCylGeo(0.10, 0.048, 3.68, 14, 0xe03a32, 0x7a1410), mat("gloss"));
    haBranch.position.set(3.60, 0, -0.30); haBranch.castShadow = true; haBranch.receiveShadow = true;
    B.add(haBranch, "portal_triad");
    B.add(makeTaperTube([[3.60, 0.24, -0.28], [3.28, 0.18, -0.24], [2.98, 0.12, -0.20]], 0.068, 0.048, 10, 8, 0xe03a32, "gloss"), "portal_triad");

    // 胆管細胞の一次線毛（内腔へ伸びる繊細な突起）
    for (let k = -4; k <= 4; k++) {
      const yy = k * 0.42;
      const cil = makeTaperTube([[DX - rIn + 0.02, yy, DZ - 0.08], [DX - rIn + 0.10, yy + 0.04, DZ - 0.06]], 0.010, 0.004, 6, 6, 0x9cf0c8, "gloss");
      B.add(cil, "canal_of_hering");
      const cil2 = makeTaperTube([[DX + rIn - 0.02, yy, DZ - 0.08], [DX + rIn - 0.10, yy + 0.04, DZ - 0.06]], 0.010, 0.004, 6, 6, 0x9cf0c8, "gloss");
      B.add(cil2, "canal_of_hering");
    }
    const herP = [[3.30, 1.45, 0.28], [3.76, 1.32, 0.22], [DX - 0.14, 1.18, DZ + 0.02]];
    const herP2 = [[3.30, -1.45, 0.28], [3.76, -1.32, 0.22], [DX - 0.14, -1.16, DZ + 0.02]];
    B.part({ sid: "canal_of_hering", f: S.tube(herP, 0.088, 0.05), ...bbPts(herP, 0.15), res: 46, skipInterior: true, mat: "gloss", color: (x) => S.mix(H(0xdf8c72), H(0x2aa85e), S.smooth(3.30, 3.88, x)) });
    B.part({ sid: "canal_of_hering", f: S.tube(herP2, 0.084, 0.05), ...bbPts(herP2, 0.15), res: 46, skipInterior: true, mat: "gloss", color: (x) => S.mix(H(0xdf8c72), H(0x2aa85e), S.smooth(3.30, 3.88, x)) });
    const ptF = (x, y, z) => {
      let d = S.roundBox([4.38, 0, -0.5], [0.96, 2.08, 0.88], 0.28)(x, y, z);
      d = S.displace((a, b, c) => d, 0.038, 3)(x, y, z);
      d = Math.max(d, -(Math.hypot(x - DX, z - DZ) - (rOut + 0.04)));
      d = Math.max(d, -(Math.hypot(x - 3.55, z + 0.78) - 0.28));
      d = Math.max(d, -(Math.hypot(x - 3.56, z + 0.26) - 0.14));
      d = Math.max(d, -S.tube(herP, 0.13, 0.05)(x, y, z));
      d = Math.max(d, -S.tube(herP2, 0.13, 0.05)(x, y, z));
      return Math.max(d, z - CUT);
    };
    B.part({ sid: "portal_triad", f: ptF, bmin: [3.34, -2.20, -1.50], bmax: [5.44, 2.20, 0.42], res: 88, skipInterior: true, mat: "soft", color: (x, y, z) => S.mix(H(bdl ? 0xd9bede : 0xe6d3be), H(0xd9c2aa), S.noise(x * 8, y * 8, z * 8)) });

    // IgA形質細胞（特徴的な偏在・車軸状核）＋門脈域リンパ球
    const pc = [4.94, -1.05, 0.24];
    B.part({
      sid: "portal_iga_plasma", f: S.ellipsoid(pc, [0.28, 0.22, 0.20]),
      bmin: [pc[0] - 0.34, pc[1] - 0.28, pc[2] - 0.28], bmax: [pc[0] + 0.34, pc[1] + 0.28, pc[2] + 0.28], res: 36, skipInterior: true, mat: "wet",
      color: (x, y, z) => {
        const dx = x - (pc[0] + 0.08), dy = y - (pc[1] + 0.03);
        const r = Math.hypot(dx, dy);
        if (r < 0.12 && z > pc[2]) { const a = Math.atan2(dy, dx); return (Math.cos(a * 8) > 0.3 && r > 0.04) ? H(0x2f1247) : H(0x6c3894); }
        return H(0xb83896);
      }
    });
    // pIgR受容体（ミントティールの小さな受容体：胆管細胞基底側［両種］＋肝細胞基底側［マウスのみ］）
    const pigrSites = [[DX + rOut, -0.52, 0.04], [DX + rOut, 0.28, 0.04]];
    if (!human) pigrSites.push([2.04, -0.88, 0.32], [0.68, 0.88, 0.32], [-0.68, 0.88, 0.32]);
    const pigrGeo = new THREE.CylinderGeometry(0.030, 0.020, 0.095, 10);
    const pigrIM = new THREE.InstancedMesh(pigrGeo, matSolid("gloss", 0x28b8a0, { emissive: 0x0a4438, emissiveIntensity: 0.3 }), pigrSites.length);
    pigrSites.forEach((p, i) => {
      dm.position.set(p[0], p[1], p[2]);
      dm.rotation.set(0, 0, i < 2 ? Math.PI / 2 : 0);
      dm.scale.setScalar(1);
      dm.updateMatrix();
      pigrIM.setMatrixAt(i, dm.matrix);
    });
    B.add(pigrIM, "portal_iga_plasma");
    const lym = [[3.74, -1.58, 0.30], [4.70, 0.62, 0.30], [4.95, 1.48, 0.30]];
    const lymIM = new THREE.InstancedMesh(geoSphere(0.115, 14), matSolid("wet", 0x5668cc), lym.length);
    lym.forEach((c, i) => { dm.position.set(c[0], c[1], c[2]); dm.rotation.set(0, 0, 0); dm.scale.setScalar(1); dm.updateMatrix(); lymIM.setMatrixAt(i, dm.matrix); });
    B.add(lymIM, "portal_iga_plasma");

    if (bdl) {
      const rings = [[3.74, 0.30], [4.82, 0.48], [4.72, 1.52], [3.78, -0.88]];
      const ringGeo = hollowCylGeo(0.17, 0.072, 0.85, 16, 0x2ca860, 0x7be0ad);
      ringGeo.rotateX(Math.PI / 2);
      const rIM = new THREE.InstancedMesh(ringGeo, mat("gloss"), rings.length);
      rings.forEach((r, i) => { dm.position.set(r[0], r[1], -0.06); dm.rotation.set(0, 0, 0); dm.scale.setScalar(1); dm.updateMatrix(); rIM.setMatrixAt(i, dm.matrix); });
      B.add(rIM, "ductular_reaction");

      const neu = [[-2.0, 0.1, -0.2], [0.3, -0.3, 0.0], [2.2, 0.25, -0.35], [3.7, -1.9, 0.3], [5.0, 0.05, 0.3], [4.4, 1.85, 0.3]];
      if (!GEO.neutro) {
        GEO.neutro = shared(S.mesh(
          S.displace(S.sphere([0, 0, 0], 0.145), 0.03, 12),
          [-0.20, -0.20, -0.20], [0.20, 0.20, 0.20], 26,
          {
            color: (x, y, z) => {
              const a = Math.atan2(y, x);
              return Math.cos(a * 3) > 0.48 && z > 0.04 ? H(0x4b2e94) : H(0xedaec0);
            },
            aoDist: 0.08, skipInterior: true
          }
        ));
      }
      const neuIM = new THREE.InstancedMesh(GEO.neutro, mat("wet"), neu.length);
      neu.forEach((c, i) => { dm.position.set(c[0], c[1], c[2]); dm.rotation.set(0, 0, i * 1.1); dm.scale.setScalar(1); dm.updateMatrix(); neuIM.setMatrixAt(i, dm.matrix); });
      B.add(neuIM, "inflammatory_cells");
    }

    // クッパー細胞（鮮やかなオレンジ色の樹状マクロファージ・類洞内腔側）
    const kc = [-1.5, -0.42, -0.08];
    const kF = S.displace(S.union([
      S.ellipsoid(kc, [0.34, 0.21, 0.27]),
      S.capsule(kc, [-2.05, -0.58, 0.14], 0.075, 0.026),
      S.capsule(kc, [-1.02, -0.60, -0.36], 0.075, 0.026),
      S.capsule(kc, [-1.62, -0.22, 0.30], 0.065, 0.022),
      S.capsule(kc, [-0.96, -0.36, 0.20], 0.065, 0.022),
      S.capsule(kc, [-1.88, -0.26, -0.44], 0.055, 0.022)
    ], 0.1), 0.04, 5);
    const kgeo = S.mesh(kF, [kc[0] - 0.68, kc[1] - 0.32, kc[2] - 0.62], [kc[0] + 0.68, kc[1] + 0.36, kc[2] + 0.62], 58, {
      color: (x, y, z) => S.mix(H(0xe66516), H(0xf6963a), S.noise(x * 8, y * 8, z * 8)), aoDist: 0.15
    });
    kgeo.translate(-kc[0], -kc[1], -kc[2]);
    const kup = new THREE.Mesh(kgeo, mat("wet")); kup.position.set(kc[0], kc[1], kc[2]); kup.castShadow = true;
    B.add(kup, "kupffer_cell");
    B.onUpdate((t) => { kup.rotation.y = Math.sin(t * 0.8) * 0.14; kup.scale.set(1 + Math.sin(t * 1.4) * 0.05, 1, 1 - Math.sin(t * 1.4) * 0.04); });

    B.build();

    // 赤血球＋血流方向矢印（門脈域［紫・赤］→ 類洞 → 中心静脈［青］側へ右→左に流れる）
    B.flow({
      geom: geoDisc(), mat: matSolid("gloss", 0xc82220), n: 18, scale: 1.15,
      spawn: (p, i, init) => {
        const y = (S.rand() - 0.5) * 0.68, z = -0.72 + S.rand() * 0.82;
        p.path = new Path([[3.25, y, z], [-3.48, y + (S.rand() - 0.5) * 0.18, z]]);
        p.v = 0.92 + S.rand() * 0.38; p.s = init ? S.rand() * p.path.len : 0; p.spin = (S.rand() - 0.5) * 3;
      }
    });
    B.flow({
      geom: geoArrow(), mat: matSolid("gloss", 0xe03a32, { emissive: 0x580c08, emissiveIntensity: 0.38 }),
      n: 5, scale: 1.85, alignFlow: true, sid: "lsec",
      spawn: (p, i, init) => {
        p.path = new Path([[3.25, 0.06, 0.38], [-3.42, 0.06, 0.38]]);
        p.v = 0.78; p.s = init ? ((i + 0.25) / 5) * p.path.len : 0;
      }
    });
    // NK / NKT 細胞（類洞内皮の上を這う：マウスはNKT優位、ヒトはNK優位）
    const nkG = geoBlob(0.20, 0.055, 1);
    const nkList = human ? ["nk", "nk", "nk", "nkt"] : ["nkt", "nkt", "nkt", "nk"];
    nkList.forEach((kind, i) => {
      const m = new THREE.Mesh(nkG, matSolid("wet", kind === "nk" ? 0x0ca4c8 : 0xc8328c));
      m.castShadow = true;
      const upper = i % 2 === 0, x0 = -2.4 + i * 1.45, z0 = -0.50 + (i % 3) * 0.24;
      B.add(m, "nk_nkt");
      m.userData.kind = kind;
      B.onUpdate((t) => {
        const x = ((x0 + t * 0.15 + 3.0) % 5.8) - 3.0;
        m.position.set(x, (upper ? 0.66 - 0.21 : -0.66 + 0.21) + Math.sin(t * 2.2 + i) * 0.016, z0);
        m.rotation.z = -t * 0.6;
      });
    });

    // IgA抗体（3段階InstancedMesh：二量体IgA［Y字×2＋J鎖］→ pIgR結合トランスサイトーシス → 分泌型IgA［SC巻き付き］）
    // 種差：ヒト＝主に胆管細胞、マウス＝肝細胞＋胆管細胞の両方がpIgRで輸送
    const igaRoutes = [
      {
        path: new Path([[pc[0] - 0.16, pc[1] + 0.12, 0.36], [4.70, -0.78, 0.32], [DX + rOut + 0.04, -0.52, 0.12], [DX + rIn + 0.02, -0.34, DZ + 0.08], [DX, -0.18, DZ + 0.08], [DX, 1.92, DZ + 0.08]]),
        transIdx: 2, lumenIdx: 4, isDuct: true
      },
      {
        path: new Path([[pc[0] - 0.12, pc[1] + 0.20, 0.36], [4.84, -0.25, 0.32], [DX + rOut + 0.04, 0.28, 0.12], [DX + rIn + 0.02, 0.42, DZ + 0.08], [DX, 0.56, DZ + 0.08], [DX, 1.92, DZ + 0.08]]),
        transIdx: 2, lumenIdx: 4, isDuct: true
      }
    ];
    if (!human) {
      // マウス固有：肝細胞基底側pIgR → 隣接細胞境界寄りのトランスサイトーシス → 毛細胆管コレクターへ分泌型IgA（SC付き）として排出
      igaRoutes.push(
        {
          path: new Path([[2.04, -0.38, 0.26], [2.04, -0.88, 0.34], [2.04, -1.42, 0.38], [2.04, -ROW - 0.64, 0.34], [3.16, -ROW - 0.54, 0.34]]),
          transIdx: 1, lumenIdx: 3, isDuct: false
        },
        {
          path: new Path([[0.68, 0.38, 0.26], [0.68, 0.88, 0.34], [0.68, 1.42, 0.38], [0.68, ROW + 0.64, 0.34], [2.25, ROW + 0.64, 0.34]]),
          transIdx: 1, lumenIdx: 3, isDuct: false
        },
        {
          path: new Path([[-0.68, 0.38, 0.26], [-0.68, 0.88, 0.34], [-0.68, 1.42, 0.38], [-0.68, ROW + 0.64, 0.34], [0.80, ROW + 0.64, 0.34]]),
          transIdx: 1, lumenIdx: 3, isDuct: false
        }
      );
    }
    const igaN = human ? 14 : 26;
    const igaMat = mat("gloss", { emissive: 0x380c2e, emissiveIntensity: 0.26 });
    const imDIga = new THREE.InstancedMesh(geoDimericIgA(), igaMat, igaN);
    const imPIga = new THREE.InstancedMesh(geoIgApIgR(), igaMat, igaN);
    const imSIga = new THREE.InstancedMesh(geoSecretoryIgA(), igaMat, igaN);
    [imDIga, imPIga, imSIga].forEach((im) => {
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.castShadow = false; im.receiveShadow = false; im.frustumCulled = false;
      B.add(im, "portal_iga_plasma");
    });
    const igaPs = [];
    for (let i = 0; i < igaN; i++) {
      const rt = igaRoutes[i % igaRoutes.length];
      const slot = Math.floor(i / igaRoutes.length);
      const perRoute = Math.ceil(igaN / igaRoutes.length);
      const blk = (bdl && rt.isDuct) ? rt.path.len * (0.68 + 0.26 * ((i % 5) / 4)) : (gs && rt.isDuct && i % 2 === 0 ? rt.path.len * 0.84 : Infinity);
      igaPs.push({
        rt,
        s: Math.min(blk, ((slot + 0.18) / perRoute) * rt.path.len),
        v: bdl && rt.isDuct ? 0.14 : gs && rt.isDuct ? 0.16 : 0.28,
        block: blk,
        roll: S.rand() * 6.28,
        off: [(S.rand() - 0.5) * 0.05, 0, (S.rand() - 0.5) * 0.03]
      });
    }
    const igaDum = new THREE.Object3D(), igaZero = new THREE.Matrix4().makeScale(0, 0, 0);
    const igaPos = new THREE.Vector3(), igaTan = new THREE.Vector3(), igaX = new THREE.Vector3(1, 0, 0), igaQ = new THREE.Quaternion();
    const stepIgA = (dt) => {
      for (let i = 0; i < igaN; i++) {
        const p = igaPs[i], rt = p.rt;
        if (p.s < p.block) {
          p.s += p.v * dt;
          if (p.s >= p.block) p.s = p.block;
          else if (p.s > rt.path.len) p.s -= rt.path.len;
        }
        rt.path.at(p.s, igaPos);
        rt.path.tangentAt(p.s, igaTan);
        p.roll += 0.55 * dt;
        igaDum.position.set(igaPos.x + p.off[0], igaPos.y + p.off[1], igaPos.z + p.off[2]);
        igaDum.quaternion.setFromUnitVectors(igaX, igaTan);
        igaQ.setFromAxisAngle(igaX, Math.sin(p.roll) * 0.42);
        igaDum.quaternion.multiply(igaQ);
        igaDum.scale.setScalar(1.16);
        igaDum.updateMatrix();
        const sTrans = rt.path.c[rt.transIdx];
        const sLumen = rt.path.c[rt.lumenIdx];
        const stage = p.s < sTrans ? 0 : p.s < sLumen ? 1 : 2;
        imDIga.setMatrixAt(i, stage === 0 ? igaDum.matrix : igaZero);
        imPIga.setMatrixAt(i, stage === 1 ? igaDum.matrix : igaZero);
        imSIga.setMatrixAt(i, stage === 2 ? igaDum.matrix : igaZero);
      }
      imDIga.instanceMatrix.needsUpdate = true;
      imPIga.instanceMatrix.needsUpdate = true;
      imSIga.instanceMatrix.needsUpdate = true;
    };
    stepIgA(0);
    B.onUpdate((t, dt) => stepIgA(dt));

    // 胆汁（毛細胆管コレクター → 上下ヘリング管 → 小葉間胆管：粒子＋3D方向矢印、BDLで停滞・蓄積）
    const bilePaths = [
      new Path([[-2.04, ROW + 0.64, 0.30], [0.0, ROW + 0.64, 0.30], [2.04, ROW + 0.64, 0.30], [3.08, ROW + 0.56, 0.30], herP[0], herP[1], herP[2], [DX, 1.25, DZ + 0.06], [DX, 2.0, DZ + 0.06]]),
      new Path([[-2.04, -ROW - 0.64, 0.30], [0.0, -ROW - 0.64, 0.30], [2.04, -ROW - 0.64, 0.30], [3.08, -ROW - 0.56, 0.30], herP2[0], herP2[1], herP2[2], [DX, -1.05, DZ + 0.06], [DX, 2.0, DZ + 0.06]])
    ];
    B.flow({
      geom: geoSphere(0.040, 10),
      mat: matSolid("gloss", 0x26c762, { emissive: 0x0a421e, emissiveIntensity: 0.45 }),
      n: bdl ? 36 : 24,
      spawn: (p, i, init) => {
        p.path = bilePaths[i % 2];
        p.v = bdl ? 0.16 : gs ? 0.12 : 0.38;
        p.block = bdl ? p.path.len * (0.58 + 0.36 * (i % 7) / 6) : (gs && i % 2 === 0 ? p.path.len * (0.76 + 0.18 * S.rand()) : Infinity);
        p.s = init ? Math.min(p.block, (i / (bdl ? 36 : 24)) * p.path.len) : 0;
        p.off = [(S.rand() - 0.5) * 0.05, 0, (S.rand() - 0.5) * 0.04];
      }
    });
    B.flow({
      geom: geoArrow(), mat: matSolid("gloss", 0x26d46c, { emissive: 0x0a4a24, emissiveIntensity: 0.42 }),
      n: 8, scale: 1.45, alignFlow: true, sid: "canal_of_hering",
      spawn: (p, i, init) => {
        p.path = bilePaths[i % 2];
        p.v = bdl ? 0.10 : gs ? 0.12 : 0.42;
        p.block = bdl ? p.path.len * 0.72 : (gs ? p.path.len * 0.85 : Infinity);
        p.s = init ? Math.min(p.block, ((Math.floor(i / 2) + 0.2) / 4) * p.path.len) : 0;
      }
    });

    B.label("hepatocyte_cord", "肝細胞（核・小胞体・ミトコンドリア）", [-2.45, 2.06, CUT], [45, -75]);
    B.label("lsec", human ? "類洞内皮（窓 約107 nm）→中心静脈へ" : "類洞内皮（窓 約141 nm）→中心静脈へ", [-3.22, 0.28, 0.30], [-105, -20]);
    B.label("space_of_disse", "ディッセ腔", [-2.65, -0.79, 0.34], [-20, 175]);
    B.label("kupffer_cell", "クッパー細胞", [-1.50, -0.32, 0.08], [-35, 198]);
    B.label("hsc", bdl ? "星細胞（活性化）" : "星細胞（ビタミンA滴）", [0.82, -0.79, 0.34], [55, 175]);
    B.label("nk_nkt", human ? "NK細胞（ヒトで優位）" : "NKT細胞（マウスで豊富）", () => {
      const m = B.group.children.find((o) => o.userData.sid === "nk_nkt" && o.userData.kind === (human ? "nk" : "nkt"));
      return m ? [m.position.x, m.position.y + 0.22, m.position.z] : [0, 0, 0];
    }, [25, -165]);
    B.label("canal_of_hering", "毛細胆管→ヘリング管→胆管", [3.65, 1.33, 0.32], [-15, -112]);
    B.label("portal_triad", "門脈枝(紫)・動脈枝(赤)→類洞へ", [3.48, 0.16, -0.18], [-15, -60]);
    B.label("portal_iga_plasma", "二量体IgA（J鎖）←形質細胞", [pc[0], pc[1], 0.42], [-25, 120]);
    B.label("portal_iga_plasma", human ? "分泌型IgA（SC付き・胆管pIgR）" : "分泌型IgA（SC付き・肝細胞＋胆管pIgR）", [DX, 0.72, 0.16], [15, -145]);
    if (bdl) {
      B.label("inflammatory_cells", "浸潤した好中球", [0.3, -0.3, 0.12], [110, 175]);
      B.label("ductular_reaction", "胆管増生", [4.82, 0.48, 0.36], [42, -165]);
      B.label("collagen_fibers", "コラーゲン沈着", [-0.5, 0.80, 0.32], [10, -165]);
    }
    return {
      B, cam: { target: [0.82, 0, 0], dist: 17.8, min: 11, max: 22, yaw: 0.12, pitch: 0.17 },
      structures: ["hepatocyte_cord", "lsec", "space_of_disse", "kupffer_cell", "hsc", "nk_nkt", "canal_of_hering", "portal_triad", "portal_iga_plasma"].concat(bdl ? ["inflammatory_cells", "ductular_reaction", "collagen_fibers"] : []),
      floorY: -2.65,
      zoomSpot: [0.68, 0.72, 0.30],
      zoomRingScale: 1.5
    };
  }

  // =====================================================================
  // L5 毛細胆管と輸送体：取り込み（NTCP/OATP）→ 細胞内 → 排出（BSEP/MRP2）
  // =====================================================================
  function buildL5(sp, pt) {
    const B = new Builder();
    S.seed(505);
    const human = sp === "human", bdl = pt === "bdl", gs = pt === "gallstone";
    const CX = 1.2, CR = bdl ? 0.62 : gs ? 0.50 : 0.42, CUT = 0.6, BAS = -2.45;
    const cellA = S.roundBox([0.25, 1.17, -0.6], [2.7, 1.05, 1.3], 0.25);
    const cellB = S.roundBox([0.25, -1.17, -0.6], [2.7, 1.05, 1.3], 0.25);
    const scA = S.roundBox([0.25, 1.17, CUT], [2.56, 0.92, 0.24], 0.16);
    const scB = S.roundBox([0.25, -1.17, CUT], [2.56, 0.92, 0.24], 0.16);
    const canal = (x, y) => Math.hypot(x - CX, y) - CR;
    const vl = bdl ? 0.05 : 0.14;
    const cellF = (x, y, z) => {
      const up = y >= 0;
      let d = up ? cellA(x, y, z) : cellB(x, y, z);
      const sc = up ? scA(x, y, z) : scB(x, y, z);
      d = Math.max(d, -Math.max(sc, -(canal(x, y) - 0.14)));
      d = Math.max(d, -canal(x, y));
      // 基底側の微絨毛（ディッセ腔へ）
      if (x < BAS + 0.1 && x > BAS - 0.45 && Math.abs(y) > 0.3) {
        const gy = Math.round(y / 0.28) * 0.28, gz = Math.round(z / 0.3) * 0.3;
        d = S.smin(d, S.capsule([BAS + 0.05, gy, gz], [BAS - 0.33, gy, gz], 0.045)(x, y, z), 0.04);
      }
      // 毛細胆管の微絨毛
      const r = Math.hypot(x - CX, y);
      if (r < CR + 0.05 && r > CR - 0.2) {
        const a = Math.atan2(y, x - CX), st = Math.PI / 7, ka = Math.round(a / st) * st;
        const gz = Math.round(z / 0.28) * 0.28;
        if (Math.abs(Math.sin(ka)) > 0.25) d = S.smin(d, S.capsule([CX + (CR + 0.02) * Math.cos(ka), (CR + 0.02) * Math.sin(ka), gz], [CX + (CR - vl) * Math.cos(ka), (CR - vl) * Math.sin(ka), gz], 0.036)(x, y, z), 0.03);
      }
      return Math.max(d, z - CUT);
    };
    B.part({
      sid: "bile_acid_pool", zone: true, f: cellF, bmin: [-2.92, -2.30, -1.96], bmax: [3.02, 2.30, 0.68], res: 118, skipInterior: true, mat: "wet",
      color: (x, y, z) => {
        const dc = Math.hypot(x - CX, y) - CR;
        if (dc < 0.17) return H(0x2aa85e);
        if (x < BAS + 0.12) return H(0xd0624c);
        if (z > CUT - 0.06) return H(0xd97d62);
        const n = 0.90 + 0.14 * S.fbm(x * 5, y * 5, z * 5);
        const c = H(0xebb296); return [c[0] * n, c[1] * n, c[2] * n];
      }
    });

    // 類洞内皮（窓あり・温かなローズピンク）
    const hr = human ? 0.044 : 0.060;
    B.part({
      sid: null,
      f: (x, y, z) => {
        let d = S.roundBox([-3.06, 0, -0.6], [0.035, 2.28, 1.28], 0.02)(x, y, z);
        if (S.noise(y * 1.5 + 2, z * 1.5 + 9, 1) > (bdl ? 0.68 : 0.36)) {
          const gy = Math.round(y / 0.19) * 0.19, gz = Math.round(z / 0.19) * 0.19;
          d = Math.max(d, -(Math.hypot(y - gy, z - gz) - hr));
        }
        return Math.max(d, z - CUT);
      },
      bmin: [-3.16, -2.35, -1.96], bmax: [-2.96, 2.35, 0.68], res: 112, mat: "wet",
      color: (x, y, z) => S.mix(H(0xe07d90), H(0xf2aebc), S.noise(x * 6, y * 6, z * 6))
    });
    B.build();

    // 細胞内小器官（手本風の核・粗面小胞体・滑面小胞体・ミトコンドリア・ゴルジ体で豊かな断面に）
    const nA = [-1.18, 1.30, 0.34], nB = [-0.88, -1.32, 0.34];
    const dm = new THREE.Object3D();
    [nA, nB].forEach((n, i) => {
      const nm = new THREE.Mesh(geoNucleus(), mat("gloss"));
      nm.position.set(n[0], n[1], n[2]); nm.scale.setScalar(1.62); nm.castShadow = true; B.add(nm);
      const rm = new THREE.Mesh(geoRER(), mat("gloss"));
      rm.position.set(n[0], n[1], n[2] + 0.04); rm.rotation.z = i === 0 ? 0.5 : -2.2; rm.scale.setScalar(1.52); B.add(rm);
    });
    // 滑面小胞体（コレステロール→胆汁酸合成：CYP7A1・有機的な分岐チューブ網）
    const erPts = [
      [[-0.22, 0.80, 0.42], [0.16, 0.94, 0.44], [0.54, 0.82, 0.42], [0.92, 0.96, 0.42]],
      [[-0.18, 1.12, 0.44], [0.22, 1.24, 0.42], [0.58, 1.10, 0.44], [0.96, 1.22, 0.42]],
      [[-0.20, 1.44, 0.42], [0.18, 1.56, 0.44], [0.56, 1.42, 0.42], [0.92, 1.52, 0.44]],
      [[-0.12, 1.72, 0.44], [0.26, 1.80, 0.42], [0.64, 1.70, 0.44]],
      [[0.18, 0.94, 0.43], [0.22, 1.24, 0.43], [0.18, 1.56, 0.43]],
      [[0.56, 0.82, 0.43], [0.58, 1.10, 0.43], [0.56, 1.42, 0.43]]
    ];
    erPts.forEach((p) => B.add(makeTube(p, 0.056, 16, 10, 0x4570d6, "gloss"), "bile_acid_pool"));

    // ミトコンドリアとゴルジ体（上下の細胞質を豊かに埋める）
    const l5Mitos = [
      [-1.95, 0.68, 0.42, 0.4], [-1.85, 1.88, 0.42, -0.5], [1.98, 1.68, 0.42, 0.8], [2.25, 1.08, 0.42, -0.2],
      [-1.92, -0.78, 0.42, -0.6], [-1.78, -1.86, 0.42, 0.3], [0.25, -1.68, 0.42, 0.5], [2.15, -1.45, 0.42, -0.7], [2.35, -0.78, 0.42, 0.9]
    ];
    const m5IM = new THREE.InstancedMesh(geoMito(), mat("gloss"), l5Mitos.length);
    l5Mitos.forEach((m, i) => { dm.position.set(m[0], m[1], m[2]); dm.rotation.set(0, 0, m[3]); dm.scale.setScalar(1.65); dm.updateMatrix(); m5IM.setMatrixAt(i, dm.matrix); });
    B.add(m5IM);
    const l5Golgi = [[1.55, 1.42, 0.44, -0.35], [0.18, -0.92, 0.44, 0.45], [1.95, -1.78, 0.44, 0.25]];
    const g5IM = new THREE.InstancedMesh(geoGolgi(), mat("gloss"), l5Golgi.length);
    l5Golgi.forEach((g, i) => { dm.position.set(g[0], g[1], g[2]); dm.rotation.set(0, 0, g[3]); dm.scale.setScalar(1.75); dm.updateMatrix(); g5IM.setMatrixAt(i, dm.matrix); });
    B.add(g5IM);
    // 細胞内小胞・ペルオキシソーム（手本風の細かな彩り小器官）
    const vesPos = [
      [-0.55, 1.85, 0.44, 0.075], [1.18, 1.84, 0.44, 0.065], [2.42, 1.65, 0.44, 0.08], [1.55, 0.92, 0.44, 0.06],
      [-0.22, -1.76, 0.44, 0.075], [1.12, -1.55, 0.44, 0.085], [1.65, -1.18, 0.44, 0.065], [2.46, -1.62, 0.44, 0.07]
    ];
    const vesIM = new THREE.InstancedMesh(geoSphere(1, 12), matSolid("gloss", 0xf2b950), vesPos.length);
    vesPos.forEach((v, i) => { dm.position.set(v[0], v[1], v[2]); dm.rotation.set(0, 0, 0); dm.scale.setScalar(v[3]); dm.updateMatrix(); vesIM.setMatrixAt(i, dm.matrix); });
    B.add(vesIM);

    // タイトジャンクション（ZO-1/Claudin のジッパー状ビーズ鎖）
    const tjX = [CX - CR - 0.11, CX + CR + 0.11];
    const tjBead = geoSphere(0.088, 12);
    const tjMat = matSolid("gloss", 0xe67218);
    const tjBeads = [];
    for (const tx of tjX) for (let z = -1.78; z <= CUT - 0.04; z += 0.14) tjBeads.push([tx, 0, z]);
    const tjIM = new THREE.InstancedMesh(tjBead, tjMat, tjBeads.length);
    tjBeads.forEach((p, i) => { dm.position.set(p[0], p[1], p[2]); dm.rotation.set(0, 0, 0); dm.scale.set(1.05, 0.95, 0.85); dm.updateMatrix(); tjIM.setMatrixAt(i, dm.matrix); });
    B.add(tjIM, "tight_junction");

    // 輸送体（立体感のある多サブユニット膜貫通タンパク質）
    if (!GEO.prot) {
      GEO.prot = shared(S.mesh(
        S.displace(S.union([
          S.ellipsoid([0, 0, 0], [0.28, 0.16, 0.16]),
          S.sphere([0.07, 0.09, 0.06], 0.10),
          S.sphere([-0.07, -0.08, -0.05], 0.10),
          S.sphere([0.05, -0.08, 0.07], 0.08)
        ], 0.06), 0.028, 9),
        [-0.36, -0.26, -0.26], [0.36, 0.26, 0.26], 34,
        { color: (x, y, z) => S.mix([1, 1, 1], [0.76, 0.76, 0.76], S.noise(x * 18, y * 18, z * 18)), aoDist: 0.12 }
      ));
    }
    const COLORS = { ntcp: 0x265cc4, oatp: 0x128c9e, bsep: 0x189656, mrp2: 0x6ea820 };
    const sites = { ntcp: [], oatp: [], bsep: [], mrp2: [] };
    const addProt = (kind, pos, rotZ) => {
      const m = new THREE.Mesh(GEO.prot, mat("gloss", { color: COLORS[kind] }));
      m.position.set(pos[0], pos[1], pos[2]); m.rotation.set(0, 0, rotZ); m.castShadow = true;
      B.add(m, kind); sites[kind].push(pos);
      B.onUpdate((t) => { m.rotation.x = Math.sin(t * 1.5 + pos[1] * 3) * 0.12; });
    };
    [[1.75, 0.45], [0.75, 0.48], [-0.85, 0.45], [-1.80, 0.42], [1.30, -0.50], [-1.35, -0.60]].forEach((p) => addProt("ntcp", [BAS, p[0], p[1]], 0));
    [[1.25, 0.48], [-1.30, 0.50], [0.50, -0.80], [-0.60, -0.40]].forEach((p) => addProt("oatp", [BAS, p[0], p[1]], 0));
    const onCanal = (deg, z) => { const a = deg * Math.PI / 180; return [[CX + (CR + 0.06) * Math.cos(a), (CR + 0.06) * Math.sin(a), z], a]; };
    [[55, 0.42], [125, 0.42], [235, 0.42], [305, 0.42], [90, -0.60], [270, -0.70]].forEach((d) => { const o = onCanal(d[0], d[1]); addProt("bsep", o[0], o[1]); });
    [[90, 0.42], [270, 0.42], [160, -0.30]].forEach((d) => { const o = onCanal(d[0], d[1]); addProt("mrp2", o[0], o[1]); });

    // 胆汁酸分子（ステロイド骨格＋抱合アミノ酸：マウスはタウリン青、ヒトはグリシン緑）
    const tag = human ? H(0x2eb864) : H(0x2884e0);
    const baG = S.mesh(S.union([S.ellipsoid([0, 0, 0], [0.10, 0.052, 0.048]), S.sphere([0.12, 0.02, 0], 0.038)], 0.02), [-0.14, -0.08, -0.08], [0.18, 0.08, 0.08], 28, { color: (x) => (x > 0.08 ? tag : H(0xf2b418)) });
    const baMat = mat("gloss", { emissive: 0x3a2400, emissiveIntensity: 0.25 });
    const lumen = (z) => [CX + (S.rand() - 0.5) * CR * 0.6, (S.rand() - 0.5) * CR * 0.6, z];
    const exitZ = bdl ? null : -1.9;
    const hold = (p, path, idx, intraIdx) => {
      if (bdl) p.block = (intraIdx && S.rand() < 0.35) ? path.c[intraIdx] + S.rand() * 0.25 : path.c[idx] + S.rand() * 0.25;
      else if (gs) p.block = S.rand() < 0.48 ? path.c[idx] + S.rand() * 0.30 : Infinity;
    };
    B.flow({
      geom: baG, mat: baMat, n: bdl ? 72 : 48, scale: 1.28,
      spawn: (p, i, init) => {
        const r = S.rand();
        let pts, inIdx, intraIdx;
        if (r < 0.62) {
          const s = S.rand() < 0.65 ? sites.ntcp[Math.floor(S.rand() * sites.ntcp.length)] : sites.oatp[Math.floor(S.rand() * sites.oatp.length)];
          const b = sites.bsep[Math.floor(S.rand() * 4)];
          const mid = [-0.55 + S.rand() * 0.95, s[1] * 0.58 + (s[1] > 0 ? 0.25 : -0.25), 0.52];
          pts = [[-3.9, s[1] + 0.3, s[2]], [-3.06, s[1] + 0.2, s[2]], [BAS - 0.25, s[1], s[2]], [BAS, s[1], s[2]], [BAS + 0.4, s[1], 0.52], mid, [b[0] + (b[0] - CX) * 0.4, b[1] * 1.4, 0.52], b, lumen(0.42), lumen(exitZ || -0.38)];
          inIdx = 8; intraIdx = 6;
        } else {
          const b = sites.bsep[S.rand() < 0.5 ? 0 : 1];
          const e = erPts[Math.floor(S.rand() * 4)][1 + Math.floor(S.rand() * 2)];
          pts = [[e[0], e[1], 0.50], [(e[0] + b[0]) / 2, (e[1] + b[1]) / 2 + 0.1, 0.52], b, lumen(0.42), lumen(exitZ || -0.38)];
          inIdx = 3; intraIdx = 1;
        }
        p.path = new Path(pts); p.v = bdl ? 0.45 : gs ? 0.35 : 0.55 + S.rand() * 0.2; p.s = init ? S.rand() * p.path.len : 0;
        p.block = Infinity; hold(p, p.path, inIdx, intraIdx);
        if (p.s > p.block) p.s = p.block;
      }
    });
    // Na⁺（NTCPで一緒に入る）
    B.flow({
      geom: geoSphere(0.034, 8), mat: matSolid("gloss", 0x6cb8ff, { emissive: 0x103870, emissiveIntensity: 0.35 }), n: 20,
      spawn: (p, i, init) => { const s = sites.ntcp[i % sites.ntcp.length]; p.path = new Path([[-3.9, s[1] - 0.2, s[2]], [-3.06, s[1] - 0.1, s[2]], [BAS, s[1] - 0.05, s[2]], [BAS + 0.5, s[1] - 0.1, 0.52]]); p.v = 0.5; p.s = init ? S.rand() * p.path.len : 0; }
    });
    // MRP2：抱合ビリルビン・二価胆汁酸など
    B.flow({
      geom: geoSphere(0.048, 10), mat: matSolid("gloss", 0xe87c1e, { emissive: 0x452000, emissiveIntensity: 0.25 }), n: bdl ? 22 : 14,
      spawn: (p, i, init) => { const m = sites.mrp2[i % 2]; const st = m[1] > 0 ? [0.4, 1.4, 0.52] : [0.6, -1.5, 0.52]; p.path = new Path([st, [m[0], m[1] * 1.5, 0.52], m, lumen(0.42), lumen(exitZ || -0.38)]); p.v = 0.4; p.s = init ? S.rand() * p.path.len : 0; p.block = Infinity; hold(p, p.path, 3); if (p.s > p.block) p.s = p.block; }
    });
    // 類洞を流れる赤血球＋血流方向矢印（門脈・肝動脈 → 類洞 → 中心静脈）
    B.flow({
      geom: geoDisc(), mat: matSolid("gloss", 0xc82220), n: 6, scale: 1.65,
      spawn: (p, i, init) => { const z = -0.85 + S.rand() * 1.25; p.path = new Path([[-3.72, 2.55, z], [-3.72, -2.55, z]]); p.v = 0.85; p.s = init ? S.rand() * p.path.len : 0; p.spin = 1.5; }
    });
    B.flow({
      geom: geoArrow(), mat: matSolid("gloss", 0xe03a32, { emissive: 0x580c08, emissiveIntensity: 0.35 }),
      n: 3, scale: 1.9, alignFlow: true,
      spawn: (p, i, init) => { p.path = new Path([[-3.72, 2.20, 0.48], [-3.72, -2.20, 0.48]]); p.v = 0.80; p.s = init ? ((i + 0.2) / 3) * p.path.len : 0; }
    });
    // 毛細胆管内の胆汁流出方向矢印（→ ヘリング管・小葉間胆管へ、BDLで停滞）
    B.flow({
      geom: geoArrow(), mat: matSolid("gloss", 0x26d46c, { emissive: 0x0a4a24, emissiveIntensity: 0.42 }),
      n: 3, scale: 1.6, alignFlow: true, sid: "bile_canaliculus",
      spawn: (p, i, init) => {
        p.path = new Path([[CX, 0, 0.56], [CX, 0, -1.75]]);
        p.v = bdl ? 0.08 : gs ? 0.14 : 0.55;
        p.block = bdl ? 0.36 : (gs ? 0.95 : Infinity);
        p.s = init ? Math.min(p.block, ((i + 0.15) / 3) * p.path.len) : 0;
      }
    });

    B.label("ntcp", "NTCP（Na⁺と一緒に取り込み）", [BAS, 1.75, 0.6], [-45, -108]);
    B.label("oatp", "OATP（Na⁺なしで取り込み）", [BAS, -1.30, 0.6], [-45, 128]);
    const b0 = sites.bsep[0], m1 = sites.mrp2[1];
    B.label("bsep", "BSEP（胆汁酸を排出）", [b0[0], b0[1], 0.6], [190, -105]);
    B.label("mrp2", "MRP2（抱合体を排出）", [m1[0], m1[1], 0.6], [140, 215]);
    B.label("tight_junction", "タイトジャンクション", [tjX[1], 0, 0.62], [140, -10]);
    B.label("bile_canaliculus", "毛細胆管（→ヘリング管・胆管へ）", [CX, CR * 0.25, 0.35], [140, -245]);
    B.label("bile_acid_pool", "コレステロールから合成（CYP7A1）", [0.40, 1.48, 0.48], [-35, -148]);
    B.label(null, "類洞（血液側・門脈域→中心）", [-3.72, 1.05, 0.3], [-45, -120]);
    return {
      B, cam: { target: [-0.20, 0, 0], dist: 16.4, min: 10, max: 20, yaw: 0.24, pitch: 0.14 },
      structures: ["ntcp", "oatp", "bsep", "mrp2", "tight_junction", "bile_canaliculus", "bile_acid_pool"],
      floorY: -2.8,
      zoneOf: (p) => (Math.hypot(p.x - CX, p.y) < CR + 0.25 ? "bile_canaliculus" : "bile_acid_pool")
    };
  }

  A.buildLevel = function (i, sp, pt) {
    const r = [buildL1, buildL2, buildL3, buildL4, buildL5][i](sp, pt);
    r.group = r.B.group; r.pick = r.B.pick; r.labels = r.B.labels; r.updaters = r.B.updaters;
    return r;
  };
})();
