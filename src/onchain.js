import { ethers } from "ethers";

// Shared on-chain read plumbing: per-chain providers with failover, a Multicall3 coalescer,
// chunked DexScreener pricing, and Blockscout wallet token discovery. Everything here is
// read-only — wallet-signing paths stay on BrowserProvider in the components.

export const MULTICALL3_ADDRESS = "0xcA11bde05977b3631167028862bE2a173976CA11";

const MULTICALL3_ABI = [
  "function aggregate3(tuple(address target, bool allowFailure, bytes callData)[] calls) view returns (tuple(bool success, bytes returnData)[] returnData)",
  "function getEthBalance(address addr) view returns (uint256 balance)",
  "function getBlockNumber() view returns (uint256 blockNumber)"
];

export const multicall3Interface = new ethers.Interface(MULTICALL3_ABI);

// Contract-shaped ref for mcall without paying an ABI parse per token address.
export const multicall3Ref = { target: MULTICALL3_ADDRESS, interface: multicall3Interface };

// Calls per aggregate3. 300 balance-sized reads is ~9M gas, comfortably under public
// eth_call gas caps; larger batches risk opaque "out of gas" failures on some RPCs.
const MULTICALL_MAX_BATCH = 300;
// One microtask turn is not enough to collect calls issued across awaited discovery steps,
// so the batcher waits a few ms and coalesces everything in flight.
const MULTICALL_FLUSH_DELAY_MS = 8;
const DEXSCREENER_BATCH_LIMIT = 30;
const BLOCKSCOUT_TOKENLIST_URL = "https://api.scan.pulsechain.com/api?module=account&action=tokenlist&address=";
// Pathological airdrop-farm wallets can hold thousands of spam tokens; cap what one wallet
// can add to the scan and report the truncation instead of silently dropping it.
export const DISCOVERY_MAX_TOKENS_PER_WALLET = 300;

const chainRpcState = new Map();
const multicallBatchers = new Map();

function getChainRpcState(chain) {
  let state = chainRpcState.get(chain.key);

  if (!state) {
    const urls = [...new Set(chain.rpcs?.length ? chain.rpcs : [chain.rpc])];

    state = {
      providers: urls.map((url) => new ethers.JsonRpcProvider(url, chain.chainId, {
        staticNetwork: true,
        // JSON-RPC batching is deliberately off: the public PulseChain RPC serves batches
        // serially, measuring ~4x slower than the same reads sent concurrently.
        batchMaxCount: 1
      })),
      active: 0
    };
    chainRpcState.set(chain.key, state);
  }

  return state;
}

export function getRpcProvider(chain) {
  const state = getChainRpcState(chain);
  return state.providers[state.active];
}

// A revert is an answer from a healthy node — only transport-level failures justify
// retrying the same read against the backup RPC.
function isRetriableRpcError(error) {
  return error?.code !== "CALL_EXCEPTION";
}

// Runs fn against the active provider, rotating to the backup on transport failure.
// The provider that answers becomes the sticky active one for subsequent reads.
export async function runOnChain(chain, fn) {
  const state = getChainRpcState(chain);
  const providerCount = state.providers.length;
  let lastError;

  for (let attempt = 0; attempt < providerCount; attempt += 1) {
    const index = (state.active + attempt) % providerCount;

    try {
      const result = await fn(state.providers[index]);
      state.active = index;
      return result;
    } catch (error) {
      lastError = error;

      if (!isRetriableRpcError(error)) {
        throw error;
      }
    }
  }

  throw lastError;
}

// Multicall3 coalescer. Callers issue ordinary-looking single reads; everything queued in
// the same few-ms window is packed into one aggregate3 eth_call (chunked at MULTICALL_MAX_BATCH)
// with per-call failure isolation, so one reverting token cannot poison the batch.
export function getMulticall(chain) {
  let batcher = multicallBatchers.get(chain.key);

  if (!batcher) {
    batcher = createMulticallBatcher(chain);
    multicallBatchers.set(chain.key, batcher);
  }

  return batcher;
}

