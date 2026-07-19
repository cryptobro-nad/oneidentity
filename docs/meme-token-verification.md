# Curated Monad meme-token verification

Evidence for every address in `app/src/lib/memeTokens.ts`. Verified 19 July 2026
against Monad Mainnet (chain 143) via `https://rpc.monad.xyz`.

Eleven tokens were requested. **Nine ship. Two do not.**

## Why symbols are not enough

The request warned that imitation tokens may exist. They do, in quantity.
Scanning nad.fun's index of 1,200 tokens turned up:

- **six** live contracts answering `symbol()` as `MOLANDAK` / `Molandak` / `DAK` / `MOLAN`
- **five** answering `moncock` / `mCOCK` / `MONCOCK`

Selecting by symbol would have shipped an imitation. Every one of those
copycats fails the graduation check below.

## Inclusion criteria

A token ships only if **all four** hold:

1. **Launchpad confirmation.** `GET https://api.nad.fun/token/:address` returns
   the token with `is_graduated: true`. nad.fun is the Monad launchpad that
   minted these; graduation means the bonding curve completed and the token
   moved to a DEX.
2. **Uniqueness.** It is the only *graduated* token for that symbol across
   nad.fun's index (`GET /order/market_cap`, 1,200 tokens paged).
3. **Identity.** An official website and/or X account exists, and is recorded
   in the config.
4. **Onchain agreement.** Bytecode present; `name()`, `symbol()`, `decimals()`,
   `totalSupply()`, `balanceOf()` all answer; symbol and decimals match config.

Sources are ranked as the task specified: official project channels first,
maintained lists/explorers second, direct onchain checks third. Where sources
conflicted, the conflict is documented rather than silently resolved.

## Included (9)

All are 18 decimals, chain 143, and hold the nad.fun standard supply of
1,000,000,000 tokens (`1e27` base units).

| Display | Onchain `symbol()` | Address | Official source |
|---|---|---|---|
| Chog | `CHOG` | `0x350035555E10d9AfAF1566AaebfCeD5BA6C27777` | https://chog.xyz/ · [@chognft](https://x.com/chognft) |
| James | `JAMES` | `0x43cF5407BDA1400498b8064d50A7e17528d87777` | https://www.busybullmon.com/ |
| Bob | `BOB` | `0x21E325B059Cd83d4037C82F0F5998Ba2dF3d7777` | https://bobmonad.com · [@BobMonad](https://x.com/BobMonad) |
| Shramp | `shramp` | `0x42a4aA89864A794dE135B23C6a8D2E05513d7777` | https://shramp.me/ · [@ShrampX](https://x.com/ShrampX) |
| 143 | `143` | `0x3842751a46D23B41A47E702473dFf316E6237777` | https://143.community/ · [@143_hq](https://x.com/143_hq) |
| emonad | `emo` | `0x81A224F8A62f52BdE942dBF23A56df77A10b7777` | https://emonad.lol · [@emonadcoin](https://x.com/emonadcoin) |
| Anago | `ANAGO` | `0x3Ec7310937281CA4Bf89D5bB11704bE9b7ff7777` | https://anagocult.com/ · [@anagocult](https://x.com/anagocult) |
| EGGMON | `EGG` | `0xD10cf12099f5Fb424Bc77401DF49f0c785657777` | https://eggmon.fun · [@eggmonad](https://x.com/eggmonad) |
| moncock | `moncock` | `0x405b6330e213DED490240CbcDD64790806827777` | https://moncock.wtf/ |

Note the case-sensitive symbols: `shramp`, `emo` and `moncock` are lowercase
onchain, and EGGMON's symbol is `EGG`. The config stores the chain's answer
verbatim; tests assert this.

### Contract shape

Seven are EIP-1167 minimal proxies (45 bytes) cloning
`0x7f64ccfeb3e3afd7691ea0ef404e947786cefae8`.

JAMES clones `0x4f44eafa383fe5f97a0d6cff97fc5d605d026fbd` instead — nad.fun V2.
This matters: the V3 Lens contract
(`0x7e78A8DE94f21804F7a17F4E8BF9EC2c872187ea`) reports `isGraduated(JAMES)` as
`false` because it does not index V2 tokens, while the nad.fun **API** reports
`is_graduated: true`. The API is authoritative across versions; the Lens check
alone would have wrongly excluded a legitimate token.

The `…7777` address suffix is a CREATE2 vanity salt mined by the launchpad
(`POST /token/salt`), not coincidence.

## Excluded (2)

### MONIGGA — excluded by policy, not by verification

`0x73b62FF5CFea3Fb857DBE84a57f1631630247777`

This token **passes every technical criterion**: nad.fun graduated, unique for
its symbol, official site `https://monigga.com`, clean onchain metadata.

It is excluded solely because its name embeds a racial slur and ONE is a
public, shareable product whose README and screenshots would carry it. This is
a content decision, recorded here so it is not mistaken for a verification
failure and not silently re-added later.

### MOLANDAK — unresolved, sources conflict

Two different live tokens on Monad Mainnet both answer `symbol() = "MOLANDAK"`:

| | `0x7B2728c04aD436153285702e969e6EfAc3a97777` | `0xd32e9ddd968b18e8429f2d1da7efb2cc1f01d42d` |
|---|---|---|
| nad.fun API | graduated, `is_cto: true` | `{"error":"Invalid token id"}` |
| nad.fun Lens | recognised | reverts identically to a dead address |
| `name()` | `MOLANDAK` | `molandak` |
| `totalSupply()` | `1e27` (launchpad standard) | `6.66e26` (non-standard) |
| Bytecode | 45-byte EIP-1167 clone | full 3.8 kB contract |
| Official site | named exactly by `molandakcto.xyz` | none found |
| CoinGecko / OpenSea / DexScreener | not listed | all three, ~$124K market cap |

The task's own evidence hierarchy favours the first (official project site
outranks aggregators), but the actual trading liquidity and every third-party
listing sit on the second. Choosing wrongly displays a confident `0` to
somebody who genuinely holds the other token — worse than showing nothing.

Neither ships until the canonical one is confirmed, ideally by the Molandak
community directly.

## Reproducing these checks

```bash
# Launchpad confirmation (authoritative across contract versions)
curl -s https://api.nad.fun/token/0x350035555E10d9AfAF1566AaebfCeD5BA6C27777

# Onchain metadata
cast call 0x350035555E10d9AfAF1566AaebfCeD5BA6C27777 'symbol()(string)'   --rpc-url https://rpc.monad.xyz
cast call 0x350035555E10d9AfAF1566AaebfCeD5BA6C27777 'decimals()(uint8)'  --rpc-url https://rpc.monad.xyz
cast code 0x350035555E10d9AfAF1566AaebfCeD5BA6C27777                      --rpc-url https://rpc.monad.xyz
```

## Standing rules

- Addresses are **hardcoded and reviewed**. There is no runtime discovery by
  symbol — that is precisely how an imitation token would get in.
- ONE reads `balanceOf` only. No prices, market caps, charts, rankings or
  external price APIs are used anywhere in the app.
- Inclusion is **not an endorsement**. These are volatile community tokens.
