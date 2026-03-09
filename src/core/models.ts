// models.ts — list_models, add_model, remove_model
// remove_model requires confirm: "DELETE_MODEL_<first8chars>" to prevent accidents.

import type { MorpheusClient } from "./client.js";
import type {
  ModelResponse,
  BidResponse,
  ModelInfo,
} from "./types.js";
import { morToFormatted, bidIsActive } from "./provider.js";

/** Format a model response with bid info for our wallet */
async function enrichModel(
  client: MorpheusClient,
  model: ModelResponse,
  address: string
): Promise<ModelInfo> {
  let activeBids = 0;
  let myBid: ModelInfo["myBid"] = undefined;

  try {
    const raw = await client.get<{ bids: BidResponse[] } | BidResponse[]>(
      `/blockchain/models/${model.Id}/bids`
    );
    const bids = Array.isArray(raw) ? raw : (raw as { bids: BidResponse[] }).bids ?? [];
    const active = bids.filter(bidIsActive);
    activeBids = active.length;
    const mine = active.find(
      (b) => b.Provider.toLowerCase() === address.toLowerCase()
    );
    if (mine) {
      myBid = {
        id: mine.Id,
        pricePerSecond: morToFormatted(mine.PricePerSecond),
        pricePerSecondWei: mine.PricePerSecond,
        createdAt: String(mine.CreatedAt),
      };
    }
  } catch {
    // Bids endpoint may fail for some models
  }

  // API may return Fee/Stake as number or string
  const feeStr = String(model.Fee);
  const stakeStr = String(model.Stake);

  return {
    id: model.Id,
    name: model.Name,
    ipfsCID: model.IpfsCID,
    pricePerSecond: morToFormatted(feeStr),
    pricePerSecondWei: feeStr,
    stake: morToFormatted(stakeStr),
    isDeleted: model.IsDeleted,
    activeBids,
    myBid,
  };
}

/** List all non-deleted models registered on the Morpheus marketplace */
export async function listModels(client: MorpheusClient): Promise<ModelInfo[]> {
  const address = await client.getWalletAddress();
  const raw = await client.get<{ models: ModelResponse[] } | ModelResponse[]>("/blockchain/models");
  const models = Array.isArray(raw) ? raw : (raw as { models: ModelResponse[] }).models ?? [];
  const active = models.filter((m) => !m.IsDeleted);

  return Promise.all(active.map((m) => enrichModel(client, m, address)));
}

export interface AddModelParams {
  /** Model name as registered on blockchain */
  name: string;
  /** IPFS CID of the model card */
  ipfsCID: string;
  /** MOR stake amount in wei */
  stakeWei: string;
  /** Price per second in MOR wei */
  pricePerSecondWei: string;
  /** Backend API type: openai | claudeai | prodia-v2 | hyperbolic-sd | prodia-sd | prodia-sdxl */
  apiType: string;
  /** Backend base URL */
  apiUrl: string;
  /** Backend API key */
  apiKey: string;
  /** Model name on the backend (e.g. "glm-4-9b") */
  modelName?: string;
}

/** Register a model on the Morpheus marketplace and post an opening bid */
export async function addModel(
  client: MorpheusClient,
  params: AddModelParams
): Promise<{ modelId: string; bidId: string }> {
  // POST /blockchain/models — registers model on-chain
  const modelRes = await client.post<{ id: string }>("/blockchain/models", {
    ipfsCID: params.ipfsCID,
    fee: params.stakeWei,
    addStake: params.stakeWei,
    name: params.name,
    tags: [],
    apiType: params.apiType,
    apiUrl: params.apiUrl,
    apiKey: params.apiKey,
    modelName: params.modelName ?? params.name,
  });

  const modelId = modelRes.id;

  // POST /blockchain/bids — sets our price for this model
  const bidRes = await client.post<{ id: string }>("/blockchain/bids", {
    modelId,
    pricePerSecond: params.pricePerSecondWei,
  });

  return { modelId, bidId: bidRes.id };
}

export interface RemoveModelParams {
  modelId: string;
  /** Must be "DELETE_MODEL_<first8chars>" to confirm deletion */
  confirm: string;
}

/**
 * Remove a model and all our bids for it.
 * Requires confirm: "DELETE_MODEL_<first8chars_of_modelId>" to prevent accidents.
 */
export async function removeModel(
  client: MorpheusClient,
  params: RemoveModelParams
): Promise<{ removed: true; bidsRemoved: number }> {
  const expected = `DELETE_MODEL_${params.modelId.slice(0, 8)}`;
  if (params.confirm !== expected) {
    throw new Error(
      `Confirmation mismatch. To confirm deletion of model ${params.modelId}, ` +
        `pass confirm: "${expected}"`
    );
  }

  const address = await client.getWalletAddress();

  // Get all bids for this model and delete ours
  let bidsRemoved = 0;
  try {
    const raw = await client.get<{ bids: BidResponse[] } | BidResponse[]>(
      `/blockchain/models/${params.modelId}/bids`
    );
    const bids = Array.isArray(raw) ? raw : (raw as { bids: BidResponse[] }).bids ?? [];
    const myBids = bids.filter(
      (b) => b.Provider.toLowerCase() === address.toLowerCase() && bidIsActive(b)
    );
    for (const bid of myBids) {
      await client.delete(`/blockchain/bids/${bid.Id}`);
      bidsRemoved++;
    }
  } catch {
    // Continue even if bid cleanup fails
  }

  // DELETE the model itself
  await client.delete(`/blockchain/models/${params.modelId}`);

  return { removed: true, bidsRemoved };
}
