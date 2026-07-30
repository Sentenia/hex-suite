import { ethers } from "ethers";
import { getMulticall, getRpcProvider, multicall3Ref } from "./onchain.js";

// Historical net-worth backfill. Both public PulseChain RPCs serve full archive state
// (verified: eth_call and Multicall3 aggregate3 answer 700+ days back), so past balances
// come from balanceOf at historical blocks and past prices from PulseX pair reserves at
// the same blocks, anchored by the bridged-DAI/WPLS pool. No third-party price API.

const HEX_ADDRESS = "0x2b591e99afE9f32eAA6214f7B7629768c40Eeb39";
const HEX_LAUNCH_SECONDS = 1_575_331_200;
const SAMPLE_WORKERS = 3;

// Per-chain price plumbing: which factories to ask for pairs, which wrapped-native token
// prices everything, and which stable pool anchors USD.
const BACKFILL_CHAIN_CONFIG = {
  pulsechain: {
    factories: ["0x29eA7545DEf87022BAdc76323F373EA1e707C523", "0x1715a3E4A142d8b698131108995174F37aEBA10D"],
    wrappedNative: "0xA1077a294dDE1B09bB078844df40758a5D0f9a27",
    stable: { address: "0xefD766cCb38EaF1dfd701853BFCe31359239F305", decimals: 18 }
  },
  ethereum: {
    factories: ["0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f"],
    wrappedNative: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    stable: { address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", decimals: 6 }
  }
};

// The default public Ethereum RPCs refuse archive eth_call (publicnode 403s); these two
// free endpoints verified serving 365-day-old state. Keyed separately so the live
// Ethereum providers are untouched.
export const ETHEREUM_ARCHIVE_CHAIN = {
  key: "ethereum-archive",
  chainId: 1,
  rpcs: ["https://rpc.mevblocker.io", "https://eth-pokt.nodies.app"]
};

const factoryInterface = new ethers.Interface([
  "function getPair(address tokenA, address tokenB) view returns (address)"
]);
const pairInterface = new ethers.Interface([
  "function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)",
  "function totalSupply() view returns (uint256)",
  "function token0() view returns (address)",
  "function token1() view returns (address)"
]);
const balanceInterface = new ethers.Interface([
  "function balanceOf(address account) view returns (uint256)"
]);

async function resolveNativePair(mcall, config, token) {
  for (const factory of config.factories) {
    try {
      const pair = await mcall({ target: factory, interface: factoryInterface }, "getPair", [token, config.wrappedNative]);

      if (pair && pair !== ethers.ZeroAddress) {
        return String(pair);
      }
    } catch {
      // Try the other factory.
    }
  }

  return null;
}

// UniswapV2 pairs sort token0 by address, so orientation is static per pair.
function pairPriceUsd({ reserves, tokenAddress, tokenDecimals, config, nativeUsd }) {
  const tokenIsToken0 = tokenAddress.toLowerCase() < config.wrappedNative.toLowerCase();
  const tokenReserve = tokenIsToken0 ? reserves.reserve0 : reserves.reserve1;
  const nativeReserve = tokenIsToken0 ? reserves.reserve1 : reserves.reserve0;
  const tokenAmount = Number(ethers.formatUnits(tokenReserve, tokenDecimals));
  const nativeAmount = Number(ethers.formatUnits(nativeReserve, 18));

  if (!(tokenAmount > 0) || !(nativeAmount > 0)) {
    return 0;
  }

  return (nativeAmount / tokenAmount) * nativeUsd;
}

/**
 * Reconstructs whole-portfolio USD value at sampled historical blocks.
 *
 * Included: verified plain tokens + native PLS, held WPLS-paired LP tokens, and staked
 * HEX principal (currently visible stakes, active at each sample date).
 * Excluded by design: farm-staked positions, pending rewards, Ethereum-chain assets, LPs
 * with no WPLS side, and tokens with no PulseX WPLS pair — reported via skippedCount.
 */
export async function backfillNetWorthHistory({ chain, chainKey = "pulsechain", wallets, tokens, lpTokens, stakes, days = 365, sampleTimestamps = null, onProgress }) {
  const config = BACKFILL_CHAIN_CONFIG[chainKey];

  if (!config) {
    throw new Error(`No backfill config for chain ${chainKey}`);
  }

  const mcall = getMulticall(chain);
  const provider = getRpcProvider(chain);

  const anchorPair = await resolveNativePair(mcall, config, config.stable.address);

  if (!anchorPair) {
    throw new Error("No stable anchor pair found — cannot derive historical USD prices.");
  }

  // One malformed address must cost one token, not the whole run — encoding throws
  // synchronously and would otherwise kill every sample point.
  let skippedCount = 0;
  const normalizeEntries = (entries) => entries.flatMap((entry) => {
    if (!entry.address) {
      return [entry];
    }

    try {
      return [{ ...entry, address: ethers.getAddress(entry.address) }];
    } catch {
      skippedCount += 1;
      return [];
    }
  });

  tokens = normalizeEntries(tokens);
  lpTokens = normalizeEntries(lpTokens);

  // Static price routes, resolved once at the current block.
  const routeByToken = new Map();

  await Promise.all(tokens.filter((token) => token.address).map(async (token) => {
    const pair = await resolveNativePair(mcall, config, token.address);

    if (pair) {
      routeByToken.set(token.address.toLowerCase(), pair);
    } else {
      skippedCount += 1;
    }
  }));

  // A held LP is valued from its own reserves; that needs a WPLS side for the USD leg.
  const lpMeta = new Map();

  await Promise.all(lpTokens.map(async (lp) => {
    try {
      const ref = { target: lp.address, interface: pairInterface };
      const [token0, token1] = await Promise.all([mcall(ref, "token0"), mcall(ref, "token1")]);
      const wrappedNativeLower = config.wrappedNative.toLowerCase();
      const nativeSide = String(token0).toLowerCase() === wrappedNativeLower
        ? 0
        : String(token1).toLowerCase() === wrappedNativeLower ? 1 : -1;

      if (nativeSide >= 0) {
        lpMeta.set(lp.address.toLowerCase(), { nativeSide });
      } else {
        skippedCount += 1;
      }
    } catch {
      skippedCount += 1;
    }
  }));

  const hexPair = stakes.length > 0 ? await resolveNativePair(mcall, config, HEX_ADDRESS) : null;

  // Timestamp -> block via two anchors; PulseChain blocktime is stable enough that linear
  // interpolation lands within minutes, which is invisible at daily/weekly resolution.
  const latestBlock = await provider.getBlockNumber();
  const latestTs = (await provider.getBlock(latestBlock)).timestamp;
  const probeBlock = Math.max(1, latestBlock - 2_600_000);
  const probeTs = (await provider.getBlock(probeBlock)).timestamp;
  const secondsPerBlock = (latestTs - probeTs) / (latestBlock - probeBlock);
  const blockAt = (tsSeconds) => Math.max(1, Math.round(latestBlock - (latestTs - tsSeconds) / secondsPerBlock));

  // Monthly beyond a year, weekly inside it, daily for the last month. Callers merging
  // multiple chains pass the same explicit timestamps so per-chain points line up exactly.
  const sampleTimes = sampleTimestamps ?? [];

  if (!sampleTimestamps) {
    for (let day = days; day > 365; day -= 30) {
      sampleTimes.push(latestTs - day * 86_400);
    }

    for (let day = Math.min(days, 365); day > 30; day -= 7) {
      sampleTimes.push(latestTs - day * 86_400);
    }

    for (let day = 30; day >= 1; day -= 1) {
      sampleTimes.push(latestTs - day * 86_400);
    }
  }

  const points = [];
  let done = 0;
  let cursor = 0;

  await Promise.all(Array.from({ length: SAMPLE_WORKERS }, async () => {
    while (cursor < sampleTimes.length) {
      const index = cursor;
      cursor += 1;
      const ts = sampleTimes[index];
      const options = { blockTag: blockAt(ts) };

      try {
        // Everything for one sample point coalesces into one aggregate at that height.
        const anchorPromise = mcall({ target: anchorPair, interface: pairInterface }, "getReserves", [], options);
        const balancePromises = [];

        for (const wallet of wallets) {
          for (const token of tokens) {
            balancePromises.push((token.address
              ? mcall({ target: token.address, interface: balanceInterface }, "balanceOf", [wallet], options)
              : mcall(multicall3Ref, "getEthBalance", [wallet], options)
            ).then((balance) => ({ token, balance })).catch(() => null));
          }

          for (const lp of lpTokens) {
            if (lpMeta.has(lp.address.toLowerCase())) {
              balancePromises.push(
                mcall({ target: lp.address, interface: balanceInterface }, "balanceOf", [wallet], options)
                  .then((balance) => ({ lp, balance }))
                  .catch(() => null)
              );
            }
          }
        }

        const routePromises = new Map();

        for (const [tokenAddress, pair] of routeByToken) {
          routePromises.set(
            tokenAddress,
            mcall({ target: pair, interface: pairInterface }, "getReserves", [], options).catch(() => null)
          );
        }

        const lpPromises = new Map();

        for (const [lpAddress] of lpMeta) {
          const ref = { target: lpAddress, interface: pairInterface };
          lpPromises.set(lpAddress, Promise.all([
            mcall(ref, "getReserves", [], options),
            mcall(ref, "totalSupply", [], options)
          ]).catch(() => null));
        }

        const hexPromise = hexPair
          ? mcall({ target: hexPair, interface: pairInterface }, "getReserves", [], options).catch(() => null)
          : null;

        const anchor = await anchorPromise;
        const nativeIsToken0 = config.wrappedNative.toLowerCase() < config.stable.address.toLowerCase();
        const nativeReserve = nativeIsToken0 ? anchor.reserve0 : anchor.reserve1;
        const stableReserve = nativeIsToken0 ? anchor.reserve1 : anchor.reserve0;
        const nativeUsd = Number(ethers.formatUnits(stableReserve, config.stable.decimals))
          / Number(ethers.formatUnits(nativeReserve, 18));

        if (!(nativeUsd > 0)) {
          throw new Error("empty anchor");
        }

        const priceByToken = new Map([["native", nativeUsd]]);

        for (const [tokenAddress, promise] of routePromises) {
          const reserves = await promise;

          if (!reserves) {
            continue;
          }

          const token = tokens.find((entry) => entry.address && entry.address.toLowerCase() === tokenAddress);
          priceByToken.set(tokenAddress, pairPriceUsd({
            reserves,
            tokenAddress,
            tokenDecimals: token.decimals,
            config,
            nativeUsd
          }));
        }

        let totalUsd = 0;

        for (const read of await Promise.all(balancePromises)) {
          if (!read) {
            continue;
          }

          if (read.token) {
            const key = read.token.address ? read.token.address.toLowerCase() : "native";
            totalUsd += Number(ethers.formatUnits(read.balance, read.token.decimals)) * (priceByToken.get(key) || 0);
          } else if (read.lp) {
            const lpData = await lpPromises.get(read.lp.address.toLowerCase());

            if (!lpData || !(lpData[1] > 0n)) {
              continue;
            }

            const [reserves, supply] = lpData;
            const meta = lpMeta.get(read.lp.address.toLowerCase());
            const nativeSideReserve = meta.nativeSide === 0 ? reserves.reserve0 : reserves.reserve1;
            const poolTvlUsd = 2 * Number(ethers.formatUnits(nativeSideReserve, 18)) * nativeUsd;
            totalUsd += (Number(read.balance) / Number(supply)) * poolTvlUsd;
          }
        }

        if (hexPromise) {
          const hexReserves = await hexPromise;

          if (hexReserves) {
            const hexUsd = pairPriceUsd({ reserves: hexReserves, tokenAddress: HEX_ADDRESS, tokenDecimals: 8, config, nativeUsd });
            const hexDay = Math.floor((ts - HEX_LAUNCH_SECONDS) / 86_400);
            let stakedHearts = 0n;

            for (const stake of stakes) {
              const started = stake.lockedDay <= hexDay;
              const endedBy = stake.unlockedDay > 0 && stake.unlockedDay <= hexDay;

              if (started && !endedBy) {
                stakedHearts += stake.stakedHearts;
              }
            }

            totalUsd += Number(ethers.formatUnits(stakedHearts, 8)) * hexUsd;
          }
        }

        if (totalUsd > 0) {
          points.push({ t: ts * 1000, v: totalUsd, backfilled: true });
        }
      } catch (error) {
        // Point dropped — a pair or the multicall didn't exist at that height.
        if (typeof globalThis.__BACKFILL_DEBUG__ === "function") {
          globalThis.__BACKFILL_DEBUG__(error, ts, options.blockTag);
        }
      }

      done += 1;
      onProgress?.(done, sampleTimes.length);
    }
  }));

  points.sort((a, b) => a.t - b.t);

  return { points, skippedCount, sampleCount: sampleTimes.length };
}
