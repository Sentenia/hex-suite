import { useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  Clock,
  Coins,
  Copy,
  Download,
  Eye,
  EyeOff,
  ExternalLink,
  Image,
  Info,
  Layers,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  TrendingUp,
  Trash2,
  Wallet
} from "lucide-react";
import { ethers } from "ethers";
import FeatureMenu from "./FeatureMenu";
import {
  DISCOVERY_MAX_TOKENS_PER_WALLET,
  discoverWalletTokens,
  fetchDexScreenerPairs,
  getMulticall,
  getRpcProvider,
  multicall3Ref,
  runOnChain,
  runWithConcurrency
} from "./onchain";
import { backfillNetWorthHistory, ETHEREUM_ARCHIVE_CHAIN } from "./backfill";

const HEX_ADDRESS = "0x2b591e99afE9f32eAA6214f7B7629768c40Eeb39";
const HSI_MANAGER_ADDRESS = "0x8BD3d1472A656e312E94fB1BbdD599B8C51D18e3";
const ICSA_ADDRESS = "0xfc4913214444aF5c715cc9F7b52655e788A569ed";
const WAATSA_ADDRESS = "0x2520E62474bA3085693f856B3E93fa6C92a4EF48";
const WPLS_ADDRESS = "0xA1077a294dDE1B09bB078844df40758a5D0f9a27";
const WETH_ADDRESS = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
const PLSX_ADDRESS = "0x95B303987A60C71504D99Aa1b13B4DA07b0790ab";
const INC_ADDRESS = "0x2fa878Ab3F87CC1C9737Fc071108F904c0B0C95d";
const PRVX_ADDRESS = "0xF6f8Db0aBa00007681F8fAF16A0FDa1c9B030b11";
const PULSE_EHEX_ADDRESS = "0x57fde0a71132198BBeC939B98976993d8D89D225";
const PDAI_ADDRESS = "0x6B175474E89094C44Da98b954EedeAC495271d0F";
const BRIDGED_DAI_ADDRESS = "0xefD766cCb38EaF1dfd701853BFCe31359239F305";
const BRIDGED_USDC_ADDRESS = "0x15D38573d2feeb82e7ad5187aB8c1D52810B1f07";
const BRIDGED_USDT_ADDRESS = "0x0Cb6F5a34ad42ec934882A05265A7d5F59b51A2f";
const BRIDGED_WETH_ADDRESS = "0x02DcdD04e3F455D838cd1249292C58f3B79e3C3C";
const BRIDGED_WBTC_ADDRESS = "0xb17D901469B9208B17d916112988A3FeD19b5cA1";
const PCOCK_ADDRESS = "0xc10A4Ed9b4042222d69ff0B374eddd47ed90fC1F";
const ATROPA_ADDRESS = "0xCc78A0acDF847A2C1714D2A925bB4477df5d48a6";
const PTGC_ADDRESS = "0x94534EeEe131840b1c0F61847c572228bdfDDE93";
const PDAI_PRINTER_ADDRESS = "0x770CFA2FB975E7bCAEDDe234D92c3858C517Adca";
const MOST_ADDRESS = "0xe33a5AE21F93aceC5CfC0b7b0FDBB65A0f0Be5cC";
const TEDDY_BEAR_ADDRESS = "0xd6c31bA0754C4383A41c0e9DF042C62b5e918f6d";
const SOIL_ADDRESS = "0xbd63FA573A120013804e51B46C56F9b3e490f53C";
const HELGO_ADDRESS = "0x0567CA0dE35606E9C260CC2358404B11DE21DB44";
const NINE_MM_ADDRESS = "0x7b39712Ef45F7dcED2bBDF11F3D5046bA61dA719";
const PMINT_ADDRESS = "0xFf640cBd35A618Df1348D861B5e47f7eaB05b422";
const HDRN_ADDRESS = "0x3819f64f282bf135d62168C1e513280dAF905e06";
const PTS_ADDRESS = "0x2A06a971fE6ffa002fd242d437E3db2b5cC5B433";
const PNAS_ADDRESS = "0xB709276c0e8d3A5372A13d4fEA886496F396feA1";
const HEX_LAUNCH_SECONDS = 1575331200;
const SECONDS_PER_DAY = 86400;
const HEARTS_PER_HEX = 100_000_000n;
const HEARTS_PER_TSHARE = 1_000_000_000_000n;
const SHARE_RATE_SCALE = 100_000n;
// HEX _stakeStartBonusHearts: LPB = hearts * min(stakedDays - 1, 3640) / 1820 (200% max at 3641+ days).
const LPB_EXTRA_DAYS_CAP = 3640;
const LPB_DENOMINATOR = 1820n;
const BIGGER_PAYS_BETTER_MAX_HEX = 150_000_000n;
const BIGGER_PAYS_BETTER_MAX_HEARTS = BIGGER_PAYS_BETTER_MAX_HEX * HEARTS_PER_HEX;
const BIGGER_PAYS_BETTER_MAX_BPS = 1_000n;
const BONUS_BPS = 10_000n;
const MAX_PORTFOLIO_WALLETS = 25;
const MAX_STAKES_PER_SOURCE = 200;
const MAX_NFTS_PER_COLLECTION = 100;
const NFT_EVENT_FALLBACK_BLOCKS = 2_000_000;
const PORTFOLIO_TOKEN_PAGE_SIZE = 6;
const UNVERIFIED_TOKEN_PAGE_SIZE = 10;
// Event queries can't ride the multicall; keep them behind a shared in-flight cap.
const SCAN_RPC_CONCURRENCY = 32;
// Parallel Blockscout requests. The explorer API rate-limits harder than the RPC.
const DISCOVERY_CONCURRENCY = 4;
// A discovered token only counts as priced when its best pair clears this floor;
// scam airdrops routinely fake a price with a few dollars of liquidity.
const DISCOVERED_MIN_LIQUIDITY_USD = 1_000;
// A holding "worth" more than a couple of pools could ever pay out is priced by fiction —
// scam tokens pass the liquidity floor, then multiply a fake price by a huge airdropped
// balance into trillion-dollar rows. Value above liquidity x this multiple demotes the row.
const DISCOVERED_EXIT_LIQUIDITY_MULTIPLE = 2;
// Cached rows from before liquidity was recorded have a price but no liquidity figure;
// until a refresh re-verifies them, anything above this stays unverified.
const DISCOVERED_STALE_VALUE_CAP_USD = 10_000;
const TOKEN_OVERRIDES_STORAGE_KEY = "pledge-token-overrides-v1";
const NEXT_UNLOCK_PAGE_SIZE = 5;
// Only these coins show in the Core trackers board (in this order). MARKET_TOKENS still
// fetches the full set because it doubles as the price feed for portfolio net worth.
const CORE_TRACKER_KEYS = ["pdai", "phex", "pls", "plsx", "inc", "prvx", "ehex", "icsa", "eth"];
const PORTFOLIO_STORAGE_KEY = "pledge-hex-stake-portfolio";
const PORTFOLIO_WALLET_BACKUP_STORAGE_KEY = "pledge-hex-stake-portfolio-wallet-backup-v1";
const PORTFOLIO_GROUPS_STORAGE_KEY = "pledge-hex-portfolio-groups-v1";
const LEGACY_ADDRESS_STORAGE_KEY = "pledge-stake-addresses";
const SCAN_CACHE_STORAGE_KEY = "pledge-hex-stake-scan-cache-v1";
const PORTFOLIO_HOLDINGS_CACHE_KEY = "pledge-hex-portfolio-holdings-cache-v1";
const WALLET_PRIVACY_STORAGE_KEY = "pledge-hide-wallet-info";
const HEX_PRIVACY_STORAGE_KEY = "pledge-hide-hex-amounts";
const MARKET_ETH_TOTALS_STORAGE_KEY = "pledge-include-eth-market-totals";
const STAKE_YIELD_STORAGE_KEY = "pledge-include-stake-yield";
const PDAI_TARGET_PRICE_STORAGE_KEY = "pledge-pdai-target-price";
const MOON_MATH_TARGET_OVERRIDES_STORAGE_KEY = "pledge-moon-math-target-overrides";
const MOON_MATH_MCAP_OVERRIDES_STORAGE_KEY = "pledge-moon-math-mcap-overrides";
const CUSTOM_CORE_TOKENS_STORAGE_KEY = "pledge-custom-core-tokens-v1";
const TSHARE_HISTORY_ENDPOINTS = {
  ethereum: "https://hexdailystats.com/fulldata",
  pulsechain: "https://hexdailystats.com/fulldatapulsechain"
};
const SOURCE_REPO_URL = "https://github.com/Sentenia/hex-suite";
// Vercel injects the deployed commit SHA (system env vars exposed to Vite builds), so the
// audit prompt pins the EXACT code this deployment was built from, not just the repo.
const SOURCE_COMMIT = import.meta.env.VITE_VERCEL_GIT_COMMIT_SHA || "main";
const VERIFY_AUDIT_PROMPT = `Please audit this open-source crypto portfolio tracker for malicious code: ${SOURCE_REPO_URL}/tree/${SOURCE_COMMIT}

It claims to be a fully client-side, read-only HEX/PulseChain portfolio viewer with no backend. Check specifically for:
1. Any code that sends wallet addresses, keys, or user data anywhere beyond read-only queries to public RPCs, Blockscout, DexScreener, and hexdailystats.
2. Wallet-drain patterns: unexpected token approvals, transaction rewriting, or recipient/address swaps in the transaction paths.
3. Obfuscated, encoded, or dynamically evaluated code.
4. Whether the transaction-signing flows (HEX stake start/end) do exactly what the UI claims and nothing else.

Report anything suspicious, or confirm it is safe to use as a watch-only portfolio tracker.`;

const BUY_PHEX_URL = "https://app.pulsex.com/swap";
const BUY_EHEX_URL = `https://app.uniswap.org/swap?outputCurrency=${HEX_ADDRESS}`;
const TSHARE_CHART_WIDTH = 920;
const TSHARE_CHART_HEIGHT = 320;
// Conservative bull-run ceiling for the cores. pDAI at $1 is ~$44B mcap; assume the
// other cores top out near $40B mcap, so each core's target = $40B / its supply.
const MOON_MATH_TARGET_MCAP = 40_000_000_000;
const MOON_MATH_TOKENS = [
  { key: "pdai", symbol: "pDAI", name: "Pulse DAI", priceKeys: ["pdai"], marketKey: "pdai", icon: "/token-icons/pdai.png" },
  { key: "hex", symbol: "HEX", name: "Pulse HEX", priceKeys: ["phex"], marketKey: "phex", icon: "/token-icons/phex.png", targetMcap: MOON_MATH_TARGET_MCAP },
  { key: "pls", symbol: "PLS", name: "Pulse", priceKeys: ["pls"], marketKey: "pls", icon: "/token-icons/pls.png", targetMcap: MOON_MATH_TARGET_MCAP },
  { key: "plsx", symbol: "PLSX", name: "PulseX", priceKeys: ["plsx"], marketKey: "plsx", icon: "/token-icons/plsx.png", targetMcap: MOON_MATH_TARGET_MCAP },
  { key: "inc", symbol: "INC", name: "Incentive", priceKeys: ["inc"], marketKey: "inc", icon: "/token-icons/inc.png", targetMcap: MOON_MATH_TARGET_MCAP },
  { key: "icsa", symbol: "ICSA", name: "Icosa", priceKeys: ["icsa"], marketKey: "icsa", icon: "/token-icons/icosa.png", targetMcap: 100_000_000 },
  { key: "prvx", symbol: "PRVX", name: "ProveX", priceKeys: ["prvx"], marketKey: "prvx", icon: "/token-icons/prvx.png", targetMcap: MOON_MATH_TARGET_MCAP },
  { key: "ehex", symbol: "eHEX", name: "Ethereum HEX", priceKeys: ["pehex", "ehex"], marketKey: "ehex", icon: "/token-icons/ehex.png", targetMcap: MOON_MATH_TARGET_MCAP / 4 },
  { key: "eth", symbol: "ETH", name: "Ethereum", priceKeys: ["eth"], marketKey: "eth", icon: "/token-icons/eth.png", defaultMultiple: 12 }
];

const CHAINS = [
  {
    key: "pulsechain",
    label: "PulseChain",
    shortLabel: "PLS",
    chainId: 369,
    walletChainId: "0x171",
    explorer: "https://scan.pulsechain.com/address/",
    rpc: import.meta.env.VITE_PULSECHAIN_RPC_URL || "https://rpc.pulsechain.com",
    // Ordered failover list; reads rotate to the next URL on transport errors.
    rpcs: [
      import.meta.env.VITE_PULSECHAIN_RPC_URL || "https://rpc.pulsechain.com",
      "https://rpc-pulsechain.g4mm4.io"
    ],
    nativeCurrency: { name: "Pulse", symbol: "PLS", decimals: 18 }
  },
  {
    key: "ethereum",
    label: "Ethereum",
    shortLabel: "ETH",
    chainId: 1,
    walletChainId: "0x1",
    explorer: "https://etherscan.io/address/",
    rpc: import.meta.env.VITE_ETHEREUM_RPC_URL || "https://ethereum-rpc.publicnode.com",
    rpcs: [
      import.meta.env.VITE_ETHEREUM_RPC_URL || "https://ethereum-rpc.publicnode.com",
      "https://cloudflare-eth.com"
    ],
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }
  }
];

const MARKET_TOKENS = [
  { key: "pdai", symbol: "pDAI", name: "Pulse DAI", chainKey: "pulsechain", address: PDAI_ADDRESS, icon: "/token-icons/pdai.png" },
  { key: "pdai-eth", symbol: "DAI.e", name: "Bridged DAI", chainKey: "pulsechain", address: BRIDGED_DAI_ADDRESS, icon: "/token-icons/dai.svg" },
  { key: "usdc", symbol: "USDC", name: "Bridged USDC", chainKey: "pulsechain", address: BRIDGED_USDC_ADDRESS },
  { key: "usdt", symbol: "USDT", name: "Bridged USDT", chainKey: "pulsechain", address: BRIDGED_USDT_ADDRESS },
  { key: "weth-pls", symbol: "WETH", name: "Bridged WETH", chainKey: "pulsechain", address: BRIDGED_WETH_ADDRESS },
  { key: "wbtc-pls", symbol: "WBTC", name: "Bridged WBTC", chainKey: "pulsechain", address: BRIDGED_WBTC_ADDRESS },
  { key: "phex", symbol: "HEX", name: "Pulse HEX", chainKey: "pulsechain", address: HEX_ADDRESS, icon: "/token-icons/phex.png" },
  { key: "pls", symbol: "PLS", name: "Pulse", chainKey: "pulsechain", address: WPLS_ADDRESS, note: "via WPLS", icon: "/token-icons/pls.png" },
  { key: "plsx", symbol: "PLSX", name: "PulseX", chainKey: "pulsechain", address: PLSX_ADDRESS, icon: "/token-icons/plsx.png" },
  { key: "inc", symbol: "INC", name: "Incentive", chainKey: "pulsechain", address: INC_ADDRESS, icon: "/token-icons/inc.png" },
  { key: "icsa", symbol: "ICSA", name: "Icosa", chainKey: "pulsechain", address: ICSA_ADDRESS, icon: "/token-icons/icosa.png" },
  { key: "prvx", symbol: "PRVX", name: "ProveX", chainKey: "pulsechain", address: PRVX_ADDRESS, icon: "/token-icons/prvx.png" },
  { key: "pehex", symbol: "eHEX", name: "Bridged eHEX", chainKey: "pulsechain", address: PULSE_EHEX_ADDRESS, icon: "/token-icons/ehex.png" },
  { key: "pcock", symbol: "PCOCK", name: "PulseChain Peacock", chainKey: "pulsechain", address: PCOCK_ADDRESS },
  { key: "atropa", symbol: "ATROPA", name: "Atropa", chainKey: "pulsechain", address: ATROPA_ADDRESS, icon: "/token-icons/atropa.svg" },
  { key: "ptgc", symbol: "pTGC", name: "The Grays Currency", chainKey: "pulsechain", address: PTGC_ADDRESS },
  { key: "printer", symbol: "PRINT", name: "pDAI Printer", chainKey: "pulsechain", address: PDAI_PRINTER_ADDRESS },
  { key: "most", symbol: "MOST", name: "MostWanted", chainKey: "pulsechain", address: MOST_ADDRESS },
  { key: "teddy", symbol: "TEDDY", name: "Teddy Bear", chainKey: "pulsechain", address: TEDDY_BEAR_ADDRESS },
  { key: "soil", symbol: "SOIL", name: "SUN Minimeal SOIL", chainKey: "pulsechain", address: SOIL_ADDRESS },
  { key: "helgo", symbol: "HELGO", name: "HELGO", chainKey: "pulsechain", address: HELGO_ADDRESS },
  { key: "nine-mm", symbol: "9MM", name: "9MM", chainKey: "pulsechain", address: NINE_MM_ADDRESS },
  { key: "pmint", symbol: "pMINT", name: "pMINT", chainKey: "pulsechain", address: PMINT_ADDRESS },
  { key: "hdrn", symbol: "HDRN", name: "Hedron", chainKey: "pulsechain", address: HDRN_ADDRESS, icon: "/token-icons/hdrn.svg" },
  { key: "pts", symbol: "PTS", name: "Piteas Token", chainKey: "pulsechain", address: PTS_ADDRESS },
  { key: "pnas", symbol: "pNAS", name: "Peacock Ninjas Against Society", chainKey: "pulsechain", address: PNAS_ADDRESS },
  { key: "ehex", symbol: "eHEX", name: "Ethereum HEX", chainKey: "ethereum", address: HEX_ADDRESS, icon: "/token-icons/ehex.png" },
  { key: "eth", symbol: "ETH", name: "Ethereum", chainKey: "ethereum", address: WETH_ADDRESS, icon: "/token-icons/eth.png" }
];

const PORTFOLIO_TOKENS = [
  { key: "native-pls", symbol: "PLS", name: "Pulse", chainKey: "pulsechain", native: true, decimals: 18, priceKey: "pls", icon: "/token-icons/pls.png" },
  { key: "pdai", symbol: "pDAI", name: "Pulse DAI", chainKey: "pulsechain", address: PDAI_ADDRESS, decimals: 18, priceKey: "pdai", icon: "/token-icons/pdai.png" },
  { key: "pdai-eth", symbol: "DAI.e", name: "Bridged DAI", chainKey: "pulsechain", address: BRIDGED_DAI_ADDRESS, decimals: 18, priceKey: "pdai-eth", icon: "/token-icons/dai.svg" },
  { key: "usdc", symbol: "USDC", name: "Bridged USDC", chainKey: "pulsechain", address: BRIDGED_USDC_ADDRESS, decimals: 6, priceKey: "usdc" },
  { key: "usdt", symbol: "USDT", name: "Bridged USDT", chainKey: "pulsechain", address: BRIDGED_USDT_ADDRESS, decimals: 6, priceKey: "usdt" },
  { key: "weth-pls", symbol: "WETH", name: "Bridged WETH", chainKey: "pulsechain", address: BRIDGED_WETH_ADDRESS, decimals: 18, priceKey: "weth-pls" },
  { key: "wbtc-pls", symbol: "WBTC", name: "Bridged WBTC", chainKey: "pulsechain", address: BRIDGED_WBTC_ADDRESS, decimals: 8, priceKey: "wbtc-pls" },
  { key: "phex", symbol: "HEX", name: "Pulse HEX", chainKey: "pulsechain", address: HEX_ADDRESS, decimals: 8, priceKey: "phex", icon: "/token-icons/phex.png" },
  { key: "plsx", symbol: "PLSX", name: "PulseX", chainKey: "pulsechain", address: PLSX_ADDRESS, decimals: 18, priceKey: "plsx", icon: "/token-icons/plsx.png" },
  { key: "inc", symbol: "INC", name: "Incentive", chainKey: "pulsechain", address: INC_ADDRESS, decimals: 18, priceKey: "inc", icon: "/token-icons/inc.png" },
  { key: "icsa", symbol: "ICSA", name: "Icosa", chainKey: "pulsechain", address: ICSA_ADDRESS, decimals: 9, priceKey: "icsa", icon: "/token-icons/icosa.png" },
  { key: "prvx", symbol: "PRVX", name: "ProveX", chainKey: "pulsechain", address: PRVX_ADDRESS, decimals: 18, priceKey: "prvx", icon: "/token-icons/prvx.png", showWhenZero: true },
  { key: "pehex", symbol: "eHEX", name: "Bridged eHEX", chainKey: "pulsechain", address: PULSE_EHEX_ADDRESS, decimals: 8, priceKey: "pehex", icon: "/token-icons/ehex.png" },
  { key: "pcock", symbol: "PCOCK", name: "PulseChain Peacock", chainKey: "pulsechain", address: PCOCK_ADDRESS, decimals: 18, priceKey: "pcock" },
  { key: "atropa", symbol: "ATROPA", name: "Atropa", chainKey: "pulsechain", address: ATROPA_ADDRESS, decimals: 18, priceKey: "atropa", icon: "/token-icons/atropa.svg" },
  { key: "ptgc", symbol: "pTGC", name: "The Grays Currency", chainKey: "pulsechain", address: PTGC_ADDRESS, decimals: 18, priceKey: "ptgc" },
  { key: "printer", symbol: "PRINT", name: "pDAI Printer", chainKey: "pulsechain", address: PDAI_PRINTER_ADDRESS, decimals: 18, priceKey: "printer" },
  { key: "most", symbol: "MOST", name: "MostWanted", chainKey: "pulsechain", address: MOST_ADDRESS, decimals: 18, priceKey: "most" },
  { key: "teddy", symbol: "TEDDY", name: "Teddy Bear", chainKey: "pulsechain", address: TEDDY_BEAR_ADDRESS, decimals: 18, priceKey: "teddy" },
  { key: "soil", symbol: "SOIL", name: "SUN Minimeal SOIL", chainKey: "pulsechain", address: SOIL_ADDRESS, decimals: 18, priceKey: "soil" },
  { key: "helgo", symbol: "HELGO", name: "HELGO", chainKey: "pulsechain", address: HELGO_ADDRESS, decimals: 18, priceKey: "helgo" },
  { key: "nine-mm", symbol: "9MM", name: "9MM", chainKey: "pulsechain", address: NINE_MM_ADDRESS, decimals: 18, priceKey: "nine-mm" },
  { key: "pmint", symbol: "pMINT", name: "pMINT", chainKey: "pulsechain", address: PMINT_ADDRESS, decimals: 18, priceKey: "pmint" },
  { key: "hdrn", symbol: "HDRN", name: "Hedron", chainKey: "pulsechain", address: HDRN_ADDRESS, decimals: 18, priceKey: "hdrn", icon: "/token-icons/hdrn.svg" },
  { key: "pts", symbol: "PTS", name: "Piteas Token", chainKey: "pulsechain", address: PTS_ADDRESS, decimals: 18, priceKey: "pts" },
  { key: "pnas", symbol: "pNAS", name: "Peacock Ninjas Against Society", chainKey: "pulsechain", address: PNAS_ADDRESS, decimals: 18, priceKey: "pnas" },
  { key: "ehex", symbol: "eHEX", name: "Ethereum HEX", chainKey: "ethereum", address: HEX_ADDRESS, decimals: 8, priceKey: "ehex", icon: "/token-icons/ehex.png" },
  { key: "native-eth", symbol: "ETH", name: "Ethereum", chainKey: "ethereum", native: true, decimals: 18, priceKey: "eth", icon: "/token-icons/eth.png" }
];

// A token's real identity is its contract on its chain — not its key or symbol. Two entries
// sharing this are the same holding and must never render as two rows. positionTag separates
// different positions in the same contract (held LP vs farm-staked LP vs pending rewards).
function tokenIdentity(token) {
  const base = token?.native
    ? `${token.chainKey}:native`
    : `${token.chainKey}:${String(token?.address || "").toLowerCase()}`;

  return token?.positionTag ? `${base}:${token.positionTag}` : base;
}

const BUILT_IN_TOKEN_IDENTITIES = new Set(
  [...MARKET_TOKENS, ...PORTFOLIO_TOKENS].map(tokenIdentity)
);

// Keeps the first entry for each identity. Built-in lists are passed first so a user-added
// token never shadows the curated symbol, icon, and decimals.
function dedupeTokensByIdentity(tokens) {
  const seen = new Set();

  return tokens.filter((token) => {
    const identity = tokenIdentity(token);

    if (seen.has(identity)) {
      return false;
    }

    seen.add(identity);
    return true;
  });
}

const HEX_ABI = [
  "function currentDay() view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
  "function globals() view returns (uint72 lockedHeartsTotal, uint72 nextStakeSharesTotal, uint40 shareRate, uint72 stakePenaltyTotal, uint16 dailyDataCount, uint72 stakeSharesTotal)",
  "function dailyData(uint256 day) view returns (uint72 dayPayoutTotal, uint72 dayStakeSharesTotal, uint56 dayUnclaimedSatoshisTotal)",
  "function stakeCount(address stakerAddr) view returns (uint256)",
  "function stakeStart(uint256 newStakedHearts, uint256 newStakedDays)",
  "function stakeEnd(uint256 stakeIndex, uint40 stakeIdParam)",
  "function stakeLists(address stakerAddr, uint256 index) view returns (uint40 stakeId, uint72 stakedHearts, uint72 stakeShares, uint16 lockedDay, uint16 stakedDays, uint16 unlockedDay, bool isAutoStake)"
];

const HSI_MANAGER_ABI = [
  "function hsiCount(address user) view returns (uint256)",
  "function hsiLists(address user, uint256 index) view returns (address)",
  "function stakeCount(address user) view returns (uint256)",
  "function stakeLists(address user, uint256 hsiIndex) view returns (tuple(uint40 stakeId, uint72 stakedHearts, uint72 stakeShares, uint16 lockedDay, uint16 stakedDays, uint16 unlockedDay, bool isAutoStake) stake)"
];

const ERC721_ENUMERABLE_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)",
  "function tokenURI(uint256 tokenId) view returns (string)"
];

const ERC20_BALANCE_ABI = [
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)"
];

const ICSA_ABI = [
  "event NFTStakeStart(uint256 data, address indexed staker, uint96 indexed nftId, address indexed tokenAddress)",
  "event NFTStakeEnd(uint256 data, address indexed staker, uint96 indexed nftId)",
  "function nftStakes(uint256 tokenId) view returns (uint64 stakeStart, uint64 capitalAdded, uint120 stakePoints, bool isActive, uint80 payoutPreCapitalAddIcsa, uint80 payoutPreCapitalAddHdrn, uint80 stakeAmount, uint16 minStakeLength)"
];

function getChain(key) {
  return CHAINS.find((chain) => chain.key === key) || CHAINS[0];
}

// A shared gate for reads that fan out on several axes at once (chain x wallet x stake index).
// Nested pools would multiply into hundreds of in-flight calls, so the whole stake scan funnels
// through one limiter and holds a single global cap.
function createRpcLimiter(limit) {
  const queue = [];
  let active = 0;

  function pump() {
    while (active < limit && queue.length > 0) {
      const { thunk, resolve, reject } = queue.shift();

      active += 1;
      thunk().then(resolve, reject).finally(() => {
        active -= 1;
        pump();
      });
    }
  }

  return (thunk) => new Promise((resolve, reject) => {
    queue.push({ thunk, resolve, reject });
    pump();
  });
}

// One parsed ABI shared by every token address; new ethers.Contract per token would re-parse it.
const erc20ReadInterface = new ethers.Interface(ERC20_BALANCE_ABI);
const hexReadInterface = new ethers.Interface(HEX_ABI);
const erc20SymbolInterface = new ethers.Interface(["function symbol() view returns (string)"]);
// UniswapV2-style pair surface. Real LPs answer token0/token1; everything else reverts.
const lpPairInterface = new ethers.Interface([
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)",
  "function totalSupply() view returns (uint256)"
]);

function formatLpUnderlyingAmount(amount) {
  return amount.toLocaleString(undefined, { maximumFractionDigits: amount >= 1 ? 2 : 6 });
}

function formatCompactNumber(value) {
  if (!Number.isFinite(value) || value <= 0) {
    return "—";
  }

  return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

// PulseX MasterChef (INC farm). Verified on-chain: poolLength/poolInfo/userInfo/pendingInc.
const MASTERCHEF_ADDRESS = "0xB2Ca4A66d3e57a5a9A12043B6bAD28249fE302d4";
const masterChefInterface = new ethers.Interface([
  "function poolLength() view returns (uint256)",
  "function poolInfo(uint256 pid) view returns (address lpToken, uint256 allocPoint, uint256 lastRewardTime, uint256 accIncPerShare)",
  "function userInfo(uint256 pid, address user) view returns (uint256 amount, uint256 rewardDebt)",
  "function pendingInc(uint256 pid, address user) view returns (uint256)"
]);
const masterChefRef = { target: MASTERCHEF_ADDRESS, interface: masterChefInterface };

// The pool list changes rarely; one read per session is plenty. Failed loads clear the
// cache so the next refresh retries instead of pinning an error forever.
let masterChefPoolsPromise = null;

function getMasterChefPools(mcall) {
  if (!masterChefPoolsPromise) {
    masterChefPoolsPromise = (async () => {
      const length = Number(await mcall(masterChefRef, "poolLength"));

      return Promise.all(Array.from({ length }, async (_, pid) => {
        const info = await mcall(masterChefRef, "poolInfo", [pid]);
        return { pid, lpToken: String(info.lpToken ?? info[0]).toLowerCase() };
      }));
    })().catch((error) => {
      masterChefPoolsPromise = null;
      throw error;
    });
  }

  return masterChefPoolsPromise;
}

// Cheap contract-shaped ref for the multicall batcher.
function erc20Ref(address) {
  return { target: address, interface: erc20ReadInterface };
}

// Known tokens carry their decimals, so only user-added tokens cost a call. The promise (not the
// value) is cached so concurrent reads of the same token share one request.
const tokenDecimalsCache = new Map();

function resolveTokenDecimals(chain, token) {
  if (Number.isInteger(token.decimals)) {
    return Promise.resolve(token.decimals);
  }

  const cacheKey = `${token.chainKey}:${String(token.address).toLowerCase()}`;
  const cached = tokenDecimalsCache.get(cacheKey);

  if (cached) {
    return cached;
  }

  const pending = getMulticall(chain)(erc20Ref(token.address), "decimals")
    .then((value) => {
      const decimals = Number(value);
      return Number.isInteger(decimals) && decimals >= 0 && decimals <= 36 ? decimals : 18;
    })
    .catch(() => 18);

  tokenDecimalsCache.set(cacheKey, pending);

  return pending;
}

// User-added tokens for the Core trackers board. Only an address is stored — symbol, name,
// icon, and prices resolve live from the token's deepest DexScreener pair.
function loadCustomCoreTokens() {
  try {
    const stored = JSON.parse(window.localStorage.getItem(CUSTOM_CORE_TOKENS_STORAGE_KEY) || "[]");
    if (!Array.isArray(stored)) return [];

    const loaded = stored
      .filter((token) => token && ethers.isAddress(token.address))
      .map((token) => ({
        key: `custom-${String(token.address).toLowerCase()}`,
        symbol: "",
        name: "",
        chainKey: token.chainKey === "ethereum" ? "ethereum" : "pulsechain",
        address: ethers.getAddress(token.address),
        custom: true
      }));

    // A token added before it shipped as a built-in would otherwise show twice forever.
    // Dropping it here self-heals existing boards without the user having to notice.
    return dedupeTokensByIdentity(loaded)
      .filter((token) => !BUILT_IN_TOKEN_IDENTITIES.has(tokenIdentity(token)));
  } catch {
    return [];
  }
}

function saveCustomCoreTokens(tokens) {
  try {
    window.localStorage.setItem(
      CUSTOM_CORE_TOKENS_STORAGE_KEY,
      JSON.stringify(tokens.map((token) => ({ address: token.address, chainKey: token.chainKey })))
    );
  } catch {
    // Private mode etc. — additions still work for this session.
  }
}

function normalizeAddress(address) {
  try {
    return ethers.getAddress(address);
  } catch {
    return "";
  }
}

function parseAddresses(input) {
  const matches = input.match(/0x[a-fA-F0-9]{40}/g) || [];
  const normalized = matches.map(normalizeAddress).filter(Boolean);
  return [...new Set(normalized)];
}

function walletRowId() {
  return `wallet-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createWalletRow({ address = "", id = "", name = "" }) {
  const normalizedAddress = normalizeAddress(address);
  const trimmedAddress = String(address || "").trim();

  return {
    id: id || normalizedAddress || walletRowId(),
    name: String(name || "").trim(),
    address: normalizedAddress || trimmedAddress
  };
}

function normalizeWalletRows(rows) {
  const seenAddresses = new Set();

  return rows
    .map((row) => {
      if (typeof row === "string") {
        return createWalletRow({ address: row });
      }

      return createWalletRow(row || {});
    })
    .filter((row) => row.address || row.name)
    .filter((row) => {
      const normalizedAddress = normalizeAddress(row.address);

      if (!normalizedAddress) {
        return true;
      }

      const key = normalizedAddress.toLowerCase();

      if (seenAddresses.has(key)) {
        return false;
      }

      seenAddresses.add(key);
      return true;
    });
}

function loadPortfolio() {
  try {
    const stored = window.localStorage.getItem(PORTFOLIO_STORAGE_KEY);

    if (stored) {
      const parsed = JSON.parse(stored);

      if (Array.isArray(parsed.wallets)) {
        return {
          wallets: normalizeWalletRows(parsed.wallets)
        };
      }

      return {
        wallets: Array.isArray(parsed.addresses)
          ? normalizeWalletRows(parseAddresses(parsed.addresses.join("\n")))
          : []
      };
    }
  } catch {
    // Fall back to the legacy address list below.
  }

  const legacyAddresses = parseAddresses(window.localStorage.getItem(LEGACY_ADDRESS_STORAGE_KEY) || "");
  return {
    wallets: normalizeWalletRows(legacyAddresses)
  };
}

function loadPortfolioWalletBackup() {
  try {
    const stored = window.localStorage.getItem(PORTFOLIO_WALLET_BACKUP_STORAGE_KEY);
    const parsed = stored ? JSON.parse(stored) : null;
    return Array.isArray(parsed?.wallets) ? normalizeWalletRows(parsed.wallets) : [];
  } catch {
    return [];
  }
}

function savePortfolioWalletBackup(wallets) {
  const incoming = normalizeWalletRows(wallets || []);

  if (incoming.length === 0) {
    return;
  }

  // Union with the existing backup instead of overwriting, so connecting a single wallet (e.g. a
  // burner) can never wipe the historical list. normalizeWalletRows dedupes by address, keeping the
  // first occurrence, so previously-saved names/wallets are preserved.
  let existing = [];

  try {
    const stored = window.localStorage.getItem(PORTFOLIO_WALLET_BACKUP_STORAGE_KEY);
    existing = stored ? normalizeWalletRows(JSON.parse(stored)?.wallets || []) : [];
  } catch {
    existing = [];
  }

  const merged = normalizeWalletRows([...existing, ...incoming]);

  try {
    window.localStorage.setItem(PORTFOLIO_WALLET_BACKUP_STORAGE_KEY, JSON.stringify({
      cachedAt: Date.now(),
      wallets: merged
    }));
  } catch {
    // Ignore storage quota/private browsing failures.
  }
}

function loadPortfolioGroups() {
  try {
    const stored = window.localStorage.getItem(PORTFOLIO_GROUPS_STORAGE_KEY);
    const parsed = stored ? JSON.parse(stored) : null;

    if (!Array.isArray(parsed?.groups)) {
      return [];
    }

    return parsed.groups
      .map((group) => ({
        id: group.id || `group-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        name: String(group.name || "").trim(),
        wallets: normalizeWalletRows(group.wallets || [])
      }))
      .filter((group) => group.name && group.wallets.length > 0);
  } catch {
    return [];
  }
}

