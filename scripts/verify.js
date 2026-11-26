// 肝臓3Dアトラス：起動計測・全階層/全種病態検証・スクリーンショット撮影スクリプト
"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawn } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const SHOT_DIR = process.argv[2] || path.join("C:", "Users", "kokis", "GoogleDrive", "memory", "研究", "3Dモデル", "肝臓3D", "screenshots_v2");
const EDGE = path.join("C:", "Program Files (x86)", "Microsoft", "Edge", "Application", "msedge.exe");
const CHROME = path.join("C:", "Program Files", "Google", "Chrome", "Application", "chrome.exe");
const BROWSER = fs.existsSync(EDGE) ? EDGE : CHROME;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".bin": "application/octet-stream",
};

function startServer() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const u = decodeURIComponent(req.url.split("?")[0]);
      const fp = path.join(ROOT, u === "/" ? "index.html" : u);
      if (!fs.existsSync(fp) || fs.statSync(fp).isDirectory()) {
        res.writeHead(404);
        res.end();
        return;
      }
      res.writeHead(200, { "Content-Type": MIME[path.extname(fp)] || "application/octet-stream" });
      fs.createReadStream(fp).pipe(res);
    });
    srv.listen(0, "127.0.0.1", () => resolve({ srv, port: srv.address().port }));
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const existing = fs.existsSync(SHOT_DIR) ? fs.readdirSync(SHOT_DIR).filter((f) => f.includes("_r8")) : [];
  console.log("Existing r8 screenshots:", existing);

  const { srv, port } = await startServer();
  const ud = fs.mkdtempSync(path.join(os.tmpdir(), "lvr-"));
  const proc = spawn(BROWSER, [
    "--headless=new",
    "--remote-debugging-port=0",
    "--window-size=1600,950",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-extensions",
    "--user-data-dir=" + ud,
    "about:blank",
  ], { stdio: ["ignore", "pipe", "pipe"] });

  try {
    const wsUrl = await new Promise((res, rej) => {
      let b = "";
      const tm = setTimeout(() => rej(new Error("CDP timeout: " + b)), 15000);
      proc.stderr.on("data", (d) => {
        b += d.toString();
        const m = b.match(/DevTools listening on (ws:\/\/[^\s]+)/);
        if (m) {
          clearTimeout(tm);
          res(m[1]);
        }
      });
    });
    const dport = new URL(wsUrl).port;
    const list = await fetch("http://127.0.0.1:" + dport + "/json/list").then((r) => r.json());
    const page = list.find((t) => t.type === "page");
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });

    let id = 0;
    const pend = new Map();
    const errs = [];
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && pend.has(m.id)) {
        const p = pend.get(m.id);
        pend.delete(m.id);
        if (m.error) p.rej(m.error);
        else p.res(m.result);
      }
      if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") {
        errs.push(m.params.args.map((a) => (a.value !== undefined ? a.value : a.description)).join(" "));
      }
      if (m.method === "Runtime.exceptionThrown") {
        errs.push(m.params.exceptionDetails.exception ? m.params.exceptionDetails.exception.description : m.params.exceptionDetails.text);
      }
    };
    const send = (method, params) => new Promise((res, rej) => {
      const i = ++id;
      pend.set(i, { res, rej });
      ws.send(JSON.stringify({ id: i, method, params: params || {} }));
    });

    await send("Page.enable");
    await send("Runtime.enable");
    await send("Emulation.setDeviceMetricsOverride", { width: 1600, height: 950, deviceScaleFactor: 1, mobile: false });

    const measure = async (label, url, waitAll) => {
      await send("Page.navigate", { url });
      for (let t = 0; t < 250; t++) {
        const ev = await send("Runtime.evaluate", {
          expression: `(() => {
            const l = window.__liver;
            if (!l || !l.bootMs) return null;
            if (${waitAll ? "true" : "false"} && !l.allBuiltMs) return null;
            const gl = l.renderer ? l.renderer.getContext() : null;
            const dbg = gl ? gl.getExtension("WEBGL_debug_renderer_info") : null;
            const gpu = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : "";
            return { bootMs: l.bootMs, allBuiltMs: l.allBuiltMs, buildMs: l.buildMs, timing: l.bootTiming, proto: location.protocol, gpu };
          })()`,
          returnByValue: true,
        });
        if (ev.result && ev.result.value) {
          console.log(label, JSON.stringify(ev.result.value));
          return ev.result.value;
        }
        await sleep(30);
      }
      console.log(label, "TIMEOUT");
      return null;
    };

    const httpUrl = "http://127.0.0.1:" + port + "/index.html";
    for (let r = 0; r < 5; r++) {
      await measure("HTTP Run " + (r + 1), httpUrl, r === 4);
    }

    // Screenshots: L1-L5 mouse normal + L4 human normal (1600x950)
    const lowerPrefix = existing.some((f) => f.startsWith("l1_") || f.startsWith("l2_") || f.startsWith("l3_") || f.startsWith("l4_"));
    const nm = (lv, sp, pt) => (lowerPrefix ? "l" : "L") + lv + "_" + sp + "_" + pt + "_r9.png";

    const waitNotTrans = async () => {
      for (let k = 0; k < 80; k++) {
        const ev = await send("Runtime.evaluate", { expression: "window.__liver && !window.__liver.isTransitioning()", returnByValue: true });
        if (ev.result && ev.result.value) return;
        await sleep(50);
      }
    };

    const snap = async (filename) => {
      await waitNotTrans();
      await sleep(250);
      const res = await send("Page.captureScreenshot", { format: "png" });
      const outPath = path.join(SHOT_DIR, filename);
      fs.writeFileSync(outPath, Buffer.from(res.data, "base64"));
      console.log("Saved screenshot:", outPath);
    };

    await sleep(300);
    await snap(nm(1, "mouse", "normal"));
    for (let lv = 1; lv < 5; lv++) {
      await send("Runtime.evaluate", { expression: "window.__liver.goLevel(" + lv + ");" });
      await sleep(950);
      await waitNotTrans();
      await snap(nm(lv + 1, "mouse", "normal"));
    }

    // L4 human normal
    await send("Runtime.evaluate", { expression: "window.__liver.goLevel(3);" });
    await sleep(950);
    await waitNotTrans();
    await send("Runtime.evaluate", { expression: "document.querySelector('#species button[data-v=\"human\"]').click();" });
    for (let k = 0; k < 60; k++) {
      const ev = await send("Runtime.evaluate", { expression: "window.__liver.state.species === 'human' && window.__liver.levels[3] && window.__liver.levels[3].group.visible", returnByValue: true });
      if (ev.result && ev.result.value) break;
      await sleep(50);
    }
    await sleep(300);
    await snap(nm(4, "human", "normal"));

    // Verify all other combos on L4 and L1 (plus X-ray on L1)
    for (const pair of [["human", "bdl"], ["human", "gallstone"], ["mouse", "bdl"], ["mouse", "gallstone"]]) {
      await send("Runtime.evaluate", {
        expression: `document.querySelector('#species button[data-v="${pair[0]}"]').click(); document.querySelector('#state button[data-v="${pair[1]}"]').click();`
      });
      await sleep(220);
    }
    await send("Runtime.evaluate", { expression: "window.__liver.goLevel(0);" });
    await sleep(950);
    await waitNotTrans();
    await send("Runtime.evaluate", { expression: "window.__liver.toggleXray(true);" });
    await sleep(150);
    await send("Runtime.evaluate", { expression: "window.__liver.toggleXray(false);" });
    for (const pair of [["human", "normal"], ["human", "bdl"], ["human", "gallstone"], ["mouse", "bdl"], ["mouse", "gallstone"], ["mouse", "normal"]]) {
      await send("Runtime.evaluate", {
        expression: `document.querySelector('#species button[data-v="${pair[0]}"]').click(); document.querySelector('#state button[data-v="${pair[1]}"]').click();`
      });
      await sleep(220);
    }

    // file:// benchmarks (Edge --app desktop mode)
    const fileUrl = "file:///" + ROOT.replace(/\\/g, "/") + "/index.html";
    for (let r = 0; r < 4; r++) {
      await measure("FILE Run " + (r + 1), fileUrl, r === 3);
    }
    await send("Runtime.evaluate", { expression: "window.__liver.goLevel(3);" });
    await sleep(950);
    await waitNotTrans();
    await send("Runtime.evaluate", { expression: "document.querySelector('#species button[data-v=\"human\"]').click();" });
    await sleep(450);
    const fCheck = await send("Runtime.evaluate", {
      expression: `({ level: window.__liver.state.level, sp: window.__liver.state.species, buildMs: window.__liver.buildMs, l4Loaded: window.LiverBaked.isLoaded("l4") })`,
      returnByValue: true,
    });
    console.log("FILE switch check:", JSON.stringify(fCheck.result.value));

    console.log("Total console errors:", errs.length, errs);
    ws.close();
  } finally {
    proc.kill();
    srv.close();
    try { fs.rmSync(ud, { recursive: true, force: true }); } catch {}
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
