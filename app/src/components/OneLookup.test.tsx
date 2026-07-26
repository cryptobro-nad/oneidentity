// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const resolveOneLookupAction = vi.fn();
vi.mock("@/app/verified/actions", () => ({
  resolveOneLookupAction: (...args: unknown[]) => resolveOneLookupAction(...args),
}));

const loadV2ProfileAction = vi.fn();
vi.mock("@/app/verified/v2actions", () => ({
  loadV2ProfileAction: (...args: unknown[]) => loadV2ProfileAction(...args),
}));

import { OneLookup } from "./OneLookup";

const ONE_ADDR = "0x1139dec3A681C96807D8C277601655A707494AaA";
const V2_ONE = "0x2df1b222d48859c3E3CD217B78Ac29966901485E";
const WALLET = "0x017F9358AFcC7018dd683001FD33fD7D68230D8B";

beforeEach(() => {
  // Default: no V2 identity, so V1 lookups behave exactly as before.
  loadV2ProfileAction.mockResolvedValue({ ok: false, reason: "not-a-one", message: "no" });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const input = () => screen.getByLabelText(/ONE identity or wallet address/i);
const submitButton = () => screen.getByRole("button", { name: /view identity|looking up/i });

describe("OneLookup — successful resolution", () => {
  it("navigates to the profile when an identity resolves", async () => {
    resolveOneLookupAction.mockResolvedValue({
      ok: true,
      oneAddress: ONE_ADDR,
      resolvedFrom: "identity",
    });
    const user = userEvent.setup();
    render(<OneLookup />);

    await user.type(input(), ONE_ADDR);
    await user.click(submitButton());

    await waitFor(() => expect(push).toHaveBeenCalledWith(`/one/${ONE_ADDR}`));
  });

  it("falls through to the V2 profile when V1 has no match", async () => {
    resolveOneLookupAction.mockResolvedValue({ ok: false, code: "NOT_FOUND", message: "not found" });
    loadV2ProfileAction.mockResolvedValue({ ok: true, profile: { address: V2_ONE } });
    const user = userEvent.setup();
    render(<OneLookup />);

    await user.type(input(), V2_ONE);
    await user.click(submitButton());

    await waitFor(() => expect(push).toHaveBeenCalledWith(`/one-v2/${V2_ONE}`));
  });

  it("navigates when a linked WALLET resolves to its ONE", async () => {
    resolveOneLookupAction.mockResolvedValue({
      ok: true,
      oneAddress: ONE_ADDR,
      resolvedFrom: "wallet",
    });
    const user = userEvent.setup();
    render(<OneLookup />);

    await user.type(input(), WALLET);
    await user.click(submitButton());

    await waitFor(() => expect(push).toHaveBeenCalledWith(`/one/${ONE_ADDR}`));
  });

  it("submits when Enter is pressed in the input", async () => {
    resolveOneLookupAction.mockResolvedValue({
      ok: true,
      oneAddress: ONE_ADDR,
      resolvedFrom: "identity",
    });
    const user = userEvent.setup();
    render(<OneLookup />);

    await user.type(input(), `${ONE_ADDR}{Enter}`);

    await waitFor(() => expect(resolveOneLookupAction).toHaveBeenCalledWith(ONE_ADDR));
    await waitFor(() => expect(push).toHaveBeenCalled());
  });

  it("accepts a lowercase address", async () => {
    resolveOneLookupAction.mockResolvedValue({
      ok: true,
      oneAddress: ONE_ADDR,
      resolvedFrom: "identity",
    });
    const user = userEvent.setup();
    render(<OneLookup />);

    await user.type(input(), ONE_ADDR.toLowerCase());
    await user.click(submitButton());

    await waitFor(() =>
      expect(resolveOneLookupAction).toHaveBeenCalledWith(ONE_ADDR.toLowerCase()),
    );
  });

  it("accepts a mixed-case checksummed address", async () => {
    resolveOneLookupAction.mockResolvedValue({
      ok: true,
      oneAddress: ONE_ADDR,
      resolvedFrom: "identity",
    });
    const user = userEvent.setup();
    render(<OneLookup />);

    await user.type(input(), ONE_ADDR);
    await user.click(submitButton());

    await waitFor(() => expect(resolveOneLookupAction).toHaveBeenCalledWith(ONE_ADDR));
  });
});

describe("OneLookup — loading state", () => {
  it("disables the submit button while looking up", async () => {
    let release!: (v: unknown) => void;
    resolveOneLookupAction.mockReturnValue(new Promise((r) => (release = r)));
    const user = userEvent.setup();
    render(<OneLookup />);

    await user.type(input(), ONE_ADDR);
    await user.click(submitButton());

    await waitFor(() =>
      expect((submitButton() as HTMLButtonElement).disabled).toBe(true),
    );
    expect(submitButton().textContent).toMatch(/looking up/i);

    release({
      ok: false,
      code: "NOT_FOUND",
      message: "No Verified ONE was found for this address.",
    });
    await waitFor(() =>
      expect((submitButton() as HTMLButtonElement).disabled).toBe(false),
    );
  });
});

describe("OneLookup — failures keep the user on the page", () => {
  it("shows a not-found message and does not navigate", async () => {
    resolveOneLookupAction.mockResolvedValue({
      ok: false,
      code: "NOT_FOUND",
      message: "No Verified ONE was found for this address.",
    });
    const user = userEvent.setup();
    render(<OneLookup />);

    await user.type(input(), WALLET);
    await user.click(submitButton());

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/no verified one was found/i);
    expect(push).not.toHaveBeenCalled();
  });

  it("shows an invalid-address message", async () => {
    resolveOneLookupAction.mockResolvedValue({
      ok: false,
      code: "INVALID_ADDRESS",
      message: "That is not a valid address.",
    });
    const user = userEvent.setup();
    render(<OneLookup />);

    await user.type(input(), "nonsense");
    await user.click(submitButton());

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/not a valid address/i);
  });

  it("shows an RPC error distinctly from not-found", async () => {
    resolveOneLookupAction.mockResolvedValue({
      ok: false,
      code: "RPC_ERROR",
      message: "Monad could not be reached just now.",
    });
    const user = userEvent.setup();
    render(<OneLookup />);

    await user.type(input(), ONE_ADDR);
    await user.click(submitButton());

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/could not be reached/i);
    expect(alert.textContent).not.toMatch(/no verified one was found/i);
    expect(push).not.toHaveBeenCalled();
  });

  it("clears the error when the user edits the input again", async () => {
    resolveOneLookupAction.mockResolvedValue({
      ok: false,
      code: "NOT_FOUND",
      message: "No Verified ONE was found for this address.",
    });
    const user = userEvent.setup();
    render(<OneLookup />);

    await user.type(input(), WALLET);
    await user.click(submitButton());
    expect(await screen.findByRole("alert")).toBeTruthy();

    await user.type(input(), "0");
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });
});