function savePortfolioGroups(groups) {
  try {
    window.localStorage.setItem(PORTFOLIO_GROUPS_STORAGE_KEY, JSON.stringify({ groups }));
  } catch {
    // Ignore storage failures. The groups still work for this session.
  }
}

function collectRecoverableWallets({ backupWallets = [], rows = [], nftRows = [], summaryRows = [], holdingRows = [] }) {
  const walletMap = new Map();

  function addWallet(address, name = "") {
    const normalizedAddress = normalizeAddress(address);

    if (!normalizedAddress) {
      return;
    }

    const key = normalizedAddress.toLowerCase();
    const current = walletMap.get(key);
    const walletName = String(name || "").trim();

    walletMap.set(key, createWalletRow({
      address: normalizedAddress,
      name: current?.name || walletName || shortAddress(normalizedAddress)
    }));
  }

  backupWallets.forEach((wallet) => addWallet(wallet.address, wallet.name));
  rows.forEach((row) => addWallet(row.address, row.walletName));
  nftRows.forEach((row) => addWallet(row.address, row.walletName));
  summaryRows.forEach((row) => addWallet(row.address, row.walletName));
  holdingRows.forEach((row) => addWallet(row.walletAddress, row.walletLabel));

  return [...walletMap.values()];
}

function serializeStakeRow(row) {
  return {
    ...row,
    chain: row.chain?.key,
    unlockDate: row.unlockDate instanceof Date ? row.unlockDate.toISOString() : row.unlockDate,
    stakedHearts: row.stakedHearts?.toString?.() || "0",
    stakeShares: row.stakeShares?.toString?.() || "0"
  };
}

function hydrateStakeRow(row) {
  const chain = getChain(row.chain?.key || row.chain || "pulsechain");
  const unlockDate = row.unlockDate ? new Date(row.unlockDate) : hexDayToDate(Number(row.unlockDay || 0));

  return {
    ...row,
    chain,
    unlockDate,
    stakedHearts: BigInt(row.stakedHearts || 0),
    stakeShares: BigInt(row.stakeShares || 0)
  };
}

function serializeNftRow(row) {
  return {
    ...row,
    chain: row.chain?.key
  };
}

function hydrateNftRow(row) {
  return {
    ...row,
    chain: getChain(row.chain?.key || row.chain || "pulsechain")
  };
}

function serializeSummaryRow(row) {
  return {
    ...row,
    chain: row.chain?.key,
    liquidHearts: row.liquidHearts?.toString?.() || "0"
  };
}

function hydrateSummaryRow(row) {
  return {
    ...row,
    chain: getChain(row.chain?.key || row.chain || "pulsechain"),
    liquidHearts: BigInt(row.liquidHearts || 0)
  };
}

function sanitizeScanWarnings(warnings) {
  return warnings.filter((warning) => !/NFT scan failed:|could not coalesce/i.test(warning));
}

function loadScanCache() {
  try {
    const stored = window.localStorage.getItem(SCAN_CACHE_STORAGE_KEY);

    if (!stored) {
      return null;
    }

    const parsed = JSON.parse(stored);

    return {
      cachedAt: Number(parsed.cachedAt || 0),
      rows: Array.isArray(parsed.rows) ? parsed.rows.map(hydrateStakeRow) : [],
      nftRows: Array.isArray(parsed.nftRows) ? parsed.nftRows.map(hydrateNftRow) : [],
      summaryRows: Array.isArray(parsed.summaryRows) ? parsed.summaryRows.map(hydrateSummaryRow) : [],
      scanChainDays: parsed.scanChainDays && typeof parsed.scanChainDays === "object" ? parsed.scanChainDays : {},
      warnings: Array.isArray(parsed.warnings) ? sanitizeScanWarnings(parsed.warnings) : []
    };
  } catch {
    return null;
  }
}

function saveScanCache({ rows, nftRows, summaryRows, scanChainDays, warnings }) {
  try {
    window.localStorage.setItem(SCAN_CACHE_STORAGE_KEY, JSON.stringify({
      cachedAt: Date.now(),
      rows: rows.map(serializeStakeRow),
      nftRows: nftRows.map(serializeNftRow),
      summaryRows: summaryRows.map(serializeSummaryRow),
      scanChainDays,
      warnings
    }));
  } catch {
    // Ignore storage quota/private browsing failures. The live scan still works.
  }
}

function clearScanCache() {
  try {
    window.localStorage.removeItem(SCAN_CACHE_STORAGE_KEY);
  } catch {
    // Nothing to do.
  }
}

const PORTFOLIO_HISTORY_STORAGE_KEY = "pledge-portfolio-history-v1";
// Depth (in days) the archive backfill has completed to; bumping BACKFILL_TARGET_DAYS
// makes existing installs automatically deepen their history on next load.
const BACKFILL_DEPTH_STORAGE_KEY = "pledge-backfill-depth-v1";
const BACKFILL_TARGET_DAYS = 1_825;

function loadBackfillDepth() {
  try {
    const value = Number(window.localStorage.getItem(BACKFILL_DEPTH_STORAGE_KEY));
    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}
// Fine-grained points every 10 minutes for the recent week; older points compact to one
// per day. 3,000 points ≈ a week of 10-minute data plus ~5 years of daily history.
const PORTFOLIO_HISTORY_MIN_GAP_MS = 10 * 60 * 1000;
const PORTFOLIO_HISTORY_FINE_WINDOW_MS = 7 * 86_400_000;
const PORTFOLIO_HISTORY_MAX_POINTS = 3_000;

function loadPortfolioHistory() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(PORTFOLIO_HISTORY_STORAGE_KEY) || "[]");
    return Array.isArray(parsed)
      ? parsed.filter((point) => Number.isFinite(point?.t) && Number.isFinite(point?.v))
      : [];
  } catch {
    return [];
  }
}

function compactPortfolioHistory(history) {
  const cutoff = Date.now() - PORTFOLIO_HISTORY_FINE_WINDOW_MS;
  const dailyByDay = new Map();
  const recent = [];

  for (const point of history) {
    if (point.t >= cutoff) {
      recent.push(point);
    } else {
      // Last point of each older UTC day wins.
      dailyByDay.set(Math.floor(point.t / 86_400_000), point);
    }
  }

  return [...dailyByDay.values(), ...recent].slice(-PORTFOLIO_HISTORY_MAX_POINTS);
}

function appendPortfolioHistory(totalUsd) {
  const history = loadPortfolioHistory();
  const last = history[history.length - 1];
  const now = Date.now();

  if (last && now - last.t < PORTFOLIO_HISTORY_MIN_GAP_MS) {
    return history;
  }

  const next = compactPortfolioHistory([...history, { t: now, v: totalUsd }]);

  try {
    window.localStorage.setItem(PORTFOLIO_HISTORY_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage full/private mode — the in-memory copy still renders.
  }

  return next;
}

const PORTFOLIO_HISTORY_RANGES = [
  { key: "1w", label: "1W", days: 7 },
  { key: "1m", label: "1M", days: 30 },
  { key: "1y", label: "1Y", days: 365 },
  { key: "5y", label: "5Y", days: 1_825 },
  { key: "max", label: "Max", days: Infinity }
];

// Whole-portfolio net worth over time (all wallets, verified holdings + staked HEX).
// History accumulates from the day recording started — there is no backfill: nothing was
// snapshotting this portfolio before then, so long ranges fill in as time passes.
function formatTimelineDate(timestamp, spanMs) {
  const date = new Date(timestamp);

  if (spanMs > 180 * 86_400_000) {
    return date.toLocaleDateString(undefined, { month: "short", year: "2-digit" });
  }

  if (spanMs > 3 * 86_400_000) {
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function PortfolioHistoryChart({ points, formatValue, onBackfill, backfillBusy, backfillStatus, canBackfill }) {
  const [rangeKey, setRangeKey] = useState("max");
  const [hoveredIndex, setHoveredIndex] = useState(null);

  if (points.length === 0 && !canBackfill) {
    return null;
  }

  const range = PORTFOLIO_HISTORY_RANGES.find((entry) => entry.key === rangeKey) || PORTFOLIO_HISTORY_RANGES[4];
  const cutoff = Number.isFinite(range.days) ? Date.now() - range.days * 86_400_000 : 0;
  const visible = points.filter((point) => point.t >= cutoff);
  const firstPoint = points[0];
  const trackedDays = firstPoint ? Math.max(1, Math.round((Date.now() - firstPoint.t) / 86_400_000)) : 0;

  const width = 640;
  const height = 110;
  let body;
  let change = 0;

  if (visible.length >= 2) {
    const values = visible.map((point) => point.v);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const valueSpan = max - min || 1;
    const timeStart = visible[0].t;
    const timeSpan = visible[visible.length - 1].t - timeStart || 1;
    // x is proportional to TIME, not sample index — backfilled weekly points and dense
    // recent points would otherwise stretch the axis dishonestly.
    const xOf = (point) => ((point.t - timeStart) / timeSpan) * width;
    const yOf = (point) => height - 6 - ((point.v - min) / valueSpan) * (height - 12);
    const line = visible.map((point) => `${xOf(point).toFixed(1)},${yOf(point).toFixed(1)}`).join(" ");
    const area = `0,${height} ${line} ${width},${height}`;
    change = values[0] > 0 ? ((values[values.length - 1] - values[0]) / values[0]) * 100 : 0;
    const stroke = change >= 0 ? "#7ee0a3" : "#ff9d9d";

    const hovered = hoveredIndex !== null && hoveredIndex < visible.length ? visible[hoveredIndex] : null;
    const hoveredXPct = hovered ? ((hovered.t - timeStart) / timeSpan) * 100 : 0;
    const hoveredYPct = hovered ? (yOf(hovered) / height) * 100 : 0;

    const handlePointerMove = (event) => {
      const rect = event.currentTarget.getBoundingClientRect();
      const fraction = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
      const targetTime = timeStart + fraction * timeSpan;
      let nearest = 0;
      let nearestDistance = Infinity;

      for (let i = 0; i < visible.length; i += 1) {
        const distance = Math.abs(visible[i].t - targetTime);

        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearest = i;
        }
      }

      setHoveredIndex(nearest);
    };

    // Timeline ticks at even TIME fractions across the visible span.
    const ticks = [0, 1 / 3, 2 / 3, 1].map((fraction) => formatTimelineDate(timeStart + fraction * timeSpan, timeSpan));

    body = (
      <>
        <div
          className="portfolioHistoryPlot"
          onPointerMove={handlePointerMove}
          onPointerLeave={() => setHoveredIndex(null)}
        >
          <svg
            className="portfolioHistorySvg"
            viewBox={`0 0 ${width} ${height}`}
            preserveAspectRatio="none"
            role="img"
            aria-label={`Net worth chart, ${range.label} range, ${change >= 0 ? "up" : "down"} ${Math.abs(change).toFixed(1)} percent`}
          >
            <polygon points={area} fill={stroke} opacity="0.08" />
            <polyline points={line} fill="none" stroke={stroke} strokeWidth="1.8" vectorEffect="non-scaling-stroke" />
          </svg>
          {hovered && (
            <>
              <div className="portfolioHistoryCrosshair" style={{ left: `${hoveredXPct}%` }} />
              <div className="portfolioHistoryDot" style={{ left: `${hoveredXPct}%`, top: `${hoveredYPct}%` }} />
              <div
                className="portfolioHistoryTooltip"
                style={{ left: `${Math.min(88, Math.max(12, hoveredXPct))}%` }}
              >
                <strong>{formatValue(hovered.v)}</strong>
                <small>
                  {new Date(hovered.t).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
                  {timeSpan <= 3 * 86_400_000 ? ` ${new Date(hovered.t).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}` : ""}
                  {hovered.backfilled ? " · reconstructed" : ""}
                </small>
              </div>
            </>
          )}
        </div>
        <div className="portfolioHistoryTimeline" aria-hidden="true">
          {ticks.map((label, index) => <span key={index}>{label}</span>)}
        </div>
      </>
    );
  } else {
    body = (
      <p className="portfolioHistoryEmpty">
        {trackedDays > 0
          ? `Not enough history for this range yet — recording started ${trackedDays === 1 ? "today" : `${trackedDays.toLocaleString()} days ago`} and a snapshot is saved every 10 minutes you have the app open.`
          : "No history recorded yet."}
        {canBackfill ? " History back to your wallets' beginnings reconstructs automatically from onchain archive data." : ""}
      </p>
    );
  }

  return (
    <div className="portfolioHistoryChart">
      <div className="portfolioHistoryHead">
        <div className="portfolioHistoryMeta">
          {visible.length >= 2 && (
            <>
              <span className={change >= 0 ? "isUp" : "isDown"}>
                {change >= 0 ? "+" : ""}{change.toFixed(1)}%
              </span>
              <small>
                {formatValue(visible[0].v)} → {formatValue(visible[visible.length - 1].v)}
                {" · "}{new Date(visible[0].t).toLocaleDateString()}
              </small>
            </>
          )}
        </div>
        <div className="portfolioHistoryRanges" role="tablist" aria-label="Net worth range">
          {PORTFOLIO_HISTORY_RANGES.map((entry) => (
            <button
              key={entry.key}
              type="button"
              className={entry.key === range.key ? "isActive" : ""}
              onClick={() => {
                setRangeKey(entry.key);
                setHoveredIndex(null);
              }}
            >
              {entry.label}
            </button>
          ))}
          {canBackfill && (
            <button
              type="button"
              className="portfolioBackfillButton"
              onClick={onBackfill}
              disabled={backfillBusy}
              title="Reconstruct up to a year of history from onchain archive state (balances and PulseX pool reserves at past blocks)"
            >
              {backfillBusy ? "Backfilling…" : "Backfill history"}
            </button>
          )}
        </div>
      </div>
      {body}
      {backfillStatus && <p className="portfolioBackfillStatus">{backfillStatus}</p>}
    </div>
  );
}

// Manual per-token verdicts, persisted across sessions. hidden: never shown; demoted:
// forced into the unverified section; trusted: exempt from the plausibility demotion.
function loadTokenOverrides() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(TOKEN_OVERRIDES_STORAGE_KEY) || "{}");
    const clean = (list) => (Array.isArray(list) ? list.filter((item) => typeof item === "string") : []);

    return { hidden: clean(parsed.hidden), demoted: clean(parsed.demoted), trusted: clean(parsed.trusted) };
  } catch {
    return { hidden: [], demoted: [], trusted: [] };
  }
}

function saveTokenOverrides(overrides) {
  try {
    window.localStorage.setItem(TOKEN_OVERRIDES_STORAGE_KEY, JSON.stringify(overrides));
  } catch {
    // Private mode etc. — verdicts still apply for this session.
  }
}

// True when a discovered holding's dollar value could not survive contact with its own pool.
function isImplausibleDiscoveredValue(row) {
  if (!(row.valueUsd > 0)) {
    return false;
  }

  const liquidityUsd = Number(row.liquidityUsd || 0);

  if (liquidityUsd > 0) {
    return row.valueUsd > liquidityUsd * DISCOVERED_EXIT_LIQUIDITY_MULTIPLE;
  }

  return row.valueUsd > DISCOVERED_STALE_VALUE_CAP_USD;
}

// The same contract must appear once per wallet. Cached rows can predate a token becoming
// built-in, so the built-in row wins and the stale user-added one is dropped.
function dedupeHoldingRows(rows) {
  const byIdentity = new Map();

  for (const row of rows) {
    const key = `${row.walletKey}:${tokenIdentity(row)}`;
    const existing = byIdentity.get(key);

    if (!existing || (existing.custom && !row.custom)) {
      byIdentity.set(key, row);
    }
  }

  return [...byIdentity.values()];
}

function serializeHoldingRow(row) {
  return {
    ...row,
    balance: row.balance?.toString?.() || "0",
    chain: row.chain?.key
  };
}

function hydrateHoldingRow(row) {
  return {
    ...row,
    balance: BigInt(row.balance || 0),
    chain: getChain(row.chain?.key || row.chain || "pulsechain")
  };
}

function loadPortfolioHoldingsCache() {
  try {
    const stored = window.localStorage.getItem(PORTFOLIO_HOLDINGS_CACHE_KEY);

    if (!stored) {
      return null;
    }

    const parsed = JSON.parse(stored);

    return {
      cachedAt: Number(parsed.cachedAt || 0),
      rows: Array.isArray(parsed.rows) ? dedupeHoldingRows(parsed.rows.map(hydrateHoldingRow)) : [],
      nfts: Array.isArray(parsed.nfts) ? parsed.nfts : []
    };
  } catch {
    return null;
  }
}

function savePortfolioHoldingsCache(rows, nfts = []) {
  try {
    window.localStorage.setItem(PORTFOLIO_HOLDINGS_CACHE_KEY, JSON.stringify({
      cachedAt: Date.now(),
      rows: rows.map(serializeHoldingRow),
      nfts
    }));
  } catch {
    // Ignore storage failures. The live value load still works.
  }
}

function clearPortfolioHoldingsCache() {
  try {
    window.localStorage.removeItem(PORTFOLIO_HOLDINGS_CACHE_KEY);
  } catch {
    // Nothing to do.
  }
}

function loadBooleanPreference(key, fallback = false) {
  try {
    const stored = window.localStorage.getItem(key);

    if (stored === null) {
      return fallback;
    }

    return stored === "true";
  } catch {
    return fallback;
  }
}

function saveBooleanPreference(key, value) {
  try {
    window.localStorage.setItem(key, value ? "true" : "false");
  } catch {
    // Ignore storage failures. The toggle still works for this session.
  }
}

function loadStringPreference(key, fallback = "") {
  try {
    const stored = window.localStorage.getItem(key);
    return stored === null ? fallback : stored;
  } catch {
    return fallback;
  }
}

function saveStringPreference(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore storage failures. The input still works for this session.
  }
}

