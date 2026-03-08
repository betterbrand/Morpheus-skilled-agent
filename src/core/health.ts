// health.ts — two-stage node health check using Promise.allSettled
// Stage 1: GET /healthcheck (process liveness, 5s timeout)
// Stage 2: GET /blockchain/latestBlock (blockchain connectivity, 10s timeout)
// All 6+ calls run in parallel; partial failures show "unavailable" for that field.

import type { MorpheusClient } from "./client.js";
import type {
  HealthcheckResponse,
  BlockResponse,
  BalanceResponse,
  ProviderResponse,
  BidResponse,
  SessionResponse,
  NodeStatus,
} from "./types.js";
import { ethToFormatted, morToFormatted, bidIsActive } from "./provider.js";

function settled<T>(result: PromiseSettledResult<T>): T | undefined {
  return result.status === "fulfilled" ? result.value : undefined;
}

// Unwrap API responses that may be wrapped in an object (e.g. { providers: [...] })
function unwrapArray<T>(raw: T[] | { [key: string]: T[] } | undefined): T[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  // Return the first array-valued property
  for (const val of Object.values(raw)) {
    if (Array.isArray(val)) return val as T[];
  }
  return [];
}

export async function nodeStatus(client: MorpheusClient): Promise<NodeStatus> {
  const address = await client.getWalletAddress().catch(() => undefined);

  // Run all checks in parallel
  const [
    healthResult,
    blockResult,
    balanceResult,
    providersResult,
    bidsResult,
    sessionsResult,
  ] = await Promise.allSettled([
    client.get<HealthcheckResponse>("/healthcheck", undefined, 5_000),
    client.get<BlockResponse>("/blockchain/latestBlock", undefined, 10_000),
    client.get<BalanceResponse>("/blockchain/balance"),
    client.get<{ providers: ProviderResponse[] } | ProviderResponse[]>("/blockchain/providers"),
    address
      ? client.get<{ bids: BidResponse[] } | BidResponse[]>(
          `/blockchain/providers/${address}/bids/active`
        )
      : Promise.reject(new Error("no address")),
    address
      ? client.get<{ sessions: SessionResponse[] } | SessionResponse[]>(
          "/blockchain/sessions/provider",
          { provider: address }
        )
      : Promise.reject(new Error("no address")),
  ]);

  const health = settled(healthResult);
  const block = settled(blockResult);
  const balance = settled(balanceResult);
  const rawProviders = settled(providersResult);
  const rawBids = settled(bidsResult);
  const rawSessions = settled(sessionsResult);

  const providers = unwrapArray<ProviderResponse>(rawProviders as ProviderResponse[] | { [key: string]: ProviderResponse[] } | undefined);
  const bids = unwrapArray<BidResponse>(rawBids as BidResponse[] | { [key: string]: BidResponse[] } | undefined);
  const sessions = unwrapArray<SessionResponse>(rawSessions as SessionResponse[] | { [key: string]: SessionResponse[] } | undefined);

  const processAlive = !!health && health.status !== "error";
  const blockchainConnected = !!block && typeof block.block === "number";

  // Check provider registration
  const providerRegistered = address
    ? providers.some(
        (p) => p.Address.toLowerCase() === address.toLowerCase() && !p.IsDeleted
      )
    : undefined;

  const activeBids = bids.filter(bidIsActive).length;
  const activeSessions = sessions.filter((s) => s.IsActive).length;

  return {
    healthy: processAlive && blockchainConnected,
    processAlive,
    blockchainConnected,
    latestBlock: block?.block,
    walletAddress: address,
    ethBalance: balance ? ethToFormatted(balance.eth) : undefined,
    morBalance: balance ? morToFormatted(balance.mor) : undefined,
    activeBids,
    activeSessions,
    providerRegistered,
  };
}
