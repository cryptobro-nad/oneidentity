# Screenshots

Captured from ONE running against **Monad Mainnet** (chain 143). Every balance,
NFT count, address and block number is real onchain data.

| File | Shows |
|---|---|
| `01-landing.png` | Landing page — "Many wallets. One view." |
| `02-portfolio-addresses.png` | Watch-only portfolio setup with the permanent "Unverified portfolio" label |
| `03-combined-balances.png` | Combined MON and stablecoin balances with per-wallet breakdown |
| `04-nft-holdings.png` | Automatic NFT discovery — seven collections found for one wallet |
| `05-verified-one-start.png` | Verified ONE entry point and wallet connection |
| `06-wallet-already-linked.png` | **Guardrail** — a wallet already belonging to an active ONE |
| `07-signature-checks.png` | **Guardrail** — unsigned wallets, requiring the exact address |
| `08-review-and-gas.png` | **Guardrail** — gas estimation and the "Not ready to submit" blocklist |
| `09-active-one-profile.png` | Public profile of the first live Verified ONE |
| `10-nft-holdings-full.png` | Full portfolio page including discovered NFT collections |
| `11-nft-holdings-expanded.png` | An NFT collection row expanded to per-wallet balances |

## On the content of these images

These screenshots intentionally show **public** data: wallet addresses, contract
addresses, transaction hashes, balances and NFT holdings. All of it is readable
by anyone with an RPC endpoint, and showing it is the point — it demonstrates
real onchain behaviour rather than mockups.

No image contains a private key, seed phrase, API key, password or keystore
material.

The guardrail screenshots (06, 07, 08) show the application **refusing to
proceed**. They are included deliberately: they are evidence that the rules are
enforced in the interface, not just in the contracts.
