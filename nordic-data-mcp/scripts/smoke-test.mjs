#!/usr/bin/env node
/**
 * Smoke test: spawn the stdio MCP server, send initialize + tools/list +
 * tools/call, and assert basic shape. Exits non-zero on failure.
 *
 * Run: node scripts/smoke-test.mjs (requires NORDIC_API_KEY in env)
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const entry = resolve(__dirname, "..", "dist", "index.js");

const child = spawn(process.execPath, [entry], {
  stdio: ["pipe", "pipe", "inherit"],
  env: process.env,
});

let buffer = "";
const pending = new Map();
let nextId = 1;

child.stdout.on("data", (chunk) => {
  buffer += chunk.toString("utf8");
  let idx;
  while ((idx = buffer.indexOf("\n")) >= 0) {
    const line = buffer.slice(0, idx).trim();
    buffer = buffer.slice(idx + 1);
    if (!line) continue;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      console.error("bad json from server:", line);
      continue;
    }
    if (msg.id != null && pending.has(msg.id)) {
      const { resolve: r, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else r(msg.result);
    }
  }
});

function request(method, params) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    child.stdin.write(
      JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n",
    );
  });
}

function notify(method, params) {
  child.stdin.write(
    JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n",
  );
}

const timeout = setTimeout(() => {
  console.error("TIMEOUT — no response in 30s");
  child.kill();
  process.exit(1);
}, 30_000);

try {
  // 1. initialize
  const init = await request("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "smoke-test", version: "0.0.0" },
  });
  console.log("initialize ok:", init.serverInfo);
  notify("notifications/initialized", {});

  // 2. tools/list
  const list = await request("tools/list", {});
  console.log(`tools/list ok: ${list.tools.length} tools`);
  const names = list.tools.map((t) => t.name).sort();
  console.log("   ", names.join(", "));
  const expected = [
    "autocomplete_address",
    "company_enriched",
    "kyb_full",
    "lookup_company",
    "lookup_lei",
    "screen_sanctions",
    "validate_vat",
  ];
  if (JSON.stringify(names) !== JSON.stringify(expected)) {
    throw new Error(
      `unexpected tools — got ${JSON.stringify(names)} want ${JSON.stringify(expected)}`,
    );
  }

  // 3. tools/call lookup_company dk 61056416 → Carlsberg
  const call = await request("tools/call", {
    name: "lookup_company",
    arguments: { country: "dk", id: "61056416" },
  });
  if (call.isError) {
    throw new Error("tools/call returned isError: " + JSON.stringify(call));
  }
  const text = call.content?.[0]?.text ?? "";
  if (!/CARLSBERG/i.test(text)) {
    throw new Error(
      "expected CARLSBERG in response, got: " + text.slice(0, 200),
    );
  }
  console.log("tools/call lookup_company ok — Carlsberg found");

  // 4. tools/call validate_vat DK 25052943 (Carlsberg's VAT)
  const vat = await request("tools/call", {
    name: "validate_vat",
    arguments: { country: "DK", vat_number: "25052943" },
  });
  if (vat.isError) {
    console.warn(
      "validate_vat returned isError (may be upstream):",
      vat.content?.[0]?.text,
    );
  } else {
    console.log(
      "tools/call validate_vat ok —",
      vat.content[0].text.slice(0, 120),
    );
  }

  // 5. invalid input — should return isError without crashing the server
  const bad = await request("tools/call", {
    name: "lookup_company",
    arguments: { country: "xx", id: "1" },
  });
  if (!bad.isError) {
    throw new Error("expected isError for invalid country");
  }
  console.log("tools/call invalid input ok — error surfaced gracefully");

  console.log("\nALL CHECKS PASSED");
  clearTimeout(timeout);
  child.kill();
  process.exit(0);
} catch (err) {
  clearTimeout(timeout);
  console.error("\nFAILED:", err.message ?? err);
  child.kill();
  process.exit(1);
}
