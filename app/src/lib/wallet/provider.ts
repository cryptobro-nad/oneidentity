/**
 * Wallet discovery and connection.
 *
 * Uses EIP-6963 (multi-injected provider discovery) plus viem's `custom`
 * transport. That is deliberately the whole dependency footprint: no wagmi, no
 * connector framework, no WalletConnect project ID, no social login. EIP-6963
 * is what MetaMask and Rabby already announce themselves with, so this supports
 * every injected wallet without adding a package.
 *
 * This module never sees a private key, never requests approvals, and never
 * initiates transfers. It reads accounts, reads the chain, requests a chain
 * switch, signs typed data, and sends the one createOne / removeMember call.
 */

import {
  createWalletClient,
  custom,
  getAddress,
  type EIP1193Provider,
  type WalletClient,
} from "viem";
import { MONAD_CHAIN_ID, monad } from "@/lib/chain";

export type WalletInfo = {
  uuid: string;
  name: string;
  icon: string;
  rdns: string;
};

export type DiscoveredWallet = { info: WalletInfo; provider: EIP1193Provider };

type Eip6963AnnounceEvent = CustomEvent<DiscoveredWallet>;

/** Monad Mainnet as wallet_addEthereumChain expects it. */
export const MONAD_CHAIN_PARAMS = {
  chainId: `0x${MONAD_CHAIN_ID.toString(16)}` as `0x${string}`,
  chainName: "Monad",
  nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
  rpcUrls: [monad.rpcUrls.default.http[0]!],
  blockExplorerUrls: ["https://monadscan.com"],
};

/**
 * Subscribes to EIP-6963 announcements.
 *
 * Wallets announce in response to the request event, so we listen first and
 * then request. Returns an unsubscribe function.
 */
export function subscribeToWallets(
  onChange: (wallets: DiscoveredWallet[]) => void,
): () => void {
  if (typeof window === "undefined") return () => {};

  const found = new Map<string, DiscoveredWallet>();

  const handler = (event: Event) => {
    const detail = (event as Eip6963AnnounceEvent).detail;
    if (!detail?.info?.uuid) return;
    found.set(detail.info.uuid, detail);
    onChange([...found.values()]);
  };

  window.addEventListener("eip6963:announceProvider", handler);
  window.dispatchEvent(new Event("eip6963:requestProvider"));

  // Fallback for wallets that predate EIP-6963 and only set window.ethereum.
  const legacy = (window as { ethereum?: EIP1193Provider }).ethereum;
  if (legacy && found.size === 0) {
    found.set("legacy-injected", {
      info: {
        uuid: "legacy-injected",
        name: "Injected wallet",
        icon: "",
        rdns: "legacy.injected",
      },
      provider: legacy,
    });
    onChange([...found.values()]);
  }

  return () => window.removeEventListener("eip6963:announceProvider", handler);
}

export async function requestAccounts(provider: EIP1193Provider): Promise<string[]> {
  // Force the wallet's account picker every time the user explicitly connects,
  // so after a disconnect (or an account switch in the wallet) they always land
  // on the account they currently have active — rather than eth_requestAccounts
  // silently returning a previously-authorised account. Wallets that don't
  // support EIP-2255 fall through to eth_requestAccounts unchanged.
  try {
    await provider.request({
      method: "wallet_requestPermissions",
      params: [{ eth_accounts: {} }],
    } as Parameters<EIP1193Provider["request"]>[0]);
  } catch (err) {
    // 4001 = the user dismissed the picker → a cancelled connect, not a fallback.
    if ((err as { code?: number } | null)?.code === 4001) throw err;
    // Unsupported / not-implemented → continue to eth_requestAccounts.
  }
  const accounts = (await provider.request({ method: "eth_requestAccounts" })) as string[];
  return accounts.map((a) => getAddress(a));
}

