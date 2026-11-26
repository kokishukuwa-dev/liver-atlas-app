// 肝臓3Dアトラス v2：距離関数（SDF）で滑らかな有機形状を作り、Surface Netsでメッシュ化する
(function () {
  const S = {};

  // sRGB → linear 高速LUT（256*4段階）
  const LUT_N = 1024;
  const SRGB_LUT = new Float32Array(LUT_N + 1);
  for (let i = 0; i <= LUT_N; i++) SRGB_LUT[i] = Math.pow(i / LUT_N, 2.2);
  function toLin(v) {
    if (v <= 0) return 0;
    if (v >= 1) return 1;
    return SRGB_LUT[(v * LUT_N + 0.5) | 0];
  }
  S.toLin = toLin;

  // ===== ノイズ =====
  function hash(i, j, k) {
    let h = Math.imul(i, 374761393) ^ Math.imul(j, 668265263) ^ Math.imul(k, 1440662683);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967295;
  }
  function noise(x, y, z) {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const xf = x - xi, yf = y - yi, zf = z - zi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
    const n000 = hash(xi, yi, zi), n100 = hash(xi + 1, yi, zi);
    const n010 = hash(xi, yi + 1, zi), n110 = hash(xi + 1, yi + 1, zi);
    const n001 = hash(xi, yi, zi + 1), n101 = hash(xi + 1, yi, zi + 1);
    const n011 = hash(xi, yi + 1, zi + 1), n111 = hash(xi + 1, yi + 1, zi + 1);
    const nx00 = n000 + (n100 - n000) * u;
    const nx10 = n010 + (n110 - n010) * u;
    const nx01 = n001 + (n101 - n001) * u;
    const nx11 = n011 + (n111 - n011) * u;
    const nxy0 = nx00 + (nx10 - nx00) * v;
    const nxy1 = nx01 + (nx11 - nx01) * v;
    return nxy0 + (nxy1 - nxy0) * w;
  }
  S.noise = noise;
  S.fbm = (x, y, z) => noise(x, y, z) * 0.6 + noise(x * 2.1, y * 2.1, z * 2.1) * 0.3 + noise(x * 4.3, y * 4.3, z * 4.3) * 0.1;
  // 細胞・小葉模様用の軽量ボロノイ風パターン（0=中心, 1=境界付近）
  S.cellPattern = (x, y, z) => {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    let d1 = 9, d2 = 9;
    for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const cx = xi + dx, cy = yi + dy, cz = zi + dz;
      const px = cx + 0.18 + 0.64 * hash(cx, cy, cz);
      const py = cy + 0.18 + 0.64 * hash(cx + 31, cy + 17, cz + 53);
      const pz = cz + 0.18 + 0.64 * hash(cx + 71, cy + 43, cz + 19);
      const d = (x - px) * (x - px) + (y - py) * (y - py) + (z - pz) * (z - pz);
      if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
    }
    return Math.sqrt(d2) - Math.sqrt(d1);
  };
  S.rand = (function () { let s = 12345; return () => { s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff; return s / 0x7fffffff; }; })();
  S.seed = (n) => { let s = n | 0 || 1; S.rand = () => { s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff; return s / 0x7fffffff; }; };

  // ===== 演算 =====
  S.smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
  S.smax = (a, b, k) => -S.smin(-a, -b, k);
  S.union = (fs, k) => (x, y, z) => { let d = 1e9; for (let i = 0; i < fs.length; i++) { const v = fs[i](x, y, z); d = k ? S.smin(d, v, k) : Math.min(d, v); } return d; };
  S.sub = (a, b, k) => (x, y, z) => k ? S.smax(a(x, y, z), -b(x, y, z), k) : Math.max(a(x, y, z), -b(x, y, z));
  S.inter = (a, b, k) => (x, y, z) => k ? S.smax(a(x, y, z), b(x, y, z), k) : Math.max(a(x, y, z), b(x, y, z));
  S.displace = (f, amp, freq) => (x, y, z) => f(x, y, z) + (S.fbm(x * freq + 11.3, y * freq + 7.1, z * freq + 3.7) - 0.5) * amp;
  S.offset = (f, r) => (x, y, z) => f(x, y, z) - r;
  // 境界箱で遠い点を安く返す（AOや合成の高速化）
  S.bounded = (f, bmin, bmax, m) => {
    const mm = m || 0.35;
    const x0 = bmin[0], y0 = bmin[1], z0 = bmin[2], x1 = bmax[0], y1 = bmax[1], z1 = bmax[2];
    return (x, y, z) => {
      const dx = x < x0 ? x0 - x : (x > x1 ? x - x1 : 0);
      const dy = y < y0 ? y0 - y : (y > y1 ? y - y1 : 0);
      const dz = z < z0 ? z0 - z : (z > z1 ? z - z1 : 0);
      const d2 = dx * dx + dy * dy + dz * dz;
      return d2 > mm * mm ? Math.sqrt(d2) : f(x, y, z);
    };
  };

  // 回転・移動（Euler XYZ, 度）
  S.xf = (f, pos, rotDeg, scale) => {
    const rx = (rotDeg ? rotDeg[0] : 0) * Math.PI / 180, ry = (rotDeg ? rotDeg[1] : 0) * Math.PI / 180, rz = (rotDeg ? rotDeg[2] : 0) * Math.PI / 180;
    const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz));
    const inv = m.clone().invert().elements;
    const px = pos ? pos[0] : 0, py = pos ? pos[1] : 0, pz = pos ? pos[2] : 0, s = scale || 1, invS = 1 / s;
    const i0 = inv[0], i1 = inv[1], i2 = inv[2], i4 = inv[4], i5 = inv[5], i6 = inv[6], i8 = inv[8], i9 = inv[9], i10 = inv[10];
    return (x, y, z) => {
      const X = x - px, Y = y - py, Z = z - pz;
      const lx = (i0 * X + i4 * Y + i8 * Z) * invS;
      const ly = (i1 * X + i5 * Y + i9 * Z) * invS;
      const lz = (i2 * X + i6 * Y + i10 * Z) * invS;
      return f(lx, ly, lz) * s;
    };
  };

  // ===== プリミティブ =====
  S.sphere = (c, r) => {
    const cx = c[0], cy = c[1], cz = c[2];
    return (x, y, z) => Math.hypot(x - cx, y - cy, z - cz) - r;
  };
  S.ellipsoid = (c, rad) => {
    const cx = c[0], cy = c[1], cz = c[2], ix = 1 / rad[0], iy = 1 / rad[1], iz = 1 / rad[2];
    const ix2 = ix * ix, iy2 = iy * iy, iz2 = iz * iz;
    return (x, y, z) => {
      const dx = x - cx, dy = y - cy, dz = z - cz;
      const px = dx * ix, py = dy * iy, pz = dz * iz;
      const k0 = Math.sqrt(px * px + py * py + pz * pz);
      const k1 = Math.sqrt(dx * dx * ix2 * ix2 + dy * dy * iy2 * iy2 + dz * dz * iz2 * iz2) + 1e-9;
      return k0 * (k0 - 1) / k1;
    };
  };
  S.capsule = (a, b, ra, rb) => {
    const r2 = rb === undefined ? ra : rb;
    const ax = a[0], ay = a[1], az = a[2];
    const bax = b[0] - ax, bay = b[1] - ay, baz = b[2] - az;
    const invL2 = 1 / (bax * bax + bay * bay + baz * baz || 1e-9);
    const dr = r2 - ra;
    return (x, y, z) => {
      const pax = x - ax, pay = y - ay, paz = z - az;
      let t = (pax * bax + pay * bay + paz * baz) * invL2;
      if (t < 0) t = 0; else if (t > 1) t = 1;
      const dx = pax - bax * t, dy = pay - bay * t, dz = paz - baz * t;
      return Math.sqrt(dx * dx + dy * dy + dz * dz) - (ra + dr * t);
    };
  };
  // 折れ線の管（半径は点ごと）。k>0で継ぎ目を滑らかに
  S.tube = (pts, radii, k) => {
    const segs = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const ra = Array.isArray(radii) ? radii[i] : radii;
      const rb = Array.isArray(radii) ? radii[i + 1] : radii;
      segs.push(S.capsule(pts[i], pts[i + 1], ra, rb));
    }
    return S.union(segs, k || 0);
  };
  S.roundBox = (c, half, r) => {
    const cx = c[0], cy = c[1], cz = c[2], hx = half[0] - r, hy = half[1] - r, hz = half[2] - r;
    return (x, y, z) => {
      const qx = Math.abs(x - cx) - hx, qy = Math.abs(y - cy) - hy, qz = Math.abs(z - cz) - hz;
      const ox = qx > 0 ? qx : 0, oy = qy > 0 ? qy : 0, oz = qz > 0 ? qz : 0;
      const m = qx > qy ? (qx > qz ? qx : qz) : (qy > qz ? qy : qz);
      return Math.sqrt(ox * ox + oy * oy + oz * oz) + (m < 0 ? m : 0) - r;
    };
  };
  // Y軸の六角柱（頂点が±X方向）
  S.hexPrismY = (c, R, halfH, round) => {
    const rr = round || 0, cx = c[0], cy = c[1], cz = c[2], hr = R * 0.8660254 - rr, hh = halfH - rr;
    return (x, y, z) => {
      const px = Math.abs(x - cx), pz = Math.abs(z - cz);
      const a = Math.max(pz, pz * 0.5 + px * 0.8660254);
      const dHex = a - hr;
      const dY = Math.abs(y - cy) - hh;
      const ox = dHex > 0 ? dHex : 0, oy = dY > 0 ? dY : 0;
      return Math.min(Math.max(dHex, dY), 0) + Math.sqrt(ox * ox + oy * oy) - rr;
    };
  };
  S.cylY = (c, r, halfH, round) => {
    const rr = round || 0, cx = c[0], cy = c[1], cz = c[2], cr = r - rr, hh = halfH - rr;
    return (x, y, z) => {
      const dR = Math.hypot(x - cx, z - cz) - cr;
      const dY = Math.abs(y - cy) - hh;
      const ox = dR > 0 ? dR : 0, oy = dY > 0 ? dY : 0;
      return Math.min(Math.max(dR, dY), 0) + Math.sqrt(ox * ox + oy * oy) - rr;
    };
  };
  S.torus = (c, R, r, axis) => (x, y, z) => {
    let a, b, h;
    const X = x - c[0], Y = y - c[1], Z = z - c[2];
    if (axis === "x") { a = Y; b = Z; h = X; } else if (axis === "z") { a = X; b = Y; h = Z; } else { a = X; b = Z; h = Y; }
    const q = Math.hypot(a, b) - R;
    return Math.hypot(q, h) - r;
  };
  // レンズ形（縁が薄い葉っぱ状）。rx,ry: 輪郭、t: 中央の半分の厚み、round: 縁の丸み
  S.lens = (c, rx, ry, t, rot, round) => {
    const k = Math.min(rx, ry), tn = t / k, Rs = (1 + tn * tn) / (2 * tn), off = (Rs - tn) * k, Rsk = Rs * k, rrk = (round || 0.18) * k;
    const sx = k / rx, sy = k / ry;
    const f = (x, y, z) => {
      const qx = x * sx, qy = y * sy;
      const d1 = Math.hypot(qx, qy, z + off) - Rsk;
      const d2 = Math.hypot(qx, qy, z - off) - Rsk;
      return S.smax(d1, d2, rrk);
    };
    return S.xf(f, c, rot);
  };
  S.plane = (n, d) => (x, y, z) => x * n[0] + y * n[1] + z * n[2] - d;

  // ===== 色ユーティリティ =====
  S.hex = (h) => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];
  S.mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  S.smooth = (e0, e1, x) => { const t = Math.min(Math.max((x - e0) / (e1 - e0), 0), 1); return t * t * (3 - 2 * t); };

  // ===== Surface Nets メッシュ化 =====
  const OFF = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const EDGES = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];

  /**
   * f: (x,y,z)=>符号付き距離, bmin/bmax: 範囲, res: 最長辺の分割数
   * opt.color: (x,y,z,nx,ny,nz)=>[r,g,b] (sRGB 0..1) / 固定色 [r,g,b]
   * opt.ao: AO用の合成SDF, opt.aoDist: 調べる距離, opt.aoMin: 最小AO (既定0.36)
   */
  S.mesh = (f, bmin, bmax, res, opt) => {
    opt = opt || {};
    const sx = bmax[0] - bmin[0], sy = bmax[1] - bmin[1], sz = bmax[2] - bmin[2];
    const h = Math.max(sx, sy, sz) / res;
    const nx = Math.ceil(sx / h) + 2, ny = Math.ceil(sy / h) + 2, nz = Math.ceil(sz / h) + 2;
    const ox = bmin[0] - h * 0.5, oy = bmin[1] - h * 0.5, oz = bmin[2] - h * 0.5;
    const v = new Float32Array(nx * ny * nz);
    const nyNx = nx * ny;
    // 外周は+hで初期化し、内部のみ評価
    v.fill(h);
    for (let k = 1; k < nz - 1; k++) {
      const z = oz + k * h;
      const kOff = k * nyNx;
      for (let j = 1; j < ny - 1; j++) {
        const y = oy + j * h;
        let idx = kOff + j * nx + 1;
        for (let i = 1; i < nx - 1; i++) {
          v[idx++] = f(ox + i * h, y, z);
        }
      }
    }
    const cnx = nx - 1, cny = ny - 1, cnz = nz - 1;
    const cellVert = new Int32Array(cnx * cny * cnz).fill(-1);
    const pos = [];
    const cv = new Float32Array(8);
    for (let k = 0; k < cnz; k++) {
      const k0 = k * nyNx, k1 = (k + 1) * nyNx;
      for (let j = 0; j < cny; j++) {
        const j0 = j * nx, j1 = (j + 1) * nx;
        const cRow = cnx * (j + cny * k);
        for (let i = 0; i < cnx; i++) {
          const v0 = v[i + j0 + k0], v1 = v[i + 1 + j0 + k0];
          const v2 = v[i + j1 + k0], v3 = v[i + 1 + j1 + k0];
          const v4 = v[i + j0 + k1], v5 = v[i + 1 + j0 + k1];
          const v6 = v[i + j1 + k1], v7 = v[i + 1 + j1 + k1];
          const m = (v0 < 0 ? 1 : 0) | (v1 < 0 ? 2 : 0) | (v2 < 0 ? 4 : 0) | (v3 < 0 ? 8 : 0) |
                    (v4 < 0 ? 16 : 0) | (v5 < 0 ? 32 : 0) | (v6 < 0 ? 64 : 0) | (v7 < 0 ? 128 : 0);
          if (m === 0 || m === 255) continue;
          cv[0] = v0; cv[1] = v1; cv[2] = v2; cv[3] = v3;
          cv[4] = v4; cv[5] = v5; cv[6] = v6; cv[7] = v7;
          let ax = 0, ay = 0, az = 0, cnt = 0;
          for (let e = 0; e < 12; e++) {
            const a = EDGES[e][0], b = EDGES[e][1];
            if ((cv[a] < 0) !== (cv[b] < 0)) {
              const t = cv[a] / (cv[a] - cv[b]);
              const oa = OFF[a], ob = OFF[b];
              ax += oa[0] + t * (ob[0] - oa[0]);
              ay += oa[1] + t * (ob[1] - oa[1]);
              az += oa[2] + t * (ob[2] - oa[2]);
              cnt++;
            }
          }
          const invC = 1 / cnt;
          cellVert[i + cRow] = pos.length / 3;
          pos.push(ox + (i + ax * invC) * h, oy + (j + ay * invC) * h, oz + (k + az * invC) * h);
        }
      }
    }
    const cnyCnx = cnx * cny;
    const C = (i, j, k) => cellVert[i + cnx * j + cnyCnx * k];
    const ind = [];
    const quad = (a, b, c, d, flip) => {
      if (a < 0 || b < 0 || c < 0 || d < 0) return;
      if (flip) ind.push(a, c, b, a, d, c); else ind.push(a, b, c, a, c, d);
    };
    for (let k = 1; k < nz - 1; k++) {
      const kOff = k * nyNx;
      for (let j = 1; j < ny - 1; j++) {
        const jOff = kOff + j * nx;
        for (let i = 1; i < nx - 1; i++) {
          const idx = jOff + i;
          const ain = v[idx] < 0;
          if (ain !== (v[idx + 1] < 0)) quad(C(i, j - 1, k - 1), C(i, j, k - 1), C(i, j, k), C(i, j - 1, k), !ain);
          if (ain !== (v[idx + nx] < 0)) quad(C(i - 1, j, k - 1), C(i - 1, j, k), C(i, j, k), C(i, j, k - 1), !ain);
          if (ain !== (v[idx + nyNx] < 0)) quad(C(i - 1, j - 1, k), C(i, j - 1, k), C(i, j, k), C(i - 1, j, k), !ain);
        }
      }
    }
    // 法線（SDF勾配）・色・AO（高速3タップ＋LUTガンマ変換）
    const nV = pos.length / 3;
    const nor = new Float32Array(nV * 3);
    const col = new Float32Array(nV * 3);
    const e = h * 0.5;
    const aoF = opt.ao, aoD = opt.aoDist || h * 4, aoMin = opt.aoMin !== undefined ? opt.aoMin : 0.36;
    const invAoD = 1 / aoD;
    const colorFn = typeof opt.color === "function" ? opt.color : null;
    const fixed = colorFn ? null : (opt.color || [0.8, 0.8, 0.8]);
    for (let q = 0; q < nV; q++) {
      const q3 = q * 3;
      const x = pos[q3], y = pos[q3 + 1], z = pos[q3 + 2];
      let gx = f(x + e, y, z) - f(x - e, y, z);
      let gy = f(x, y + e, z) - f(x, y - e, z);
      let gz = f(x, y, z + e) - f(x, y, z - e);
      const gl = Math.sqrt(gx * gx + gy * gy + gz * gz) || 1;
      gx /= gl; gy /= gl; gz /= gl;
      nor[q3] = gx; nor[q3 + 1] = gy; nor[q3 + 2] = gz;
      const c = colorFn ? colorFn(x, y, z, gx, gy, gz) : fixed;
      let ao = 1;
      if (aoF) {
        const d1 = aoD * 0.25, d2 = aoD * 0.58, d3 = aoD;
        let occ = 0.52 * (d1 - aoF(x + gx * d1, y + gy * d1, z + gz * d1))
                + 0.32 * (d2 - aoF(x + gx * d2, y + gy * d2, z + gz * d2))
                + 0.16 * (d3 - aoF(x + gx * d3, y + gy * d3, z + gz * d3));
        ao = 1 - occ * invAoD * 1.85;
        if (ao < aoMin) ao = aoMin; else if (ao > 1) ao = 1;
      }
      col[q3] = toLin(c[0] * ao);
      col[q3 + 1] = toLin(c[1] * ao);
      col[q3 + 2] = toLin(c[2] * ao);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    g.setIndex(ind);
    g.computeBoundingSphere();
    return g;
  };

  window.SDF = S;
})();
