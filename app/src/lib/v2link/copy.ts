/**
 * Approved user-facing copy for the V2 linking flow. Do NOT reuse V1's
 * "No funds move" line — in V2 a small amount of MON does move (secondary →
 * primary, the user's own wallets).
 */

export const V2_LINK_COPY = {
  fundsNote:
    "You send a small amount of MON from the secondary wallet to your own primary wallet. ONE never receives, holds, forwards, or controls it. The amount stays in your primary wallet.",
  connectPrimary: "Connect your primary wallet",
  enterSecondary: "Enter the wallet address you want to link",
  linkWallet: "Link wallet",
  awaitingTransfer: "Send the exact amount from the secondary wallet using any wallet app.",
  checking: "Checking Monad for your transfer…",
  checkNow: "I've sent it — check now",
  transferConfirmed: "Transfer confirmed. Approve the link with your primary wallet.",
  approveWithPrimary: "Approve with primary",
  linked: "Wallet linked.",
  expired: "This attempt expired. Click Link wallet again to get a new amount.",
  approvalExpired: "The approval window closed before this was confirmed. Start again to link this wallet.",
  wrongNetwork: "Open your wallet, switch to Monad Mainnet, then try again.",
  wrongPrimary: "The connected wallet is not the primary you started with. Switch back to it, then try again.",
  approvalRejected: "You declined the approval in your wallet. You can approve again while the window is open.",
  approvalReverted: "The approval did not go through on Monad. Check the explorer, then try again.",
  transferWindowNote: "You have 5 minutes to send the transfer.",
  approvalWindowNote: "Approve within 10 minutes to finish linking.",
  timeLeft: (label: string) => `${label} left`,
  secondaryNeverConnects: "The secondary wallet never connects to ONE.",
} as const;

/** Copy for viewing and managing an existing V2 identity. No technical terms. */
export const V2_MANAGE_COPY = {
  linkedWallets: "Linked wallets",
  primaryTag: "Primary",
  remove: "Remove",
  removing: "Removing…",
  confirmRemovePrefix: "Remove",
  confirmRemoveSuffix: "from this identity? It stays a normal wallet and can be linked again later.",
  cancel: "Cancel",
  removed: "Wallet removed.",
  removeFailed: "The wallet was not removed. Check the explorer, then try again.",
  primaryCannotBeRemoved: "The primary wallet cannot be removed.",
  active: "Active",
  inactive: "Inactive",
  connectToManage: "Connect the primary wallet to manage linked wallets.",
  onlyPrimaryManages: "Only the primary wallet can add or remove linked wallets.",
} as const;

/** UI states of the per-secondary linking flow. */
export type LinkFlowState =
  | "idle"
  | "creatingChallenge"
  | "awaitingTransfer"
  | "checking"
  | "verified"
  | "approving"
  | "linked"
  | "expired"
  | "approvalExpired"
  | "error";

/** mm:ss for a positive number of seconds (clamped at zero). */
export function formatCountdown(secondsLeft: number): string {
  const s = Math.max(0, Math.floor(secondsLeft));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}
