import { test } from "node:test";
import assert from "node:assert/strict";
import desk from "../api/desk.mjs";

test("public desk page accepts GET and Swae's HEAD availability probe", async () => {
  const get = await desk.fetch(new Request("https://cyber-live-desk.vercel.app/desk", { method: "GET" }));
  assert.equal(get.status, 200);
  assert.match(get.headers.get("content-type"), /text\/html/);
  assert.match(await get.text(), /Cyber Live Desk overlay/);

  const head = await desk.fetch(new Request("https://cyber-live-desk.vercel.app/desk", { method: "HEAD" }));
  assert.equal(head.status, 200);
  assert.match(head.headers.get("content-type"), /text\/html/);
  assert.equal(await head.text(), "");
});

test("public desk aliases accept HEAD without opening operator API routes", async () => {
  const alias = await desk.fetch(new Request("https://cyber-live-desk.vercel.app/api/desk", { method: "HEAD" }));
  assert.equal(alias.status, 200);

  const old = process.env.DESK_OPERATOR_TOKEN;
  process.env.DESK_OPERATOR_TOKEN = "route-test-only-token";
  try {
    const privateRoute = await desk.fetch(new Request("https://cyber-live-desk.vercel.app/api/desk/cards", { method: "GET" }));
    assert.equal(privateRoute.status, 401);
  } finally {
    if (old === undefined) delete process.env.DESK_OPERATOR_TOKEN;
    else process.env.DESK_OPERATOR_TOKEN = old;
  }
});
