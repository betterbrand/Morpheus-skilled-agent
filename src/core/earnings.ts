// earnings.ts — claim_earnings
// Checks all provider sessions for claimable balances and optionally claims them.

import type { MorpheusClient } from "./client.js";
import type {
  SessionResponse,
  ClaimableBalanceResponse,
  ClaimResponse,
  EarningsSummary,
} from "./types.js";
import { morToFormatted } from "./provider.js";

export interface ClaimEarningsParams {
  /** If true, claim all claimable sessions. If false, only report. Default: true */
  doClaim?: boolean;
  /** Max sessions to claim in one call. Default: 10 */
  maxClaims?: number;
  /** Skip session IDs that were recently claimed (unix timestamp map) */
  recentlyClaimed?: Record<string, number>;
  /** Minimum claimable amount in wei to bother claiming. Default: "0" */
  minClaimableWei?: string;
}

export async function claimEarnings(
  client: MorpheusClient,
  params: ClaimEarningsParams = {}
): Promise<EarningsSummary[]> {
  const {
    doClaim = true,
    maxClaims = 10,
    recentlyClaimed = {},
    minClaimableWei = "0",
  } = params;

  const address = await client.getWalletAddress();

  // GET all sessions where this node is the provider (returns { sessions: [...] })
  const raw = await client.get<{ sessions: SessionResponse[] } | SessionResponse[]>(
    "/blockchain/sessions/provider",
    { provider: address }
  );
  const sessions = Array.isArray(raw) ? raw : (raw as { sessions: SessionResponse[] }).sessions ?? [];

  const results: EarningsSummary[] = [];
  let claimCount = 0;

  for (const session of sessions) {
    if (claimCount >= maxClaims) break;

    // Skip if recently claimed (within last 60 minutes)
    const lastClaimed = recentlyClaimed[session.Id];
    if (lastClaimed && Date.now() / 1000 - lastClaimed < 3600) {
      results.push({
        sessionId: session.Id,
        claimableWei: "0",
        claimableFormatted: "0.0 MOR",
        skipped: "claimed_recently",
      });
      continue;
    }

    // Check claimable balance for this session
    let claimable: ClaimableBalanceResponse;
    try {
      claimable = await client.get<ClaimableBalanceResponse>(
        `/proxy/sessions/${session.Id}/providerClaimableBalance`
      );
    } catch {
      results.push({
        sessionId: session.Id,
        claimableWei: "0",
        claimableFormatted: "0.0 MOR",
        skipped: "claimable_check_failed",
      });
      continue;
    }

    const claimableWei = claimable.balance ?? "0";

    // Skip if below minimum threshold
    try {
      if (BigInt(claimableWei) < BigInt(minClaimableWei)) {
        results.push({
          sessionId: session.Id,
          claimableWei,
          claimableFormatted: morToFormatted(claimableWei),
          skipped: "below_minimum",
        });
        continue;
      }
    } catch {
      // Bad wei value — skip
      continue;
    }

    if (!doClaim) {
      results.push({
        sessionId: session.Id,
        claimableWei,
        claimableFormatted: morToFormatted(claimableWei),
      });
      continue;
    }

    // Claim it
    try {
      const claim = await client.post<ClaimResponse>(
        `/proxy/sessions/${session.Id}/providerClaim`,
        {}
      );
      results.push({
        sessionId: session.Id,
        claimableWei,
        claimableFormatted: morToFormatted(claimableWei),
        txHash: claim.txHash,
      });
      claimCount++;
    } catch (err) {
      results.push({
        sessionId: session.Id,
        claimableWei,
        claimableFormatted: morToFormatted(claimableWei),
        skipped: `claim_failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  return results;
}
