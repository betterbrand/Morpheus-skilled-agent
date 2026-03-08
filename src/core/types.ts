// All TypeScript interfaces for the Morpheus Node Manager.
// Wei values are represented as strings from the API (avoid BigInt serialization issues)
// but converted to BigInt for arithmetic comparisons.

export interface Config {
  apiUrl: string;
  apiUser: string;
  apiPassword: string;
  cookiePath?: string;
}

// --- Proxy-router API response types ---

export interface HealthcheckResponse {
  status: string;
}

export interface BlockResponse {
  block: number;
}

export interface WalletResponse {
  address: string;
}

export interface BalanceResponse {
  eth: string; // wei as string (lowercase keys from real API)
  mor: string; // wei as string
}

export interface ProviderResponse {
  Address: string;
  Stake: string; // wei
  Fee: number;   // basis points
  Endpoint: string;
  IsDeleted: boolean;
  CreatedAt: string;
}

export interface ModelResponse {
  Id: string;
  IpfsCID: string;
  Fee: number | string;   // wei per second (API returns number)
  Stake: number | string; // wei (API returns number)
  Owner: string;
  Name: string;
  Tags: string[] | null;
  IsDeleted: boolean;
}

export interface BidResponse {
  Id: string;
  ModelAgentId: string;
  Provider: string;
  PricePerSecond: string; // wei (always string in real API)
  Nonce: string | number;
  CreatedAt: string | number;
  DeletedAt: string | null; // "0" means not deleted (use bidIsActive() helper)
}

export interface SessionResponse {
  Id: string;
  Provider: string;
  User: string;
  ModelAgentId: string;
  BidId: string;
  Stake: string;      // wei
  CloseoutReceipt: string;
  CloseoutType: number;
  ProviderSig: string;
  UserSig: string;
  OpenedAt: string;
  EndsAt: string;
  ClosedAt: string | null;
  IsActive: boolean;
}

export interface ClaimableBalanceResponse {
  balance: string; // wei
}

export interface ClaimResponse {
  txHash: string;
}

// --- Tool result types (returned by core functions) ---

export interface NodeStatus {
  healthy: boolean;
  processAlive: boolean;
  blockchainConnected: boolean;
  latestBlock?: number;
  walletAddress?: string;
  ethBalance?: string;   // formatted (e.g. "0.05 ETH")
  morBalance?: string;   // formatted
  activeBids?: number;
  activeSessions?: number;
  providerRegistered?: boolean;
  error?: string;
}

export interface ModelInfo {
  id: string;
  name: string;
  ipfsCID: string;
  pricePerSecond: string; // formatted
  pricePerSecondWei: string;
  stake: string;          // formatted
  isDeleted: boolean;
  activeBids: number;
  myBid?: BidSummary;
}

export interface BidSummary {
  id: string;
  pricePerSecond: string; // formatted
  pricePerSecondWei: string;
  createdAt: string;
}

export interface EarningsSummary {
  sessionId: string;
  claimableWei: string;
  claimableFormatted: string;
  txHash?: string;
  skipped?: string;
}

export interface ProviderInfo {
  address: string;
  stake: string;       // formatted
  fee: number;         // basis points
  endpoint: string;
  registered: boolean;
  activeBids: BidSummary[];
}

export interface BalanceSummary {
  eth: string;  // formatted
  mor: string;  // formatted
  ethWei: string;
  morWei: string;
}

// --- Ops agent types ---

export interface OpsConfig {
  apiUrl: string;
  apiUser: string;
  apiPassword: string;
  checkIntervalMs: number;
  thresholds: {
    minMorWei: string; // BigInt string
    minEthWei: string; // BigInt string
  };
  autoClaim: boolean;
  maxClaimsPerCycle: number;
  autoRestart: boolean;
  maxConsecutiveRestarts: number;
  restartCommand?: string; // not used — hardcoded to systemctl/launchctl
  alerts: {
    webhookUrl: string;
    type: "telegram" | "slack" | "generic";
  };
  stateFile?: string;
  auditFile?: string;
  lockFile?: string;
}

export interface OpsState {
  lastClaimedAt: Record<string, number>; // sessionId -> unix timestamp
  consecutiveRestarts: number;
  consecutiveHealthyChecks: number;
  lastCheckAt: number;
}

export interface AuditEntry {
  ts: string;
  action: string;
  [key: string]: unknown;
}
