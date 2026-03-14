// core.test.js — integration tests against a mock HTTP server (no real node required)
// Run with: node --test test/core.test.js

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "http";

// Mock server matching real proxy-router response shapes
const routes = [
  { method: "GET", path: "/healthcheck", response: { status: "ok" } },
  { method: "GET", path: "/blockchain/latestBlock", response: { block: 12345678 } },
  { method: "GET", path: "/wallet", response: { address: "0xa2c397849325605d8a7b08629f173540a9f1ac41" } },
  { method: "GET", path: "/blockchain/balance", response: { eth: "50000000000000000", mor: "1500000000000000000" } },
  {
    method: "GET", path: "/blockchain/providers",
    response: {
      providers: [{
        Address: "0xa2c397849325605d8a7b08629f173540a9f1ac41",
        Stake: "250200000000000000000",
        Fee: 100,
        Endpoint: "5.161.177.217:3333",
        IsDeleted: false,
        CreatedAt: "1772837137",
      }],
    },
  },
  {
    method: "GET", path: "/blockchain/models",
    response: {
      models: [{
        Id: "0xmodel1aabbccdd",
        IpfsCID: "QmFakeModel1",
        Fee: 100000000,
        Stake: 100000000000000000,
        Owner: "0xa2c397849325605d8a7b08629f173540a9f1ac41",
        Name: "GLM-5",
        Tags: ["LLM", "chat"],
        IsDeleted: false,
        ModelType: "LLM",
      }],
    },
  },
  {
    method: "GET", path: "/blockchain/bids",
    response: {
      bids: [{
        Id: "0xbid1aabbccdd",
        ModelAgentId: "0xmodel1aabbccdd",
        Provider: "0xa2c397849325605d8a7b08629f173540a9f1ac41",
        PricePerSecond: "10000000000",
        Nonce: "0",
        CreatedAt: "1772837215",
        DeletedAt: "0",
      }],
    },
  },
  {
    method: "GET", path: "/blockchain/models/0xmodel1aabbccdd/bids",
    response: {
      bids: [{
        Id: "0xbid1aabbccdd",
        ModelAgentId: "0xmodel1aabbccdd",
        Provider: "0xa2c397849325605d8a7b08629f173540a9f1ac41",
        PricePerSecond: "10000000000",
        Nonce: "0",
        CreatedAt: "1772837215",
        DeletedAt: "0",
      }],
    },
  },
  {
    method: "GET", path: "/blockchain/providers/0xa2c397849325605d8a7b08629f173540a9f1ac41/bids/active",
    response: {
      bids: [{
        Id: "0xbid1aabbccdd",
        ModelAgentId: "0xmodel1aabbccdd",
        Provider: "0xa2c397849325605d8a7b08629f173540a9f1ac41",
        PricePerSecond: "10000000000",
        Nonce: "0",
        CreatedAt: "1772837215",
        DeletedAt: "0",
      }],
    },
  },
  { method: "GET", path: "/blockchain/sessions/provider", response: { sessions: [] } },
  { method: "POST", path: "/blockchain/models", response: { id: "0xnewmodel1234" } },
  { method: "POST", path: "/blockchain/bids", response: { id: "0xnewbid5678" } },
  { method: "DELETE", path: "/blockchain/bids/0xbid1aabbccdd", response: {}, status: 200 },
  { method: "DELETE", path: "/blockchain/models/0xmodel1aabbccdd", response: {}, status: 200 },
];

let server;
let baseUrl;

async function getClient() {
  const { MorpheusClient } = await import("../dist/core/client.js");
  return new MorpheusClient({ apiUrl: baseUrl, apiUser: "admin", apiPassword: "test" });
}

before(async () => {
  server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const route = routes.find(r => r.method === req.method && url.pathname === r.path);
    if (route) {
      res.writeHead(route.status ?? 200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(route.response));
    } else {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: `Not found: ${req.method} ${url.pathname}` }));
    }
  });
  await new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      baseUrl = `http://127.0.0.1:${addr.port}`;
      resolve();
    });
  });
});

after(() => server.close());

describe("client allowlist", () => {
  it("blocks POST /blockchain/send/eth", async () => {
    const { MorpheusClient } = await import("../dist/core/client.js");
    const c = new MorpheusClient({ apiUrl: baseUrl, apiUser: "admin", apiPassword: "test" });
    await assert.rejects(() => c.post("/blockchain/send/eth", {}), /Blocked endpoint/);
  });

  it("blocks DELETE /wallet", async () => {
    const { MorpheusClient } = await import("../dist/core/client.js");
    const c = new MorpheusClient({ apiUrl: baseUrl, apiUser: "admin", apiPassword: "test" });
    await assert.rejects(() => c.delete("/wallet"), /Blocked endpoint/);
  });

  it("blocks POST /wallet/privateKey", async () => {
    const { MorpheusClient } = await import("../dist/core/client.js");
    const c = new MorpheusClient({ apiUrl: baseUrl, apiUser: "admin", apiPassword: "test" });
    await assert.rejects(() => c.post("/wallet/privateKey", {}), /Blocked endpoint/);
  });

  it("blocks GET /docker/anything", async () => {
    const { MorpheusClient } = await import("../dist/core/client.js");
    const c = new MorpheusClient({ apiUrl: baseUrl, apiUser: "admin", apiPassword: "test" });
    await assert.rejects(() => c.get("/docker/containers"), /Blocked endpoint/);
  });

  it("blocks POST /blockchain/send/mor", async () => {
    const { MorpheusClient } = await import("../dist/core/client.js");
    const c = new MorpheusClient({ apiUrl: baseUrl, apiUser: "admin", apiPassword: "test" });
    await assert.rejects(() => c.post("/blockchain/send/mor", {}), /Blocked endpoint/);
  });

  it("blocks GET /ipfs/download/file", async () => {
    const { MorpheusClient } = await import("../dist/core/client.js");
    const c = new MorpheusClient({ apiUrl: baseUrl, apiUser: "admin", apiPassword: "test" });
    await assert.rejects(() => c.get("/ipfs/download/file"), /Blocked endpoint/);
  });
});

