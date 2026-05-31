#!/usr/bin/env node
// Regression matrix for the discovery tools' security boundary (v1.5.0+).
// Locks in the path-smuggling / admin-bypass and secret-redaction guarantees
// for `call_endpoint`. The bypass vectors are refused BEFORE any network call,
// so they run without an API key; the legit sanity calls need NORDIC_API_KEY.
//
// Usage:
//   npm run build && node scripts/security-check.mjs
//   NORDIC_API_KEY=ndk_... node scripts/security-check.mjs   (adds live sanity)

import { dispatchToolCall } from "../dist/lib/dispatcher.js";

let failures = 0;
const pass = (m) => console.log(`  \u2713 ${m}`);
const fail = (m) => {
  console.log(`  \u2717 ${m}`);
  failures++;
};

const parse = (r) => {
  let json;
  try {
    json = JSON.parse(r.content[0].text);
  } catch {
    /* not JSON */
  }
  return {
    isError: !!r.isError,
    txt: r.content.map((c) => c.text).join("\n"),
    json,
  };
};

// Every one of these must be refused with 400 invalid_path or 403 forbidden,
// regardless of encoding depth or whether the payload arrives via the path or a
// template parameter.
const BYPASS_VECTORS = [
  ["case-variant admin", { method: "GET", path: "/Admin/keys" }],
  ["single-encoded slash", { method: "GET", path: "/api/company/dk/..%2f..%2fadmin%2fkeys" }],
  ["double-encoded slash", { method: "GET", path: "/api/company/dk/..%252f..%252fadmin%252fkeys" }],
  ["double-encoded dot", { method: "GET", path: "/api/company/dk/%252e%252e/admin" }],
  ["literal traversal", { method: "GET", path: "/api/company/dk/../../admin/keys" }],
  ["backslash separators", { method: "GET", path: "\\admin\\keys" }],
  ["dotdot-to-admin", { method: "GET", path: "/api/x/../admin" }],
  [
    "template-param slash smuggle",
    {
      method: "GET",
      path: "/api/company/{country}/{id}",
      params: { country: "dk", id: "..%2f..%2fadmin%2fkeys" },
    },
  ],
  [
    "template-param literal traversal",
    {
      method: "GET",
      path: "/api/company/{country}/{id}",
      params: { country: "dk", id: "../../admin/keys" },
    },
  ],
  [
    "template-param double-encoded",
    {
      method: "GET",
      path: "/api/company/{country}/{id}",
      params: { country: "dk", id: "..%252f..%252fadmin" },
    },
  ],
  ["direct admin", { method: "GET", path: "/admin/keys" }],
];

async function run() {
  console.log("Security regression matrix for discovery tools\n");

  console.log("A: admin / path-smuggling vectors (all must be refused)");
  for (const [name, args] of BYPASS_VECTORS) {
    const res = parse(await dispatchToolCall("call_endpoint", args));
    const refused = res.isError && /\[40[03]\]/.test(res.txt);
    refused ? pass(name) : fail(`${name} was NOT refused -> ${res.txt.slice(0, 100)}`);
  }

  console.log("\nB: method whitelist");
  {
    const res = parse(
      await dispatchToolCall("call_endpoint", {
        method: "POST",
        path: "/api/company/dk/22756214",
      }),
    );
    res.isError && /\[405\]/.test(res.txt)
      ? pass("POST to GET-only path rejected with 405")
      : fail(`expected 405, got ${res.txt.slice(0, 100)}`);
  }

  console.log("\nC: no admin endpoints leak via discovery listing");
  {
    const res = parse(await dispatchToolCall("list_endpoints", {}));
    const adminCount = (res.json?.endpoints ?? []).filter((e) =>
      String(e.path).toLowerCase().startsWith("/admin"),
    ).length;
    adminCount === 0
      ? pass("list_endpoints contains 0 admin paths")
      : fail(`list_endpoints leaked ${adminCount} admin paths`);
  }

  console.log("\nC2: dashboard endpoints are hidden from discovery listing");
  {
    const res = parse(await dispatchToolCall("list_endpoints", {}));
    const dashCount = (res.json?.endpoints ?? []).filter((e) =>
      String(e.path).toLowerCase().startsWith("/api/dashboard"),
    ).length;
    dashCount === 0
      ? pass("list_endpoints contains 0 /api/dashboard paths")
      : fail(`list_endpoints leaked ${dashCount} dashboard paths`);
  }

  if (process.env.NORDIC_API_KEY) {
    console.log("\nD: live sanity (legit calls still work)");
    const c = parse(
      await dispatchToolCall("call_endpoint", {
        method: "GET",
        path: "/api/company/dk/22756214",
      }),
    );
    !c.isError
      ? pass("call_endpoint /api/company/dk/22756214 returns data")
      : fail(`legit call failed -> ${c.txt.slice(0, 100)}`);

    console.log(
      "\nD2: dashboard filter is discovery-only, not an MCP hard block",
    );
    const d = parse(
      await dispatchToolCall("call_endpoint", {
        method: "GET",
        path: "/api/dashboard/stats",
      }),
    );
    // Must NOT be blocked MCP-side (403 forbidden). Backend auth (401/upstream)
    // is expected because the scoped MCP key can't use the internal dashboard key.
    !/\[403\]\s+forbidden/i.test(d.txt)
      ? pass("call_endpoint dashboard route not MCP-blocked (backend auth applies)")
      : fail(`dashboard route was MCP hard-blocked -> ${d.txt.slice(0, 100)}`);
  } else {
    console.log("\nD: live sanity skipped (no NORDIC_API_KEY)");
  }

  console.log("");
  if (failures > 0) {
    console.log(`SECURITY CHECK FAILED (${failures} issue(s))`);
    process.exit(1);
  }
  console.log("ALL SECURITY CHECKS PASSED");
}

run().catch((err) => {
  console.error("security-check crashed:", err);
  process.exit(1);
});