/**
 * Attempts to revoke this site's account permission on an injected wallet, and
 * reports whether the wallet was actually de-authorised.
 *
 * This is what makes a deliberate disconnect *real*. After revoking (EIP-2255 /
 * MetaMask `wallet_revokePermissions`), the next connect opens the wallet and
 * asks the user to approve the active account, instead of `eth_requestAccounts`
 * returning the previous account silently.
 *
 * Not every wallet honours it. Backpack, for one, keeps the site connected —
 * either the method is unsupported or it is a no-op. So this does not trust the
 * call: it re-reads `eth_accounts` afterwards and treats the wallet as
 * de-authorised only if the wallet no longer reports an authorised account.
 * That behavioural check is wallet-agnostic — it catches both a thrown
 * "unsupported" and a silent no-op — so the caller can be honest about whether
 * the disconnect took effect. Never throws.
 */
export async function revokeInjectedPermissions(
  provider: EIP1193Provider,
): Promise<{ deauthorized: boolean }> {
  try {
    await provider.request({
      method: "wallet_revokePermissions",
      params: [{ eth_accounts: {} }],
    } as Parameters<EIP1193Provider["request"]>[0]);
  } catch {
    // Unsupported, already revoked, or dismissed — verified below regardless.
  }

  try {
    const accounts = (await provider.request({ method: "eth_accounts" })) as unknown;
    const stillAuthorised = Array.isArray(accounts) && accounts.length > 0;
    return { deauthorized: !stillAuthorised };
  } catch {
    // If the wallet will not even report accounts, treat it as cleared.
    return { deauthorized: true };
  }
}

export async function getChainId(provider: EIP1193Provider): Promise<number> {
  const hex = (await provider.request({ method: "eth_chainId" })) as string;
  return Number.parseInt(hex, 16);
}

/** EIP-1193 / EIP-3085 codes we act on. */
export const ERROR_USER_REJECTED = 4001;
export const ERROR_UNRECOGNIZED_CHAIN = 4902;
export const ERROR_UNSUPPORTED_METHOD = 4200;

/**
 * Digs an RPC error code out of a provider error.
 *
 * WalletConnect does not surface RPC errors at the top level the way an
 * injected wallet does — it wraps the wallet's response, so a 4902 commonly
 * arrives as `error.cause.code`, `error.data.originalError.code`, or only
 * inside the message text. Checking `error.code` alone (the previous
 * behaviour) silently missed those, which is why "add the chain" never fired
 * for mobile users and the switch appeared to do nothing.
 */
export function extractRpcErrorCode(error: unknown): number | null {
  const seen = new Set<unknown>();

  const walk = (node: unknown, depth: number): number | null => {
    if (!node || depth > 6 || seen.has(node)) return null;
    seen.add(node);

    if (typeof node === "object") {
      const code = (node as { code?: unknown }).code;
      if (typeof code === "number") return code;
      // Some wallets send the code as a numeric string.
      if (typeof code === "string" && /^-?\d+$/.test(code)) return Number.parseInt(code, 10);

      for (const key of ["cause", "data", "originalError", "error", "innerError"] as const) {
        const found = walk((node as Record<string, unknown>)[key], depth + 1);
        if (found !== null) return found;
      }
    }
    return null;
  };

  const direct = walk(error, 0);
  if (direct !== null) return direct;

  // Last resort: some providers only report the code in the message string.
  const message = error instanceof Error ? error.message : String(error ?? "");
  const match = message.match(/\b(4001|4902|4200)\b/);
  return match ? Number.parseInt(match[1]!, 10) : null;
}

export function isUserRejection(error: unknown): boolean {
  if (extractRpcErrorCode(error) === ERROR_USER_REJECTED) return true;
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /user rejected|user denied|rejected the request|user disapproved/i.test(message);
}

export type SwitchOutcome =
  | { ok: true; chainId: number }
  | {
      ok: false;
      reason: "rejected" | "unsupported-method" | "unsupported-chain" | "still-wrong-chain" | "failed";
      chainId: number | null;
      message: string;
    };