describe("node_status", () => {
  it("returns healthy when healthcheck + latestBlock both succeed", async () => {
    const { nodeStatus } = await import("../dist/core/health.js");
    const client = await getClient();
    const status = await nodeStatus(client);
    assert.equal(status.healthy, true);
    assert.equal(status.processAlive, true);
    assert.equal(status.blockchainConnected, true);
    assert.equal(status.latestBlock, 12345678);
    assert.equal(status.activeBids, 1);
    assert.equal(status.providerRegistered, true);
  });

  it("includes formatted balances", async () => {
    const { nodeStatus } = await import("../dist/core/health.js");
    const client = await getClient();
    const status = await nodeStatus(client);
    assert.ok(status.ethBalance?.includes("ETH"), `got: ${status.ethBalance}`);
    assert.ok(status.morBalance?.includes("MOR"), `got: ${status.morBalance}`);
  });
});

describe("checkBalances", () => {
  it("returns formatted ETH and MOR (lowercase API keys)", async () => {
    const { checkBalances } = await import("../dist/core/provider.js");
    const client = await getClient();
    const bal = await checkBalances(client);
    assert.ok(bal.eth.includes("ETH"), `got: ${bal.eth}`);
    assert.ok(bal.mor.includes("MOR"), `got: ${bal.mor}`);
    assert.equal(bal.ethWei, "50000000000000000");
    assert.equal(bal.morWei, "1500000000000000000");
  });
});

describe("weiToFormatted", () => {
  it("formats 1 ETH correctly", async () => {
    const { ethToFormatted } = await import("../dist/core/provider.js");
    assert.equal(ethToFormatted("1000000000000000000"), "1.0 ETH");
  });

  it("handles BigInt safely (no precision loss at large values)", async () => {
    const { morToFormatted } = await import("../dist/core/provider.js");
    const result = morToFormatted("1000000000000000000000000");
    assert.ok(result.includes("1000000"), `got: ${result}`);
  });
});

describe("bidIsActive", () => {
  it("treats DeletedAt='0' as active", async () => {
    const { bidIsActive } = await import("../dist/core/provider.js");
    assert.equal(bidIsActive({ Id: "0x1", Provider: "0x2", ModelAgentId: "0x3", PricePerSecond: "100", Nonce: "0", CreatedAt: "1000", DeletedAt: "0" }), true);
  });
  it("treats DeletedAt=null as active", async () => {
    const { bidIsActive } = await import("../dist/core/provider.js");
    assert.equal(bidIsActive({ Id: "0x1", Provider: "0x2", ModelAgentId: "0x3", PricePerSecond: "100", Nonce: "0", CreatedAt: "1000", DeletedAt: null }), true);
  });
  it("treats non-zero DeletedAt as inactive", async () => {
    const { bidIsActive } = await import("../dist/core/provider.js");
    assert.equal(bidIsActive({ Id: "0x1", Provider: "0x2", ModelAgentId: "0x3", PricePerSecond: "100", Nonce: "0", CreatedAt: "1000", DeletedAt: "1772837000" }), false);
  });
});

describe("listModels", () => {
  it("returns models with bid info from wrapped response", async () => {
    const { listModels } = await import("../dist/core/models.js");
    const client = await getClient();
    const models = await listModels(client);
    assert.equal(models.length, 1);
    assert.equal(models[0].name, "GLM-5");
    assert.ok(models[0].myBid !== undefined, "should have myBid");
  });
});

describe("removeModel confirmation guard", () => {
  it("rejects wrong confirm token", async () => {
    const { removeModel } = await import("../dist/core/models.js");
    const client = await getClient();
    await assert.rejects(
      () => removeModel(client, { modelId: "0xmodel1aabbccdd", confirm: "wrong" }),
      /Confirmation mismatch/
    );
  });

  it("accepts correct DELETE_MODEL_<first8> token", async () => {
    const { removeModel } = await import("../dist/core/models.js");
    const client = await getClient();
    const result = await removeModel(client, { modelId: "0xmodel1aabbccdd", confirm: "DELETE_MODEL_0xmodel1" });
    assert.equal(result.removed, true);
  });
});

describe("config", () => {
  it("rejects http:// for remote URLs", async () => {
    const { loadConfig } = await import("../dist/config.js");
    assert.throws(() => loadConfig({ url: "http://5.161.177.217:8082" }), /Refusing http/);
  });

  it("allows http:// for localhost", async () => {
    const { loadConfig } = await import("../dist/config.js");
    const cfg = loadConfig({ url: "http://localhost:8082", password: "test" });
    assert.equal(cfg.apiUrl, "http://localhost:8082");
  });

  it("allows http:// for remote with insecure=true", async () => {
    const { loadConfig } = await import("../dist/config.js");
    const cfg = loadConfig({ url: "http://5.161.177.217:8082", password: "test", insecure: true });
    assert.equal(cfg.apiUrl, "http://5.161.177.217:8082");
  });

  it("strips trailing slash from URL", async () => {
    const { loadConfig } = await import("../dist/config.js");
    const cfg = loadConfig({ url: "http://localhost:8082/", password: "test" });
    assert.equal(cfg.apiUrl, "http://localhost:8082");
  });
});
