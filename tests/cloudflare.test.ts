import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  getDatabase,
  getDatabaseSync,
  getGameAssetsBucket,
  getGameAssetsBucketSync,
} from "../src/lib/cloudflare";

describe("cloudflare binding entry points", () => {
  it("resolves the D1 database from an explicit environment", async () => {
    const fakeDb = { kind: "d1" };
    const env = { DB: fakeDb } as unknown as CloudflareEnv;

    assert.equal(await getDatabase(env), fakeDb as never);
    assert.equal(getDatabaseSync(env), fakeDb as never);
  });

  it("resolves the private game assets bucket from an explicit environment", async () => {
    const fakeBucket = { kind: "r2" };
    const env = { GAME_ASSETS: fakeBucket } as unknown as CloudflareEnv;

    assert.equal(await getGameAssetsBucket(env), fakeBucket as never);
    assert.equal(getGameAssetsBucketSync(env), fakeBucket as never);
  });

  it("fails closed with actionable errors when bindings are unavailable", async () => {
    await assert.rejects(() => getDatabase(), /D1 binding/);
    assert.throws(() => getDatabaseSync(), /D1 binding/);
    await assert.rejects(() => getGameAssetsBucket(), /R2 binding/);
    assert.throws(() => getGameAssetsBucketSync(), /R2 binding/);
  });
});