function loadJsonPreference(key, fallback) {
  try {
    const stored = window.localStorage.getItem(key);
    const parsed = stored ? JSON.parse(stored) : fallback;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function saveJsonPreference(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage failures. The control still works for this session.
  }
}

function sanitizeDecimalInput(value) {
  const cleaned = String(value || "").replace(/[^0-9.]/g, "");
  const parts = cleaned.split(".");

  if (parts.length <= 2) {
    return cleaned;
  }

  return `${parts[0]}.${parts.slice(1).join("")}`;
}

function addUniqueWarning(warnings, message) {
  if (message && !warnings.includes(message)) {
    warnings.push(message);
  }
}

function toNumber(value) {
  return Number(value ?? 0);
}

function formatTokenUnits(value, decimals, maximumFractionDigits = 2) {
  const formatted = ethers.formatUnits(value ?? 0n, decimals);
  const [whole, fraction = ""] = formatted.split(".");
  const groupedWhole = BigInt(whole).toLocaleString();
  const trimmedFraction = fraction.slice(0, maximumFractionDigits).replace(/0+$/, "");
  return trimmedFraction ? `${groupedWhole}.${trimmedFraction}` : groupedWhole;
}

function formatUsd(value, maximumFractionDigits = 2) {
  const numeric = Number(value);

  if (!Number.isFinite(numeric) || numeric <= 0) {
    return "-";
  }

  if (numeric < 0.00000001) {
    return `$${numeric.toExponential(2)}`;
  }

  if (numeric < 1) {
    return `$${numeric.toLocaleString(undefined, { maximumFractionDigits: Math.max(6, maximumFractionDigits) })}`;
  }

  return `$${numeric.toLocaleString(undefined, { maximumFractionDigits })}`;
}

function formatCompactUsd(value) {
  const numeric = Number(value);

  if (!Number.isFinite(numeric) || numeric <= 0) {
    return "-";
  }

  return new Intl.NumberFormat(undefined, {
    compactDisplay: "short",
    maximumFractionDigits: 2,
    notation: "compact",
    style: "currency",
    currency: "USD"
  }).format(numeric);
}

function formatMoonPriceInput(value) {
  const numeric = Number(value);

  if (!Number.isFinite(numeric) || numeric <= 0) {
    return "";
  }

  const decimals = numeric >= 1
    ? 4
    : numeric >= 0.01
      ? 6
      : 10;

  return numeric.toFixed(decimals).replace(/0+$/, "").replace(/\.$/, "");
}

// Parse a market-cap input like "40B", "10b", "100M", "500k", or a plain number, into dollars.
function parseMcapValue(raw) {
  if (raw === undefined || raw === null) {
    return null;
  }

  const cleaned = String(raw).trim().replace(/[$,\s]/g, "");
  const match = cleaned.match(/^(\d*\.?\d+)([tbmk]?)$/i);

  if (!match) {
    return null;
  }

  const numeric = Number(match[1]);

  if (!Number.isFinite(numeric) || numeric < 0) {
    return null;
  }

  const multiplier = { t: 1e12, b: 1e9, m: 1e6, k: 1e3, "": 1 }[match[2].toLowerCase()];
  return numeric * multiplier;
}

// Format a dollar market cap into a compact editable string like "40B" or "100M".
function formatMcapValue(value) {
  const numeric = Number(value);

  if (!Number.isFinite(numeric) || numeric <= 0) {
    return "";
  }

  const trim = (amount) => amount.toLocaleString(undefined, { maximumFractionDigits: 2 });

  if (numeric >= 1e12) return `${trim(numeric / 1e12)}T`;
  if (numeric >= 1e9) return `${trim(numeric / 1e9)}B`;
  if (numeric >= 1e6) return `${trim(numeric / 1e6)}M`;
  if (numeric >= 1e3) return `${trim(numeric / 1e3)}K`;
  return trim(numeric);
}

function formatPercent(value) {
  if (value === null || value === undefined) {
    return "-";
  }

  const numeric = Number(value);

  if (!Number.isFinite(numeric)) {
    return "-";
  }

  return `${numeric > 0 ? "+" : ""}${numeric.toFixed(2)}%`;
}

function formatGasGwei(value) {
  if (!Number.isFinite(value) || value <= 0) {
    return "-";
  }

  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 2 })}M gwei`;
  }

  if (value >= 1_000) {
    return `${(value / 1_000).toLocaleString(undefined, { maximumFractionDigits: 1 })}k gwei`;
  }

  return `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })} gwei`;
}

function formatPlsAmount(value) {
  if (!Number.isFinite(value) || value <= 0) {
    return "-";
  }

  return `${value.toLocaleString(undefined, { maximumFractionDigits: value >= 1 ? 2 : 4 })} PLS`;
}

function formatBonusPercent(bonusHearts, principalHearts) {
  if (!principalHearts || principalHearts <= 0n || bonusHearts <= 0n) {
    return "0%";
  }

  const scaled = bonusHearts * 10_000n / principalHearts;
  return `${(Number(scaled) / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}%`;
}

function formatHexFromHearts(value, maximumFractionDigits = 2) {
  return `${formatTokenUnits(value, 8, maximumFractionDigits)} HEX`;
}

function formatTsharesFromShares(value, maximumFractionDigits = 4) {
  return `${formatTokenUnits(value, 12, maximumFractionDigits)} T-shares`;
}

function formatHexInputAmount(value) {
  return ethers.formatUnits(value ?? 0n, 8).replace(/\.?0+$/, "") || "0";
}

function parseStakeAmountHearts(amount) {
  const normalized = String(amount || "").trim();

  if (!normalized || Number(normalized) <= 0) {
    return null;
  }

  try {
    return ethers.parseUnits(normalized, 8);
  } catch {
    return null;
  }
}

function parseStakeDaysInput(days) {
  const parsed = Number.parseInt(days, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function calculateStakeBonuses(principalHearts, stakedDays) {
  const cappedExtraDays = stakedDays > 1 ? BigInt(Math.min(stakedDays - 1, LPB_EXTRA_DAYS_CAP)) : 0n;
  const longerBonusHearts = principalHearts * cappedExtraDays / LPB_DENOMINATOR;
  const cappedPrincipal = principalHearts > BIGGER_PAYS_BETTER_MAX_HEARTS
    ? BIGGER_PAYS_BETTER_MAX_HEARTS
    : principalHearts;
  const biggerBonusHearts = principalHearts * cappedPrincipal * BIGGER_PAYS_BETTER_MAX_BPS
    / (BIGGER_PAYS_BETTER_MAX_HEARTS * BONUS_BPS);
  const effectiveHearts = principalHearts + longerBonusHearts + biggerBonusHearts;

  return {
    biggerBonusHearts,
    effectiveHearts,
    longerBonusHearts
  };
}

function readHexResultValue(result, key, index) {
  return BigInt(result?.[key] ?? result?.[index] ?? 0);
}

function buildStakePayoutPreview({ metrics, principalHearts, stakedDays }) {
  if (!metrics || !principalHearts || !stakedDays || metrics.shareRate <= 0n) {
    return null;
  }

  const bonuses = calculateStakeBonuses(principalHearts, stakedDays);
  const stakeShares = bonuses.effectiveHearts * SHARE_RATE_SCALE / metrics.shareRate;
  const tShareRateHearts = HEARTS_PER_TSHARE * metrics.shareRate / SHARE_RATE_SCALE;
  const dailyPayoutHeartsPerTshare = metrics.dayStakeSharesTotal > 0n
    ? metrics.dayPayoutTotal * HEARTS_PER_TSHARE / metrics.dayStakeSharesTotal
    : 0n;
  const estimatedYieldHearts = dailyPayoutHeartsPerTshare * stakeShares * BigInt(stakedDays) / HEARTS_PER_TSHARE;
  const estimatedTotalHearts = principalHearts + estimatedYieldHearts;

  return {
    ...bonuses,
    dailyPayoutHeartsPerTshare,
    estimatedTotalHearts,
    estimatedYieldHearts,
    stakeShares,
    tShareRateHearts
  };
}

function getMarketPairScore(pair) {
  return Number(pair?.liquidity?.usd || 0) + Number(pair?.volume?.h24 || 0) * 0.2;
}

function getMarketPairSide(pair, token) {
  const address = token.address.toLowerCase();
  const base = pair?.baseToken?.address?.toLowerCase();
  const quote = pair?.quoteToken?.address?.toLowerCase();

  if (base === address) {
    return "base";
  }

  if (quote === address) {
    return "quote";
  }

  return "";
}

function getTokenPairPriceUsd(pair, token) {
  const side = getMarketPairSide(pair, token);
  const basePriceUsd = Number(pair?.priceUsd);

  if (!Number.isFinite(basePriceUsd) || basePriceUsd <= 0) {
    return null;
  }

  if (side === "base") {
    return basePriceUsd;
  }

  if (side === "quote") {
    const basePriceInQuote = Number(pair?.priceNative);

    if (Number.isFinite(basePriceInQuote) && basePriceInQuote > 0) {
      return basePriceUsd / basePriceInQuote;
    }
  }

  return null;
}

function pickBestMarketPair(pairs, token) {
  const exactPairs = pairs.filter((pair) => getMarketPairSide(pair, token));
  const basePairs = exactPairs.filter((pair) => getMarketPairSide(pair, token) === "base");
  const quotePairs = exactPairs.filter((pair) => getMarketPairSide(pair, token) === "quote" && getTokenPairPriceUsd(pair, token));
  const preferredPairs = basePairs.length > 0 ? basePairs : quotePairs;

  return preferredPairs.sort((a, b) => getMarketPairScore(b) - getMarketPairScore(a))[0];
}

function tokenFallbackLabel(symbol) {
  return String(symbol || "?").slice(0, 6);
}

function TokenAvatar({ icon, symbol }) {
  const [imageFailed, setImageFailed] = useState(false);

  if (icon && !imageFailed) {
    return <img src={icon} alt="" aria-hidden="true" onError={() => setImageFailed(true)} />;
  }

  return <span className="marketTokenFallback" aria-hidden="true">{tokenFallbackLabel(symbol)}</span>;
}

function marketRowFromPair(token, pair) {
  if (!pair) {
    return {
      ...token,
      symbol: token.symbol || `${String(token.address || "?").slice(0, 6)}…`,
      name: token.name || "Custom token",
      chain: getChain(token.chainKey),
      status: "No pair found",
      priceUsd: null,
      liquidityUsd: null,
      marketCap: null,
      volume24h: null,
      change24h: null
    };
  }

  const orientation = getMarketPairSide(pair, token);
  const pairSymbol = `${pair.baseToken?.symbol || "?"}/${pair.quoteToken?.symbol || "?"}`;
  const tokenPriceUsd = getTokenPairPriceUsd(pair, token);
  const tokenMarketCap = orientation === "base" ? Number(pair.marketCap || pair.fdv || 0) : null;
  const tokenChange24h = orientation === "base" ? pair.priceChange?.h24 : null;
  const remoteIcon = orientation === "base" && typeof pair.info?.imageUrl === "string"
    ? pair.info.imageUrl
    : "";
  const pairSideToken = orientation === "quote" ? pair.quoteToken : pair.baseToken;

  return {
    ...token,
    symbol: token.symbol || pairSideToken?.symbol || "?",
    name: token.name || pairSideToken?.name || "Custom token",
    chain: getChain(token.chainKey),
    icon: token.icon || remoteIcon,
    status: pair.dexId ? pair.dexId : "pair",
    pairSymbol,
    pairUrl: pair.url,
    priceUsd: tokenPriceUsd,
    liquidityUsd: pair.liquidity?.usd,
    marketCap: tokenMarketCap,
    volume24h: pair.volume?.h24,
    change24h: tokenChange24h,
    orientation
  };
}

function readNumber(row, keys) {
  for (const key of keys) {
    const value = Number(row?.[key]);

    if (Number.isFinite(value) && value > 0) {
      return value;
    }
  }

  return null;
}

function normalizeTshareHistoryRow(row) {
  const day = Number(row.currentDay ?? row.day ?? row.hexDay ?? 0);
  const price =
    readNumber(row, ["tsharePrice", "tSharePrice", "tsharePriceUSD", "tSharePriceUSD", "tshareCostUSD"]) ??
    (() => {
      const rateHex = readNumber(row, ["tshareRateHEX", "tShareRateHEX", "shareRateHEX", "tshareRate"]);
      const hexPrice = readNumber(row, ["priceUV2UV3", "priceUV3", "priceUV2", "price", "hexPrice"]);
      return rateHex && hexPrice ? rateHex * hexPrice : null;
    })();

  if (!day || !price) {
    return null;
  }

  return {
    day,
    date: row.date ? new Date(row.date) : hexDayToDate(day),
    price,
    rateHex: readNumber(row, ["tshareRateHEX", "tShareRateHEX", "shareRateHEX", "tshareRate"]),
    payoutPerTshare: readNumber(row, ["payoutPerTshareHEX", "payoutPerTshare", "dailyPayoutPerTshare"])
  };
}

function downsampleRows(rows, maxPoints = 360) {
  if (rows.length <= maxPoints) {
    return rows;
  }

  const step = Math.ceil(rows.length / maxPoints);
  return rows.filter((_, index) => index % step === 0 || index === rows.length - 1);
}

function formatChartDate(date) {
  return date.toLocaleDateString(undefined, {
    month: "short",
    year: "numeric"
  });
}

function buildTshareChart(rows) {
  const prices = rows.map((row) => row.price).filter((price) => price > 0);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const padLeft = 76;
  const padRight = 24;
  const padTop = 24;
  const padBottom = 54;
  const innerWidth = TSHARE_CHART_WIDTH - padLeft - padRight;
  const innerHeight = TSHARE_CHART_HEIGHT - padTop - padBottom;
  const plotRight = padLeft + innerWidth;
  const plotBottom = padTop + innerHeight;
  const logMin = Math.log10(min);
  const logMax = Math.log10(max);
  const logRange = Math.max(logMax - logMin, 1);
  const points = rows.map((row, index) => {
    const x = padLeft + (index / Math.max(rows.length - 1, 1)) * innerWidth;
    const y = padTop + (1 - (Math.log10(row.price) - logMin) / logRange) * innerHeight;

    return { row, x, y };
  });
  const path = points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(" ");
  const yTicks = Array.from({ length: 5 }, (_, index) => {
    const ratio = index / 4;
    const price = 10 ** (logMax - ratio * logRange);
    const y = padTop + ratio * innerHeight;

    return { price, y };
  });
  const xTicks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => {
    const index = Math.min(rows.length - 1, Math.round(ratio * (rows.length - 1)));

    return {
      date: rows[index].date,
      x: padLeft + ratio * innerWidth
    };
  });

  return {
    innerHeight,
    innerWidth,
    padLeft,
    padRight,
    padTop,
    padBottom,
    path,
    plotBottom,
    plotRight,
    points,
    xTicks,
    yTicks
  };
}

function formatDate(date) {
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short"
  });
}

function hexDayToDate(day) {
  return new Date((HEX_LAUNCH_SECONDS + day * SECONDS_PER_DAY) * 1000);
}

function estimatedHexDay() {
  return Math.max(0, Math.floor((Date.now() / 1000 - HEX_LAUNCH_SECONDS) / SECONDS_PER_DAY));
}

function refreshStakeTiming(row, currentDay) {
  const scannedDay = Number(row.currentDay);
  const effectiveDay = Math.max(
    Number.isFinite(scannedDay) ? scannedDay : 0,
    Number.isFinite(currentDay) ? currentDay : estimatedHexDay()
  );

  if (row.statusKind === "ended") {
    return row.currentDay === effectiveDay ? row : { ...row, currentDay: effectiveDay };
  }

  const daysLeft = Math.max(0, Number(row.unlockDay || 0) - effectiveDay);
  const ready = daysLeft === 0;
  const status = ready ? "ready" : `${daysLeft.toLocaleString()} days`;
  const statusKind = ready ? "ready" : "waiting";

  if (
    row.currentDay === effectiveDay
    && row.status === status
    && row.statusKind === statusKind
  ) {
    return row;
  }

  return {
    ...row,
    currentDay: effectiveDay,
    status,
    statusKind
  };
}

function unpackStake(result) {
  let stake = result?.stake ?? result;

  if (stake === result && result?.stakedHearts === undefined && result?.[1] === undefined && result?.[0] !== undefined) {
    stake = result[0];
  }

  return {
    stakeId: toNumber(stake.stakeId ?? stake[0]),
    stakedHearts: BigInt(stake.stakedHearts ?? stake[1] ?? 0),
    stakeShares: BigInt(stake.stakeShares ?? stake[2] ?? 0),
    lockedDay: toNumber(stake.lockedDay ?? stake[3]),
    stakedDays: toNumber(stake.stakedDays ?? stake[4]),
    unlockedDay: toNumber(stake.unlockedDay ?? stake[5]),
    isAutoStake: Boolean(stake.isAutoStake ?? stake[6])
  };
}

function hasStakeValue(stake) {
  return stake.stakedHearts > 0n || stake.stakeShares > 0n || stake.stakedDays > 0;
}

function buildRow({ address, chain, currentDay, hsiAddress = "", index, source, stake }) {
  const unlockDay = stake.lockedDay + stake.stakedDays;
  const unlockDate = hexDayToDate(unlockDay);
  const daysLeft = Math.max(0, unlockDay - currentDay);
  const ended = stake.unlockedDay > 0;
  const ready = !ended && currentDay >= unlockDay;

  return {
    id: `${chain.key}-${address}-${source}-${index}-${stake.stakeId}`,
    address,
    chain,
    source,
    index,
    hsiAddress,
    stakeId: stake.stakeId,
    stakedHearts: stake.stakedHearts,
    stakeShares: stake.stakeShares,
    hex: formatTokenUnits(stake.stakedHearts, 8, 2),
    tShares: formatTokenUnits(stake.stakeShares, 12, 4),
    lockedDay: stake.lockedDay,
    stakedDays: stake.stakedDays,
    unlockedDay: stake.unlockedDay,
    currentDay,
    unlockDay,
    unlockDate,
    localUnlock: formatDate(unlockDate),
    utcUnlock: unlockDate.toISOString().replace(".000Z", "Z"),
    status: ended ? "ended" : ready ? "ready" : `${daysLeft.toLocaleString()} days`,
    statusKind: ended ? "ended" : ready ? "ready" : "waiting",
    autoStake: stake.isAutoStake
  };
}

// Every stake index is independent; issuing all reads at once lets the multicall batcher
// pack them into a handful of aggregate3 round trips. Promise.all preserves index order,
// which keeps row order identical to the old sequential walk.
async function readNativeStakes({ address, chain, currentDay, hex, mcall }) {
  const count = toNumber(await mcall(hex, "stakeCount", [address]));
  const limit = Math.min(count, MAX_STAKES_PER_SOURCE);

  const stakes = await Promise.all(
    Array.from({ length: limit }, (_, index) => mcall(hex, "stakeLists", [address, index]))
  );

  const rows = [];

  stakes.forEach((result, index) => {
    const stake = unpackStake(result);

    if (!hasStakeValue(stake)) {
      return;
    }

    rows.push(buildRow({
      address,
      chain,
      currentDay,
      index,
      source: "HEX native",
      stake
    }));
  });

  return { rows, count, truncated: count > limit ? count - limit : 0 };
}

async function readIcosaHsiStakes({ address, chain, currentDay, hsim, mcall }) {
  const [count, stakeCount] = (await Promise.all([
    mcall(hsim, "hsiCount", [address]),
    mcall(hsim, "stakeCount", [address])
  ])).map(toNumber);
  const limit = Math.min(count, stakeCount, MAX_STAKES_PER_SOURCE);

  const entries = await Promise.all(
    Array.from({ length: limit }, (_, index) => Promise.all([
      mcall(hsim, "hsiLists", [address, index]),
      mcall(hsim, "stakeLists", [address, index])
    ]))
  );

  const rows = [];

  entries.forEach(([hsiAddress, stakeResult], index) => {
    const stake = unpackStake(stakeResult);

    if (!hasStakeValue(stake)) {
      return;
    }

    rows.push(buildRow({
      address,
      chain,
      currentDay,
      hsiAddress,
      index,
      source: "Icosa wrapped HEX stake",
      stake
    }));
  });

  return { rows, count, stakeCount, truncated: Math.max(count, stakeCount) > limit ? Math.max(count, stakeCount) - limit : 0 };
}

async function readOwnedWaatsaNfts({ address, chain, waatsa, mcall }) {
  const count = toNumber(await mcall(waatsa, "balanceOf", [address]));
  const limit = Math.min(count, MAX_NFTS_PER_COLLECTION);

  const rows = await Promise.all(
    Array.from({ length: limit }, async (_, index) => {
      const tokenId = await mcall(waatsa, "tokenOfOwnerByIndex", [address, index]);
      const tokenUri = await mcall(waatsa, "tokenURI", [tokenId]).catch(() => "");

      return {
        id: `${chain.key}-${address}-waatsa-owned-${tokenId.toString()}`,
        address,
        chain,
        collection: "WAATSA",
        tokenAddress: WAATSA_ADDRESS,
        tokenId: tokenId.toString(),
        status: "owned",
        statusKind: "owned",
        detail: "Wallet-held WAATSA NFT",
        tokenUri
      };
    })
  );

  return { rows, count, truncated: count > limit ? count - limit : 0 };
}

async function queryNftStakeEvents({ icsa, filter, fromBlock, latestBlock }) {
  try {
    return { events: await icsa.queryFilter(filter, fromBlock, latestBlock), partial: false };
  } catch {
    const fallbackStart = Math.max(fromBlock, latestBlock - NFT_EVENT_FALLBACK_BLOCKS);
    return { events: await icsa.queryFilter(filter, fallbackStart, latestBlock), partial: true };
  }
}

async function readIcosaNftStakeEvents({ address, chain, icsa, latestBlock, mcall, runRpc }) {
  const fromBlock = chain.key === "ethereum" ? 14_900_000 : 0;
  // Event queries can't ride the multicall; they go through the limiter with RPC failover.
  const [starts, ends] = await Promise.all([
    runRpc(() => runOnChain(chain, (provider) => queryNftStakeEvents({
      icsa: icsa.connect(provider),
      filter: icsa.filters.NFTStakeStart(null, address),
      fromBlock,
      latestBlock
    }))),
    runRpc(() => runOnChain(chain, (provider) => queryNftStakeEvents({
      icsa: icsa.connect(provider),
      filter: icsa.filters.NFTStakeEnd(null, address),
      fromBlock,
      latestBlock
    })))
  ]);
  const endedIds = new Set(ends.events.map((event) => (event.args?.nftId ?? event.args?.[2] ?? "").toString()));
  const activeStarts = starts.events.filter((event) => {
    const tokenId = (event.args?.nftId ?? event.args?.[2] ?? "").toString();
    return tokenId && !endedIds.has(tokenId);
  });
  const candidates = await Promise.all(
    activeStarts.slice(0, MAX_NFTS_PER_COLLECTION).map(async (event) => {
      const tokenId = (event.args?.nftId ?? event.args?.[2]).toString();
      const tokenAddress = event.args?.tokenAddress ?? event.args?.[3] ?? "";
      // An unreadable stake record is treated as active, same as the sequential version.
      const isActive = await mcall(icsa, "nftStakes", [tokenId])
        .then((stake) => Boolean(stake.isActive ?? stake[3]))
        .catch(() => true);

      return isActive
        ? {
          id: `${chain.key}-${address}-icosa-staked-${tokenAddress}-${tokenId}`,
          address,
          chain,
          collection: tokenAddress && tokenAddress.toLowerCase() === WAATSA_ADDRESS.toLowerCase() ? "WAATSA" : "NFT",
          tokenAddress,
          tokenId,
          status: "staked",
          statusKind: "staked",
          detail: "Staked through Icosa NFT pool",
          tokenUri: ""
        }
        : null;
    })
  );

  const rows = candidates.filter(Boolean);

  return {
    rows,
    count: rows.length,
    truncated: activeStarts.length > MAX_NFTS_PER_COLLECTION ? activeStarts.length - MAX_NFTS_PER_COLLECTION : 0,
    partial: starts.partial || ends.partial
  };
}

function shortAddress(address) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

// Per-stake daily-yield sparkline: estimated HEX earned each served day = stake T-shares ×
// daily payout-per-T-share. Days when big stakes end push the payout up, so those show as bumps.
function StakeYieldSparkline({ row, dayPayoutMap }) {
  const [hoveredIndex, setHoveredIndex] = useState(null);
  const series = useMemo(() => {
    if (!dayPayoutMap || dayPayoutMap.size === 0) {
      return null;
    }

    const tShares = Number(row.stakeShares) / 1e12;

    if (!(tShares > 0)) {
      return null;
    }

    const startDay = row.lockedDay;
    const endDay = Math.min(row.currentDay - 1, row.unlockDay - 1);

    if (!Number.isFinite(startDay) || endDay < startDay) {
      return null;
    }

    const payouts = [...dayPayoutMap.entries()]
      .map(([day, payout]) => ({ day: Number(day), payout: Number(payout) }))
      .filter((item) => Number.isFinite(item.day) && Number.isFinite(item.payout) && item.payout > 0)
      .sort((a, b) => a.day - b.day);

    if (payouts.length === 0) {
      return null;
    }

    const points = [];
    let payoutIndex = 0;
    let latestKnown = null;

    for (let day = startDay; day <= endDay; day += 1) {
      while (payoutIndex < payouts.length && payouts[payoutIndex].day <= day) {
        latestKnown = payouts[payoutIndex];
        payoutIndex += 1;
      }

      const exactPayout = dayPayoutMap.get(day);
      const payout = exactPayout ?? latestKnown?.payout;

      if (payout !== undefined) {
        points.push({
          day,
          estimated: exactPayout === undefined,
          hex: tShares * Number(payout),
          sourceDay: exactPayout === undefined ? latestKnown?.day : day
        });
      }
    }

    return points.length >= 1 ? points : null;
  }, [row, dayPayoutMap]);

  if (!series) {
    return <span className="stakeSparkEmpty" title="No served-day yield yet">—</span>;
  }

  const maxPoints = 80;
  const step = series.length > maxPoints ? Math.ceil(series.length / maxPoints) : 1;
  const pts = series.filter((_, index) => index % step === 0 || index === series.length - 1);

  const width = 132;
  const height = 30;
  const pad = 3;
  const values = pts.map((point) => point.hex);
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const xAt = (index) => pad + (index / Math.max(pts.length - 1, 1)) * (width - 2 * pad);
  const yAt = (value) => pad + (1 - (value - min) / range) * (height - 2 * pad);
  const path = pts.length === 1
    ? `M ${pad} ${yAt(pts[0].hex).toFixed(1)} L ${width - pad} ${yAt(pts[0].hex).toFixed(1)}`
    : pts
      .map((point, index) => `${index === 0 ? "M" : "L"} ${xAt(index).toFixed(1)} ${yAt(point.hex).toFixed(1)}`)
      .join(" ");

  const peakIndex = values.indexOf(max);
  const total = series.reduce((sum, point) => sum + point.hex, 0);
  const peak = series.reduce((best, point) => (point.hex > best.hex ? point : best), series[0]);
  const activeIndex = hoveredIndex === null ? null : Math.max(0, Math.min(pts.length - 1, hoveredIndex));
  const active = activeIndex === null ? null : pts[activeIndex];
  const activeX = active ? xAt(activeIndex) : 0;
  const activeY = active ? yAt(active.hex) : 0;
  const title =
    `Daily HEX yield · ${series.length.toLocaleString()} served days · ` +
    `~${total.toLocaleString(undefined, { maximumFractionDigits: 2 })} HEX total · ` +
    `peak day ${peak.day.toLocaleString()} (~${peak.hex.toLocaleString(undefined, { maximumFractionDigits: 4 })} HEX)`;

  function handlePointerMove(event) {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    setHoveredIndex(Math.round(ratio * Math.max(pts.length - 1, 0)));
  }

  return (
    <span className="stakeSparkWrap">
      <svg
        className="stakeSpark"
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={title}
        onPointerMove={handlePointerMove}
        onPointerLeave={() => setHoveredIndex(null)}
      >
        <title>{title}</title>
        <path d={path} fill="none" stroke="#ff2cb4" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={xAt(peakIndex)} cy={yAt(max)} r="2.2" fill="#ff2cb4" />
        {active && (
          <g className="stakeSparkActive">
            <line x1={activeX} x2={activeX} y1={pad} y2={height - pad} />
            <circle cx={activeX} cy={activeY} r="2.8" />
          </g>
        )}
      </svg>
      {active && (
        <span className="stakeSparkTooltip" style={{ left: `${(activeX / width) * 100}%` }}>
          <strong>~{active.hex.toLocaleString(undefined, { maximumFractionDigits: 4 })} HEX</strong>
          <small>day {active.day.toLocaleString()}</small>
          {active.estimated && <small>est. from day {active.sourceDay?.toLocaleString()}</small>}
        </span>
      )}
    </span>
  );
}

function TshareHistoryChart({ rows }) {
  const [hoveredPoint, setHoveredPoint] = useState(null);
  const sampledRows = downsampleRows(rows);
  const first = sampledRows[0];
  const last = sampledRows[sampledRows.length - 1];
  const high = sampledRows.reduce((best, row) => (row.price > best.price ? row : best), sampledRows[0]);
  const chart = buildTshareChart(sampledRows);
  const activePoint = hoveredPoint;

  function handleChartPointerMove(event) {
    const svg = event.currentTarget.ownerSVGElement;
    const matrix = svg?.getScreenCTM();

    if (!svg || !matrix) {
      return;
    }

    const svgPoint = svg.createSVGPoint();
    svgPoint.x = event.clientX;
    svgPoint.y = event.clientY;

    const localPoint = svgPoint.matrixTransform(matrix.inverse());
    const clampedX = Math.min(Math.max(localPoint.x, chart.padLeft), chart.plotRight);
    const nearest = chart.points.reduce((best, point) => (
      Math.abs(point.x - clampedX) < Math.abs(best.x - clampedX) ? point : best
    ), chart.points[0]);

    setHoveredPoint(nearest);
  }

  return (
    <div className="tshareChartWrap">
      <div className="tshareChartStats">
        <div>
          <span>first loaded</span>
          <strong>{formatCompactUsd(first.price)}</strong>
          <small>HEX day {first.day.toLocaleString()}</small>
        </div>
        <div>
          <span>latest</span>
          <strong>{formatCompactUsd(last.price)}</strong>
          <small>HEX day {last.day.toLocaleString()}</small>
        </div>
        <div>
          <span>high</span>
          <strong>{formatCompactUsd(high.price)}</strong>
          <small>{formatDate(high.date)}</small>
        </div>
      </div>

      <div className="tshareChartFrame">
        <svg className="tshareChart" viewBox={`0 0 ${TSHARE_CHART_WIDTH} ${TSHARE_CHART_HEIGHT}`} role="img" aria-label="T-share cost history in dollars">
          <defs>
            <linearGradient id="tshareLine" x1="0" x2="1" y1="0" y2="0">
              <stop offset="0%" stopColor="#ff2cb4" />
              <stop offset="50%" stopColor="#8b3cff" />
              <stop offset="100%" stopColor="#1fd5ff" />
            </linearGradient>
            <linearGradient id="tshareFill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="rgba(255,44,180,0.3)" />
              <stop offset="100%" stopColor="rgba(31,213,255,0)" />
            </linearGradient>
          </defs>
          <rect
            x={chart.padLeft}
            y={chart.padTop}
            width={chart.innerWidth}
            height={chart.innerHeight}
            rx="0"
            fill="rgba(10,9,8,0.52)"
            stroke="rgba(242,236,225,0.08)"
          />
          {chart.yTicks.map((tick) => (
            <g key={`y-${tick.y}`}>
              <line x1={chart.padLeft} x2={chart.plotRight} y1={tick.y} y2={tick.y} stroke="rgba(242,236,225,0.07)" />
              <text x={chart.padLeft - 10} y={tick.y + 4} textAnchor="end" className="tshareAxisLabel">
                {formatCompactUsd(tick.price)}
              </text>
            </g>
          ))}
          {chart.xTicks.map((tick) => (
            <g key={`x-${tick.x}`}>
              <line x1={tick.x} x2={tick.x} y1={chart.padTop} y2={chart.plotBottom} stroke="rgba(242,236,225,0.035)" />
              <text x={tick.x} y={chart.plotBottom + 24} textAnchor="middle" className="tshareAxisLabel">
                {formatChartDate(tick.date)}
              </text>
            </g>
          ))}
          <text x={chart.padLeft - 56} y={chart.padTop + 10} className="tshareAxisTitle">USD</text>
          <text x={chart.plotRight} y={chart.plotBottom + 45} textAnchor="end" className="tshareAxisTitle">time</text>
          <path d={`${chart.path} L ${chart.plotRight} ${chart.plotBottom} L ${chart.padLeft} ${chart.plotBottom} Z`} fill="url(#tshareFill)" opacity="0.62" />
          <path d={chart.path} fill="none" stroke="url(#tshareLine)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
          {activePoint && (
            <g className="tshareCrosshair">
              <line x1={activePoint.x} x2={activePoint.x} y1={chart.padTop} y2={chart.plotBottom} />
              <circle cx={activePoint.x} cy={activePoint.y} r="5" />
            </g>
          )}
          <rect
            x={chart.padLeft}
            y={chart.padTop}
            width={chart.innerWidth}
            height={chart.innerHeight}
            fill="transparent"
            className="tshareHitbox"
            onPointerMove={handleChartPointerMove}
            onPointerLeave={() => setHoveredPoint(null)}
          />
        </svg>

        {activePoint && (
          <div
            className={activePoint.y < 96 ? "tshareTooltip below" : "tshareTooltip"}
            style={{
              left: `${(activePoint.x / TSHARE_CHART_WIDTH) * 100}%`,
              top: `${(activePoint.y / TSHARE_CHART_HEIGHT) * 100}%`
            }}
          >
            <strong>{formatUsd(activePoint.row.price, 2)}</strong>
            <span>{formatDate(activePoint.row.date)}</span>
            <small>HEX day {activePoint.row.day.toLocaleString()}</small>
          </div>
        )}
      </div>

      <div className="tshareChartFooter">
        <span>{formatDate(first.date)}</span>
        <span>Log scale, dollar cost of one T-share</span>
        <span>{formatDate(last.date)}</span>
      </div>
    </div>
  );
}

export default function StakeTracker({ view = "portfolio" }) {
  const cachedScan = useMemo(loadScanCache, []);
  const cachedHoldings = useMemo(loadPortfolioHoldingsCache, []);
  const [liveHexDay, setLiveHexDay] = useState(estimatedHexDay);
  const [walletBackup, setWalletBackup] = useState(loadPortfolioWalletBackup);
  const [portfolio, setPortfolio] = useState(loadPortfolio);
  const [walletDraft, setWalletDraft] = useState({ name: "", address: "" });
  const [portfolioGroups, setPortfolioGroups] = useState(loadPortfolioGroups);
  const [groupNameDraft, setGroupNameDraft] = useState("");
  const [enabledChains, setEnabledChains] = useState({ pulsechain: true, ethereum: true });
  const [includeIcosa, setIncludeIcosa] = useState(true);
  const [includeIcosaNfts, setIncludeIcosaNfts] = useState(true);
  const [rows, setRows] = useState(() => cachedScan?.rows || []);
  const [nftRows, setNftRows] = useState(() => cachedScan?.nftRows || []);
  const [summaryRows, setSummaryRows] = useState(() => cachedScan?.summaryRows || []);
  const [scanChainDays, setScanChainDays] = useState(() => cachedScan?.scanChainDays || {});
  const [warnings, setWarnings] = useState(() => cachedScan?.warnings || []);
  const [status, setStatus] = useState(() => (
    cachedScan?.cachedAt
      ? `Showing cached stakes from ${new Date(cachedScan.cachedAt).toLocaleString()}. Press Refresh stakes to update.`
      : ""
  ));
  const [busy, setBusy] = useState(false);
  const [marketRows, setMarketRows] = useState([]);
  const [marketStatus, setMarketStatus] = useState("");
  const [customCoreTokens, setCustomCoreTokens] = useState(loadCustomCoreTokens);
  const [customTokenInput, setCustomTokenInput] = useState("");
  const [customTokenError, setCustomTokenError] = useState("");
  const [portfolioHoldings, setPortfolioHoldings] = useState(() => cachedHoldings?.rows || []);
  // addressLower -> { priceUsd, liquidityUsd, icon } for Blockscout-discovered tokens.
  const [discoveredPrices, setDiscoveredPrices] = useState({});
  // { walletKey, walletLabel, address, symbol, name, type, count } per wallet x collection.
  const [discoveredNftRows, setDiscoveredNftRows] = useState(() => cachedHoldings?.nfts || []);
  const [tokenOverrides, setTokenOverrides] = useState(loadTokenOverrides);
  const [portfolioHistory, setPortfolioHistory] = useState(loadPortfolioHistory);
  const [backfillBusy, setBackfillBusy] = useState(false);
  const [backfillStatus, setBackfillStatus] = useState("");
  const [backfillDepth, setBackfillDepth] = useState(loadBackfillDepth);
  // Row key of the holding whose action popover is open, or null.
  const [tokenActionTarget, setTokenActionTarget] = useState(null);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [verifyCopied, setVerifyCopied] = useState(false);
  const [unverifiedTokenPage, setUnverifiedTokenPage] = useState(0);
  const [portfolioHoldingsBusy, setPortfolioHoldingsBusy] = useState(false);
  const [portfolioHoldingsStatus, setPortfolioHoldingsStatus] = useState(() => (
    cachedHoldings?.cachedAt
      ? `Showing cached value from ${new Date(cachedHoldings.cachedAt).toLocaleString()}.`
      : ""
  ));
  const [portfolioWalletFilters, setPortfolioWalletFilters] = useState([]);
  const [pulseGas, setPulseGas] = useState({ gwei: null, simpleTxPls: null, status: "loading" });
  const [stakeChainKey, setStakeChainKey] = useState("pulsechain");
  const [walletAccount, setWalletAccount] = useState("");
  const [walletChainId, setWalletChainId] = useState(null);
  const [walletHexBalance, setWalletHexBalance] = useState(null);
  const [walletCurrentDay, setWalletCurrentDay] = useState(null);
  const [stakeAmount, setStakeAmount] = useState("");
  const [stakeDays, setStakeDays] = useState("5555");
  const [stakeAck, setStakeAck] = useState(false);
  const [stakeBusy, setStakeBusy] = useState("");
  const [stakeStatus, setStakeStatus] = useState("");
  const [stakeQuoteMetrics, setStakeQuoteMetrics] = useState({});
  const [stakeQuoteStatus, setStakeQuoteStatus] = useState("");
  const [stakeQuoteBusy, setStakeQuoteBusy] = useState(false);
  const [showEarlyEnd, setShowEarlyEnd] = useState(false);
  const [earlyEndAck, setEarlyEndAck] = useState(false);
  const [tshareOpen, setTshareOpen] = useState(true);
  const [tshareRows, setTshareRows] = useState([]);
  const [tshareRowsByChain, setTshareRowsByChain] = useState({});
  // Per-chain map of HEX day -> daily HEX payout per T-share, used for per-stake yield sparklines.
  const [dailyYieldByChain, setDailyYieldByChain] = useState({});
  const dailyYieldLoadingRef = useRef(new Set());
  const autoSavedWalletRef = useRef("");
  const [tshareBusy, setTshareBusy] = useState(false);
  const [tshareStatus, setTshareStatus] = useState("");
  const [walletBreakdownOpen, setWalletBreakdownOpen] = useState(false);
  const [nextUnlocksOpen, setNextUnlocksOpen] = useState(false);
  const [nextUnlockPage, setNextUnlockPage] = useState(0);
  const [highlightedStakeId, setHighlightedStakeId] = useState("");
  const [unlockSort, setUnlockSort] = useState({ key: "unlock", direction: "asc" });
  const [hideWalletInfo, setHideWalletInfo] = useState(() => loadBooleanPreference(WALLET_PRIVACY_STORAGE_KEY, false));
  const [hideHexAmounts, setHideHexAmounts] = useState(() => loadBooleanPreference(HEX_PRIVACY_STORAGE_KEY, false));
  const [includeEthMarketTotals, setIncludeEthMarketTotals] = useState(() => loadBooleanPreference(MARKET_ETH_TOTALS_STORAGE_KEY, false));
  const [includeStakeYield, setIncludeStakeYield] = useState(() => loadBooleanPreference(STAKE_YIELD_STORAGE_KEY, true));
  const [pdaiTargetPrice, setPdaiTargetPrice] = useState(() => loadStringPreference(PDAI_TARGET_PRICE_STORAGE_KEY, "1.00"));
  const [moonMathTargetOverrides, setMoonMathTargetOverrides] = useState(() => loadJsonPreference(MOON_MATH_TARGET_OVERRIDES_STORAGE_KEY, {}));
  const [moonMathMcapOverrides, setMoonMathMcapOverrides] = useState(() => loadJsonPreference(MOON_MATH_MCAP_OVERRIDES_STORAGE_KEY, {}));
  const [moonMathOpen, setMoonMathOpen] = useState(false);
  const [myCoinsOpen, setMyCoinsOpen] = useState(true);
  const [coreTrackersOpen, setCoreTrackersOpen] = useState(true);
  const [portfolioTokenPage, setPortfolioTokenPage] = useState(0);
  const [clearWalletsArmed, setClearWalletsArmed] = useState(false);
  const [earlyEndCandidate, setEarlyEndCandidate] = useState(null);
  const [walletAddPrompt, setWalletAddPrompt] = useState(false);
  const stakeTableDragRef = useRef({ active: false, moved: false, startLeft: 0, startX: 0 });
  const portfolioAutoLoadKeyRef = useRef("");
  const hexStakeAutoRefreshKeyRef = useRef("");
  const walletManagerRef = useRef(null);
  const walletAddressInputRef = useRef(null);
  const walletAddFocusTimeoutRef = useRef(null);
  const walletAddPromptTimeoutRef = useRef(null);
  const tshareRequestKeyRef = useRef("");
  const tshareRequestedChainKeyRef = useRef("");

  useEffect(() => {
    saveBooleanPreference(WALLET_PRIVACY_STORAGE_KEY, hideWalletInfo);
  }, [hideWalletInfo]);

  useEffect(() => {
    saveBooleanPreference(HEX_PRIVACY_STORAGE_KEY, hideHexAmounts);
  }, [hideHexAmounts]);

  useEffect(() => {
    saveBooleanPreference(MARKET_ETH_TOTALS_STORAGE_KEY, includeEthMarketTotals);
  }, [includeEthMarketTotals]);

  useEffect(() => {
    saveBooleanPreference(STAKE_YIELD_STORAGE_KEY, includeStakeYield);
  }, [includeStakeYield]);

  useEffect(() => {
    saveStringPreference(PDAI_TARGET_PRICE_STORAGE_KEY, pdaiTargetPrice);
  }, [pdaiTargetPrice]);

  useEffect(() => {
    saveJsonPreference(MOON_MATH_TARGET_OVERRIDES_STORAGE_KEY, moonMathTargetOverrides);
  }, [moonMathTargetOverrides]);

  useEffect(() => {
    saveJsonPreference(MOON_MATH_MCAP_OVERRIDES_STORAGE_KEY, moonMathMcapOverrides);
  }, [moonMathMcapOverrides]);

  useEffect(() => {
    function refreshLiveHexDay() {
      setLiveHexDay(estimatedHexDay());
    }

    refreshLiveHexDay();
    const interval = window.setInterval(refreshLiveHexDay, 60_000);
    document.addEventListener("visibilitychange", refreshLiveHexDay);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshLiveHexDay);
    };
  }, []);

  useEffect(() => {
    if (!clearWalletsArmed) {
      return undefined;
    }

    const timeout = window.setTimeout(() => setClearWalletsArmed(false), 4500);
    return () => window.clearTimeout(timeout);
  }, [clearWalletsArmed]);

  useEffect(() => () => {
    if (walletAddFocusTimeoutRef.current) {
      window.clearTimeout(walletAddFocusTimeoutRef.current);
    }

    if (walletAddPromptTimeoutRef.current) {
      window.clearTimeout(walletAddPromptTimeoutRef.current);
    }
  }, []);

  const isStakeCreator = view === "create";
  const isHexStakes = view === "stakes";
  const isPortfolio = view === "portfolio";
  const savedWallets = Array.isArray(portfolio.wallets) ? portfolio.wallets : [];
  const recoverableWallets = useMemo(() => {
    if (savedWallets.length > 0) {
      return [];
    }

    return collectRecoverableWallets({
      backupWallets: walletBackup,
      rows: rows.length > 0 ? rows : cachedScan?.rows,
      nftRows: nftRows.length > 0 ? nftRows : cachedScan?.nftRows,
      summaryRows: summaryRows.length > 0 ? summaryRows : cachedScan?.summaryRows,
      holdingRows: portfolioHoldings.length > 0 ? portfolioHoldings : cachedHoldings?.rows
    }).slice(0, MAX_PORTFOLIO_WALLETS);
  }, [savedWallets.length, walletBackup, rows, nftRows, summaryRows, portfolioHoldings, cachedScan, cachedHoldings]);
  // Cached/backup wallets that aren't currently in the list — recoverable even when wallets exist.
  const recoverableExtras = useMemo(() => {
    const candidates = collectRecoverableWallets({
      backupWallets: walletBackup,
      rows: rows.length > 0 ? rows : cachedScan?.rows,
      nftRows: nftRows.length > 0 ? nftRows : cachedScan?.nftRows,
      summaryRows: summaryRows.length > 0 ? summaryRows : cachedScan?.summaryRows,
      holdingRows: portfolioHoldings.length > 0 ? portfolioHoldings : cachedHoldings?.rows
    });
    const have = new Set(
      savedWallets.map((wallet) => normalizeAddress(wallet.address).toLowerCase()).filter(Boolean)
    );
    return candidates
      .filter((wallet) => {
        const key = normalizeAddress(wallet.address).toLowerCase();
        return key && !have.has(key);
      })
      .slice(0, MAX_PORTFOLIO_WALLETS);
  }, [savedWallets, walletBackup, rows, nftRows, summaryRows, portfolioHoldings, cachedScan, cachedHoldings]);
  const validWallets = useMemo(() => {
    const seenAddresses = new Set();

    return savedWallets
      .map((wallet) => ({ ...wallet, normalizedAddress: normalizeAddress(wallet.address) }))
      .filter((wallet) => {
        if (!wallet.normalizedAddress) {
          return false;
        }

        const key = wallet.normalizedAddress.toLowerCase();

        if (seenAddresses.has(key)) {
          return false;
        }

        seenAddresses.add(key);
        return true;
      });
  }, [savedWallets]);
  const portfolioAddresses = useMemo(() => validWallets.map((wallet) => wallet.normalizedAddress), [validWallets]);
  const selectedPortfolioWalletKeys = useMemo(() => {
    const validKeys = new Set(validWallets.map((wallet) => wallet.normalizedAddress.toLowerCase()));
    return new Set(portfolioWalletFilters.filter((key) => validKeys.has(key)));
  }, [portfolioWalletFilters, validWallets]);
  const portfolioWalletFilterIsAll = selectedPortfolioWalletKeys.size === 0;
  const invalidWalletCount = savedWallets.filter((wallet) => wallet.address && !normalizeAddress(wallet.address)).length;
  const activeChains = CHAINS.filter((chain) => enabledChains[chain.key]);
  const activeChainKey = activeChains.map((chain) => chain.key).join("|");
  const scannedHexDays = CHAINS
    .map((chain) => scanChainDays[chain.key])
    .filter((day) => Number.isFinite(day));
  const uniqueScannedHexDays = [...new Set(scannedHexDays)];
  const portfolioHexDayLabel = uniqueScannedHexDays.length === 0
    ? `~${estimatedHexDay().toLocaleString()}`
    : uniqueScannedHexDays.length === 1
      ? uniqueScannedHexDays[0].toLocaleString()
      : CHAINS
        .filter((chain) => Number.isFinite(scanChainDays[chain.key]))
        .map((chain) => `${chain.shortLabel} ${scanChainDays[chain.key].toLocaleString()}`)
        .join(" / ");
  const selectedStakeChain = getChain(stakeChainKey);
  const selectedHexSymbol = stakeChainKey === "ethereum" ? "eHEX" : "pHEX";
  const createStakeHexDayLabel = walletCurrentDay !== null
    ? walletCurrentDay.toLocaleString()
    : Number.isFinite(stakeQuoteMetrics[stakeChainKey]?.currentDay)
      ? stakeQuoteMetrics[stakeChainKey].currentDay.toLocaleString()
      : `~${estimatedHexDay().toLocaleString()}`;
  const headerHexDayLabel = isStakeCreator ? createStakeHexDayLabel : portfolioHexDayLabel;
  const headerHexDayDetail = isStakeCreator ? selectedStakeChain.shortLabel : "latest scan";
  const stakeAmountHearts = parseStakeAmountHearts(stakeAmount);
  const stakeDaysNumber = parseStakeDaysInput(stakeDays);
  const stakeBonusPreview = stakeAmountHearts && stakeDaysNumber
    ? calculateStakeBonuses(stakeAmountHearts, stakeDaysNumber)
    : null;
  const stakePayoutPreviews = CHAINS.map((chain) => ({
    chain,
    symbol: chain.key === "ethereum" ? "eHEX" : "pHEX",
    metrics: stakeQuoteMetrics[chain.key],
    preview: buildStakePayoutPreview({
      metrics: stakeQuoteMetrics[chain.key],
      principalHearts: stakeAmountHearts,
      stakedDays: stakeDaysNumber
    })
  }));
  const sortedRows = useMemo(
    () => rows
      .map((row) => refreshStakeTiming(row, liveHexDay))
      .sort((a, b) => a.unlockDay - b.unlockDay || a.chain.label.localeCompare(b.chain.label)),
    [rows, liveHexDay]
  );
  const filteredStakeRows = useMemo(
    () => portfolioWalletFilterIsAll
      ? sortedRows
      : sortedRows.filter((row) => selectedPortfolioWalletKeys.has(normalizeAddress(row.address).toLowerCase())),
    [sortedRows, portfolioWalletFilterIsAll, selectedPortfolioWalletKeys]
  );
  const unlockRows = useMemo(() => {
    const nextRows = [...filteredStakeRows];
    const direction = unlockSort.direction === "desc" ? -1 : 1;

    function compareBigInt(a, b) {
      return a === b ? 0 : a < b ? -1 : 1;
    }

    function tieBreak(a, b) {
      return a.unlockDay - b.unlockDay
        || walletLabel(a.address).localeCompare(walletLabel(b.address))
        || a.source.localeCompare(b.source);
    }

    return nextRows.sort((a, b) => {
      let result = 0;

      switch (unlockSort.key) {
        case "chain":
          result = a.chain.label.localeCompare(b.chain.label);
          break;
        case "wallet":
          result = walletLabel(a.address).localeCompare(walletLabel(b.address));
          break;
        case "source":
          result = a.source.localeCompare(b.source);
          break;
        case "hex":
          result = compareBigInt(a.stakedHearts, b.stakedHearts);
          break;
        case "tshares":
          result = compareBigInt(a.stakeShares, b.stakeShares);
          break;
        case "locked":
          result = a.stakedDays - b.stakedDays;
          break;
        default:
          result = a.unlockDay - b.unlockDay;
          break;
      }

      return result === 0 ? tieBreak(a, b) : result * direction;
    });
  }, [filteredStakeRows, unlockSort, validWallets]);
  const readyCount = filteredStakeRows.filter((row) => row.statusKind === "ready").length;
  const waitingCount = filteredStakeRows.filter((row) => row.statusKind === "waiting").length;
  const nextRow = filteredStakeRows.find((row) => row.statusKind === "ready" || row.statusKind === "waiting");
  const activeStakeRows = filteredStakeRows.filter((row) => row.statusKind !== "ended");
  const totalStakedHearts = activeStakeRows.reduce((total, row) => total + row.stakedHearts, 0n);
  const totalStakeShares = activeStakeRows.reduce((total, row) => total + row.stakeShares, 0n);
  const totalLiquidPhexHearts = summaryRows
    .filter((row) => row.chain.key === "pulsechain")
    .reduce((total, row) => total + BigInt(row.liquidHearts || 0), 0n);
  const totalLiquidEhexHearts = summaryRows
    .filter((row) => row.chain.key === "ethereum")
    .reduce((total, row) => total + BigInt(row.liquidHearts || 0), 0n);
  const hsiStakeCount = filteredStakeRows.filter((row) => row.source === "Icosa wrapped HEX stake").length;
  const upcomingRows = filteredStakeRows.filter((row) => row.statusKind === "waiting");
  const nextUnlockPageCount = Math.max(1, Math.ceil(upcomingRows.length / NEXT_UNLOCK_PAGE_SIZE));
  const safeNextUnlockPage = Math.min(nextUnlockPage, nextUnlockPageCount - 1);
  const pagedUpcomingRows = upcomingRows.slice(
    safeNextUnlockPage * NEXT_UNLOCK_PAGE_SIZE,
    safeNextUnlockPage * NEXT_UNLOCK_PAGE_SIZE + NEXT_UNLOCK_PAGE_SIZE
  );
  const marketTotalRows = marketRows.filter((row) => CORE_TRACKER_KEYS.includes(row.key) && (includeEthMarketTotals || row.key !== "eth"));
  const marketLiquidityTotal = marketTotalRows.reduce((total, row) => total + Number(row.liquidityUsd || 0), 0);
  const marketVolumeTotal = marketTotalRows.reduce((total, row) => total + Number(row.volume24h || 0), 0);
  // Balances are fetched once per wallet set; prices are layered on here. A price refresh
  // re-values the portfolio instantly instead of triggering another full balance scan.
  const pricedPortfolioHoldings = useMemo(() => portfolioHoldings.map((row) => {
    if (row.discovered) {
      // Falls back to the cached row price so reloads keep values until the next refresh.
      const entry = discoveredPrices[String(row.address).toLowerCase()];
      const priceUsd = entry?.priceUsd ?? row.priceUsd ?? 0;

      return {
        ...row,
        icon: row.icon || entry?.icon || "",
        priceUsd,
        // Kept on the row so the plausibility check can compare value against pool depth.
        liquidityUsd: entry?.liquidityUsd ?? row.liquidityUsd,
        valueUsd: row.amount * priceUsd
      };
    }

    const priceUsd = getTokenPriceUsd(row.priceKey);
    const marketRow = row.symbol && row.name ? null : getTokenMarketRow(row.priceKey);

    return {
      ...row,
      symbol: row.symbol || marketRow?.symbol || `${String(row.address || "?").slice(0, 6)}…`,
      name: row.name || marketRow?.name || "Custom token",
      icon: row.icon || getTokenMarketIcon(row.priceKey),
      priceUsd,
      valueUsd: row.amount * priceUsd
    };
  }), [portfolioHoldings, marketRows, discoveredPrices]);
  const selectedWalletHoldingRows = useMemo(() => {
    const sourceRows = portfolioWalletFilterIsAll
      ? pricedPortfolioHoldings
      : pricedPortfolioHoldings.filter((row) => selectedPortfolioWalletKeys.has(row.walletKey));

    return [...sourceRows]
      .sort((a, b) => b.valueUsd - a.valueUsd || a.symbol.localeCompare(b.symbol) || a.walletLabel.localeCompare(b.walletLabel));
  }, [pricedPortfolioHoldings, portfolioWalletFilterIsAll, selectedPortfolioWalletKeys]);
  const selectedHoldingRows = useMemo(() => {
    const grouped = new Map();

    for (const row of selectedWalletHoldingRows) {
      const key = `${row.chain.key}-${row.symbol}-${row.priceKey}`;
      const current = grouped.get(key) || {
        ...row,
        amount: 0,
        balance: 0n,
        valueUsd: 0,
        walletCount: 0
      };

      current.amount += row.amount;
      current.balance += row.balance;
      current.valueUsd += row.valueUsd;
      current.walletCount += 1;
      grouped.set(key, current);
    }

    return [...grouped.values()]
      // Combined LP rows recompute underlying amounts from the summed LP balance.
      .map((row) => (row.lpUnderlying
        ? {
          ...row,
          name: `${formatLpUnderlyingAmount(row.amount * row.lpUnderlying.per0)} ${row.lpUnderlying.symbol0} + ${formatLpUnderlyingAmount(row.amount * row.lpUnderlying.per1)} ${row.lpUnderlying.symbol1}${row.farm ? " · PulseX farm" : ""}`
        }
        : row))
      .sort((a, b) => b.valueUsd - a.valueUsd || a.symbol.localeCompare(b.symbol));
  }, [selectedWalletHoldingRows]);
  const hiddenTokenSet = useMemo(() => new Set(tokenOverrides.hidden), [tokenOverrides]);
  const demotedTokenSet = useMemo(() => new Set(tokenOverrides.demoted), [tokenOverrides]);
  const trustedTokenSet = useMemo(() => new Set(tokenOverrides.trusted), [tokenOverrides]);
  // Verified rows are what the portfolio claims you own; unverified rows are visible but
  // never counted. A discovered row lands in unverified when it has no liquidity-backed
  // price, its value fails the exit-liquidity plausibility check, or the user demoted it.
  const { verifiedHoldingRows, unverifiedHoldingRows, hiddenHoldingCount } = useMemo(() => {
    const verified = [];
    const unverified = [];
    let hiddenCount = 0;

    for (const row of selectedHoldingRows) {
      const identity = tokenIdentity(row);

      if (hiddenTokenSet.has(identity)) {
        hiddenCount += 1;
        continue;
      }

      if (row.discovered) {
        const suspicious = !(row.priceUsd > 0) || isImplausibleDiscoveredValue(row);

        if (demotedTokenSet.has(identity) || (suspicious && !trustedTokenSet.has(identity))) {
          unverified.push(row);
          continue;
        }
      }

      verified.push(row);
    }

    return { verifiedHoldingRows: verified, unverifiedHoldingRows: unverified, hiddenHoldingCount: hiddenCount };
  }, [selectedHoldingRows, hiddenTokenSet, demotedTokenSet, trustedTokenSet]);
  // Net worth counts verified rows only — an implausible discovered "value" must never
  // inflate the headline number.
  const portfolioLiquidTotalUsd = verifiedHoldingRows.reduce((total, row) => total + row.valueUsd, 0);
  const nftCollections = useMemo(() => {
    const source = portfolioWalletFilterIsAll
      ? discoveredNftRows
      : discoveredNftRows.filter((row) => selectedPortfolioWalletKeys.has(row.walletKey));
    const grouped = new Map();

    for (const row of source) {
      const key = String(row.address).toLowerCase();
      const current = grouped.get(key) || { ...row, count: 0, walletCount: 0 };
      current.count += row.count;
      current.walletCount += 1;
      grouped.set(key, current);
    }

    return [...grouped.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [discoveredNftRows, portfolioWalletFilterIsAll, selectedPortfolioWalletKeys]);
  const selectedActiveStakeRows = portfolioWalletFilterIsAll
    ? activeStakeRows
    : activeStakeRows.filter((row) => selectedPortfolioWalletKeys.has(normalizeAddress(row.address).toLowerCase()));

  function estimateStakeYieldHearts(row) {
    const metrics = stakeQuoteMetrics[row.chain.key];

    if (!metrics || metrics.dayStakeSharesTotal <= 0n || row.stakeShares <= 0n || row.stakedDays <= 0) {
      return 0n;
    }

    const dailyPayoutHeartsPerTshare = metrics.dayPayoutTotal * HEARTS_PER_TSHARE / metrics.dayStakeSharesTotal;
    return dailyPayoutHeartsPerTshare * row.stakeShares * BigInt(row.stakedDays) / HEARTS_PER_TSHARE;
  }

  function estimateStakeTotalHearts(row) {
    return row.stakedHearts + estimateStakeYieldHearts(row);
  }

  // What one T-share cost when this stake started (HEX/T-share) vs what it costs today.
  // stakedHearts/stakeShares is hearts-per-share; x1e4 converts to HEX-per-T-share.
  // The live shareRate is hearts-per-share x1e5, so /10 is HEX-per-T-share.
  function tShareRateInfo(row) {
    if (!(row.stakeShares > 0n)) {
      return null;
    }

    const costHexPerTshare = (Number(row.stakedHearts) / Number(row.stakeShares)) * 1e4;
    const shareRate = stakeQuoteMetrics[row.chain.key]?.shareRate;
    const nowHexPerTshare = shareRate ? Number(shareRate) / 10 : 0;

    return { costHexPerTshare, nowHexPerTshare };
  }

  const stakeValueHearts = (row) => (includeStakeYield ? estimateStakeTotalHearts(row) : row.stakedHearts);
  const selectedStakedPulseHexHearts = selectedActiveStakeRows
    .filter((row) => row.chain.key === "pulsechain")
    .reduce((total, row) => total + stakeValueHearts(row), 0n);
  const selectedStakedEHexHearts = selectedActiveStakeRows
    .filter((row) => row.chain.key === "ethereum")
    .reduce((total, row) => total + stakeValueHearts(row), 0n);
  const selectedStakedYieldHearts = selectedActiveStakeRows.reduce((total, row) => total + estimateStakeYieldHearts(row), 0n);
  const selectedStakedPulseHexAmount = Number(ethers.formatUnits(selectedStakedPulseHexHearts, 8));
  const selectedStakedEHexAmount = Number(ethers.formatUnits(selectedStakedEHexHearts, 8));
  const selectedStakedYieldAmount = Number(ethers.formatUnits(selectedStakedYieldHearts, 8));
  const portfolioStakedValueUsd = selectedStakedPulseHexAmount * getTokenPriceUsd("phex")
    + selectedStakedEHexAmount * getTokenPriceUsd("ehex");
  const portfolioTotalUsd = portfolioLiquidTotalUsd + portfolioStakedValueUsd;

  // Snapshot net worth for the history sparkline; appendPortfolioHistory rate-limits to
  // one point per half hour, so price ticks re-running this effect are harmless.
  useEffect(() => {
    if (portfolioTotalUsd > 0 && !portfolioHoldingsBusy) {
      setPortfolioHistory(appendPortfolioHistory(portfolioTotalUsd));
    }
  }, [portfolioTotalUsd, portfolioHoldingsBusy]);

  // Backfill runs itself: once per session, after holdings load, whenever the completed
  // depth marker is shallower than the current target. Raising BACKFILL_TARGET_DAYS
  // automatically deepens existing installs. The button stays as a manual retry.
  const autoBackfillAttemptedRef = useRef(false);

  useEffect(() => {
    if (autoBackfillAttemptedRef.current || portfolioHoldingsBusy || backfillBusy) {
      return;
    }

    if (portfolioHoldings.length === 0 || portfolioAddresses.length === 0) {
      return;
    }

    autoBackfillAttemptedRef.current = true;

    if (backfillDepth < BACKFILL_TARGET_DAYS) {
      backfillHistory();
    }
  }, [portfolioHoldings, portfolioHoldingsBusy]);
  const activeUnlockRows = unlockRows.filter((row) => row.statusKind !== "ended");
  const endedUnlockRows = unlockRows.filter((row) => row.statusKind === "ended");
  const totalEstimatedYieldHearts = activeStakeRows.reduce(
    (total, row) => total + estimateStakeYieldHearts(row),
    0n
  );
  const totalPulseStakeHearts = activeStakeRows
    .filter((row) => row.chain.key === "pulsechain")
    .reduce((total, row) => total + estimateStakeTotalHearts(row), 0n);
  const totalEthereumStakeHearts = activeStakeRows
    .filter((row) => row.chain.key === "ethereum")
    .reduce((total, row) => total + estimateStakeTotalHearts(row), 0n);
  const totalStakeEstimatedValueUsd =
    Number(ethers.formatUnits(totalPulseStakeHearts, 8)) * getTokenPriceUsd("phex")
    + Number(ethers.formatUnits(totalEthereumStakeHearts, 8)) * getTokenPriceUsd("ehex");
  const pulseHexPriceUsd = getTokenPriceUsd("phex");
  const ethereumHexPriceUsd = getTokenPriceUsd("ehex");
  const stakeBookCurrentDay = Number.isFinite(stakeQuoteMetrics.pulsechain?.currentDay)
    ? stakeQuoteMetrics.pulsechain.currentDay
    : Number.isFinite(stakeQuoteMetrics.ethereum?.currentDay)
      ? stakeQuoteMetrics.ethereum.currentDay
      : estimatedHexDay();
  const stakeBookHexDayLabel = stakeBookCurrentDay.toLocaleString();
  const stakeBookPulseHexPriceLabel = pulseHexPriceUsd > 0 ? formatUsd(pulseHexPriceUsd, 8) : "-";
  const stakeBookEthereumHexPriceLabel = ethereumHexPriceUsd > 0 ? formatUsd(ethereumHexPriceUsd, 8) : "-";
  const dueWithin30Count = upcomingRows.filter((row) => row.unlockDay - getRowCurrentDay(row) <= 30).length;
  const dueWithin365Count = upcomingRows.filter((row) => row.unlockDay - getRowCurrentDay(row) <= 365).length;
  const nextMaturityDays = nextRow
    ? Math.max(0, nextRow.unlockDay - getRowCurrentDay(nextRow))
    : null;
  const pdaiTargetPriceNumber = Number(pdaiTargetPrice);
  const safePdaiTargetPrice = Number.isFinite(pdaiTargetPriceNumber) && pdaiTargetPriceNumber >= 0 ? pdaiTargetPriceNumber : 0;
  const moonMathDriverToken = MOON_MATH_TOKENS[0];

  function getMoonMathLivePrice(token, holdingRows = selectedHoldingRows) {
    const marketPrice = Number(marketRows.find((row) => row.key === token.marketKey)?.priceUsd || 0);

    if (Number.isFinite(marketPrice) && marketPrice > 0) {
      return marketPrice;
    }

    const holdingPrice = Number(holdingRows.find((row) => token.priceKeys.includes(row.priceKey))?.priceUsd || 0);
    return Number.isFinite(holdingPrice) && holdingPrice > 0 ? holdingPrice : 0;
  }

  function moonMathInputValue(row) {
    if (row.key === "pdai") {
      return pdaiTargetPrice;
    }

    const override = moonMathTargetOverrides[row.key];
    return override === undefined ? formatMoonPriceInput(row.estimatedTargetPrice) : override;
  }

  function updateMoonMathTarget(key, value) {
    const cleaned = sanitizeDecimalInput(value);

    if (key === "pdai") {
      setPdaiTargetPrice(cleaned);
      return;
    }

    setMoonMathTargetOverrides((current) => {
      const next = { ...current };

      if (!cleaned) {
        delete next[key];
      } else {
        next[key] = cleaned;
      }

      return next;
    });
  }

  function moonMathMcapInputValue(row) {
    const override = moonMathMcapOverrides[row.key];
    return override === undefined ? formatMcapValue(row.targetMcap) : override;
  }

  function updateMoonMathMcap(key, value) {
    const cleaned = String(value || "").replace(/[^0-9.tbmkTBMK]/g, "");

    setMoonMathMcapOverrides((current) => {
      const next = { ...current };

      if (!cleaned) {
        delete next[key];
      } else {
        next[key] = cleaned;
      }

      return next;
    });
  }

  const moonMathLiveDriverPrice = getMoonMathLivePrice(moonMathDriverToken);
  const moonMathMultiple = moonMathLiveDriverPrice > 0 && safePdaiTargetPrice > 0
    ? safePdaiTargetPrice / moonMathLiveDriverPrice
    : 0;
  const moonMathRows = MOON_MATH_TOKENS.map((token) => {
    const holdingRows = selectedHoldingRows.filter((row) => token.priceKeys.includes(row.priceKey));
    const liquidAmount = holdingRows.reduce((total, row) => total + Number(row.amount || 0), 0);
    const livePrice = getMoonMathLivePrice(token, holdingRows);
    const extraStakeAmount = token.key === "hex"
      ? selectedStakedPulseHexAmount
      : token.key === "ehex"
        ? selectedStakedEHexAmount
        : 0;
    const liveValue = holdingRows.reduce((total, row) => total + Number(row.valueUsd || 0), 0)
      + extraStakeAmount * livePrice;
    const currentMcap = getTokenMarketCap(token.marketKey);
    // mcap-driven tokens aim at an editable target market cap (default = our estimate);
    // their target price = livePrice * (targetMcap / currentMcap).
    const effectiveTargetMcap = token.targetMcap
      ? (parseMcapValue(moonMathMcapOverrides[token.key]) ?? token.targetMcap)
      : 0;
    const estimateMultiple = token.defaultMultiple
      ? token.defaultMultiple
      : token.targetMcap && currentMcap > 0
        ? effectiveTargetMcap / currentMcap
        : moonMathMultiple;
    const estimatedTargetPrice = token.key === "pdai"
      ? safePdaiTargetPrice
      : livePrice > 0 && estimateMultiple > 0
        ? livePrice * estimateMultiple
        : 0;
    const overridePrice = Number(moonMathTargetOverrides[token.key]);
    const targetPrice = token.key === "pdai"
      ? safePdaiTargetPrice
      : token.targetMcap
        ? estimatedTargetPrice
        : Number.isFinite(overridePrice) && overridePrice >= 0
          ? overridePrice
          : estimatedTargetPrice;
    const exposure = liquidAmount + extraStakeAmount;
    const targetMultiple = livePrice > 0 ? targetPrice / livePrice : 0;

    return {
      ...token,
      currentMcap,
      effectiveTargetMcap,
      estimatedTargetPrice,
      estimateMultiple,
      exposure,
      livePrice,
      liveValue,
      targetMultiple,
      targetPrice,
      targetValue: exposure * targetPrice
    };
  });
  const moonMathLiveCoreValue = moonMathRows.reduce((total, row) => total + row.liveValue, 0);
  const moonMathProjectedCoreValue = moonMathRows.reduce((total, row) => total + row.targetValue, 0);
  const moonMathNonCoreValue = Math.max(0, portfolioTotalUsd - moonMathLiveCoreValue);
  const moonMathProjectedPortfolioValue = moonMathNonCoreValue + moonMathProjectedCoreValue;
  const pulseGasLabel = pulseGas.status === "loading" ? "loading" : formatGasGwei(pulseGas.gwei);
  const pulseGasDetail = pulseGas.simpleTxPls
    ? `simple tx ~${formatPlsAmount(pulseGas.simpleTxPls)}`
    : pulseGas.status === "unavailable"
      ? "RPC unavailable"
      : "checking PulseChain RPC";
  function setWalletActionStatus(message) {
    if (isStakeCreator) {
      setStakeStatus(message);
    } else {
      setStatus(message);
    }
  }

  useEffect(() => {
    window.localStorage.setItem(PORTFOLIO_STORAGE_KEY, JSON.stringify({ wallets: savedWallets }));
    window.localStorage.setItem(LEGACY_ADDRESS_STORAGE_KEY, portfolioAddresses.join("\n"));

    if (savedWallets.length > 0) {
      savePortfolioWalletBackup(savedWallets);
      setWalletBackup(loadPortfolioWalletBackup());
    }
  }, [savedWallets, portfolioAddresses]);

  // Built-ins first so they win the dedupe and keep their curated symbol/icon/decimals.
  const allMarketTokens = useMemo(
    () => dedupeTokensByIdentity([...MARKET_TOKENS, ...customCoreTokens]),
    [customCoreTokens]
  );
  // User-added core tokens are scanned for balances too, otherwise they'd show a price but never
  // appear in holdings. They carry no decimals, so those resolve on-chain during the scan.
  const portfolioScanTokens = useMemo(
    () => dedupeTokensByIdentity([
      ...PORTFOLIO_TOKENS,
      ...customCoreTokens.map((token) => ({ ...token, decimals: undefined, priceKey: token.key }))
    ]),
    [customCoreTokens]
  );

  useEffect(() => {
    if (isStakeCreator) {
      return undefined;
    }

    refreshMarkets();

    // Prices re-layer over cached balances instantly (pricedPortfolioHoldings), so a
    // minute-level market refresh keeps values live without re-reading the chain.
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        refreshMarkets();
      }
    }, 60_000);

    return () => window.clearInterval(interval);
  }, [isStakeCreator, allMarketTokens]);

  useEffect(() => {
    refreshPulseGas();

    const interval = window.setInterval(() => {
      refreshPulseGas();
    }, 60_000);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    refreshStakeQuoteMetrics();
  }, []);

  // Quiet balance refresh: re-read balances of already-known rows only (no discovery, no
  // LP probing, no farm scan — those need a full refresh). A few multicall round trips
  // every five minutes keeps amounts current without touching the busy spinner.
  const portfolioHoldingsRef = useRef(portfolioHoldings);
  const discoveredNftRowsRef = useRef(discoveredNftRows);

  useEffect(() => {
    portfolioHoldingsRef.current = portfolioHoldings;
  }, [portfolioHoldings]);

  useEffect(() => {
    discoveredNftRowsRef.current = discoveredNftRows;
  }, [discoveredNftRows]);

  useEffect(() => {
    const interval = window.setInterval(async () => {
      const rows = portfolioHoldingsRef.current;

      if (document.visibilityState !== "visible" || rows.length === 0) {
        return;
      }

      try {
        const updated = await Promise.all(rows.map(async (row) => {
          // Farm/pending rows read other contracts; the full refresh owns those.
          if (row.positionTag) {
            return row;
          }

          try {
            const mcall = getMulticall(row.chain);
            const balance = row.native
              ? await mcall(multicall3Ref, "getEthBalance", [row.walletAddress])
              : await mcall(erc20Ref(row.address), "balanceOf", [row.walletAddress]);

            if (balance === row.balance) {
              return row;
            }

            const amount = Number(ethers.formatUnits(balance, row.decimals));
            return { ...row, balance, amount, valueUsd: amount * (row.priceUsd || 0) };
          } catch {
            return row;
          }
        }));

        setPortfolioHoldings(updated);
        savePortfolioHoldingsCache(updated, discoveredNftRowsRef.current);
      } catch {
        // Next tick retries.
      }
    }, 300_000);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (isStakeCreator || portfolioAddresses.length === 0 || portfolioHoldingsBusy) {
      return;
    }

    // Keyed on what actually changes the balances to read. Prices are applied by
    // pricedPortfolioHoldings, so a price tick must not kick off another scan.
    const addressKey = portfolioAddresses.map((address) => address.toLowerCase()).join("|");
    const tokenKey = portfolioScanTokens.map((token) => token.key).join("|");
    const autoLoadKey = `${addressKey}::${tokenKey}`;

    if (portfolioAutoLoadKeyRef.current === autoLoadKey) {
      return;
    }

    portfolioAutoLoadKeyRef.current = autoLoadKey;
    refreshPortfolioHoldings();
  }, [isStakeCreator, portfolioAddresses, portfolioHoldingsBusy, portfolioScanTokens]);

  useEffect(() => {
    const ethereum = window.ethereum;

    if (!ethereum?.on) {
      return undefined;
    }

    const handleAccounts = (accounts) => {
      setWalletAccount(accounts?.[0] ? normalizeAddress(accounts[0]) : "");
    };
    const handleChain = (chainId) => {
      setWalletChainId(Number.parseInt(chainId, 16));
    };

    ethereum.on("accountsChanged", handleAccounts);
    ethereum.on("chainChanged", handleChain);

    async function syncWalletState() {
      try {
        const [accounts, chainId] = await Promise.all([
          ethereum.request({ method: "eth_accounts" }),
          ethereum.request({ method: "eth_chainId" })
        ]);

        handleAccounts(accounts);
        handleChain(chainId);
      } catch {
        // Wallet state will still update when the user connects or switches networks.
      }
    }

    syncWalletState();

    return () => {
      ethereum.removeListener?.("accountsChanged", handleAccounts);
      ethereum.removeListener?.("chainChanged", handleChain);
    };
  }, []);

  useEffect(() => {
    if (isStakeCreator && walletAccount) {
      refreshStakeWallet();
    }
  }, [isStakeCreator, walletAccount, stakeChainKey, walletChainId]);

  useEffect(() => {
    if (isStakeCreator || !walletAccount) {
      if (!walletAccount) {
        autoSavedWalletRef.current = "";
      }
      return;
    }

    const walletKey = walletAccount.toLowerCase();

    if (autoSavedWalletRef.current === walletKey) {
      return;
    }

    autoSavedWalletRef.current = walletKey;
    saveWalletAddress(walletAccount, { silent: true });
  }, [isStakeCreator, walletAccount]);

  useEffect(() => {
    if (!isStakeCreator || !tshareOpen) {
      return;
    }

    const cachedRows = tshareRowsByChain[stakeChainKey] || [];

    if (cachedRows.length > 1) {
      tshareRequestKeyRef.current = "";
      tshareRequestedChainKeyRef.current = stakeChainKey;
      setTshareBusy(false);
      setTshareRows(cachedRows);
      setTshareStatus(`Showing ${cachedRows.length.toLocaleString()} ${selectedStakeChain.label} T-share history rows.`);
      return;
    }

    if (tshareRequestedChainKeyRef.current !== stakeChainKey) {
      refreshTshareHistory(stakeChainKey);
    }
  }, [isStakeCreator, tshareOpen, stakeChainKey, tshareRowsByChain]);

  useEffect(() => {
    if (!isHexStakes) {
      hexStakeAutoRefreshKeyRef.current = "";
      return;
    }

    if (busy || portfolioAddresses.length === 0 || activeChainKey === "") {
      return;
    }

    const addressKey = portfolioAddresses.map((address) => address.toLowerCase()).join("|");
    const refreshKey = [
      addressKey,
      activeChainKey,
      includeIcosa ? "hsi" : "native",
      includeIcosaNfts ? "nfts" : "no-nfts"
    ].join("::");

    if (hexStakeAutoRefreshKeyRef.current === refreshKey) {
      return;
    }

    hexStakeAutoRefreshKeyRef.current = refreshKey;
    refreshHexStakes();
  }, [isHexStakes, busy, portfolioAddresses, activeChainKey, includeIcosa, includeIcosaNfts]);

  // In the portfolio view, load the daily payout-per-T-share series for each chain that has stakes,
  // so each stake row can render a daily-yield sparkline. Cheap: one fetch per chain, then cached.
  useEffect(() => {
    if (isStakeCreator) {
      return;
    }

    const chains = [...new Set(rows.map((row) => row.chain?.key).filter(Boolean))];

    chains.forEach((key) => {
      if (dailyYieldByChain[key] || dailyYieldLoadingRef.current.has(key)) {
        return;
      }

      const endpoint = TSHARE_HISTORY_ENDPOINTS[key];

      if (!endpoint) {
        return;
      }

      dailyYieldLoadingRef.current.add(key);

      (async () => {
        try {
          const response = await fetch(endpoint);

          if (!response.ok) {
            throw new Error(`${response.status}`);
          }

          const data = await response.json();
          const map = new Map();

          (Array.isArray(data) ? data : []).forEach((entry) => {
            const normalized = normalizeTshareHistoryRow(entry);

            if (normalized && normalized.payoutPerTshare > 0) {
              map.set(normalized.day, normalized.payoutPerTshare);
            }
          });

          setDailyYieldByChain((prev) => ({ ...prev, [key]: map }));
        } catch {
          // Non-fatal — the sparkline just won't render for this chain.
        } finally {
          dailyYieldLoadingRef.current.delete(key);
        }
      })();
    });
  }, [isStakeCreator, rows, dailyYieldByChain]);

  useEffect(() => {
    setNextUnlockPage(0);
  }, [upcomingRows.length]);


  function walletLabel(address) {
    const normalizedAddress = normalizeAddress(address);
    const wallet = validWallets.find((item) => item.normalizedAddress === normalizedAddress);
    return wallet?.name?.trim() || shortAddress(normalizedAddress || address);
  }

  function displayWalletLabel(address) {
    return hideWalletInfo ? "****" : walletLabel(address);
  }

  function displayShortAddress(address) {
    return hideWalletInfo ? "****" : shortAddress(address);
  }

  function displayHexAmount(value) {
    return hideHexAmounts ? "****" : value;
  }

  function getRowCurrentDay(row) {
    return Number.isFinite(row.currentDay)
      ? row.currentDay
      : Number.isFinite(scanChainDays[row.chain.key])
        ? scanChainDays[row.chain.key]
        : estimatedHexDay();
  }

  function getStakeProgress(row) {
    const servedDays = Math.max(0, Math.min(row.stakedDays, getRowCurrentDay(row) - row.lockedDay));
    return {
      percent: row.stakedDays > 0 ? Math.min(100, (servedDays / row.stakedDays) * 100) : 0,
      servedDays
    };
  }

  function getStakeEstimatedValueUsd(row) {
    const amount = Number(ethers.formatUnits(estimateStakeTotalHearts(row), 8));
    const priceKey = row.chain.key === "ethereum" ? "ehex" : "phex";
    return amount * getTokenPriceUsd(priceKey);
  }

  function buildEarlyEndWarning(row) {
    const currentDay = getRowCurrentDay(row);
    const servedDays = Math.max(0, Math.min(row.stakedDays, currentDay - row.lockedDay));
    const daysLeft = Math.max(0, row.stakedDays - servedDays);
    const penaltyDays = Math.max(Math.ceil(row.stakedDays / 2), 90);
    const progress = row.stakedDays > 0 ? servedDays / row.stakedDays : 0;
    const penaltyWindowMet = servedDays >= penaltyDays;
    const principalRisk = penaltyWindowMet ? "0 HEX expected" : `up to ${row.hex} HEX`;

    return {
      daysLeft,
      penaltyDays,
      penaltyWindowMet,
      principalRisk,
      progress,
      servedDays
    };
  }

  function stakeDomId(row) {
    return `stake-row-${String(row.id).replace(/[^a-zA-Z0-9_-]/g, "-")}`;
  }

  function scrollToStake(row) {
    setHighlightedStakeId(row.id);

    window.setTimeout(() => {
      document.getElementById(stakeDomId(row))?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 0);

    window.setTimeout(() => {
      setHighlightedStakeId((current) => (current === row.id ? "" : current));
    }, 2200);
  }

  function toggleUnlockSort(key) {
    setUnlockSort((current) => ({
      key,
      direction: current.key === key && current.direction === "asc" ? "desc" : "asc"
    }));
  }

  function renderSortHeader(label, key) {
    const active = unlockSort.key === key;

    return (
      <button
        className={active ? "tableSortButton isActive" : "tableSortButton"}
        type="button"
        onClick={() => toggleUnlockSort(key)}
        title={`Sort by ${label}`}
        aria-label={`Sort unlocks by ${label}`}
      >
        {label}
        <ChevronDown className={active && unlockSort.direction === "asc" ? "isAsc" : ""} size={13} aria-hidden="true" />
      </button>
    );
  }

  function resetScanResults() {
    setRows([]);
    setNftRows([]);
    setSummaryRows([]);
    setScanChainDays({});
    setWarnings([]);
    setPortfolioHoldings([]);
    setPortfolioHoldingsStatus("");
    setPortfolioWalletFilters([]);
    clearScanCache();
    clearPortfolioHoldingsCache();
  }

  function togglePortfolioWalletSelection(walletKey) {
    setPortfolioWalletFilters((current) => {
      const key = String(walletKey || "").toLowerCase();

      if (!key) {
        return current;
      }

      if (current.includes(key)) {
        return current.filter((item) => item !== key);
      }

      return [...current, key];
    });
  }

  function scrollToWalletManager() {
    walletManagerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    setWalletAddPrompt(true);

    if (walletAddFocusTimeoutRef.current) {
      window.clearTimeout(walletAddFocusTimeoutRef.current);
    }

    if (walletAddPromptTimeoutRef.current) {
      window.clearTimeout(walletAddPromptTimeoutRef.current);
    }

    walletAddFocusTimeoutRef.current = window.setTimeout(() => {
      walletAddressInputRef.current?.focus({ preventScroll: true });
    }, 480);

    walletAddPromptTimeoutRef.current = window.setTimeout(() => {
      setWalletAddPrompt(false);
    }, 2800);
  }

  function saveWalletAddress(address, { silent = false } = {}) {
    const normalizedAddress = normalizeAddress(address || "");

    if (!normalizedAddress) {
      if (!silent) {
        setStatus("Connect a wallet first.");
      }
      return false;
    }

    if (portfolioAddresses.some((item) => item.toLowerCase() === normalizedAddress.toLowerCase())) {
      if (!silent) {
        setStatus("That wallet is already saved.");
      }
      return false;
    }

    if (portfolioAddresses.length >= MAX_PORTFOLIO_WALLETS) {
      if (!silent) {
        setStatus(`Wallet limit reached. Keep this portfolio to ${MAX_PORTFOLIO_WALLETS} wallets so scans stay responsive.`);
      }
      return false;
    }

    setPortfolio((current) => {
      const wallets = normalizeWalletRows(current.wallets || []);

      if (wallets.some((wallet) => normalizeAddress(wallet.address).toLowerCase() === normalizedAddress.toLowerCase())) {
        return current;
      }

      return {
        wallets: [...wallets, createWalletRow({ address: normalizedAddress, name: shortAddress(normalizedAddress) })]
      };
    });
    setClearWalletsArmed(false);

    if (!silent) {
      setStatus(`Saved ${displayShortAddress(normalizedAddress)}. Press Refresh stakes to update.`);
    }

    return true;
  }

  function updateWallet(id, field, value) {
    setClearWalletsArmed(false);

    if (field === "address") {
      resetScanResults();
      setStatus("Wallet address changed. Press Refresh stakes to update.");
    }

    setPortfolio((current) => ({
      wallets: normalizeWalletRows(current.wallets || []).map((wallet) => (
        wallet.id === id ? { ...wallet, [field]: value } : wallet
      ))
    }));
  }

  function normalizeWalletAddress(id) {
    setPortfolio((current) => ({
      wallets: normalizeWalletRows((current.wallets || []).map((wallet) => {
        if (wallet.id !== id) {
          return wallet;
        }

        const normalizedAddress = normalizeAddress(wallet.address);
        return normalizedAddress ? { ...wallet, address: normalizedAddress } : wallet;
      }))
    }));
  }

  function addWallet() {
    const address = normalizeAddress(walletDraft.address);

    if (!address) {
      setStatus("Enter a valid 0x wallet address.");
      return;
    }

    if (portfolioAddresses.some((item) => item.toLowerCase() === address.toLowerCase())) {
      setStatus("That wallet is already saved.");
      return;
    }

    if (portfolioAddresses.length >= MAX_PORTFOLIO_WALLETS) {
      setStatus(`Wallet limit reached. Keep this portfolio to ${MAX_PORTFOLIO_WALLETS} wallets so scans stay responsive.`);
      return;
    }

    const nextWallet = createWalletRow({
      address,
      name: walletDraft.name || shortAddress(address)
    });

    setPortfolio((current) => ({
      wallets: [...normalizeWalletRows(current.wallets || []), nextWallet]
    }));
    setWalletDraft({ name: "", address: "" });
    setClearWalletsArmed(false);
    setStatus(`Saved ${hideWalletInfo ? "****" : nextWallet.name || shortAddress(address)}. Press Refresh stakes to update.`);
  }

  function handleWalletDraftKeyDown(event) {
    if (event.key !== "Enter") {
      return;
    }

    event.preventDefault();
    addWallet();
  }

  function removeWallet(id) {
    const wallet = savedWallets.find((item) => item.id === id);
    const address = normalizeAddress(wallet?.address || "");

    setPortfolio((current) => ({
      wallets: normalizeWalletRows(current.wallets || []).filter((item) => item.id !== id)
    }));

    if (address) {
      setRows((current) => current.filter((row) => row.address !== address));
      setNftRows((current) => current.filter((row) => row.address !== address));
      setSummaryRows((current) => current.filter((row) => row.address !== address));
      setPortfolioHoldings((current) => current.filter((row) => row.walletAddress !== address));
      setPortfolioWalletFilters((current) => current.filter((key) => key !== address.toLowerCase()));
    }

    clearScanCache();
    clearPortfolioHoldingsCache();
    setStatus("Wallet removed. Press Refresh stakes to update cached stakes.");
  }

  function clearPortfolio() {
    if (!clearWalletsArmed) {
      setClearWalletsArmed(true);
      setStatus("Click Confirm clear wallets to remove saved wallets from this browser.");
      return;
    }

    setClearWalletsArmed(false);
    setPortfolio({ wallets: [] });
    resetScanResults();
    setStatus("Portfolio addresses cleared. The last non-empty wallet list is kept for recovery.");
  }

  function recoverSavedWallets() {
    if (recoverableExtras.length === 0) {
      setStatus("No additional cached wallets found to recover.");
      return;
    }

    setPortfolio((current) => ({
      wallets: normalizeWalletRows([...(current.wallets || []), ...recoverableExtras]).slice(0, MAX_PORTFOLIO_WALLETS)
    }));
    setStatus(`Added back ${recoverableExtras.length.toLocaleString()} cached wallet${recoverableExtras.length === 1 ? "" : "s"}. Press Refresh stakes for a fresh scan.`);
  }

  function savePortfolioGroup() {
    const name = groupNameDraft.trim();

    if (!name) {
      setStatus("Name the portfolio group first.");
      return;
    }

    if (validWallets.length === 0) {
      setStatus("Add at least one wallet before saving a group.");
      return;
    }

    const group = {
      id: `group-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      name,
      wallets: normalizeWalletRows(savedWallets)
    };
    const next = [...portfolioGroups.filter((item) => item.name.toLowerCase() !== name.toLowerCase()), group];

    setPortfolioGroups(next);
    savePortfolioGroups(next);
    setGroupNameDraft("");
    setStatus(`Saved portfolio "${name}" (${group.wallets.length} wallet${group.wallets.length === 1 ? "" : "s"}).`);
  }

  function loadPortfolioGroup(id, merge = false) {
    const group = portfolioGroups.find((item) => item.id === id);

    if (!group) {
      return;
    }

    setPortfolio((current) => ({
      wallets: merge
        ? normalizeWalletRows([...(current.wallets || []), ...group.wallets]).slice(0, MAX_PORTFOLIO_WALLETS)
        : normalizeWalletRows(group.wallets)
    }));
    setStatus(`${merge ? "Merged" : "Loaded"} portfolio "${group.name}". Press Refresh stakes.`);
  }

  function deletePortfolioGroup(id) {
    const group = portfolioGroups.find((item) => item.id === id);
    const next = portfolioGroups.filter((item) => item.id !== id);

    setPortfolioGroups(next);
    savePortfolioGroups(next);

    if (group) {
      setStatus(`Deleted portfolio "${group.name}".`);
    }
  }

  async function refreshPulseGas() {
    try {
      const chain = getChain("pulsechain");
      const feeData = await runOnChain(chain, (provider) => provider.getFeeData());
      const gasPrice = feeData.gasPrice ?? feeData.maxFeePerGas;

      if (!gasPrice || gasPrice <= 0n) {
        throw new Error("No PulseChain gas price returned.");
      }

      setPulseGas({
        gwei: Number(ethers.formatUnits(gasPrice, "gwei")),
        simpleTxPls: Number(ethers.formatEther(gasPrice * 21_000n)),
        status: "live"
      });
    } catch {
      setPulseGas({ gwei: null, simpleTxPls: null, status: "unavailable" });
    }
  }

  async function refreshMarkets() {
    setMarketStatus("");

    try {
      const nextRows = [];
      const nextWarnings = [];

      // Both chains are fetched at once; waiting on PulseChain before starting Ethereum
      // doubled the time before any price appeared. fetchDexScreenerPairs chunks by the
      // API's 30-address cap, so the token list can grow without silently losing prices.
      const perChain = await Promise.all(CHAINS.map(async (chain) => {
        const tokens = allMarketTokens.filter((token) => token.chainKey === chain.key);

        try {
          const pairs = await fetchDexScreenerPairs(chain.key, tokens.map((token) => token.address));

          return {
            rows: tokens.map((token) => marketRowFromPair(token, pickBestMarketPair(pairs, token)))
          };
        } catch (error) {
          return {
            rows: tokens.map((token) => marketRowFromPair(token, null)),
            warning: `${chain.label} market data failed: ${error?.message || "unknown error"}`
          };
        }
      }));

      for (const result of perChain) {
        nextRows.push(...result.rows);

        if (result.warning) {
          nextWarnings.push(result.warning);
        }
      }

      setMarketRows(nextRows);
      setMarketStatus(nextWarnings.length > 0 ? nextWarnings.join(" ") : "");
    } catch (error) {
      setMarketStatus(error?.message || "Market refresh failed.");
    }
  }

  function getTokenPriceUsd(priceKey) {
    const row = marketRows.find((item) => item.key === priceKey);
    const price = Number(row?.priceUsd);

    return Number.isFinite(price) && price > 0 ? price : 0;
  }

  function getTokenMarketIcon(priceKey) {
    const row = marketRows.find((item) => item.key === priceKey);
    return row?.icon || "";
  }

  function getTokenMarketRow(priceKey) {
    return marketRows.find((item) => item.key === priceKey);
  }

  function getTokenMarketCap(marketKey) {
    const row = marketRows.find((item) => item.key === marketKey);
    const marketCap = Number(row?.marketCap);

    return Number.isFinite(marketCap) && marketCap > 0 ? marketCap : 0;
  }

  function buildPortfolioTokenRow({ address, balance = 0n, chain, decimals, token, walletKey }) {
    const amount = Number(ethers.formatUnits(balance, decimals));
    const priceUsd = getTokenPriceUsd(token.priceKey);
    // User-added tokens store only an address; their labels come from the resolved market pair.
    const marketRow = token.symbol && token.name ? null : getTokenMarketRow(token.priceKey);

    return {
      ...token,
      amount,
      balance,
      chain,
      decimals,
      symbol: token.symbol || marketRow?.symbol || `${String(token.address || "?").slice(0, 6)}…`,
      name: token.name || marketRow?.name || "Custom token",
      icon: token.icon || getTokenMarketIcon(token.priceKey),
      priceUsd,
      valueUsd: amount * priceUsd,
      walletKey,
      walletLabel: walletLabel(address),
      walletAddress: address
    };
  }

  async function refreshPortfolioHoldings() {
    if (portfolioAddresses.length === 0) {
      setPortfolioHoldings([]);
      setPortfolioHoldingsStatus(invalidWalletCount > 0 ? "Fix the invalid wallet address first." : "Add at least one wallet.");
      return;
    }

    setPortfolioHoldingsBusy(true);
    setPortfolioHoldingsStatus("");

    try {
      const statusNotes = [];

      // Discover every PRC-20 each wallet holds (PulseChain only — Blockscout covers chain
      // 369; the Ethereum side keeps its curated list). Blockscout supplies the token list
      // and metadata; balances are re-read on-chain below so the chain stays authoritative.
      const pulseChain = getChain("pulsechain");
      const curatedIdentities = new Set(portfolioScanTokens.map(tokenIdentity));
      // Blockscout rate-limits bursts; one retry after a short backoff recovers most failures.
      const discoveryResults = await runWithConcurrency(portfolioAddresses, DISCOVERY_CONCURRENCY, async (address) => {
        for (let attempt = 0; attempt < 2; attempt += 1) {
          try {
            return await discoverWalletTokens(address);
          } catch {
            if (attempt === 0) {
              await new Promise((resolve) => setTimeout(resolve, 800));
            }
          }
        }

        return null;
      });

      const discoveredTasks = [];
      const discoveredTokensByAddress = new Map();
      const discoveryFailedWallets = [];
      const nextNftRows = [];
      let discoveryTruncated = 0;

      discoveryResults.forEach((result, index) => {
        if (!result) {
          discoveryFailedWallets.push(walletLabel(portfolioAddresses[index]));
          return;
        }

        discoveryTruncated += result.truncated;

        for (const nft of result.nfts || []) {
          nextNftRows.push({
            ...nft,
            walletKey: portfolioAddresses[index].toLowerCase(),
            walletLabel: walletLabel(portfolioAddresses[index])
          });
        }

        for (const discovered of result.tokens) {
          const addressLower = discovered.address.toLowerCase();

          if (curatedIdentities.has(`pulsechain:${addressLower}`)) {
            continue;
          }

          const token = {
            key: `disc-${addressLower}`,
            symbol: discovered.symbol,
            name: discovered.name,
            chainKey: "pulsechain",
            address: discovered.address,
            decimals: discovered.decimals,
            priceKey: `disc-${addressLower}`,
            discovered: true
          };

          discoveredTasks.push({ address: portfolioAddresses[index], chain: pulseChain, token });
          discoveredTokensByAddress.set(addressLower, token);
        }
      });

      // One flat task list: curated tokens for every wallet on both chains, plus each
      // wallet's discovered tokens. The multicall batcher coalesces all of it into a few
      // aggregate3 round trips per chain.
      const tasks = [];

      for (const chain of CHAINS) {
        const tokens = portfolioScanTokens.filter((token) => token.chainKey === chain.key);

        for (const address of portfolioAddresses) {
          for (const token of tokens) {
            tasks.push({ address, chain, token });
          }
        }
      }

      tasks.push(...discoveredTasks);

      // PulseX MasterChef positions: staked LP is invisible to balanceOf, so every pool is
      // asked directly. 19 pools x wallets x 2 reads all coalesce into the multicall.
      const farmPositionsPromise = (async () => {
        const mcallPulse = getMulticall(pulseChain);
        const pools = await getMasterChefPools(mcallPulse);
        const positions = [];

        await Promise.all(portfolioAddresses.flatMap((address) => pools.map(async (pool) => {
          try {
            const [userInfo, pending] = await Promise.all([
              mcallPulse(masterChefRef, "userInfo", [pool.pid, address]),
              mcallPulse(masterChefRef, "pendingInc", [pool.pid, address]).catch(() => 0n)
            ]);
            const amount = BigInt(userInfo.amount ?? userInfo[0] ?? 0);

            if (amount > 0n || pending > 0n) {
              positions.push({ address, pid: pool.pid, lpToken: pool.lpToken, amount, pending });
            }
          } catch {
            // One unreadable pool must not sink the rest.
          }
        })));

        return positions;
      })();

      // Probe which discovered tokens are UniswapV2-style pairs. Real LPs answer
      // token0/token1; for those, pull reserves, supply, and underlying metadata. All of it
      // rides the multicall, so non-LP tokens cost two coalesced (reverting) sub-calls.
      // Farm-staked LP tokens join the probe set so their pools decompose the same way.
      const uniqueDiscoveredAddresses = [...discoveredTokensByAddress.keys()];
      const lpInfoPromise = (async () => {
        const mcallPulse = getMulticall(pulseChain);
        const farmPositions = await farmPositionsPromise.catch(() => []);
        const probeAddresses = [...new Set([
          ...uniqueDiscoveredAddresses,
          ...farmPositions.map((position) => position.lpToken)
        ])];
        const probes = await Promise.all(probeAddresses.map(async (addressLower) => {
          try {
            const ref = { target: addressLower, interface: lpPairInterface };
            const [token0, token1] = await Promise.all([
              mcallPulse(ref, "token0"),
              mcallPulse(ref, "token1")
            ]);

            return { addressLower, token0: String(token0).toLowerCase(), token1: String(token1).toLowerCase() };
          } catch {
            return null;
          }
        }));

        const lpInfo = new Map();

        await Promise.all(probes.filter(Boolean).map(async (probe) => {
          try {
            const ref = { target: probe.addressLower, interface: lpPairInterface };
            const [reserves, totalSupply, symbol0, symbol1, decimals0, decimals1] = await Promise.all([
              mcallPulse(ref, "getReserves"),
              mcallPulse(ref, "totalSupply"),
              mcallPulse({ target: probe.token0, interface: erc20SymbolInterface }, "symbol").catch(() => "?"),
              mcallPulse({ target: probe.token1, interface: erc20SymbolInterface }, "symbol").catch(() => "?"),
              resolveTokenDecimals(pulseChain, { chainKey: "pulsechain", address: probe.token0 }),
              resolveTokenDecimals(pulseChain, { chainKey: "pulsechain", address: probe.token1 })
            ]);

            if (totalSupply > 0n) {
              lpInfo.set(probe.addressLower, {
                ...probe,
                reserve0: BigInt(reserves.reserve0 ?? reserves[0]),
                reserve1: BigInt(reserves.reserve1 ?? reserves[1]),
                totalSupply,
                symbol0: String(symbol0),
                symbol1: String(symbol1),
                decimals0,
                decimals1
              });
            }
          } catch {
            // Answered token0/token1 but not the rest — not a healthy pair; leave as a plain token.
          }
        }));

        return lpInfo;
      })();

      // Pricing waits on the LP probe (it must know which addresses are pairs and what their
      // underlying tokens are) but runs concurrently with the balance reads.
      const discoveredPricesPromise = (async () => {
        const lpInfo = await lpInfoPromise;
        const plainAddresses = uniqueDiscoveredAddresses.filter((addressLower) => !lpInfo.has(addressLower));
        const underlyingAddresses = [...new Set([...lpInfo.values()].flatMap((lp) => [lp.token0, lp.token1]))];

        // Curated market prices by address — WPLS, PLSX, pDAI etc. price LP sides for free.
        const addressPrice = new Map();

        for (const marketRow of marketRows) {
          const price = Number(marketRow.priceUsd);

          if (marketRow.address && marketRow.chainKey === "pulsechain" && Number.isFinite(price) && price > 0) {
            addressPrice.set(String(marketRow.address).toLowerCase(), price);
          }
        }

        const unknownUnderlying = underlyingAddresses.filter((addressLower) => !addressPrice.has(addressLower));
        const fetchList = [...new Set([...plainAddresses, ...unknownUnderlying])];
        const pairs = fetchList.length > 0 ? await fetchDexScreenerPairs("pulsechain", fetchList) : [];
        const fetchSet = new Set(fetchList);
        const pairsByToken = new Map();

        for (const pair of pairs) {
          for (const side of ["baseToken", "quoteToken"]) {
            const pairAddress = pair?.[side]?.address?.toLowerCase();

            if (pairAddress && fetchSet.has(pairAddress)) {
              const bucket = pairsByToken.get(pairAddress) || [];
              bucket.push(pair);
              pairsByToken.set(pairAddress, bucket);
            }
          }
        }

        const priced = {};

        for (const addressLower of plainAddresses) {
          const token = discoveredTokensByAddress.get(addressLower);
          const best = pickBestMarketPair(pairsByToken.get(addressLower) || [], token);

          if (!best) {
            continue;
          }

          const priceUsd = getTokenPairPriceUsd(best, token);
          const liquidityUsd = Number(best.liquidity?.usd || 0);

          if (priceUsd > 0 && liquidityUsd >= DISCOVERED_MIN_LIQUIDITY_USD) {
            priced[addressLower] = {
              priceUsd,
              liquidityUsd,
              icon: typeof best.info?.imageUrl === "string" ? best.info.imageUrl : ""
            };
          }
        }

        for (const addressLower of unknownUnderlying) {
          const best = pickBestMarketPair(pairsByToken.get(addressLower) || [], { address: addressLower });

          if (!best) {
            continue;
          }

          const priceUsd = getTokenPairPriceUsd(best, { address: addressLower });

          if (priceUsd > 0 && Number(best.liquidity?.usd || 0) >= DISCOVERED_MIN_LIQUIDITY_USD) {
            addressPrice.set(addressLower, priceUsd);
          }
        }

        // Value each LP as its share of pool TVL. Pools sit ~50/50, so when only one side
        // has a trusted price the other side is assumed equal; neither side priced → the LP
        // stays unpriced and lands in unverified.
        for (const [addressLower, lp] of lpInfo) {
          const amount0 = Number(ethers.formatUnits(lp.reserve0, lp.decimals0));
          const amount1 = Number(ethers.formatUnits(lp.reserve1, lp.decimals1));
          const price0 = addressPrice.get(lp.token0) || 0;
          const price1 = addressPrice.get(lp.token1) || 0;
          let tvlUsd = 0;

          if (price0 > 0 && price1 > 0) {
            tvlUsd = amount0 * price0 + amount1 * price1;
          } else if (price0 > 0) {
            tvlUsd = amount0 * price0 * 2;
          } else if (price1 > 0) {
            tvlUsd = amount1 * price1 * 2;
          }

          const supply = Number(ethers.formatUnits(lp.totalSupply, 18));

          if (tvlUsd > 0 && supply > 0) {
            priced[addressLower] = { priceUsd: tvlUsd / supply, liquidityUsd: tvlUsd, icon: "" };
          }
        }

        return priced;
      })();

      const balanceResults = await Promise.all(tasks.map(async ({ address, chain, token }) => {
        const walletKey = address.toLowerCase();
        const mcall = getMulticall(chain);

        try {
          const decimals = token.native ? token.decimals : await resolveTokenDecimals(chain, token);
          const balance = token.native
            ? await mcall(multicall3Ref, "getEthBalance", [address])
            : await mcall(erc20Ref(token.address), "balanceOf", [address]);

          if (balance <= 0n && !token.showWhenZero) {
            return null;
          }

          return buildPortfolioTokenRow({ address, balance, chain, decimals, token, walletKey });
        } catch {
          // A missing token contract or flaky public RPC should not break the whole portfolio.
          return token.showWhenZero
            ? buildPortfolioTokenRow({ address, balance: 0n, chain, decimals: token.decimals ?? 18, token, walletKey })
            : null;
        }
      }));

      const nextDiscoveredPrices = await discoveredPricesPromise.catch(() => {
        statusNotes.push("Discovered-token prices unavailable.");
        return {};
      });
      const lpInfoResolved = await lpInfoPromise.catch(() => new Map());
      const farmPositions = await farmPositionsPromise.catch(() => {
        statusNotes.push("PulseX farm positions unavailable.");
        return [];
      });

      // Farm rows: one per staked-LP position, plus one per pool's pending INC. positionTag
      // keeps them distinct from wallet-held rows of the same contracts.
      const farmRows = [];

      for (const position of farmPositions) {
        const walletKey = position.address.toLowerCase();
        const lp = lpInfoResolved.get(position.lpToken);

        if (position.amount > 0n) {
          const token = {
            key: `farm-${position.pid}-${position.lpToken}`,
            symbol: lp ? `${lp.symbol0}-${lp.symbol1} LP (farm)` : "Farm LP",
            name: "Staked in PulseX farm",
            chainKey: "pulsechain",
            address: position.lpToken,
            decimals: 18,
            priceKey: `disc-${position.lpToken}`,
            discovered: true,
            farm: true,
            positionTag: `farm-${position.pid}`
          };
          let row = buildPortfolioTokenRow({ address: position.address, balance: position.amount, chain: pulseChain, decimals: 18, token, walletKey });

          if (lp && lp.totalSupply > 0n) {
            const supply = Number(ethers.formatUnits(lp.totalSupply, 18));
            const per0 = supply > 0 ? Number(ethers.formatUnits(lp.reserve0, lp.decimals0)) / supply : 0;
            const per1 = supply > 0 ? Number(ethers.formatUnits(lp.reserve1, lp.decimals1)) / supply : 0;

            row = {
              ...row,
              lp: true,
              lpUnderlying: { symbol0: lp.symbol0, symbol1: lp.symbol1, per0, per1 },
              name: `${formatLpUnderlyingAmount(row.amount * per0)} ${lp.symbol0} + ${formatLpUnderlyingAmount(row.amount * per1)} ${lp.symbol1} · PulseX farm`
            };
          }

          farmRows.push(row);
        }

        if (position.pending > 0n) {
          const token = {
            key: `farm-pending-inc-${position.pid}`,
            symbol: "INC (pending)",
            name: "PulseX farm rewards, claimable",
            chainKey: "pulsechain",
            address: INC_ADDRESS,
            decimals: 18,
            priceKey: "inc",
            farm: true,
            positionTag: `farm-pending-${position.pid}`,
            icon: "/token-icons/inc.png"
          };

          farmRows.push(buildPortfolioTokenRow({ address: position.address, balance: position.pending, chain: pulseChain, decimals: 18, token, walletKey }));
        }
      }

      // LP rows get a readable identity: pair symbols plus the wallet's share of the reserves.
      // Underlying-per-LP-unit factors ride along so combined multi-wallet rows can recompute.
      // Farm rows arrive pre-labelled and must not be relabelled as plain held LP.
      const nextRows = dedupeHoldingRows([...balanceResults.filter(Boolean), ...farmRows]).map((row) => {
        const lp = row.discovered && !row.farm ? lpInfoResolved.get(String(row.address).toLowerCase()) : null;

        if (!lp || lp.totalSupply <= 0n) {
          return row;
        }

        const supply = Number(ethers.formatUnits(lp.totalSupply, 18));
        const per0 = supply > 0 ? Number(ethers.formatUnits(lp.reserve0, lp.decimals0)) / supply : 0;
        const per1 = supply > 0 ? Number(ethers.formatUnits(lp.reserve1, lp.decimals1)) / supply : 0;

        return {
          ...row,
          lp: true,
          lpUnderlying: { symbol0: lp.symbol0, symbol1: lp.symbol1, per0, per1 },
          symbol: `${lp.symbol0}-${lp.symbol1} LP`,
          name: `${formatLpUnderlyingAmount(row.amount * per0)} ${lp.symbol0} + ${formatLpUnderlyingAmount(row.amount * per1)} ${lp.symbol1}`
        };
      });

      setDiscoveredPrices(nextDiscoveredPrices);
      setPortfolioHoldings(nextRows);
      setDiscoveredNftRows(nextNftRows);
      savePortfolioHoldingsCache(nextRows, nextNftRows);

      if (discoveryFailedWallets.length > 0) {
        statusNotes.push(`Token discovery failed for ${discoveryFailedWallets.join(", ")} — curated tokens still loaded; refresh to retry.`);
      }

      if (discoveryTruncated > 0) {
        statusNotes.push(`${discoveryTruncated.toLocaleString()} discovered token${discoveryTruncated === 1 ? "" : "s"} past the ${DISCOVERY_MAX_TOKENS_PER_WALLET}-per-wallet cap were skipped.`);
      }

      const discoveredRowCount = nextRows.filter((row) => row.discovered).length;
      const lpRowCount = nextRows.filter((row) => row.lp).length;
      const farmRowCount = nextRows.filter((row) => row.farm).length;
      setPortfolioHoldingsStatus([
        `Loaded ${nextRows.length.toLocaleString()} token row${nextRows.length === 1 ? "" : "s"}${discoveredRowCount > 0 || farmRowCount > 0 ? ` (${discoveredRowCount.toLocaleString()} discovered onchain${lpRowCount > 0 ? `, ${lpRowCount.toLocaleString()} LP` : ""}${farmRowCount > 0 ? `, ${farmRowCount.toLocaleString()} farm` : ""})` : ""}.`,
        ...statusNotes
      ].join(" "));
    } catch (error) {
      setPortfolioHoldingsStatus(error?.shortMessage || error?.message || "Portfolio value failed to load.");
    } finally {
      setPortfolioHoldingsBusy(false);
    }
  }

  async function refreshTshareHistory(chainKey = stakeChainKey, { force = false } = {}) {
    const chain = getChain(chainKey);
    const cachedRows = tshareRowsByChain[chainKey] || [];

    if (!force && cachedRows.length > 1) {
      setTshareRows(cachedRows);
      setTshareStatus(`Showing ${cachedRows.length.toLocaleString()} ${chain.label} T-share history rows.`);
      return;
    }

    const requestKey = `${chainKey}-${Date.now()}`;
    tshareRequestKeyRef.current = requestKey;
    tshareRequestedChainKeyRef.current = chainKey;
    setTshareBusy(true);
    setTshareStatus(`Loading ${chain.label} T-share history.`);

    try {
      const endpoint = TSHARE_HISTORY_ENDPOINTS[chainKey] || TSHARE_HISTORY_ENDPOINTS.ethereum;
      const response = await fetch(endpoint);

      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const rows = (Array.isArray(data) ? data : [])
        .map(normalizeTshareHistoryRow)
        .filter(Boolean)
        .sort((a, b) => a.day - b.day);

      if (rows.length < 2) {
        throw new Error("T-share history did not return enough rows.");
      }

      setTshareRowsByChain((current) => ({ ...current, [chainKey]: rows }));

      if (tshareRequestKeyRef.current === requestKey) {
        setTshareRows(rows);
        setTshareStatus(`Loaded ${rows.length.toLocaleString()} ${chain.label} T-share history rows.`);
      }
    } catch (error) {
      if (tshareRequestKeyRef.current === requestKey) {
        setTshareRows([]);
        setTshareStatus(error?.message || `${chain.label} T-share history failed to load.`);
      }
    } finally {
      if (tshareRequestKeyRef.current === requestKey) {
        setTshareBusy(false);
      }
    }
  }

  async function readStakeQuoteMetrics(chain) {
    const mcall = getMulticall(chain);
    const hex = { target: HEX_ADDRESS, interface: hexReadInterface };
    const [currentDayResult, globals] = await Promise.all([
      mcall(hex, "currentDay"),
      mcall(hex, "globals")
    ]);
    const currentDay = toNumber(currentDayResult);
    const dailyDataCount = toNumber(globals.dailyDataCount ?? globals[4]);
    const payoutDay = Math.max(0, Math.min(currentDay - 1, dailyDataCount - 1));
    const dailyData = await mcall(hex, "dailyData", [payoutDay]);

    return {
      chainKey: chain.key,
      currentDay,
      dailyDataCount,
      dayPayoutTotal: readHexResultValue(dailyData, "dayPayoutTotal", 0),
      dayStakeSharesTotal: readHexResultValue(dailyData, "dayStakeSharesTotal", 1),
      payoutDay,
      shareRate: readHexResultValue(globals, "shareRate", 2)
    };
  }

  async function refreshStakeQuoteMetrics() {
    setStakeQuoteBusy(true);
    setStakeQuoteStatus("");

    try {
      const nextMetrics = {};
      const nextWarnings = [];
      const results = await Promise.all(CHAINS.map(async (chain) => {
        try {
          return { chain, metrics: await readStakeQuoteMetrics(chain) };
        } catch (error) {
          nextWarnings.push(`${chain.label} payout quote failed: ${error?.shortMessage || error?.message || "unknown error"}`);
          return { chain, metrics: null };
        }
      }));

      for (const result of results) {
        if (result.metrics) {
          nextMetrics[result.chain.key] = result.metrics;
        }
      }

      setStakeQuoteMetrics(nextMetrics);
      setStakeQuoteStatus(nextWarnings.length > 0
        ? nextWarnings.join(" ")
        : `Payout quote data refreshed ${new Date().toLocaleTimeString()}.`);
    } catch (error) {
      setStakeQuoteStatus(error?.shortMessage || error?.message || "Payout quote refresh failed.");
    } finally {
      setStakeQuoteBusy(false);
    }
  }

  async function connectWallet() {
    if (!window.ethereum) {
      setWalletActionStatus("No browser wallet found.");
      return null;
    }

    const provider = new ethers.BrowserProvider(window.ethereum);
    await provider.send("eth_requestAccounts", []);
    const signer = await provider.getSigner();
    const network = await provider.getNetwork();
    const address = normalizeAddress(await signer.getAddress());

    setWalletAccount(address);
    setWalletChainId(Number(network.chainId));
    setWalletActionStatus(`Wallet connected: ${displayShortAddress(address)}.`);

    if (!isStakeCreator) {
      autoSavedWalletRef.current = address.toLowerCase();
      saveWalletAddress(address, { silent: true });
    }

    return { provider, signer, address };
  }

  async function switchToStakeChain(chain = selectedStakeChain) {
    if (!window.ethereum) {
      setWalletActionStatus("No browser wallet found.");
      return;
    }

    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: chain.walletChainId }]
      });
    } catch (error) {
      const code = error?.code ?? error?.data?.originalError?.code;

      if (code !== 4902 || chain.key !== "pulsechain") {
        throw error;
      }

      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [{
          chainId: chain.walletChainId,
          chainName: chain.label,
          nativeCurrency: chain.nativeCurrency,
          rpcUrls: [chain.rpc],
          blockExplorerUrls: [chain.explorer.replace("/address/", "")]
        }]
      });
    }

    const provider = new ethers.BrowserProvider(window.ethereum);
    const network = await provider.getNetwork();
    setWalletChainId(Number(network.chainId));
    setWalletActionStatus(`Wallet switched to ${chain.label}.`);
  }

  async function selectStakeChain(chain) {
    setStakeChainKey(chain.key);
    const cachedRows = tshareRowsByChain[chain.key] || [];
    setTshareRows(cachedRows);
    setTshareStatus(cachedRows.length > 1
      ? `Showing ${cachedRows.length.toLocaleString()} ${chain.label} T-share history rows.`
      : `Loading ${chain.label} T-share history.`);
    setStakeStatus("");

    try {
      if (window.ethereum) {
        await switchToStakeChain(chain);
      }

      await refreshStakeWallet(chain, walletAccount);
    } catch (error) {
      setStakeStatus(error?.shortMessage || error?.message || `Could not switch to ${chain.label}.`);
    }
  }

  async function getStakeSigner(chain = selectedStakeChain) {
    if (!window.ethereum) {
      throw new Error("No browser wallet found.");
    }

    if (!walletAccount) {
      await connectWallet();
    }

    if (walletChainId !== chain.chainId) {
      await switchToStakeChain(chain);
    }

    const provider = new ethers.BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();
    const network = await provider.getNetwork();
    const address = normalizeAddress(await signer.getAddress());

    if (Number(network.chainId) !== chain.chainId) {
      throw new Error(`Switch wallet to ${chain.label} first.`);
    }

    setWalletAccount(address);
    setWalletChainId(Number(network.chainId));

    return signer;
  }

  async function refreshStakeWallet(chain = selectedStakeChain, account = walletAccount) {
    try {
      const mcall = getMulticall(chain);
      const hex = { target: HEX_ADDRESS, interface: hexReadInterface };
      const [currentDay, balance] = await Promise.all([
        mcall(hex, "currentDay"),
        account ? mcall(hex, "balanceOf", [account]) : Promise.resolve(0n)
      ]);

      setWalletCurrentDay(toNumber(currentDay));
      setWalletHexBalance(balance);

    } catch (error) {
      setStakeStatus(error?.shortMessage || error?.message || "Could not refresh HEX wallet data.");
    }
  }

  async function startHexStake() {
    const amount = stakeAmount.trim();
    const days = Number.parseInt(stakeDays, 10);

    if (!amount || Number(amount) <= 0) {
      setStakeStatus("Enter a HEX amount to stake.");
      return;
    }

    if (!Number.isInteger(days) || days < 1 || days > 5555) {
      setStakeStatus("Stake days must be between 1 and 5,555.");
      return;
    }

    if (!stakeAck) {
      setStakeStatus("Check the confirmation first. HEX staking locks the HEX until the stake matures.");
      return;
    }

    setStakeBusy("start");
    setStakeStatus("");

    try {
      const signer = await getStakeSigner();
      const hex = new ethers.Contract(HEX_ADDRESS, HEX_ABI, signer);
      const hearts = ethers.parseUnits(amount, 8);
      const tx = await hex.stakeStart(hearts, days);

      setStakeStatus(`Stake submitted: ${tx.hash.slice(0, 10)}... waiting for confirmation.`);
      await tx.wait();
      const address = normalizeAddress(await signer.getAddress());

      setPortfolio((current) => ({
        wallets: normalizeWalletRows(current.wallets || []).some((wallet) => normalizeAddress(wallet.address).toLowerCase() === address.toLowerCase())
          ? normalizeWalletRows(current.wallets || [])
          : [...normalizeWalletRows(current.wallets || []), createWalletRow({ address, name: shortAddress(address) })]
      }));
      setStakeAmount("");
      setStakeAck(false);
      await refreshStakeWallet();
      setStakeStatus("HEX stake started. Open HEX Stakes and press Refresh stakes to add it to your dashboard.");
    } catch (error) {
      setStakeStatus(error?.shortMessage || error?.reason || error?.message || "Stake transaction failed.");
    } finally {
      setStakeBusy("");
    }
  }

  function fillStakeAmountFromBalance(percentBps) {
    if (!walletHexBalance || walletHexBalance <= 0n) {
      setStakeStatus("Connect or reconnect wallet to load HEX balance before using amount shortcuts.");
      return;
    }

    const nextAmount = walletHexBalance * BigInt(percentBps) / 10_000n;
    setStakeAmount(formatHexInputAmount(nextAmount));
  }

  async function endNativeStake(row) {
    const isEarly = row.statusKind !== "ready";
    setStakeBusy(`end-${row.id}`);
    setWalletActionStatus("");

    try {
      setStakeChainKey(row.chain.key);
      const signer = await getStakeSigner(row.chain);
      const hex = new ethers.Contract(HEX_ADDRESS, HEX_ABI, signer);
      const tx = await hex.stakeEnd(row.index, row.stakeId);

      setWalletActionStatus(`${isEarly ? "Early end" : "End stake"} submitted: ${tx.hash.slice(0, 10)}... waiting for confirmation.`);
      await tx.wait();
      await refreshStakeWallet(row.chain);
      setWalletActionStatus(isEarly ? "Early end transaction confirmed." : "Stake ended.");
      return true;
    } catch (error) {
      setWalletActionStatus(error?.shortMessage || error?.reason || error?.message || "Stake end transaction failed.");
      return false;
    } finally {
      setStakeBusy("");
    }
  }

  async function scan() {
    setStatus("");
    setWarnings([]);

    if (portfolioAddresses.length === 0) {
      setStatus(invalidWalletCount > 0 ? "Fix the invalid wallet address before scanning." : "Add at least one wallet address.");
      return false;
    }

    if (activeChains.length === 0) {
      setStatus("Choose at least one chain.");
      return false;
    }

    setBusy(true);

    try {
      const nextRows = [];
      const nextNftRows = [];
      const nextSummaryRows = [];
      const nextWarnings = [];
      const nextChainDays = {};
      const optionalNftFailures = new Map();
      const optionalNftFallbacks = new Map();

      const recordOptionalNftIssue = (bucket, chain, kind) => {
        const key = `${chain.key}-${kind}`;
        const current = bucket.get(key) || { chain, kind, count: 0 };
        bucket.set(key, { ...current, count: current.count + 1 });
      };

      // Chains and wallets are scanned concurrently behind one shared limiter, and results are
      // reassembled in the original chain/wallet order so rows stay stable between scans.
      const runRpc = createRpcLimiter(SCAN_RPC_CONCURRENCY);

      const chainResults = await Promise.all(activeChains.map(async (chain) => {
        const provider = getRpcProvider(chain);
        const mcall = getMulticall(chain);
        const hex = new ethers.Contract(HEX_ADDRESS, HEX_ABI, provider);
        const hsim = new ethers.Contract(HSI_MANAGER_ADDRESS, HSI_MANAGER_ABI, provider);
        const waatsa = new ethers.Contract(WAATSA_ADDRESS, ERC721_ENUMERABLE_ABI, provider);
        const icsa = new ethers.Contract(ICSA_ADDRESS, ICSA_ABI, provider);
        const [latestBlockResult, currentDayResult] = await Promise.all([
          mcall(multicall3Ref, "getBlockNumber"),
          mcall(hex, "currentDay")
        ]);
        const latestBlock = toNumber(latestBlockResult);
        const currentDay = toNumber(currentDayResult);

        const walletResults = await Promise.all(portfolioAddresses.map(async (address) => {
          const label = walletLabel(address);
          const summary = {
            id: `${chain.key}-${address}`,
            chain,
            address,
            walletName: label,
            nativeStakeCount: 0,
            hsiStakeCount: 0,
            waatsaCount: 0,
            stakedNftCount: 0,
            liquidHearts: 0n
          };
          const rows = [];
          const nftRows = [];
          const warnings = [];

          // allSettled rather than all: one wallet's failure must not cancel the rest, and the
          // optional NFT reads keep their own softer failure handling.
          const [liquid, native, hsi, ownedNfts, stakedNfts] = await Promise.allSettled([
            mcall(hex, "balanceOf", [address]),
            readNativeStakes({ address, chain, currentDay, hex, mcall }),
            includeIcosa ? readIcosaHsiStakes({ address, chain, currentDay, hsim, mcall }) : Promise.resolve(null),
            includeIcosaNfts ? readOwnedWaatsaNfts({ address, chain, waatsa, mcall }) : Promise.resolve(null),
            includeIcosaNfts ? readIcosaNftStakeEvents({ address, chain, icsa, latestBlock, mcall, runRpc }) : Promise.resolve(null)
          ]);

          if (liquid.status === "fulfilled") {
            summary.liquidHearts = liquid.value;
          }

          if (native.status === "fulfilled" && native.value) {
            rows.push(...native.value.rows);
            summary.nativeStakeCount = native.value.count;

            if (native.value.truncated > 0) {
              warnings.push(`${chain.label} ${label} has ${native.value.truncated} more native stakes than this page loaded.`);
            }
          }

          if (hsi.status === "fulfilled" && hsi.value) {
            rows.push(...hsi.value.rows);
            summary.hsiStakeCount = hsi.value.stakeCount;

            if (hsi.value.truncated > 0) {
              warnings.push(`${chain.label} ${label} has ${hsi.value.truncated} more Icosa wrapped HEX stakes than this page loaded.`);
            }
          }

          // Core reads share one wallet-level warning, matching the old single try/catch.
          const coreFailure = [liquid, native, hsi].find((result) => result.status === "rejected");

          if (coreFailure) {
            const error = coreFailure.reason;
            warnings.unshift(`${chain.label} ${label} failed: ${error?.shortMessage || error?.message || "unknown error"}`);
          }

          if (includeIcosaNfts) {
            if (ownedNfts.status === "fulfilled" && ownedNfts.value) {
              nftRows.push(...ownedNfts.value.rows);
              summary.waatsaCount = ownedNfts.value.count;

              if (ownedNfts.value.truncated > 0) {
                warnings.push(`${chain.label} ${label} has ${ownedNfts.value.truncated} more WAATSA NFTs than this page loaded.`);
              }
            } else if (ownedNfts.status === "rejected") {
              recordOptionalNftIssue(optionalNftFailures, chain, "wallet-held WAATSA NFTs");
            }

            if (stakedNfts.status === "fulfilled" && stakedNfts.value) {
              nftRows.push(...stakedNfts.value.rows);
              summary.stakedNftCount = stakedNfts.value.count;

              if (stakedNfts.value.truncated > 0) {
                warnings.push(`${chain.label} ${label} has ${stakedNfts.value.truncated} more Icosa-staked NFTs than this page loaded.`);
              }

              if (stakedNfts.value.partial) {
                recordOptionalNftIssue(optionalNftFallbacks, chain, "Icosa staked NFT history");
              }
            } else if (stakedNfts.status === "rejected") {
              recordOptionalNftIssue(optionalNftFailures, chain, "Icosa staked NFT history");
            }
          }

          return { nftRows, rows, summary, warnings };
        }));

        return { chain, currentDay, walletResults };
      }));

      for (const { chain, currentDay, walletResults } of chainResults) {
        nextChainDays[chain.key] = currentDay;

        for (const wallet of walletResults) {
          nextRows.push(...wallet.rows);
          nextNftRows.push(...wallet.nftRows);
          nextWarnings.push(...wallet.warnings);
          nextSummaryRows.push(wallet.summary);
        }
      }

      optionalNftFailures.forEach(({ chain, kind, count }) => {
        addUniqueWarning(
          nextWarnings,
          `${chain.label} ${kind} could not be read for ${count.toLocaleString()} wallet${count === 1 ? "" : "s"} from the public RPC. Native HEX stakes and wrapped stakes still loaded.`
        );
      });

      optionalNftFallbacks.forEach(({ chain, kind, count }) => {
        addUniqueWarning(
          nextWarnings,
          `${chain.label} ${kind} used a recent-block fallback for ${count.toLocaleString()} wallet${count === 1 ? "" : "s"}; older staked NFTs may not appear.`
        );
      });

      setRows(nextRows);
      setNftRows(nextNftRows);
      setSummaryRows(nextSummaryRows);
      setScanChainDays(nextChainDays);
      setWarnings(nextWarnings);
      saveScanCache({
        rows: nextRows,
        nftRows: nextNftRows,
        summaryRows: nextSummaryRows,
        scanChainDays: nextChainDays,
        warnings: nextWarnings
      });
      setStatus(`Loaded ${nextRows.length.toLocaleString()} stake rows and ${nextNftRows.length.toLocaleString()} Icosa NFT rows for ${portfolioAddresses.length.toLocaleString()} saved wallet${portfolioAddresses.length === 1 ? "" : "s"}.`);
      return true;
    } catch (error) {
      setStatus(error?.shortMessage || error?.message || "Stake scan failed.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function refreshStakesAndValue() {
    await refreshStakeQuoteMetrics();
    const scanned = await scan();

    if (scanned) {
      await refreshPortfolioHoldings();
    }
  }

  async function refreshHexStakes() {
    await refreshStakeQuoteMetrics();
    await scan();
  }

  function handleStakeTablePointerDown(event) {
    if (event.button !== 0 || event.target.closest("a, button, input, textarea, select")) {
      return;
    }

    stakeTableDragRef.current = {
      active: true,
      moved: false,
      startLeft: event.currentTarget.scrollLeft,
      startX: event.clientX
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    event.currentTarget.classList.add("isDragging");
  }

  function handleStakeTablePointerMove(event) {
    const drag = stakeTableDragRef.current;

    if (!drag.active) {
      return;
    }

    const deltaX = event.clientX - drag.startX;

    if (Math.abs(deltaX) > 2) {
      drag.moved = true;
    }

    event.currentTarget.scrollLeft = drag.startLeft - deltaX;
    event.preventDefault();
  }

  function handleStakeTablePointerEnd(event) {
    if (!stakeTableDragRef.current.active) {
      return;
    }

    stakeTableDragRef.current.active = false;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    event.currentTarget.classList.remove("isDragging");
  }

  function handleStakeTableClick(event) {
    if (stakeTableDragRef.current.moved) {
      event.preventDefault();
      event.stopPropagation();
      stakeTableDragRef.current.moved = false;
    }
  }

  async function handleUnlockRowConnect(row) {
    const result = await connectWallet();

    if (result?.address && normalizeAddress(result.address).toLowerCase() !== normalizeAddress(row.address).toLowerCase()) {
      setStatus(`Connected ${displayShortAddress(result.address)}, but this stake belongs to ${displayWalletLabel(row.address)}.`);
    }
  }

  async function handleUnlockRowEnd(row) {
    const ended = await endNativeStake(row);

    if (ended && !isStakeCreator) {
      await scan();
    }
  }

  function renderUnlockAction(row) {
    if (row.source !== "HEX native") {
      return <span className="tableActionHint">Track only</span>;
    }

    if (row.statusKind === "ended") {
      return <span className="tableActionHint">Ended</span>;
    }

    const isEarlyEnd = row.statusKind === "waiting";
    const canEnd = row.statusKind === "ready" || (isEarlyEnd && showEarlyEnd && earlyEndAck);

    if (!canEnd) {
      if (isEarlyEnd && showEarlyEnd && !earlyEndAck) {
        return <span className="tableActionHint warning">Confirm EES</span>;
      }

      return <span className="tableActionHint">Locked</span>;
    }

    const rowAddress = normalizeAddress(row.address);
    const connectedAddress = normalizeAddress(walletAccount);

    if (!connectedAddress) {
      return (
        <button className="tableActionButton secondary" type="button" onClick={() => handleUnlockRowConnect(row)}>
          Connect owner
        </button>
      );
    }

    if (connectedAddress.toLowerCase() !== rowAddress.toLowerCase()) {
      return <span className="tableActionHint">Connect owner</span>;
    }

    if (walletChainId !== row.chain.chainId) {
      return (
        <button className="tableActionButton secondary" type="button" onClick={() => switchToStakeChain(row.chain)}>
          Switch wallet to {row.chain.label}
        </button>
      );
    }

    return (
      <button
        className={isEarlyEnd ? "tableActionButton danger" : "tableActionButton"}
        type="button"
        onClick={() => (isEarlyEnd ? setEarlyEndCandidate(row) : handleUnlockRowEnd(row))}
        disabled={stakeBusy === `end-${row.id}` || busy}
      >
        {stakeBusy === `end-${row.id}` ? "Ending" : isEarlyEnd ? "Early end" : "End stake"}
      </button>
    );
  }

  async function confirmEarlyEndStake() {
    const row = earlyEndCandidate;

    if (!row) {
      return;
    }

    setEarlyEndCandidate(null);
    await handleUnlockRowEnd(row);
  }

  function addCustomCoreToken() {
    const raw = customTokenInput.trim();

    if (!ethers.isAddress(raw)) {
      setCustomTokenError("Paste a valid PulseChain token address.");
      return;
    }

    const address = ethers.getAddress(raw);
    const candidate = { key: `custom-${address.toLowerCase()}`, symbol: "", name: "", chainKey: "pulsechain", address, custom: true };
    const identity = tokenIdentity(candidate);

    if (BUILT_IN_TOKEN_IDENTITIES.has(identity)) {
      setCustomTokenError("Already tracked — this token is built in.");
      return;
    }

    if (customCoreTokens.some((token) => tokenIdentity(token) === identity)) {
      setCustomTokenError("Already on your board.");
      return;
    }

    const next = [...customCoreTokens, candidate];
    setCustomCoreTokens(next);
    saveCustomCoreTokens(next);
    setCustomTokenInput("");
    setCustomTokenError("");
  }

  function removeCustomCoreToken(key) {
    const next = customCoreTokens.filter((token) => token.key !== key);
    setCustomCoreTokens(next);
    saveCustomCoreTokens(next);
  }

  // One verdict per token: hide, demote, or trust. Applying any verdict clears the others.
  function applyTokenOverride(identity, action) {
    setTokenOverrides((current) => {
      const without = (list) => list.filter((item) => item !== identity);
      const next = {
        hidden: without(current.hidden),
        demoted: without(current.demoted),
        trusted: without(current.trusted)
      };

      if (action === "hide") {
        next.hidden = [...next.hidden, identity];
      } else if (action === "demote") {
        next.demoted = [...next.demoted, identity];
      } else if (action === "trust") {
        next.trusted = [...next.trusted, identity];
      }

      saveTokenOverrides(next);
      return next;
    });
  }

  async function copyVerifyPrompt() {
    try {
      await navigator.clipboard.writeText(VERIFY_AUDIT_PROMPT);
    } catch {
      // Clipboard API blocked (http, permissions) — legacy fallback.
      const textarea = document.createElement("textarea");
      textarea.value = VERIFY_AUDIT_PROMPT;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }

    setVerifyCopied(true);
    window.setTimeout(() => setVerifyCopied(false), 2_500);
  }

  function restoreHiddenTokens() {
    setTokenOverrides((current) => {
      const next = { ...current, hidden: [] };
      saveTokenOverrides(next);
      return next;
    });
  }

  // Reconstruct up to a year of net worth from archive state: balances via balanceOf at
  // historical blocks, prices from PulseX pair reserves at the same blocks. Scope is the
  // verified PulseChain portfolio; backfilled points only fill time BEFORE live recording
  // started, so they never overwrite an actual observed snapshot.
  async function backfillHistory() {
    if (backfillBusy) {
      return;
    }

    setBackfillBusy(true);
    setBackfillStatus("Preparing backfill…");

    try {
      // One token/stake job per chain; both sampled at identical timestamps so the per-chain
      // values sum into single points.
      const collectJob = (chainKey) => {
        const eligible = pricedPortfolioHoldings.filter((row) => {
          if (row.chain.key !== chainKey || row.positionTag) {
            return false;
          }

          return ["curated", "trusted", "verified"].includes(holdingCsvStatus(row));
        });
        const seenTokens = new Set();
        const tokens = [];
        const lpTokens = [];

        for (const row of eligible) {
          const key = row.native ? "native" : String(row.address).toLowerCase();

          if (seenTokens.has(key)) {
            continue;
          }

          seenTokens.add(key);

          if (row.lp) {
            lpTokens.push({ address: row.address, decimals: 18 });
          } else {
            tokens.push({ address: row.native ? null : row.address, decimals: row.decimals });
          }
        }

        // Stake rows fall back to the cached scan so auto-backfill counts staked HEX even
        // before the first fresh stake scan of the session.
        const stakeSourceRows = rows.length > 0 ? rows : (cachedScan?.rows || []);
        const stakes = stakeSourceRows
          .filter((row) => row.chain.key === chainKey && row.stakedHearts > 0n)
          .map((row) => ({
            stakedHearts: row.stakedHearts,
            lockedDay: row.lockedDay,
            unlockedDay: row.unlockedDay ?? 0
          }));

        return { tokens, lpTokens, stakes };
      };

      // Full target depth every run; chains clamp themselves — PulseChain points before
      // PulseX existed drop out because the price anchor pair reverts at those blocks.
      const days = BACKFILL_TARGET_DAYS;
      const nowSeconds = Math.floor(Date.now() / 1000);
      const sampleTimestamps = [];

      for (let day = days; day > 365; day -= 30) {
        sampleTimestamps.push(nowSeconds - day * 86_400);
      }

      for (let day = 365; day > 30; day -= 7) {
        sampleTimestamps.push(nowSeconds - day * 86_400);
      }

      for (let day = 30; day >= 1; day -= 1) {
        sampleTimestamps.push(nowSeconds - day * 86_400);
      }

      const jobs = [
        { chainKey: "pulsechain", chain: getChain("pulsechain"), ...collectJob("pulsechain") }
      ];
      const ethereumJob = collectJob("ethereum");

      if (ethereumJob.tokens.length > 0 || ethereumJob.stakes.length > 0) {
        jobs.push({ chainKey: "ethereum", chain: ETHEREUM_ARCHIVE_CHAIN, ...ethereumJob });
      }

      const totalSamples = sampleTimestamps.length * jobs.length;
      let doneSamples = 0;
      const results = await Promise.all(jobs.map((job) => backfillNetWorthHistory({
        chain: job.chain,
        chainKey: job.chainKey,
        wallets: portfolioAddresses,
        tokens: job.tokens,
        lpTokens: job.lpTokens,
        stakes: job.stakes,
        sampleTimestamps,
        onProgress: () => {
          doneSamples += 1;
          setBackfillStatus(`Backfilling ${doneSamples}/${totalSamples} samples…`);
        }
      })));

      // Same timestamps on every chain — sum values per timestamp.
      const valueByTime = new Map();

      for (const result of results) {
        for (const point of result.points) {
          valueByTime.set(point.t, (valueByTime.get(point.t) || 0) + point.v);
        }
      }

      const points = [...valueByTime.entries()]
        .map(([t, v]) => ({ t, v, backfilled: true }))
        .sort((a, b) => a.t - b.t);

      // The chart starts where the wallets start: drop the leading run of ~zero points
      // from before any tracked wallet held anything.
      while (points.length > 0 && points[0].v < 0.01) {
        points.shift();
      }

      const skippedCount = results.reduce((total, result) => total + result.skippedCount, 0);

      const existing = loadPortfolioHistory();
      // Live-recorded points always win; deepening replaces previously backfilled points
      // with the recomputed set but never overwrites an actual observed snapshot.
      const earliestLive = existing.find((point) => !point.backfilled)?.t ?? Infinity;
      const merged = [...points.filter((point) => point.t < earliestLive), ...existing.filter((point) => !point.backfilled)]
        .sort((a, b) => a.t - b.t)
        .slice(-PORTFOLIO_HISTORY_MAX_POINTS);

      try {
        window.localStorage.setItem(PORTFOLIO_HISTORY_STORAGE_KEY, JSON.stringify(merged));
      } catch {
        // Storage failure — chart still shows the in-memory merge this session.
      }

      setPortfolioHistory(merged);

      try {
        window.localStorage.setItem(BACKFILL_DEPTH_STORAGE_KEY, String(days));
      } catch {
        // Depth marker is an optimization only.
      }

      setBackfillDepth(days);
      setBackfillStatus([
        `Backfilled ${points.length.toLocaleString()} points from onchain archive state${jobs.length > 1 ? " (PulseChain + Ethereum)" : ""}.`,
        skippedCount > 0 ? `${skippedCount.toLocaleString()} tokens skipped (no wrapped-native pair).` : "",
        "Excludes farm positions."
      ].filter(Boolean).join(" "));
    } catch (error) {
      setBackfillStatus(error?.shortMessage || error?.message || "Backfill failed.");
    } finally {
      setBackfillBusy(false);
    }
  }

  function holdingCsvStatus(row) {
    const identity = tokenIdentity(row);

    if (hiddenTokenSet.has(identity)) return "hidden";
    if (trustedTokenSet.has(identity)) return "trusted";
    if (demotedTokenSet.has(identity)) return "demoted";
    if (!row.discovered) return "curated";

    return row.priceUsd > 0 && !isImplausibleDiscoveredValue(row) ? "verified" : "unverified";
  }

  // Per-wallet granularity (not the combined view), including unverified and hidden rows —
  // an export should be the complete record, with the status column telling them apart.
  function exportHoldingsCsv() {
    const escapeCell = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const lines = [
      ["chain", "symbol", "name", "address", "wallet", "wallet_label", "amount", "price_usd", "value_usd", "status"].join(",")
    ];

    for (const row of selectedWalletHoldingRows) {
      lines.push([
        row.chain.key,
        row.symbol,
        row.name,
        row.address || "native",
        row.walletAddress,
        row.walletLabel,
        row.amount,
        row.priceUsd || 0,
        row.valueUsd || 0,
        holdingCsvStatus(row)
      ].map(escapeCell).join(","));
    }

    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `pledge-portfolio-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function renderMarketBoard() {
    const coreTrackerRows = [...CORE_TRACKER_KEYS, ...customCoreTokens.map((token) => token.key)]
      .map((key) => {
        const token = allMarketTokens.find((item) => item.key === key);
        if (!token) return null;
        return { token, row: marketRows.find((item) => item.key === key) || marketRowFromPair(token, null) };
      })
      .filter(Boolean);

    return (
      <article className="stakePanel marketPanel">
        <button className="moonMathToggle" type="button" onClick={() => setCoreTrackersOpen((current) => !current)}>
          <div>
            <span className="stakeEyebrow">Core trackers</span>
            <small>Live price, mcap, liquidity and volume for the pLedge cores.</small>
          </div>
          <div className="moonMathToggleMeta">
            <span>{coreTrackerRows.length} coins</span>
            <ChevronDown className={coreTrackersOpen ? "isOpen" : ""} size={18} aria-hidden="true" />
          </div>
        </button>

        {coreTrackersOpen && (
          <>
            <div className="marketTotals">
              <div>
                <span>tracked liquidity</span>
                <strong>{formatCompactUsd(marketLiquidityTotal)}</strong>
              </div>
              <div>
                <span>tracked 24h volume</span>
                <strong>{formatCompactUsd(marketVolumeTotal)}</strong>
              </div>
            </div>

            <div className="marketGrid">
              {coreTrackerRows.map(({ token, row }) => {
                const changeClass = Number(row.change24h || 0) >= 0 ? "positive" : "negative";

                return (
                  <article className="marketCard" key={token.key}>
                <header>
                  <div className="marketTokenIdentity">
                    <TokenAvatar icon={row.icon} symbol={row.symbol} />
                    <div>
                      <span>{row.symbol}</span>
                      <small>{row.name} / {row.chain.shortLabel}</small>
                    </div>
                  </div>
                  {token.key === "eth" ? (
                    <button
                      className={includeEthMarketTotals ? "marketTotalToggle isIncluded" : "marketTotalToggle"}
                      type="button"
                      onClick={() => setIncludeEthMarketTotals((current) => !current)}
                      title={includeEthMarketTotals ? "Remove ETH liquidity and volume from totals" : "Add ETH liquidity and volume to totals"}
                    >
                      {includeEthMarketTotals ? "In totals" : "Add totals"}
                    </button>
                  ) : token.custom ? (
                    <button
                      className="marketRemoveToken"
                      type="button"
                      onClick={() => removeCustomCoreToken(token.key)}
                      title="Remove this token from your board"
                      aria-label={`Remove ${row.symbol}`}
                    >
                      <Trash2 size={13} aria-hidden="true" />
                    </button>
                  ) : (
                    row.note && <em>{row.note}</em>
                  )}
                </header>
                <strong>{formatUsd(row.priceUsd, 8)}</strong>
                <div className="marketMetrics">
                  <span>mcap <b>{formatCompactUsd(row.marketCap)}</b></span>
                  <span>liq <b>{formatCompactUsd(row.liquidityUsd)}</b></span>
                  <span>vol <b>{formatCompactUsd(row.volume24h)}</b></span>
                  <span className={changeClass}>24h <b>{formatPercent(row.change24h)}</b></span>
                </div>
                <footer>
                  <span>{row.pairSymbol || row.status}</span>
                  {row.pairUrl && (
                    <a href={row.pairUrl} target="_blank" rel="noreferrer">
                      Pair
                      <ExternalLink size={12} aria-hidden="true" />
                    </a>
                  )}
                </footer>
              </article>
            );
          })}
        </div>
            <div className="marketAddTokenRow">
              <input
                value={customTokenInput}
                onChange={(event) => {
                  setCustomTokenInput(event.target.value.trim());
                  setCustomTokenError("");
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") addCustomCoreToken();
                }}
                placeholder="0x… add any PulseChain token"
                spellCheck={false}
              />
              <button type="button" onClick={addCustomCoreToken}>
                <Plus size={14} aria-hidden="true" />
                Track
              </button>
            </div>
            {customTokenError && <p className="marketStatusLine">{customTokenError}</p>}
            {marketStatus && <p className="marketStatusLine">{marketStatus}</p>}
          </>
        )}
      </article>
    );
  }

  function renderPortfolioValueBoard() {
    const portfolioTokenPageCount = Math.max(1, Math.ceil(verifiedHoldingRows.length / PORTFOLIO_TOKEN_PAGE_SIZE));
    const safePortfolioTokenPage = Math.min(Math.max(portfolioTokenPage, 0), portfolioTokenPageCount - 1);
    const pagedHoldingRows = verifiedHoldingRows.slice(
      safePortfolioTokenPage * PORTFOLIO_TOKEN_PAGE_SIZE,
      safePortfolioTokenPage * PORTFOLIO_TOKEN_PAGE_SIZE + PORTFOLIO_TOKEN_PAGE_SIZE
    );
    // Clamped rather than reset so trusting/hiding a row keeps you near where you were.
    const unverifiedPageCount = Math.max(1, Math.ceil(unverifiedHoldingRows.length / UNVERIFIED_TOKEN_PAGE_SIZE));
    const safeUnverifiedPage = Math.min(Math.max(unverifiedTokenPage, 0), unverifiedPageCount - 1);
    const pagedUnverifiedRows = unverifiedHoldingRows.slice(
      safeUnverifiedPage * UNVERIFIED_TOKEN_PAGE_SIZE,
      safeUnverifiedPage * UNVERIFIED_TOKEN_PAGE_SIZE + UNVERIFIED_TOKEN_PAGE_SIZE
    );

    return (
      <article className="stakePanel portfolioValuePanel">
        <div className="portfolioValueHeader">
          <div>
            <span className="stakeEyebrow">
              Portfolio net worth
              <button
                type="button"
                className="privacyEyeToggle"
                onClick={() => setHideHexAmounts((current) => !current)}
                title={hideHexAmounts ? "Show amounts" : "Hide amounts"}
                aria-label={hideHexAmounts ? "Show amounts" : "Hide amounts"}
                aria-pressed={hideHexAmounts}
              >
                {hideHexAmounts ? <EyeOff size={14} aria-hidden="true" /> : <Eye size={14} aria-hidden="true" />}
              </button>
            </span>
            <strong>{displayHexAmount(formatCompactUsd(portfolioTotalUsd))}</strong>
            {portfolioStakedValueUsd > 0 && (
              <small className="portfolioValueNote">
                includes staked HEX {displayHexAmount(formatCompactUsd(portfolioStakedValueUsd))}
                {includeStakeYield && selectedStakedYieldAmount > 0
                  ? ` · incl. est. yield ${displayHexAmount(selectedStakedYieldAmount.toLocaleString(undefined, { maximumFractionDigits: 2 }))} HEX/eHEX`
                  : " · principal only"}
              </small>
            )}
            <button
              type="button"
              className={includeStakeYield ? "marketTotalToggle isIncluded" : "marketTotalToggle"}
              onClick={() => setIncludeStakeYield((current) => !current)}
              title={includeStakeYield
                ? "Net worth includes estimated stake yield. Click to show staked principal only."
                : "Net worth shows staked principal only. Click to include estimated stake yield."}
            >
              {includeStakeYield ? "Yield: on" : "Yield: off"}
            </button>
          </div>
          <div className="portfolioValueActions">
            <button
              className="stakeGhostButton"
              type="button"
              onClick={exportHoldingsCsv}
              disabled={selectedWalletHoldingRows.length === 0}
              title="Download every holding row (including unverified and hidden) as CSV"
            >
              <Download size={16} aria-hidden="true" />
              CSV
            </button>
            <button
              className="stakeGhostButton addWalletJumpButton"
              type="button"
              onClick={scrollToWalletManager}
            >
              <Plus size={16} aria-hidden="true" />
              Add wallet
            </button>
            <button
              className="stakePrimaryButton loadValueButton"
              type="button"
              onClick={refreshStakesAndValue}
              disabled={busy || portfolioHoldingsBusy || stakeQuoteBusy}
            >
              {busy || portfolioHoldingsBusy || stakeQuoteBusy ? <RefreshCw size={16} aria-hidden="true" /> : <Coins size={16} aria-hidden="true" />}
              {busy || portfolioHoldingsBusy || stakeQuoteBusy ? "Refreshing" : "Load value"}
            </button>
          </div>
        </div>

        <PortfolioHistoryChart
          points={portfolioHistory}
          formatValue={(value) => displayHexAmount(formatCompactUsd(value))}
          onBackfill={backfillHistory}
          backfillBusy={backfillBusy}
          backfillStatus={backfillStatus}
          canBackfill={backfillDepth < BACKFILL_TARGET_DAYS}
        />

        <div className="portfolioWalletTabs" aria-label="Portfolio wallet selector">
          <button
            className="portfolioWalletTab portfolioWalletAddTab"
            type="button"
            onClick={scrollToWalletManager}
            title="Add another wallet"
            aria-label="Add another wallet"
          >
            <Plus size={15} aria-hidden="true" />
          </button>
          <button
            className={portfolioWalletFilterIsAll ? "portfolioWalletTab isActive" : "portfolioWalletTab"}
            type="button"
            onClick={() => setPortfolioWalletFilters([])}
            aria-pressed={portfolioWalletFilterIsAll}
          >
            All
          </button>
          {validWallets.map((wallet, index) => {
            const key = wallet.normalizedAddress.toLowerCase();
            const label = hideWalletInfo ? `Wallet ${index + 1}` : wallet.name?.trim() || shortAddress(wallet.normalizedAddress);
            const selected = selectedPortfolioWalletKeys.has(key);

            return (
              <button
                className={selected ? "portfolioWalletTab isActive" : "portfolioWalletTab"}
                type="button"
                onClick={() => togglePortfolioWalletSelection(key)}
                aria-pressed={selected}
                key={`portfolio-wallet-${key}`}
              >
                {label}
              </button>
            );
          })}
        </div>

        <section className="moonMathPanel" aria-label="Moon math target simulator">
          <button className="moonMathToggle" type="button" onClick={() => setMoonMathOpen((current) => !current)}>
            <div>
              <span className="stakeEyebrow">Moon math</span>
              <small>If pDAI gets to $1 (~$44B), and the cores top out near ~$40B mcap each, this is where it could land.</small>
              <strong>{displayHexAmount(formatCompactUsd(moonMathProjectedPortfolioValue))}</strong>
            </div>
            <div className="moonMathToggleMeta">
              <span>pDAI ${formatMoonPriceInput(safePdaiTargetPrice) || "0"}</span>
              <ChevronDown className={moonMathOpen ? "isOpen" : ""} size={18} aria-hidden="true" />
            </div>
          </button>

          {moonMathOpen && (
            <div className="moonMathBody">
              <div className="moonMathTargetGrid">
                {moonMathRows.map((row) => {
                  const targetMode = row.key === "pdai"
                    ? ""
                    : row.targetMcap
                      ? (moonMathMcapOverrides[row.key] !== undefined ? "custom mcap" : "mcap")
                      : moonMathTargetOverrides[row.key] !== undefined
                        ? "custom"
                        : row.defaultMultiple
                          ? "estimate"
                          : "auto";
                  const multiplierLabel = row.key === "pdai" || !(row.targetMultiple > 0)
                    ? ""
                    : `${row.targetMultiple.toLocaleString(undefined, { maximumFractionDigits: row.targetMultiple >= 100 ? 0 : 1 })}x`;

                  return (
                    <article className="moonMathTargetBox" key={`moon-target-${row.key}`}>
                      <div className="moonMathTokenHeader">
                        <div className="marketTokenIdentity">
                          <TokenAvatar icon={row.icon} symbol={row.symbol} />
                          <div>
                            <span>{row.symbol}</span>
                            {targetMode && <small>{targetMode}</small>}
                          </div>
                        </div>
                        {multiplierLabel && <span className="moonMathMultiplier">{multiplierLabel}</span>}
                      </div>
                      {row.targetMcap ? (
                        <>
                          <label>
                            <span>mcap</span>
                            <input
                              value={moonMathMcapInputValue(row)}
                              onChange={(event) => updateMoonMathMcap(row.key, event.target.value)}
                              inputMode="text"
                              aria-label={`${row.symbol} target market cap`}
                            />
                          </label>
                          <small className="moonMathImpliedPrice">
                            {row.targetPrice > 0 ? `→ $${formatMoonPriceInput(row.targetPrice)}` : "→ needs live price"}
                          </small>
                        </>
                      ) : (
                        <label>
                          <span>$</span>
                          <input
                            value={moonMathInputValue(row)}
                            onChange={(event) => updateMoonMathTarget(row.key, event.target.value)}
                            inputMode="decimal"
                            aria-label={`${row.symbol} target price`}
                          />
                        </label>
                      )}
                    </article>
                  );
                })}
              </div>

              <div className="moonMathStats">
                <article>
                  <span>projected portfolio</span>
                  <strong>{displayHexAmount(formatCompactUsd(moonMathProjectedPortfolioValue))}</strong>
                </article>
                <article>
                  <span>moon set target value</span>
                  <strong>{displayHexAmount(formatCompactUsd(moonMathProjectedCoreValue))}</strong>
                  <small>pDAI, HEX, PLS, PLSX, INC, ICSA, PRVX, eHEX, ETH; HEX/eHEX stakes {includeStakeYield ? "include estimated yield" : "principal only"}</small>
                </article>
                <article>
                  <span>non-core live value</span>
                  <strong>{displayHexAmount(formatCompactUsd(moonMathNonCoreValue))}</strong>
                  <small>everything outside the Moon Math set</small>
                </article>
              </div>
            </div>
          )}
        </section>

        <button className="moonMathToggle" type="button" onClick={() => setMyCoinsOpen((current) => !current)}>
          <div>
            <span className="stakeEyebrow">My coins</span>
            <small>Your holdings, combined across every wallet.</small>
          </div>
          <div className="moonMathToggleMeta">
            <span>{verifiedHoldingRows.length} coins{unverifiedHoldingRows.length > 0 ? ` · ${unverifiedHoldingRows.length} unverified` : ""}</span>
            <ChevronDown className={myCoinsOpen ? "isOpen" : ""} size={18} aria-hidden="true" />
          </div>
        </button>

        {myCoinsOpen && (selectedHoldingRows.length === 0 ? (
          <div className="emptyStakeState compact">
            <Coins size={28} aria-hidden="true" />
            <span>{portfolioHoldingsBusy ? "Loading portfolio value." : "Refresh stakes to load wallet coins and stake value."}</span>
          </div>
        ) : (
          <>
            <div className="portfolioHoldingsList">
              {pagedHoldingRows.map((row) => {
                const rowKey = `coins:${row.chain.key}:${row.priceKey}`;

                return (
                  <article
                    className="portfolioHoldingRow isClickable"
                    key={`holding-total-${row.chain.key}-${row.symbol}-${row.priceKey}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => setTokenActionTarget((current) => (current === rowKey ? null : rowKey))}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setTokenActionTarget((current) => (current === rowKey ? null : rowKey));
                      }
                    }}
                  >
                    <div className="marketTokenIdentity">
                      <TokenAvatar icon={row.icon} symbol={row.symbol} />
                      <div>
                        <span>{row.symbol}</span>
                        <small>{row.name}</small>
                      </div>
                    </div>
                    <div>
                      <span>amount</span>
                      <strong>{displayHexAmount(row.amount.toLocaleString(undefined, { maximumFractionDigits: row.amount >= 1 ? 4 : 8 }))}</strong>
                    </div>
                    <div>
                      <span>price</span>
                      <strong>{formatUsd(row.priceUsd, 8)}</strong>
                    </div>
                    <div>
                      <span>value</span>
                      <strong>{displayHexAmount(formatCompactUsd(row.valueUsd))}</strong>
                    </div>
                    {tokenActionTarget === rowKey && (
                      <div className="tokenActionMenu" onClick={(event) => event.stopPropagation()}>
                        {row.discovered ? (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                applyTokenOverride(tokenIdentity(row), "demote");
                                setTokenActionTarget(null);
                              }}
                            >
                              <EyeOff size={13} aria-hidden="true" />
                              Move to unverified
                            </button>
                            <button
                              type="button"
                              className="danger"
                              onClick={() => {
                                applyTokenOverride(tokenIdentity(row), "hide");
                                setTokenActionTarget(null);
                              }}
                            >
                              <Trash2 size={13} aria-hidden="true" />
                              Hide token
                            </button>
                          </>
                        ) : (
                          <span className="tokenActionNote">Core token — always shown</span>
                        )}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
            {portfolioTokenPageCount > 1 && (
              <div className="portfolioTokenPager">
                <button
                  type="button"
                  onClick={() => setPortfolioTokenPage(0)}
                  disabled={safePortfolioTokenPage === 0}
                  aria-label="First coins page"
                >
                  &laquo;
                </button>
                <button
                  type="button"
                  onClick={() => setPortfolioTokenPage((current) => Math.max(0, current - 1))}
                  disabled={safePortfolioTokenPage === 0}
                  aria-label="Previous coins page"
                >
                  &lt;
                </button>
                <span>Page {safePortfolioTokenPage + 1} / {portfolioTokenPageCount}</span>
                <button
                  type="button"
                  onClick={() => setPortfolioTokenPage((current) => Math.min(portfolioTokenPageCount - 1, current + 1))}
                  disabled={safePortfolioTokenPage >= portfolioTokenPageCount - 1}
                  aria-label="Next coins page"
                >
                  &gt;
                </button>
              </div>
            )}
            {unverifiedHoldingRows.length > 0 && (
              <details className="unverifiedTokenSection">
                <summary>
                  Unverified tokens ({unverifiedHoldingRows.length}) — discovered onchain, no trusted price
                </summary>
                <div className="unverifiedTokenList">
                  {pagedUnverifiedRows.map((row) => {
                    const rowKey = `unverified:${row.chain.key}:${row.priceKey}`;

                    return (
                      <div
                        className="unverifiedTokenRow isClickable"
                        key={`unverified-${row.chain.key}-${row.priceKey}`}
                        role="button"
                        tabIndex={0}
                        onClick={() => setTokenActionTarget((current) => (current === rowKey ? null : rowKey))}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            setTokenActionTarget((current) => (current === rowKey ? null : rowKey));
                          }
                        }}
                      >
                        <div className="marketTokenIdentity">
                          <TokenAvatar icon={row.icon} symbol={row.symbol} />
                          <div>
                            <span>{row.symbol}</span>
                            <small>{row.name}</small>
                          </div>
                        </div>
                        <strong>{displayHexAmount(row.amount.toLocaleString(undefined, { maximumFractionDigits: row.amount >= 1 ? 4 : 8 }))}</strong>
                        {tokenActionTarget === rowKey && (
                          <div className="tokenActionMenu" onClick={(event) => event.stopPropagation()}>
                            <button
                              type="button"
                              onClick={() => {
                                applyTokenOverride(tokenIdentity(row), "trust");
                                setTokenActionTarget(null);
                              }}
                            >
                              <ShieldCheck size={13} aria-hidden="true" />
                              Trust — move to My coins
                            </button>
                            <button
                              type="button"
                              className="danger"
                              onClick={() => {
                                applyTokenOverride(tokenIdentity(row), "hide");
                                setTokenActionTarget(null);
                              }}
                            >
                              <Trash2 size={13} aria-hidden="true" />
                              Hide token
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                {unverifiedPageCount > 1 && (
                  <div className="portfolioTokenPager">
                    <button
                      type="button"
                      onClick={() => setUnverifiedTokenPage(0)}
                      disabled={safeUnverifiedPage === 0}
                      aria-label="First unverified tokens page"
                    >
                      &laquo;
                    </button>
                    <button
                      type="button"
                      onClick={() => setUnverifiedTokenPage((current) => Math.max(0, current - 1))}
                      disabled={safeUnverifiedPage === 0}
                      aria-label="Previous unverified tokens page"
                    >
                      &lt;
                    </button>
                    <span>Page {safeUnverifiedPage + 1} / {unverifiedPageCount}</span>
                    <button
                      type="button"
                      onClick={() => setUnverifiedTokenPage((current) => Math.min(unverifiedPageCount - 1, current + 1))}
                      disabled={safeUnverifiedPage >= unverifiedPageCount - 1}
                      aria-label="Next unverified tokens page"
                    >
                      &gt;
                    </button>
                  </div>
                )}
              </details>
            )}
            {nftCollections.length > 0 && (
              <details className="unverifiedTokenSection">
                <summary>
                  NFT collections ({nftCollections.length}) — {nftCollections.reduce((total, c) => total + c.count, 0).toLocaleString()} NFTs held
                </summary>
                <div className="unverifiedTokenList">
                  {nftCollections.slice(0, 40).map((collection) => (
                    <div className="unverifiedTokenRow" key={`nft-${collection.address}`}>
                      <div className="marketTokenIdentity">
                        <TokenAvatar icon="" symbol={collection.symbol} />
                        <div>
                          <span>{collection.name}</span>
                          <small>
                            {collection.type}
                            {collection.walletCount > 1 ? ` · ${collection.walletCount} wallets` : ""}
                          </small>
                        </div>
                      </div>
                      <strong>{collection.count.toLocaleString()}</strong>
                      <a
                        className="nftCollectionLink"
                        href={`https://scan.pulsechain.com/token/${collection.address}`}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(event) => event.stopPropagation()}
                        aria-label={`Open ${collection.name} on PulseScan`}
                      >
                        <ExternalLink size={13} aria-hidden="true" />
                      </a>
                    </div>
                  ))}
                  {nftCollections.length > 40 && (
                    <div className="unverifiedTokenRow">
                      <span className="tokenActionNote">and {(nftCollections.length - 40).toLocaleString()} more collections</span>
                    </div>
                  )}
                </div>
              </details>
            )}
            {hiddenHoldingCount > 0 && (
              <button type="button" className="restoreHiddenTokens" onClick={restoreHiddenTokens}>
                Restore {hiddenHoldingCount} hidden token{hiddenHoldingCount === 1 ? "" : "s"}
              </button>
            )}
            {tokenActionTarget && (
              <button
                type="button"
                className="tokenActionBackdrop"
                onClick={() => setTokenActionTarget(null)}
                aria-label="Close token menu"
                tabIndex={-1}
              />
            )}
          </>
        ))}
        {portfolioHoldingsStatus && <p className="marketStatusLine">{portfolioHoldingsStatus}</p>}
      </article>
    );
  }

  function renderWalletBar() {
    return (
      <section className="stakeWalletBar" aria-label="HEX quick actions">
        <div className="stakeWalletBarBuys" aria-label="Buy HEX links">
          <a className="buyHexLink phex" href={BUY_PHEX_URL} target="_blank" rel="noreferrer">
            Buy pHEX
            <ExternalLink size={13} aria-hidden="true" />
          </a>
          <a className="buyHexLink ehex" href={BUY_EHEX_URL} target="_blank" rel="noreferrer">
            Buy eHEX
            <ExternalLink size={13} aria-hidden="true" />
          </a>
        </div>

        <div className="stakeWalletBarActions">
          <button
            className={walletAccount ? "stakePrimaryButton walletConnectButton isConnected" : "stakePrimaryButton walletConnectButton"}
            type="button"
            onClick={connectWallet}
            title={walletAccount ? "Connected wallet. Click to choose another account." : "Connect wallet"}
          >
            <Wallet size={16} aria-hidden="true" />
            {walletAccount ? shortAddress(walletAccount) : "Connect wallet"}
          </button>
        </div>
      </section>
    );
  }

  function renderStakeTopbar() {
    const title = isStakeCreator
      ? "Create HEX Stake"
      : isHexStakes
        ? "HEX Stakes"
        : "Portfolio";

    return (
      <header className="stakeTopbar">
        <div className="stakeBrandLockup">
          <img className="stakeHexMark" src="/token-icons/phex.png" alt="" aria-hidden="true" />
          <h1>{title}</h1>
          <span className="stakePageKicker">HEX SUITE</span>
        </div>
        <div className="stakeHeaderMeta">
          <div className="stakeHeaderGas" aria-label="PulseChain gas tracker">
            <span>PulseChain gas</span>
            <strong>{pulseGasLabel}</strong>
            <small>{pulseGasDetail}</small>
          </div>
          <div className="stakeHeaderGas" aria-label="HEX day">
            <span>HEX day</span>
            <strong>{headerHexDayLabel}</strong>
            <small>{headerHexDayDetail}</small>
          </div>
          <div className="verifySourceWrap">
            <button
              type="button"
              className="verifySourceButton"
              onClick={() => setVerifyOpen((current) => !current)}
              title="This app is open source — verify the code yourself"
              aria-expanded={verifyOpen}
            >
              <ShieldCheck size={14} aria-hidden="true" />
              Source
            </button>
            {verifyOpen && (
              <div className="verifyMenu">
                <p>
                  Fully open source and client-side — your wallet addresses never leave this browser.
                  Don't trust that claim: verify it.
                </p>
                <a href={`${SOURCE_REPO_URL}/tree/${SOURCE_COMMIT}`} target="_blank" rel="noreferrer">
                  <ExternalLink size={13} aria-hidden="true" />
                  View this exact code on GitHub
                </a>
                <button type="button" onClick={copyVerifyPrompt}>
                  <Copy size={13} aria-hidden="true" />
                  {verifyCopied ? "Copied — paste it into Claude" : "Copy AI audit prompt"}
                </button>
                <small>
                  The prompt asks an AI (Claude, or any assistant that can read GitHub) to check this
                  deployment's code for wallet drains, data exfiltration, or hidden behavior.
                </small>
              </div>
            )}
            {verifyOpen && (
              <button
                type="button"
                className="tokenActionBackdrop"
                onClick={() => setVerifyOpen(false)}
                aria-label="Close verification panel"
                tabIndex={-1}
              />
            )}
          </div>
        </div>
        {renderWalletBar()}
      </header>
    );
  }

  function renderStakeCalculator() {
    const hasInput = Boolean(stakeAmountHearts && stakeDaysNumber);

    return (
      <section className="stakeCalculatorPanel" aria-label="Live HEX stake payout calculator">
        <div className="stakeCalculatorHeader">
          <div>
            <span className="stakeEyebrow">Live stake math</span>
            <h3>Longer pays better. More pays better.</h3>
            <p>Estimate T-shares and total payout using the latest completed daily payout on each chain.</p>
          </div>
        </div>

        {!hasInput ? (
          <div className="stakeCalcEmpty">
            Enter a HEX amount and stake length to preview bonuses, T-shares, and projected payout.
          </div>
        ) : (
          <>
            <div className="bonusPreviewGrid">
              <article>
                <span>Longer pays better</span>
                <strong>{formatBonusPercent(stakeBonusPreview.longerBonusHearts, stakeAmountHearts)}</strong>
                <small>{formatHexFromHearts(stakeBonusPreview.longerBonusHearts)} bonus toward shares</small>
              </article>
              <article>
                <span>Bigger pays better</span>
                <strong>{formatBonusPercent(stakeBonusPreview.biggerBonusHearts, stakeAmountHearts)}</strong>
                <small>{formatHexFromHearts(stakeBonusPreview.biggerBonusHearts)} bonus toward shares</small>
              </article>
              <article>
                <span>Effective HEX</span>
                <strong>{formatTokenUnits(stakeBonusPreview.effectiveHearts, 8, 2)}</strong>
                <small>principal plus LPB/BPB, used to calculate T-shares</small>
              </article>
            </div>

            <div className="payoutCompareGrid">
              {stakePayoutPreviews.map(({ chain, metrics, preview, symbol }) => (
                <article className={chain.key === stakeChainKey ? "payoutQuoteCard isSelected" : "payoutQuoteCard"} key={`quote-${chain.key}`}>
                  <header>
                    <div>
                      <span>{symbol}</span>
                      <small>{chain.label}</small>
                    </div>
                    {chain.key === stakeChainKey && <em>selected</em>}
                  </header>

                  {!metrics || !preview ? (
                    <div className="payoutQuoteEmpty">
                      {stakeQuoteBusy ? "Loading live chain data..." : "Quote data unavailable."}
                    </div>
                  ) : (
                    <>
                      <div className="quoteHero">
                        <span>estimated total payout</span>
                        <strong>{formatHexFromHearts(preview.estimatedTotalHearts, 2)}</strong>
                      </div>

                      <dl className="quoteMetricList">
                        <div>
                          <dt>T-shares</dt>
                          <dd>{formatTsharesFromShares(preview.stakeShares, 5)}</dd>
                        </div>
                        <div>
                          <dt>estimated yield</dt>
                          <dd>{formatHexFromHearts(preview.estimatedYieldHearts, 2)}</dd>
                        </div>
                        <div>
                          <dt>T-share rate</dt>
                          <dd>{formatHexFromHearts(preview.tShareRateHearts, 2)}</dd>
                        </div>
                        <div>
                          <dt>daily payout</dt>
                          <dd>{formatTokenUnits(preview.dailyPayoutHeartsPerTshare, 8, 3)} {symbol}/T-share</dd>
                        </div>
                      </dl>

                      <footer>
                        latest payout day {metrics.payoutDay.toLocaleString()} / current day {metrics.currentDay.toLocaleString()}
                      </footer>
                    </>
                  )}
                </article>
              ))}
            </div>
          </>
        )}

        {stakeQuoteStatus && <p className="stakeQuoteStatus">{stakeQuoteStatus}</p>}
        <p className="stakeCalcNote">
          Projection uses the latest completed daily payout as a flat estimate. Actual HEX payout changes daily and can include system penalties/bonuses.
        </p>
      </section>
    );
  }

  function renderTsharePanel() {
    return (
      <section className="stakePanel tsharePanel mantelTsharePanel">
        <button className="tsharePanelToggle" type="button" onClick={() => setTshareOpen((current) => !current)}>
          <div>
            <span className="stakeEyebrow">T-share history</span>
            <h2>Dollar cost of one T-share over time</h2>
          </div>
          <ChevronDown className={tshareOpen ? "isOpen" : ""} size={22} aria-hidden="true" />
        </button>

        {tshareOpen && (
          <div className="tsharePanelBody">
            <div className="tsharePanelMeta">
              <span>{selectedHexSymbol}</span>
              <small>{selectedStakeChain.label}</small>
              {tshareBusy && <RefreshCw size={14} aria-hidden="true" />}
            </div>

            {tshareStatus && <p className="stakeActionStatus">{tshareStatus}</p>}

            {tshareRows.length > 1 ? (
              <TshareHistoryChart rows={tshareRows} />
            ) : (
              <div className="emptyStakeState compact">
                <TrendingUp size={28} aria-hidden="true" />
                <span>{tshareBusy ? `Loading ${selectedStakeChain.label} chart.` : "T-share history unavailable for this chain."}</span>
              </div>
            )}
          </div>
        )}
      </section>
    );
  }

  function renderStakeWalletFilter() {
    return (
      <div className="hexStakeWalletFilter">
        <div>
          <span className="stakeEyebrow">Tracked wallets</span>
          <div className="portfolioWalletTabs" aria-label="HEX stake wallet selector">
            <button
              className={portfolioWalletFilterIsAll ? "portfolioWalletTab isActive" : "portfolioWalletTab"}
              type="button"
              onClick={() => setPortfolioWalletFilters([])}
              aria-pressed={portfolioWalletFilterIsAll}
            >
              All wallets
            </button>
            {validWallets.map((wallet, index) => {
              const key = wallet.normalizedAddress.toLowerCase();
              const label = hideWalletInfo ? `Wallet ${index + 1}` : wallet.name?.trim() || shortAddress(wallet.normalizedAddress);
              const selected = selectedPortfolioWalletKeys.has(key);

              return (
                <button
                  className={selected ? "portfolioWalletTab isActive" : "portfolioWalletTab"}
                  type="button"
                  onClick={() => togglePortfolioWalletSelection(key)}
                  aria-pressed={selected}
                  key={`stake-wallet-${key}`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
        <a className="hexStakeManageLink" href="?page=portfolio">
          Manage wallets
          <ExternalLink size={13} aria-hidden="true" />
        </a>
      </div>
    );
  }

  function renderStakeLedger(rowsToRender, { history = false } = {}) {
    return (
      <div
        className="stakeTableWrap hexStakeTableWrap"
        onClickCapture={handleStakeTableClick}
        onPointerDown={handleStakeTablePointerDown}
        onPointerCancel={handleStakeTablePointerEnd}
        onPointerLeave={handleStakeTablePointerEnd}
        onPointerMove={handleStakeTablePointerMove}
        onPointerUp={handleStakeTablePointerEnd}
      >
        <table className="stakeTable hexStakeTable">
          <thead>
            <tr>
              <th>{renderSortHeader("Chain", "chain")}</th>
              <th>{renderSortHeader("Wallet", "wallet")}</th>
              <th>Start</th>
              <th>End</th>
              <th>Progress</th>
              <th>{renderSortHeader("Principal", "hex")}</th>
              <th>{renderSortHeader("T-shares", "tshares")}</th>
              <th>Est. yield</th>
              <th>{history ? "Final value" : "Est. value"}</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {rowsToRender.map((row) => {
              const progress = getStakeProgress(row);
              const estimatedValue = getStakeEstimatedValueUsd(row);

              return (
                <tr className={highlightedStakeId === row.id ? "isHighlightedStake" : ""} id={stakeDomId(row)} key={row.id}>
                  <td>
                    <span className={`chainPill ${row.chain.key}`}>{row.chain.shortLabel}</span>
                  </td>
                  <td>
                    <a className="walletLink" href={`${row.chain.explorer}${row.address}`} target="_blank" rel="noreferrer">
                      <span>
                        <strong>{displayWalletLabel(row.address)}</strong>
                        <small>{displayShortAddress(row.address)}</small>
                      </span>
                      <ExternalLink size={12} aria-hidden="true" />
                    </a>
                  </td>
                  <td>
                    <strong>Day {row.lockedDay.toLocaleString()}</strong>
                    <small>{hexDayToDate(row.lockedDay).toLocaleDateString()}</small>
                  </td>
                  <td>
                    <strong>Day {row.unlockDay.toLocaleString()}</strong>
                    <small>{row.unlockDate.toLocaleDateString()}</small>
                  </td>
                  <td className="stakeProgressCell">
                    <div className="stakeProgressMeta">
                      <span>{progress.percent.toLocaleString(undefined, { maximumFractionDigits: 1 })}%</span>
                      <small>{progress.servedDays.toLocaleString()} / {row.stakedDays.toLocaleString()}d</small>
                    </div>
                    <span className="stakeProgressTrack" aria-hidden="true">
                      <span style={{ width: `${progress.percent}%` }} />
                    </span>
                  </td>
                  <td>
                    <strong>{displayHexAmount(row.hex)}</strong>
                    <small>{row.source}</small>
                  </td>
                  <td>
                    <strong>{displayHexAmount(row.tShares)}</strong>
                    {(() => {
                      const rate = tShareRateInfo(row);
                      return rate ? (
                        <small title="HEX per T-share when this stake started vs the current share rate">
                          @{formatCompactNumber(rate.costHexPerTshare)}{rate.nowHexPerTshare > 0 ? ` · now ${formatCompactNumber(rate.nowHexPerTshare)}` : ""}
                        </small>
                      ) : null;
                    })()}
                  </td>
                  <td>
                    <strong>{displayHexAmount(formatTokenUnits(estimateStakeYieldHearts(row), 8, 2))}</strong>
                    <small>HEX est.</small>
                  </td>
                  <td>
                    <strong>{displayHexAmount(estimatedValue > 0 ? formatCompactUsd(estimatedValue) : "—")}</strong>
                    <small>{row.chain.key === "ethereum" ? "eHEX" : "pHEX"}</small>
                  </td>
                  <td>
                    <span className={`stakeStatus ${row.statusKind}`}>{row.status}</span>
                  </td>
                  <td>{renderUnlockAction(row)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  function renderHexStakesDashboard() {
    const timelineRows = [...activeStakeRows]
      .sort((a, b) => a.unlockDay - b.unlockDay)
      .slice(0, 5);
    const selectedWalletLabel = portfolioWalletFilterIsAll
      ? `${validWallets.length.toLocaleString()} tracked wallet${validWallets.length === 1 ? "" : "s"}`
      : `${selectedPortfolioWalletKeys.size.toLocaleString()} selected wallet${selectedPortfolioWalletKeys.size === 1 ? "" : "s"}`;

    return (
      <>
        <section className="hexStakeOverview">
          <div className="hexStakeOverviewCopy">
            <span className="stakeEyebrow">Stake command center</span>
            <h2>Your HEX, organized by maturity.</h2>
            <p>
              See every active native and wrapped stake across PulseChain and Ethereum, with live days remaining,
              estimated yield, and owner-aware end-stake actions.
            </p>
            <div className="hexStakeOverviewActions">
              <button
                className="stakePrimaryButton"
                type="button"
                onClick={refreshHexStakes}
                disabled={busy || stakeQuoteBusy}
              >
                <RefreshCw size={16} aria-hidden="true" />
                {busy || stakeQuoteBusy ? "Refreshing stakes" : "Refresh stakes"}
              </button>
              <a className="stakeGhostLink" href="?page=hex-stake">
                <Coins size={15} aria-hidden="true" />
                Start a new stake
              </a>
            </div>
          </div>
          <div className="hexStakeOverviewTotal">
            <span>Active stakes</span>
            <strong>{activeStakeRows.length.toLocaleString()}</strong>
            <small>{selectedWalletLabel}</small>
          </div>
        </section>

        {renderStakeWalletFilter()}

        <section className="hexStakeSummaryGrid" aria-label="HEX stake summary">
          <article>
            <span>Principal locked</span>
            <strong>{displayHexAmount(formatTokenUnits(totalStakedHearts, 8, 1))}</strong>
            <small>HEX + eHEX</small>
          </article>
          <article>
            <span>Estimated yield</span>
            <strong>{displayHexAmount(formatTokenUnits(totalEstimatedYieldHearts, 8, 1))}</strong>
            <small>flat latest-payout estimate</small>
          </article>
          <article>
            <span>T-shares</span>
            <strong>{displayHexAmount(formatTokenUnits(totalStakeShares, 12, 2))}</strong>
            <small>share power</small>
          </article>
          <article>
            <span>Estimated value</span>
            <strong>{displayHexAmount(totalStakeEstimatedValueUsd > 0 ? formatCompactUsd(totalStakeEstimatedValueUsd) : "—")}</strong>
            <small>principal + estimated yield</small>
          </article>
          <article className={readyCount > 0 ? "isReady" : ""}>
            <span>Ready now</span>
            <strong>{readyCount.toLocaleString()}</strong>
            <small>{readyCount > 0 ? "can be ended" : "no matured stakes"}</small>
          </article>
        </section>

        <section className="hexStakeMaturityGrid">
          <article className="stakePanel hexNextMaturity">
            <div className="stakePanelHeader">
              <div className="stakePanelTitleLine">
                <CalendarClock size={20} aria-hidden="true" />
                <h2>Next maturities</h2>
              </div>
              <span className="portfolioWalletCount">{upcomingRows.length.toLocaleString()} scheduled</span>
            </div>

            {timelineRows.length === 0 ? (
              <div className="miniEmpty">Refresh stakes to build your maturity timeline.</div>
            ) : (
              <div className="hexMaturityTimeline">
                {timelineRows.map((row, index) => {
                  const daysLeft = Math.max(0, row.unlockDay - getRowCurrentDay(row));

                  return (
                    <button type="button" className="hexMaturityItem" onClick={() => scrollToStake(row)} key={`maturity-${row.id}`}>
                      <span className="hexMaturityIndex">{String(index + 1).padStart(2, "0")}</span>
                      <span className="hexMaturityDate">
                        <strong>{daysLeft === 0 ? "Ready now" : `${daysLeft.toLocaleString()} days`}</strong>
                        <small>{row.unlockDate.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}</small>
                      </span>
                      <span className="hexMaturityStake">
                        <strong>{displayHexAmount(row.hex)} HEX</strong>
                        <small>{row.chain.shortLabel} · {displayWalletLabel(row.address)}</small>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </article>

          <article className="stakePanel hexMaturityBands">
            <div className="stakePanelHeader">
              <div className="stakePanelTitleLine">
                <Clock size={20} aria-hidden="true" />
                <h2>Maturity outlook</h2>
              </div>
            </div>
            <div className="hexMaturityBandList">
              <div className="isReady">
                <span>Ready now</span>
                <strong>{readyCount.toLocaleString()}</strong>
              </div>
              <div>
                <span>Next 30 days</span>
                <strong>{dueWithin30Count.toLocaleString()}</strong>
              </div>
              <div>
                <span>Next 365 days</span>
                <strong>{dueWithin365Count.toLocaleString()}</strong>
              </div>
              <div>
                <span>Later</span>
                <strong>{Math.max(0, waitingCount - dueWithin365Count).toLocaleString()}</strong>
              </div>
            </div>
            <div className="hexNextDateCallout">
              <span>Next stake</span>
              <strong>
                {nextMaturityDays === null
                  ? "No active stakes"
                  : nextMaturityDays === 0
                    ? "Ready to end"
                    : `${nextMaturityDays.toLocaleString()} days away`}
              </strong>
              {nextRow && <small>{nextRow.localUnlock}</small>}
            </div>
          </article>
        </section>

        {status && <p className="stakeStatusLine">{status}</p>}

        {warnings.length > 0 && (
          <section className="stakeWarningList">
            {warnings.map((warning) => (
              <div className="stakeWarning" key={warning}>{warning}</div>
            ))}
          </section>
        )}

        <section className="stakePanel stakeTableCard hexActiveStakeCard">
          <div className="stakePanelHeader unlocksHeader">
            <div>
              <span className="stakeEyebrow">Your stake book</span>
              <div className="stakePanelTitleLine">
                <TrendingUp size={20} aria-hidden="true" />
                <h2>Active stakes</h2>
              </div>
            </div>
            <div className="stakeBookHeaderRight">
              <div className="stakeBookReference" aria-label="Current HEX day and HEX price">
                <span>
                  <small>HEX day</small>
                  <strong>{stakeBookHexDayLabel}</strong>
                </span>
                <span>
                  <small>pHEX price</small>
                  <strong>{stakeBookPulseHexPriceLabel}</strong>
                  <em>{pulseHexPriceUsd > 0 ? "PulseChain" : "loading"}</em>
                </span>
                <span>
                  <small>eHEX price</small>
                  <strong>{stakeBookEthereumHexPriceLabel}</strong>
                  <em>{ethereumHexPriceUsd > 0 ? "Ethereum" : "loading"}</em>
                </span>
              </div>
              <div className="unlockHeaderActions">
                <span className="portfolioWalletCount">{activeUnlockRows.length.toLocaleString()} active</span>
                <button
                  className={showEarlyEnd ? "toggleButton isActive" : "toggleButton"}
                  type="button"
                  onClick={() => {
                    setShowEarlyEnd((current) => !current);
                    setEarlyEndAck(false);
                  }}
                >
                  Show EES
                </button>
              </div>
            </div>
          </div>
          {showEarlyEnd && (
            <label className="stakeAckRow unlockEesAck">
              <input
                checked={earlyEndAck}
                onChange={(event) => setEarlyEndAck(event.target.checked)}
                type="checkbox"
              />
              <span>I understand early end stake can penalize principal/rewards. Reveal EES buttons only when I mean it.</span>
            </label>
          )}
          {activeUnlockRows.length === 0 ? (
            <div className="emptyStakeState">
              <Clock size={28} aria-hidden="true" />
              <span>No active stakes loaded for this wallet selection.</span>
            </div>
          ) : (
            renderStakeLedger(activeUnlockRows)
          )}
        </section>

        {endedUnlockRows.length > 0 && (
          <section className="stakePanel stakeTableCard hexStakeHistoryCard">
            <div className="stakePanelHeader">
              <div>
                <span className="stakeEyebrow">Archive</span>
                <div className="stakePanelTitleLine">
                  <Layers size={20} aria-hidden="true" />
                  <h2>Stake history</h2>
                </div>
              </div>
              <span className="portfolioWalletCount">{endedUnlockRows.length.toLocaleString()} ended</span>
            </div>
            {renderStakeLedger(endedUnlockRows, { history: true })}
          </section>
        )}
      </>
    );
  }

  return (
    <main className={isHexStakes ? "stakeShell hexStakeShell" : "stakeShell"}>
      <div className="stakeRibbon" />
      <div className="stakeGrain" />
      <div className="stakeWrap">
        {renderStakeTopbar()}
        <FeatureMenu active={isStakeCreator ? "hexStake" : isHexStakes ? "stakes" : "portfolio"} />
        {isStakeCreator && renderTsharePanel()}

        {isStakeCreator && (
          <section className="stakeHeroStats" aria-label="Stake creation snapshot">
            <article>
              <span>selected chain</span>
              <strong>{selectedStakeChain.label}</strong>
            </article>
            <article>
              <span>{selectedHexSymbol} balance</span>
              <strong>{walletHexBalance === null ? "-" : formatTokenUnits(walletHexBalance, 8, 1)}</strong>
            </article>
            <article>
              <span>HEX day</span>
              <strong>{walletCurrentDay === null ? "-" : walletCurrentDay.toLocaleString()}</strong>
            </article>
            <article>
              <span>native actions</span>
              <strong>start / end</strong>
            </article>
          </section>
        )}

        {isPortfolio && (
          <section className="portfolioValueBoard">
            {renderPortfolioValueBoard()}
          </section>
        )}

        {isPortfolio && (
          <section className="portfolioMarketBoard">
            {renderMarketBoard()}
          </section>
        )}

        {isStakeCreator && <section className="hexSuiteGrid stakeCreatorGrid">
          <article className="stakePanel stakeActionPanel">
            <div className="stakePanelHeader">
              <Coins size={20} aria-hidden="true" />
              <h2>Stake {selectedHexSymbol}</h2>
            </div>

            <div className="stakeOptionRow">
              {CHAINS.map((chain) => (
                <button
                  key={`stake-${chain.key}`}
                  className={stakeChainKey === chain.key ? "toggleButton isActive" : "toggleButton"}
                  type="button"
                  onClick={() => selectStakeChain(chain)}
                >
                  {chain.key === "ethereum" ? "Ethereum eHEX" : "PulseChain HEX"}
                </button>
              ))}
            </div>

            <div className="stakeBalanceStrip">
              <span>{selectedHexSymbol} balance</span>
              <strong>{walletHexBalance === null ? "-" : formatTokenUnits(walletHexBalance, 8, 2)}</strong>
            </div>

            <div className="stakeFormGrid">
              <label>
                <span>{selectedHexSymbol} amount</span>
                <input
                  value={stakeAmount}
                  onChange={(event) => setStakeAmount(event.target.value.replace(/[^0-9.]/g, ""))}
                  inputMode="decimal"
                  placeholder="0.00"
                />
                <div className="stakeAmountShortcuts" aria-label={`${selectedHexSymbol} balance shortcuts`}>
                  {[
                    { label: "25%", value: 2500 },
                    { label: "50%", value: 5000 },
                    { label: "75%", value: 7500 },
                    { label: "Max", value: 10000 }
                  ].map((item) => (
                    <button
                      className={item.label === "Max" ? "stakeShortcutButton isMax" : "stakeShortcutButton"}
                      key={item.label}
                      type="button"
                      onClick={() => fillStakeAmountFromBalance(item.value)}
                      disabled={!walletHexBalance || walletHexBalance <= 0n}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </label>
              <label>
                <span>stake days</span>
                <input
                  value={stakeDays}
                  onChange={(event) => setStakeDays(event.target.value.replace(/[^0-9]/g, ""))}
                  inputMode="numeric"
                  placeholder="5555"
                />
              </label>
            </div>

            {renderStakeCalculator()}

            <label className="stakeAckRow">
              <input
                checked={stakeAck}
                onChange={(event) => setStakeAck(event.target.checked)}
                type="checkbox"
              />
              <span>I understand HEX staking locks the HEX until maturity. Ending before maturity is an early end and can apply contract penalties.</span>
            </label>

            <button className="stakePrimaryButton stakeStartButton" type="button" onClick={startHexStake} disabled={stakeBusy === "start"}>
              <ShieldCheck size={17} aria-hidden="true" />
              {stakeBusy === "start" ? "Submitting stake" : `Start ${selectedHexSymbol} stake`}
            </button>

            {stakeStatus && <p className="stakeActionStatus">{stakeStatus}</p>}
          </article>
        </section>}

        {isPortfolio && <>
        <section className="portfolioGrid">
          <article className="stakePanel portfolioPanel" ref={walletManagerRef}>
            <div className="stakePanelHeader">
              <div className="stakePanelTitleLine">
                <Search size={20} aria-hidden="true" />
                <h2>Portfolio</h2>
                <button
                  className={hideWalletInfo ? "privacyIconButton inlinePrivacy isHidden" : "privacyIconButton inlinePrivacy"}
                  type="button"
                  onClick={() => setHideWalletInfo((current) => !current)}
                  title={hideWalletInfo ? "Show wallet info" : "Hide wallet info"}
                  aria-label={hideWalletInfo ? "Show wallet info" : "Hide wallet info"}
                >
                  {hideWalletInfo ? <EyeOff size={14} aria-hidden="true" /> : <Eye size={14} aria-hidden="true" />}
                </button>
              </div>
              <div className="portfolioHeaderActions">
                <span className="portfolioWalletCount">
                  {portfolioAddresses.length.toLocaleString()} / {MAX_PORTFOLIO_WALLETS.toLocaleString()} wallet{portfolioAddresses.length === 1 ? "" : "s"} added
                </span>
                <button
                  className="stakePrimaryButton loadStakesButton"
                  type="button"
                  onClick={refreshStakesAndValue}
                  disabled={busy || portfolioHoldingsBusy || stakeQuoteBusy}
                >
                  {busy || portfolioHoldingsBusy || stakeQuoteBusy ? <RefreshCw size={17} aria-hidden="true" /> : <CheckCircle2 size={17} aria-hidden="true" />}
                  {busy || portfolioHoldingsBusy || stakeQuoteBusy ? "Refreshing" : "Refresh portfolio"}
                </button>
                <span
                  className="loadStakesHelp"
                  title="Refreshes wallet balances, market values, and the shared stake cache for every saved wallet."
                  aria-label="Refresh portfolio details"
                >
                  <Info size={14} aria-hidden="true" />
                </span>
              </div>
            </div>

            <div className="walletRows" aria-label="Saved wallet rows">
              <div className={walletAddPrompt ? "walletRow walletRowAdd isPrompting" : "walletRow walletRowAdd"}>
                <label>
                  <span>New wallet name</span>
                  <input
                    value={walletDraft.name}
                    onKeyDown={handleWalletDraftKeyDown}
                    onChange={(event) => setWalletDraft((current) => ({ ...current, name: event.target.value }))}
                    placeholder="Trading wallet"
                  />
                </label>
                <label>
                  <span>New wallet address</span>
                  <input
                    ref={walletAddressInputRef}
                    value={walletDraft.address}
                    onKeyDown={handleWalletDraftKeyDown}
                    onChange={(event) => setWalletDraft((current) => ({ ...current, address: event.target.value }))}
                    placeholder="0x..."
                    spellCheck="false"
                  />
                </label>
                <button className="walletAddButton" type="button" onClick={addWallet} aria-label="Add wallet">
                  <Plus size={18} aria-hidden="true" />
                </button>
              </div>

              {savedWallets.length === 0 ? (
                <div className="walletRowEmpty">
                  <span>No saved wallets yet.</span>
                  {recoverableExtras.length > 0 && (
                    <button className="stakeGhostButton recoverWalletsButton" type="button" onClick={recoverSavedWallets}>
                      <RefreshCw size={15} aria-hidden="true" />
                      Recover {recoverableExtras.length.toLocaleString()} wallet{recoverableExtras.length === 1 ? "" : "s"}
                    </button>
                  )}
                </div>
              ) : (
                savedWallets.map((wallet) => {
                  const normalizedAddress = normalizeAddress(wallet.address);
                  const invalid = wallet.address && !normalizedAddress;

                  return (
                    <div className={invalid ? "walletRow isInvalid" : "walletRow"} key={wallet.id}>
                      <label>
                        <span>Name</span>
                        <input
                          type={hideWalletInfo ? "password" : "text"}
                          value={wallet.name}
                          onChange={(event) => updateWallet(wallet.id, "name", event.target.value)}
                          placeholder="Main wallet"
                        />
                      </label>
                      <label>
                        <span>Wallet address</span>
                        <input
                          type={hideWalletInfo ? "password" : "text"}
                          value={wallet.address}
                          onBlur={() => normalizeWalletAddress(wallet.id)}
                          onChange={(event) => updateWallet(wallet.id, "address", event.target.value)}
                          placeholder="0x..."
                          spellCheck="false"
                        />
                      </label>
                      <button className="walletIconButton" type="button" onClick={() => removeWallet(wallet.id)} aria-label={`Delete ${wallet.name || wallet.address || "wallet"}`}>
                        <Trash2 size={16} aria-hidden="true" />
                      </button>
                    </div>
                  );
                })
              )}

              {savedWallets.length > 0 && recoverableExtras.length > 0 && (
                <button className="stakeGhostButton recoverWalletsButton" type="button" onClick={recoverSavedWallets}>
                  <RefreshCw size={15} aria-hidden="true" />
                  Add back {recoverableExtras.length.toLocaleString()} cached wallet{recoverableExtras.length === 1 ? "" : "s"}
                </button>
              )}

              {savedWallets.length > 0 && (
                <button
                  className={clearWalletsArmed ? "stakeGhostButton clearWalletsButton isConfirming" : "stakeGhostButton clearWalletsButton"}
                  type="button"
                  onClick={clearPortfolio}
                >
                  <Trash2 size={17} aria-hidden="true" />
                  {clearWalletsArmed ? "Confirm clear wallets" : "Clear all wallets"}
                </button>
              )}
            </div>

            <div className="portfolioGroups" aria-label="Saved portfolios">
              <div className="portfolioGroupsHeader">
                <Layers size={16} aria-hidden="true" />
                <span>Saved portfolios</span>
              </div>
              <div className="walletRow walletRowAdd">
                <label>
                  <span>Group name</span>
                  <input
                    value={groupNameDraft}
                    onChange={(event) => setGroupNameDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        savePortfolioGroup();
                      }
                    }}
                    placeholder="e.g. Family wallets"
                  />
                </label>
                <button
                  className="stakeGhostButton"
                  type="button"
                  onClick={savePortfolioGroup}
                  disabled={validWallets.length === 0 || !groupNameDraft.trim()}
                >
                  <Plus size={15} aria-hidden="true" />
                  Save current ({validWallets.length})
                </button>
              </div>

              {portfolioGroups.length === 0 ? (
                <p className="portfolioGroupsEmpty">
                  Save your current wallet list as a named group so it’s never lost. Load it back any time.
                </p>
              ) : (
                <ul className="portfolioGroupList">
                  {portfolioGroups.map((group) => (
                    <li className="portfolioGroupItem" key={group.id}>
                      <span className="portfolioGroupName">
                        <strong>{group.name}</strong>
                        <small>{group.wallets.length} wallet{group.wallets.length === 1 ? "" : "s"}</small>
                      </span>
                      <span className="portfolioGroupActions">
                        <button className="stakeGhostButton" type="button" onClick={() => loadPortfolioGroup(group.id, false)}>
                          Load
                        </button>
                        <button className="stakeGhostButton" type="button" onClick={() => loadPortfolioGroup(group.id, true)} title="Add this group's wallets to the current list">
                          Merge
                        </button>
                        <button className="walletIconButton" type="button" onClick={() => deletePortfolioGroup(group.id)} aria-label={`Delete ${group.name}`}>
                          <Trash2 size={15} aria-hidden="true" />
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </article>
        </section>

        </>}

        {false && <>
        <section className="portfolioPulse">
          <article className="stakePanel">
            <div className="stakePanelHeader">
              <div className="stakePanelTitleLine">
                <Layers size={20} aria-hidden="true" />
                <h2>Wallet breakdown</h2>
              </div>
              <button className="collapseToggle" type="button" onClick={() => setWalletBreakdownOpen((current) => !current)}>
                {summaryRows.length.toLocaleString()} row{summaryRows.length === 1 ? "" : "s"}
                <ChevronDown className={walletBreakdownOpen ? "isOpen" : ""} size={16} aria-hidden="true" />
              </button>
            </div>
            {walletBreakdownOpen && (
              summaryRows.length === 0 ? (
                <div className="miniEmpty">Refresh stakes to see wallet-level counts.</div>
              ) : (
                <div className="walletBreakdownList">
                  {summaryRows.map((row) => (
                    <div className="walletBreakdownItem" key={row.id}>
                      <div>
                        <span>{hideWalletInfo ? "****" : row.walletName || walletLabel(row.address)}</span>
                        <small>{row.chain.label} / {displayShortAddress(row.address)}</small>
                      </div>
                      <strong>{row.nativeStakeCount + row.hsiStakeCount} stakes</strong>
                      <strong>{row.waatsaCount + row.stakedNftCount} NFTs</strong>
                    </div>
                  ))}
                </div>
              )
            )}
          </article>

          <article className="stakePanel">
            <div className="stakePanelHeader">
              <div className="stakePanelTitleLine">
                <CalendarClock size={20} aria-hidden="true" />
                <h2>Next unlocks</h2>
              </div>
              <button className="collapseToggle" type="button" onClick={() => setNextUnlocksOpen((current) => !current)}>
                {upcomingRows.length.toLocaleString()} upcoming
                <ChevronDown className={nextUnlocksOpen ? "isOpen" : ""} size={16} aria-hidden="true" />
              </button>
            </div>
            {nextUnlocksOpen && (
              upcomingRows.length === 0 ? (
                <div className="miniEmpty">{nextRow ? "No locked future stakes loaded." : "Refresh stakes to see upcoming unlocks."}</div>
              ) : (
                <div>
                  <div className="nextUnlockList">
                    {pagedUpcomingRows.map((row) => (
                      <button className="nextUnlockItem nextUnlockButton" type="button" onClick={() => scrollToStake(row)} key={`next-${row.id}`}>
                        <div>
                          <span>{displayWalletLabel(row.address)}</span>
                          <small>{row.localUnlock}</small>
                          <small>{row.chain.label} / {row.source}</small>
                        </div>
                        <div className="nextUnlockAmount">
                          <strong>{displayHexAmount(row.hex)} HEX</strong>
                          <small>{row.status}</small>
                        </div>
                      </button>
                    ))}
                  </div>
                  {upcomingRows.length > NEXT_UNLOCK_PAGE_SIZE && (
                    <div className="nextUnlockPager">
                      <button
                        type="button"
                        onClick={() => setNextUnlockPage((current) => Math.max(0, current - 1))}
                        disabled={safeNextUnlockPage === 0}
                        aria-label="Previous next unlocks page"
                      >
                        &lt;
                      </button>
                      <span>Page {safeNextUnlockPage + 1} / {nextUnlockPageCount}</span>
                      <button
                        type="button"
                        onClick={() => setNextUnlockPage((current) => Math.min(nextUnlockPageCount - 1, current + 1))}
                        disabled={safeNextUnlockPage >= nextUnlockPageCount - 1}
                        aria-label="Next next unlocks page"
                      >
                        &gt;
                      </button>
                    </div>
                  )}
                </div>
              )
            )}
          </article>
        </section>

        {status && <p className="stakeStatusLine">{status}</p>}

        {warnings.length > 0 && (
          <section className="stakeWarningList">
            {warnings.map((warning) => (
              <div className="stakeWarning" key={warning}>{warning}</div>
            ))}
          </section>
        )}

        <section className="stakePanel stakeTableCard">
          <div className="stakePanelHeader unlocksHeader">
            <div className="stakePanelTitleLine">
              <CalendarClock size={20} aria-hidden="true" />
              <h2>Unlocks</h2>
            </div>
            <div className="unlockHeaderActions">
              <button
                className={showEarlyEnd ? "toggleButton isActive" : "toggleButton"}
                type="button"
                onClick={() => {
                  setShowEarlyEnd((current) => !current);
                  setEarlyEndAck(false);
                }}
              >
                Show EES
              </button>
            </div>
          </div>
          {showEarlyEnd && (
            <label className="stakeAckRow unlockEesAck">
              <input
                checked={earlyEndAck}
                onChange={(event) => setEarlyEndAck(event.target.checked)}
                type="checkbox"
              />
              <span>I understand early end stake can penalize principal/rewards. Reveal EES buttons only when I mean it.</span>
            </label>
          )}
          {sortedRows.length === 0 ? (
            <div className="emptyStakeState">
              <Clock size={28} aria-hidden="true" />
              <span>No stakes loaded yet.</span>
            </div>
          ) : (
            <div
              className="stakeTableWrap"
              onClickCapture={handleStakeTableClick}
              onPointerDown={handleStakeTablePointerDown}
              onPointerCancel={handleStakeTablePointerEnd}
              onPointerLeave={handleStakeTablePointerEnd}
              onPointerMove={handleStakeTablePointerMove}
              onPointerUp={handleStakeTablePointerEnd}
            >
              <table className="stakeTable">
                <thead>
                  <tr>
                    <th>{renderSortHeader("Chain", "chain")}</th>
                    <th>{renderSortHeader("Wallet", "wallet")}</th>
                    <th>{renderSortHeader("Source", "source")}</th>
                    <th>{renderSortHeader("HEX", "hex")}</th>
                    <th>{renderSortHeader("T-shares", "tshares")}</th>
                    <th>Daily yield</th>
                    <th>{renderSortHeader("Locked", "locked")}</th>
                    <th>Unlock day</th>
                    <th>Date and time</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {unlockRows.map((row) => (
                    <tr className={highlightedStakeId === row.id ? "isHighlightedStake" : ""} id={stakeDomId(row)} key={row.id}>
                      <td>
                        <span className={`chainPill ${row.chain.key}`}>{row.chain.shortLabel}</span>
                      </td>
                      <td>
                        <a className="walletLink" href={`${row.chain.explorer}${row.address}`} target="_blank" rel="noreferrer">
                          <span>
                            <strong>{displayWalletLabel(row.address)}</strong>
                            <small>{displayShortAddress(row.address)}</small>
                          </span>
                          <ExternalLink size={12} aria-hidden="true" />
                        </a>
                      </td>
                      <td>
                        <span>{row.source}</span>
                        {row.hsiAddress && <small>{displayShortAddress(row.hsiAddress)}</small>}
                      </td>
                      <td>{displayHexAmount(row.hex)}</td>
                      <td>
                        <strong>{displayHexAmount(row.tShares)}</strong>
                        {(() => {
                          const rate = tShareRateInfo(row);
                          return rate ? (
                            <small title="HEX per T-share when this stake started vs the current share rate">
                              @{formatCompactNumber(rate.costHexPerTshare)}{rate.nowHexPerTshare > 0 ? ` · now ${formatCompactNumber(rate.nowHexPerTshare)}` : ""}
                            </small>
                          ) : null;
                        })()}
                      </td>
                      <td>
                        <StakeYieldSparkline row={row} dayPayoutMap={dailyYieldByChain[row.chain.key]} />
                      </td>
                      <td>{row.stakedDays.toLocaleString()} days</td>
                      <td>
                        <strong>{row.unlockDay.toLocaleString()}</strong>
                        <small>started day {row.lockedDay.toLocaleString()}</small>
                      </td>
                      <td>
                        <strong>{row.localUnlock}</strong>
                        <small>{row.utcUnlock}</small>
                      </td>
                      <td>
                        <span className={`stakeStatus ${row.statusKind}`}>{row.status}</span>
                      </td>
                      <td>{renderUnlockAction(row)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="stakePanel nftTableCard">
          <div className="stakePanelHeader">
            <Image size={20} aria-hidden="true" />
            <h2>Icosa NFTs</h2>
          </div>
          {nftRows.length === 0 ? (
            <div className="emptyStakeState">
              <Image size={28} aria-hidden="true" />
              <span>No wallet-held WAATSA or staked Icosa NFT rows loaded yet.</span>
            </div>
          ) : (
            <div className="nftGrid">
              {nftRows.map((row) => (
                <article className="nftCard" key={row.id}>
                  <div>
                    <span className={`nftStatus ${row.statusKind}`}>{row.status}</span>
                    <h3>{row.collection} #{row.tokenId}</h3>
                    <p>{row.detail}</p>
                  </div>
                  <div className="nftMeta">
                    <span>{row.chain.label}</span>
                    <span>{displayWalletLabel(row.address)}</span>
                  </div>
                  <a href={`${row.chain.explorer}${row.tokenAddress}`} target="_blank" rel="noreferrer">
                    View contract
                    <ExternalLink size={12} aria-hidden="true" />
                  </a>
                </article>
              ))}
            </div>
          )}
        </section>
        </>}

        {isHexStakes && renderHexStakesDashboard()}

        {isHexStakes && earlyEndCandidate && (() => {
          const warning = buildEarlyEndWarning(earlyEndCandidate);
          // Rough EES math from the latest daily payout: accrued yield over served days,
          // penalty over the penalty window, net = principal + yield - penalty (floor 0).
          // The contract computes the real figure at transaction time.
          const eesMetrics = stakeQuoteMetrics[earlyEndCandidate.chain.key];
          let estYieldHearts = 0n;
          let estPenaltyHearts = 0n;

          if (eesMetrics && eesMetrics.dayStakeSharesTotal > 0n && earlyEndCandidate.stakeShares > 0n) {
            const perTshareDaily = eesMetrics.dayPayoutTotal * HEARTS_PER_TSHARE / eesMetrics.dayStakeSharesTotal;
            estYieldHearts = perTshareDaily * earlyEndCandidate.stakeShares * BigInt(Math.max(0, warning.servedDays)) / HEARTS_PER_TSHARE;
            estPenaltyHearts = perTshareDaily * earlyEndCandidate.stakeShares * BigInt(Math.max(0, warning.penaltyDays)) / HEARTS_PER_TSHARE;
          }

          const grossHearts = (earlyEndCandidate.stakedHearts ?? 0n) + estYieldHearts;
          const estNetHearts = grossHearts > estPenaltyHearts ? grossHearts - estPenaltyHearts : 0n;
          const hasEesEstimate = estYieldHearts > 0n || estPenaltyHearts > 0n;

          return (
            <div className="eesModalBackdrop" role="presentation">
              <section className="eesModal" role="dialog" aria-modal="true" aria-labelledby="ees-title">
                <span className="stakeEyebrow">Emergency end stake</span>
                <h2 id="ees-title">This can destroy your stake.</h2>
                <p>
                  HEX early end stake penalties are hard-coded. The contract penalizes at least half of the committed
                  stake length, with a 90 day minimum penalty window. If the stake has not served enough days, that
                  penalty can eat into principal.
                </p>

                <div className="eesRiskGrid">
                  <div>
                    <span>Stake size</span>
                    <strong>{displayHexAmount(`${earlyEndCandidate.hex} HEX`)}</strong>
                  </div>
                  <div>
                    <span>Served</span>
                    <strong>{warning.servedDays.toLocaleString()} / {earlyEndCandidate.stakedDays.toLocaleString()} days</strong>
                  </div>
                  <div>
                    <span>Days left</span>
                    <strong>{warning.daysLeft.toLocaleString()}</strong>
                  </div>
                  <div>
                    <span>Penalty window</span>
                    <strong>{warning.penaltyDays.toLocaleString()} days</strong>
                  </div>
                  <div>
                    <span>Principal at risk</span>
                    <strong>{displayHexAmount(warning.principalRisk)}</strong>
                  </div>
                  <div>
                    <span>Progress</span>
                    <strong>{(warning.progress * 100).toLocaleString(undefined, { maximumFractionDigits: 1 })}%</strong>
                  </div>
                  {hasEesEstimate && (
                    <div>
                      <span>Est. penalty</span>
                      <strong>~{displayHexAmount(formatTokenUnits(estPenaltyHearts, 8, 2))} HEX</strong>
                    </div>
                  )}
                  {hasEesEstimate && (
                    <div>
                      <span>Est. net return</span>
                      <strong>~{displayHexAmount(formatTokenUnits(estNetHearts, 8, 2))} HEX</strong>
                    </div>
                  )}
                </div>

                <p className="eesModalWarning">
                  {warning.penaltyWindowMet
                    ? "This stake has served the minimum penalty window, but early ending can still forfeit rewards. The HEX contract calculates the final return at transaction time."
                    : "This stake has not served the minimum penalty window. You can lose principal, and in extreme cases an early end can return little or nothing."}
                </p>

                <div className="eesModalActions">
                  <button className="stakeGhostButton" type="button" onClick={() => setEarlyEndCandidate(null)}>
                    No, keep stake
                  </button>
                  <button className="stakePrimaryButton dangerAction" type="button" onClick={confirmEarlyEndStake}>
                    Yes, early end
                  </button>
                </div>
              </section>
            </div>
          );
        })()}
      </div>
    </main>
  );
}