/**
 * Switches the wallet to Monad Mainnet and VERIFIES the result.
 *
 * Three things the previous implementation got wrong, all of which made the
 * mobile button appear to do nothing:
 *
 *  1. It only inspected `error.code`, so WalletConnect's wrapped 4902 was
 *     never recognised and the chain was never added.
 *  2. After adding the chain it returned immediately. Adding a chain does not
 *     switch to it in most wallets, so the user stayed on the wrong network.
 *  3. It never re-read `eth_chainId`, so a silently-ignored request looked
 *     like success.
 *
 * Success now means one thing only: the provider reports chain 143.
 */
export async function switchToMonad(provider: EIP1193Provider): Promise<SwitchOutcome> {
  const readChain = async (): Promise<number | null> => {
    try {
      return await getChainId(provider);
    } catch {
      return null;
    }
  };

  const request = async (method: string, params: unknown[]) =>
    provider.request({ method, params } as Parameters<EIP1193Provider["request"]>[0]);

  try {
    await request("wallet_switchEthereumChain", [{ chainId: MONAD_CHAIN_PARAMS.chainId }]);
  } catch (error) {
    if (isUserRejection(error)) {
      // Never follow a rejection with an add-chain prompt: the user just said
      // no, and prompting again is the wrong response to that answer.
      return {
        ok: false,
        reason: "rejected",
        chainId: await readChain(),
        message: "You declined the network change in your wallet.",
      };
    }

    const code = extractRpcErrorCode(error);

    if (code === ERROR_UNRECOGNIZED_CHAIN) {
      try {
        await request("wallet_addEthereumChain", [MONAD_CHAIN_PARAMS]);
      } catch (addError) {
        if (isUserRejection(addError)) {
          return {
            ok: false,
            reason: "rejected",
            chainId: await readChain(),
            message: "You declined adding Monad Mainnet to your wallet.",
          };
        }
        return {
          ok: false,
          reason: "unsupported-chain",
          chainId: await readChain(),
          message: "Your wallet could not add Monad Mainnet.",
        };
      }

      // Adding is not switching. Ask explicitly, and tolerate a wallet that
      // already switched as part of adding.
      try {
        await request("wallet_switchEthereumChain", [{ chainId: MONAD_CHAIN_PARAMS.chainId }]);
      } catch {
        // Verified below rather than trusted either way.
      }
    } else if (code === ERROR_UNSUPPORTED_METHOD) {
      return {
        ok: false,
        reason: "unsupported-method",
        chainId: await readChain(),
        message: "This wallet does not support switching networks from a website.",
      };
    } else {
      return {
        ok: false,
        reason: "failed",
        chainId: await readChain(),
        message: "The network change request failed.",
      };
    }
  }

  // The only proof that matters.
  const chainId = await readChain();
  if (chainId === MONAD_CHAIN_ID) return { ok: true, chainId };

  return {
    ok: false,
    reason: "still-wrong-chain",
    chainId,
    message: "Your wallet is still on a different network.",
  };
}

export function walletClientFor(
  provider: EIP1193Provider,
  account: `0x${string}`,
): WalletClient {
  return createWalletClient({ account, chain: monad, transport: custom(provider) });
}

/** Subscribes to account/chain changes so the UI never shows a stale wallet. */
export function subscribeToProviderEvents(
  provider: EIP1193Provider,
  handlers: { onAccountsChanged: (a: string[]) => void; onChainChanged: (id: number) => void },
): () => void {
  const accountsHandler = (accounts: unknown) => {
    handlers.onAccountsChanged((accounts as string[]).map((a) => getAddress(a)));
  };
  const chainHandler = (chainId: unknown) => {
    handlers.onChainChanged(Number.parseInt(chainId as string, 16));
  };

  const emitter = provider as unknown as {
    on?: (event: string, cb: (arg: unknown) => void) => void;
    removeListener?: (event: string, cb: (arg: unknown) => void) => void;
  };

  emitter.on?.("accountsChanged", accountsHandler);
  emitter.on?.("chainChanged", chainHandler);

  return () => {
    emitter.removeListener?.("accountsChanged", accountsHandler);
    emitter.removeListener?.("chainChanged", chainHandler);
  };
}