describe("OneLookup — no wallet involvement", () => {
  it("never requests a wallet connection", async () => {
    const request = vi.fn();
    vi.stubGlobal("ethereum", { request });
    resolveOneLookupAction.mockResolvedValue({
      ok: true,
      oneAddress: ONE_ADDR,
      resolvedFrom: "identity",
    });

    const user = userEvent.setup();
    render(<OneLookup />);
    await user.type(input(), ONE_ADDR);
    await user.click(submitButton());

    await waitFor(() => expect(push).toHaveBeenCalled());
    // Public lookup must work for someone with no wallet at all.
    expect(request).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("renders a visible label and the no-signature reassurance", () => {
    render(<OneLookup />);
    expect(input()).toBeTruthy();
    expect(screen.getByText(/no connection or signature required/i)).toBeTruthy();
  });

  it("explains the wallet-vs-identity lookup asymmetry in full mode", () => {
    render(<OneLookup />);
    // Detail lives in the collapsed "How lookup works" note (still in the DOM).
    expect(screen.getByText(/how lookup works/i)).toBeTruthy();
    expect(screen.getByText(/past links cannot be looked up from a wallet address/i)).toBeTruthy();
  });

  it("omits the long explanation in compact mode", () => {
    render(<OneLookup compact />);
    expect(screen.queryByText(/past links cannot be looked up/i)).toBeNull();
    expect(screen.getByRole("heading", { name: /look up another one/i })).toBeTruthy();
  });
});
