# HEX Suite

A fully client-side HEX & PulseChain portfolio tracker. No backend, no accounts, no tracking — wallet addresses and history live in your browser's localStorage and never leave it, except as read-only queries to public blockchain infrastructure.

## Features

- **HEX stakes** — native and Icosa/HSI-wrapped stakes across PulseChain and Ethereum, with per-stake yield estimates, T-share cost vs. current rate, unlock calendar, and early-end penalty estimates
- **Portfolio** — automatic discovery of every PRC-20 a wallet holds (via Blockscout), priced through DexScreener with liquidity-floor and exit-liquidity plausibility checks so scam airdrops can't inflate net worth
- **LPs & farms** — PulseX-style LP tokens decomposed into underlying value; PulseX MasterChef staked positions and pending INC
- **NFT collections** — every PRC-721/1155 collection per wallet
- **Net worth history** — recorded live, plus up to 5 years reconstructed from onchain archive state (historical balances × historical PulseX/Uniswap pool reserves — no third-party price API)
- **Multi-wallet** — up to 25 watch-only wallets, named groups, combined or filtered views, privacy masking, CSV export

## Architecture notes

- All chain reads go through a Multicall3 coalescer (hundreds of reads per round trip) with RPC failover — deliberate design so the app stays fast and gentle on public RPCs
- JSON-RPC batching is intentionally disabled (public PulseChain RPC serves batches serially; measured ~4× slower than concurrent single calls)
- Historical backfill uses archive `eth_call` at sampled block heights; USD prices derive from pair reserves against bridged-DAI/WPLS (PulseChain) and USDC/WETH (Ethereum) anchors

## Run

```bash
npm install
npm run dev      # http://127.0.0.1:5173
npm run build    # production build in dist/
```

No environment variables required. Optional RPC overrides in `.env.example`.

## Deploy

Push to a Git repo and import into Vercel — `vercel.json` carries the build settings and security headers. No env vars, no secrets, nothing server-side.

## Disclaimer

This is a read-only portfolio viewer. It estimates values from public market data; estimates (yield, early-end penalties, historical reconstruction) are approximations, not financial advice. Verify anything that matters onchain.