function createMulticallBatcher(chain) {
  let pending = [];
  let timer = null;

  async function flushChunk(chunk, blockTag) {
    try {
      const calls = chunk.map((entry) => ({
        target: entry.target,
        allowFailure: true,
        callData: entry.callData
      }));
      const data = multicall3Interface.encodeFunctionData("aggregate3", [calls]);
      const request = { to: MULTICALL3_ADDRESS, data };

      if (blockTag !== "latest") {
        request.blockTag = blockTag;
      }

      const raw = await runOnChain(chain, (provider) => provider.call(request));
      const [results] = multicall3Interface.decodeFunctionResult("aggregate3", raw);

      chunk.forEach((entry, index) => {
        const { success, returnData } = results[index];

        if (!success) {
          entry.reject(new Error(`multicall reverted: ${entry.label}`));
          return;
        }

        try {
          const decoded = entry.iface.decodeFunctionResult(entry.fragment, returnData);
          // Match ethers contract-call behavior: unwrap single return values,
          // keep multi-output results addressable by name and index.
          entry.resolve(decoded.length === 1 ? decoded[0] : decoded);
        } catch (error) {
          entry.reject(error);
        }
      });
    } catch (error) {
      chunk.forEach((entry) => entry.reject(error));
    }
  }

  async function flush() {
    timer = null;
    const batch = pending;
    pending = [];

    // Historical reads at different heights cannot share an aggregate — group by blockTag.
    const byBlockTag = new Map();

    for (const entry of batch) {
      const bucket = byBlockTag.get(entry.blockTag) || [];
      bucket.push(entry);
      byBlockTag.set(entry.blockTag, bucket);
    }

    const flushes = [];

    for (const [blockTag, entries] of byBlockTag) {
      for (let i = 0; i < entries.length; i += MULTICALL_MAX_BATCH) {
        flushes.push(flushChunk(entries.slice(i, i + MULTICALL_MAX_BATCH), blockTag));
      }
    }

    await Promise.all(flushes);
  }

  return function mcall(contractLike, fn, args = [], options = {}) {
    const iface = contractLike.interface;
    const fragment = iface.getFunction(fn);
    const callData = iface.encodeFunctionData(fragment, args);

    return new Promise((resolve, reject) => {
      pending.push({
        target: contractLike.target,
        iface,
        fragment,
        callData,
        blockTag: options.blockTag ?? "latest",
        resolve,
        reject,
        label: `${contractLike.target}.${fn}`
      });

      if (!timer) {
        timer = setTimeout(flush, MULTICALL_FLUSH_DELAY_MS);
      }
    });
  };
}

// Fixed-size worker pool for tasks that cannot be multicalled (HTTP APIs, event queries).
export async function runWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;

  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  });

  await Promise.all(workers);

  return results;
}

// DexScreener's tokens/v1 endpoint accepts at most 30 addresses per request; larger joined
// lists silently return partial data, so every caller must go through this chunker.
export async function fetchDexScreenerPairs(chainKey, addresses) {
  const chunks = [];

  for (let i = 0; i < addresses.length; i += DEXSCREENER_BATCH_LIMIT) {
    chunks.push(addresses.slice(i, i + DEXSCREENER_BATCH_LIMIT));
  }

  const results = await Promise.all(chunks.map(async (chunk) => {
    const response = await fetch(`https://api.dexscreener.com/tokens/v1/${chainKey}/${chunk.join(",")}`);

    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }

    const pairs = await response.json();
    return Array.isArray(pairs) ? pairs : [];
  }));

  return results.flat();
}

function clampDecimals(value) {
  const decimals = Number(value);
  return Number.isInteger(decimals) && decimals >= 0 && decimals <= 36 ? decimals : 18;
}

// Lists every PRC-20 a wallet holds via the PulseChain Blockscout API (the v2 API is
// currently broken upstream; v1 tokenlist works). Blockscout is only trusted for the token
// LIST and metadata — balances are re-read on-chain so the chain stays the source of truth.
export async function discoverWalletTokens(address) {
  const response = await fetch(`${BLOCKSCOUT_TOKENLIST_URL}${address}`);

  if (!response.ok) {
    throw new Error(`Blockscout responded ${response.status}`);
  }

  const payload = await response.json();
  const list = Array.isArray(payload?.result) ? payload.result : [];
  const erc20 = list.filter((token) => token?.type === "ERC-20" && ethers.isAddress(token.contractAddress));
  const nftTypes = new Set(["ERC-721", "ERC-1155"]);
  const nfts = list.filter((token) => nftTypes.has(token?.type) && ethers.isAddress(token.contractAddress));

  return {
    tokens: erc20.slice(0, DISCOVERY_MAX_TOKENS_PER_WALLET).map((token) => ({
      address: ethers.getAddress(token.contractAddress),
      symbol: String(token.symbol || "").slice(0, 20) || "?",
      name: String(token.name || "").slice(0, 64) || "Unknown token",
      decimals: clampDecimals(token.decimals)
    })),
    // NFT collections come back from the same call for free: name, symbol, and how many
    // the wallet holds. Token-by-token enumeration needs ERC721Enumerable, which most
    // collections skip, so the gallery works at collection granularity.
    nfts: nfts.slice(0, DISCOVERY_MAX_TOKENS_PER_WALLET).map((token) => ({
      address: ethers.getAddress(token.contractAddress),
      symbol: String(token.symbol || "").slice(0, 20) || "NFT",
      name: String(token.name || "").slice(0, 64) || "Unknown collection",
      type: token.type,
      count: Number(token.balance) || 0
    })),
    truncated: Math.max(0, erc20.length - DISCOVERY_MAX_TOKENS_PER_WALLET)
  };
}
