// provider.ts — provider_info, check_balances, BigInt wei utilities

import type { MorpheusClient } from "./client.js";
import type {
  BalanceResponse,
  ProviderResponse,
  BidResponse,
  BalanceSummary,
  ProviderInfo,
  BidSummary,
} from "./types.js";

// --- BigInt Wei Utilities ---

const ETH_DECIMALS = BigInt("1000000000000000000"); // 1e18
const MOR_DECIMALS = BigInt("1000000000000000000"); // 1e18 (MOR is also 18-decimal ERC-20)

/** Format a wei string to a human-readable decimal string */
export function weiToFormatted(weiStr: string, symbol: string, decimals = ETH_DECIMALS): string {
  try {
    const wei = BigInt(weiStr);
    const whole = wei / decimals;
    const remainder = wei % decimals;
    // Show 6 decimal places
    const fracStr = remainder.toString().padStart(18, "0").slice(0, 6);
    // Trim trailing zeros
    const frac = fracStr.replace(/0+$/, "") || "0";
    return `${whole}.${frac} ${symbol}`;
  } catch {
    return `${weiStr} ${symbol} (raw)`;
  }
}

export function ethToFormatted(weiStr: string): string {
  return weiToFormatted(weiStr, "ETH", ETH_DECIMALS);
}

export function morToFormatted(weiStr: string): string {
  return weiToFormatted(weiStr, "MOR", MOR_DECIMALS);
}

/** Compare wei strings using BigInt (safe for large values) */
export function weiGte(weiStr: string, threshold: string): boolean {
  try {
    return BigInt(weiStr) >= BigInt(threshold);
  } catch {
    return false;
  }
}

/**
 * Check if a bid is active.
 * The real API returns DeletedAt: "0" for active bids (not null).
 */
export function bidIsActive(bid: BidResponse): boolean {
  return !bid.DeletedAt || bid.DeletedAt === "0" || bid.DeletedAt === null;
}

/** Sum an array of wei strings */
export function sumWei(weiStrings: string[]): string {
  return weiStrings.reduce((acc, w) => {
    try {
      return (BigInt(acc) + BigInt(w)).toString();
    } catch {
      return acc;
    }
  }, "0");
}

// --- API Functions ---

/** Get ETH and MOR balances for the node wallet */
export async function checkBalances(client: MorpheusClient): Promise<BalanceSummary> {
  const balance = await client.get<BalanceResponse>("/blockchain/balance");
  return {
    eth: ethToFormatted(balance.eth),
    mor: morToFormatted(balance.mor),
    ethWei: balance.eth,
    morWei: balance.mor,
  };
}

/** Get provider registration info and active bids */
export async function providerInfo(client: MorpheusClient): Promise<ProviderInfo> {
  const address = await client.getWalletAddress();

  // GET /blockchain/providers returns { providers: [...] }
  const raw = await client.get<{ providers: ProviderResponse[] } | ProviderResponse[]>("/blockchain/providers");
  const providers = Array.isArray(raw) ? raw : (raw as { providers: ProviderResponse[] }).providers ?? [];
  const mine = providers.find(
    (p) => p.Address.toLowerCase() === address.toLowerCase()
  );

  // GET active bids for this provider
  let activeBids: BidSummary[] = [];
  try {
    const bidsRaw = await client.get<{ bids: BidResponse[] } | BidResponse[]>(
      `/blockchain/providers/${address}/bids/active`
    );
    const bids = Array.isArray(bidsRaw) ? bidsRaw : (bidsRaw as { bids: BidResponse[] }).bids ?? [];
    activeBids = bids.filter(bidIsActive).map((b) => ({
      id: b.Id,
      pricePerSecond: morToFormatted(b.PricePerSecond),
      pricePerSecondWei: b.PricePerSecond,
      createdAt: String(b.CreatedAt),
    }));
  } catch {
    // Provider may have no bids
  }

  if (!mine) {
    return {
      address,
      stake: "0.0 MOR",
      fee: 0,
      endpoint: "",
      registered: false,
      activeBids,
    };
  }

  return {
    address: mine.Address,
    stake: morToFormatted(mine.Stake),
    fee: mine.Fee,
    endpoint: mine.Endpoint,
    registered: !mine.IsDeleted,
    activeBids,
  };
}
