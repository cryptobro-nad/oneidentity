// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IONERegistry} from "./IONERegistry.sol";

/// @title ONEIdentity
/// @notice A ONE's unique public address. Holds no member list of its own — every
///         membership question is answered by the registry that deployed it, so
///         there is exactly one mutable source of truth.
/// @dev Aggregation is bounded by the registry's five-member cap and is gated on the
///      ONE still being active, so an inactive ONE can never be presented as a verified
///      identity. Balance reads copy a bounded 32 bytes of returndata and revert with an
///      explicit error rather than ever returning a partial total that a caller could
///      mistake for authoritative.
contract ONEIdentity {
    /// @dev `balanceOf(address)` selector, held right-aligned for scratch-space encoding.
    uint256 private constant BALANCE_OF_SELECTOR = 0x70a08231;

    /// @notice The registry that deployed this identity and owns its membership.
    IONERegistry public immutable registry;

    /// @notice Raised when an aggregation is attempted on a ONE that is no longer active.
    error InactiveIdentity();

    error NotAContract(address target);
    error ERC20BalanceCallFailed(address token, address account);
    error ERC721BalanceCallFailed(address collection, address account);

    constructor(address registry_) {
        registry = IONERegistry(registry_);
    }

    /// @dev Aggregation is only meaningful for a live verified identity. Once a ONE
    ///      drops to its primary alone it is permanently inactive, and reporting the
    ///      primary's solo holdings under the ONE address would misrepresent it as a
    ///      multi-wallet identity. Metadata reads stay open so the ONE remains
    ///      permanently queryable.
    modifier onlyActive() {
        if (!registry.isActive(address(this))) revert InactiveIdentity();
        _;
    }

    // ---------------------------------------------------------------------
    // Membership metadata — always readable, active or not
    // ---------------------------------------------------------------------

    /// @notice The primary wallet. Readable for the lifetime of the ONE.
    function primaryOwner() external view returns (address) {
        return registry.primaryOf(address(this));
    }

    /// @notice Current members, ascending. Readable for the lifetime of the ONE.
    /// @dev For an inactive ONE this is the primary alone.
    function getMembers() external view returns (address[] memory) {
        return registry.membersOf(address(this));
    }

    /// @notice Current member count. Readable for the lifetime of the ONE.
    function memberCount() external view returns (uint256) {
        return registry.memberCountOf(address(this));
    }

    /// @notice Whether this ONE still has at least two members.
    function isActive() external view returns (bool) {
        return registry.isActive(address(this));
    }

    // ---------------------------------------------------------------------
    // Aggregation — active identities only
    // ---------------------------------------------------------------------

    /// @notice Combined native MON balance across all current members.
    /// @dev Reverts with {InactiveIdentity} once only the primary remains.
    function combinedNativeBalance() external view onlyActive returns (uint256 total) {
        address[] memory members = registry.membersOf(address(this));
        for (uint256 i = 0; i < members.length; ++i) {
            total += members[i].balance;
        }
    }

    /// @notice Combined ERC-20 balance across all current members.
    /// @dev Reverts if the ONE is inactive, `token` is not a contract, or any
    ///      `balanceOf` call fails or returns malformed data.
    function combinedERC20Balance(address token) external view onlyActive returns (uint256 total) {
        if (token.code.length == 0) revert NotAContract(token);
        address[] memory members = registry.membersOf(address(this));
        for (uint256 i = 0; i < members.length; ++i) {
            (bool ok, uint256 balance) = _staticBalanceOf(token, members[i]);
            if (!ok) revert ERC20BalanceCallFailed(token, members[i]);
            total += balance;
        }
    }

    /// @notice Combined ERC-721 balance across all current members.
    /// @dev Reverts if the ONE is inactive, `collection` is not a contract, or any
    ///      `balanceOf` call fails or returns malformed data.
    function combinedERC721Balance(address collection) external view onlyActive returns (uint256) {
        return _combinedERC721Balance(collection);
    }

    /// @notice Whether the combined ERC-721 balance is at least `minimum`.
    /// @dev Propagates the aggregation revert instead of returning a misleading false,
    ///      and reverts with {InactiveIdentity} on an inactive ONE rather than reporting
    ///      a threshold result the ONE is not entitled to.
    function meetsERC721Threshold(address collection, uint256 minimum)
        external
        view
        onlyActive
        returns (bool)
    {
        return _combinedERC721Balance(collection) >= minimum;
    }

    // ---------------------------------------------------------------------
    // Internals
    // ---------------------------------------------------------------------

    /// @dev Shared by {combinedERC721Balance} and {meetsERC721Threshold} so the active
    ///      check runs exactly once per external call.
    function _combinedERC721Balance(address collection) private view returns (uint256 total) {
        if (collection.code.length == 0) revert NotAContract(collection);
        address[] memory members = registry.membersOf(address(this));
        for (uint256 i = 0; i < members.length; ++i) {
            (bool ok, uint256 balance) = _staticBalanceOf(collection, members[i]);
            if (!ok) revert ERC721BalanceCallFailed(collection, members[i]);
            total += balance;
        }
    }

    /// @dev `balanceOf(address)` via a bounded staticcall.
    ///
    ///      The call is issued with a 32-byte return buffer, so the EVM copies at most
    ///      one word into our memory no matter how much the callee returns — a hostile
    ///      token cannot force this contract to allocate megabytes of returndata and
    ///      burn the caller's gas on memory expansion. `returndatasize()` still reports
    ///      the callee's true output length, so an over-long or short reply is detected
    ///      and rejected rather than silently truncated to a plausible balance.
    ///
    ///      Returns ok=false when the call reverts or does not return exactly one word,
    ///      so callers raise a typed error instead of counting the member as zero.
    function _staticBalanceOf(address target, address account)
        private
        view
        returns (bool ok, uint256 amount)
    {
        assembly ("memory-safe") {
            // Encode into the 0x00..0x3f scratch space, which needs no allocation.
            // The selector is stored right-aligned so it lands in 0x1c..0x1f, leaving
            // the argument word at 0x20..0x3f: calldata is the 0x24 bytes from 0x1c.
            mstore(0x00, BALANCE_OF_SELECTOR)
            mstore(0x20, account)

            // staticcall(gas, to, argsOffset, argsSize, retOffset, retSize)
            // retSize is pinned to 0x20, so at most one word is ever copied back.
            let success := staticcall(gas(), target, 0x1c, 0x24, 0x20, 0x20)

            // Accept only a successful call that returned exactly one word.
            if and(success, eq(returndatasize(), 0x20)) {
                ok := 1
                amount := mload(0x20)
            }
        }
    }
}
