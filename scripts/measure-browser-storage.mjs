// Isolated synthetic benchmark. Loopback HTTP is a transport baseline, not the desktop proxy.
import { createServer } from "node:http";
import { chromium } from "@playwright/test";
const server = createServer(async (req, res) => {
  if (req.method === "POST") { for await (const chunk of req) void chunk; res.end("ok"); }
  else { res.setHeader("Content-Type", "text/html"); res.end("<!doctype html><title>Synthetic storage benchmark</title>"); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  globalThis.console.log(JSON.stringify(await page.evaluate(async () => {
    const results = [];
    for (const count of [30, 300]) {
      const entries = Array.from({ length: count }, (_, i) => ({ id: `synthetic-${i}`, title: `합성 자료 ${i}`, question: "합성 수학 문제와 설명 ".repeat(300), questionImages: [`image-${i}.png`], questionMeta: [], memo: "합성 메모" }));
      const samples = [];
      for (let sample = 0; sample < 3; sample++) {
        await new Promise(resolve => globalThis.requestAnimationFrame(resolve));
        let start = globalThis.performance.now();
        const payload = JSON.stringify({ schemaVersion: 2, entries });
        const stringifyMs = globalThis.performance.now() - start;
        start = globalThis.performance.now(); globalThis.localStorage.setItem("synthetic-storage-benchmark", payload);
        const setItemMs = globalThis.performance.now() - start;
        start = globalThis.performance.now(); await globalThis.fetch("/baseline", { method: "POST", body: payload });
        samples.push({ stringifyMs, setItemMs, loopbackRequestMs: globalThis.performance.now() - start, bytes: new globalThis.TextEncoder().encode(payload).length });
      }
      globalThis.localStorage.removeItem("synthetic-storage-benchmark");
      results.push({ entries: count, writes: samples.length, requests: samples.length, samples });
    }
    return results;
  }), null, 2));
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
