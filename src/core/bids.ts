// bids.ts — adjust_bid
// Pre-prepares new bid params before deleting old bid to minimize the gap where no bid exists.

import type { MorpheusClient } from "./client.js";
import type { BidResponse } from "./types.js";
import { morToFormatted, bidIsActive } from "./provider.js";

export interface AdjustBidParams {
  modelId: string;
  newPricePerSecondWei: string;
}

export interface AdjustBidResult {
  oldBidId: string;
  newBidId: string;
  oldPrice: string;
  newPrice: string;
  modelId: string;
}

/**
 * Adjust our bid price for a model.
 *
 * WARNING: There is a brief bid gap between DELETE and POST where the provider
 * has no active bid for this model. This is unavoidable in the current proxy-router API.
 * The gap is typically <1 second. Plan accordingly for high-traffic models.
 *
 * Strategy: Prepare all params before deleting, then POST immediately after DELETE.
 */
export async function adjustBid(
  client: MorpheusClient,
  params: AdjustBidParams
): Promise<AdjustBidResult> {
  const address = await client.getWalletAddress();

  // Find our current bid for this model
  const raw = await client.get<{ bids: BidResponse[] } | BidResponse[]>(
    `/blockchain/bids`,
    { modelId: params.modelId }
  );
  const bids = Array.isArray(raw) ? raw : (raw as { bids: BidResponse[] }).bids ?? [];
  const myBid = bids.find(
    (b) =>
      b.Provider.toLowerCase() === address.toLowerCase() && bidIsActive(b)
  );

  if (!myBid) {
    throw new Error(
      `No active bid found for model ${params.modelId} by provider ${address}. ` +
        "Use add_model to create a new bid."
    );
  }

  // Pre-prepare new bid params (no network call, just capture values)
  const newBidParams = {
    modelId: params.modelId,
    pricePerSecond: params.newPricePerSecondWei,
  };

  const oldBidId = myBid.Id;
  const oldPrice = morToFormatted(myBid.PricePerSecond);

  // DELETE old bid, then immediately POST new bid to minimize gap
  await client.delete(`/blockchain/bids/${oldBidId}`);
  const newBid = await client.post<{ id: string }>("/blockchain/bids", newBidParams);

  return {
    oldBidId,
    newBidId: newBid.id,
    oldPrice,
    newPrice: morToFormatted(params.newPricePerSecondWei),
    modelId: params.modelId,
  };
}
