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
  transferConfirmed: "Transfer confirmed. Approve the link with your primary wallet.",
  approveWithPrimary: "Approve with primary",
  linked: "Wallet linked.",
  expired: "This attempt expired. Click Link wallet again to get a new amount.",
  secondaryNeverConnects: "The secondary wallet never connects to ONE.",
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
  | "error";
