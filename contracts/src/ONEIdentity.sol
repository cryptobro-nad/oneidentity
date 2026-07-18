// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IONERegistry} from "./IONERegistry.sol";

/// @title ONEIdentity
/// @notice A ONE's unique public address. Holds no member list of its own — every
///         membership question is answered by the registry that deployed it, so
///         there is exactly one mutable source of truth.
/// @dev Aggregation is bounded by the registry's five-member cap. Balance reads use
///      raw staticcalls and revert with an explicit error rather than ever returning
///      a partial total that a caller could mistake for authoritative.
contract ONEIdentity {
    /// @notice The registry that deployed this identity and owns its membership.
    IONERegistry public immutable registry;

    error NotAContract(address target);
    error ERC20BalanceCallFailed(address token, address account);
    error ERC721BalanceCallFailed(address collection, address account);

    constructor(address registry_) {
        registry = IONERegistry(registry_);
    }

    // ---------------------------------------------------------------------
    // Membership (delegated to the registry)
    // ---------------------------------------------------------------------

    function primaryOwner() external view returns (address) {
        return registry.primaryOf(address(this));
    }

    function getMembers() external view returns (address[] memory) {
        return registry.membersOf(address(this));
    }

    function memberCount() external view returns (uint256) {
        return registry.memberCountOf(address(this));
    }

    function isActive() external view returns (bool) {
        return registry.isActive(address(this));
    }

    // ---------------------------------------------------------------------
    // Aggregation
    // ---------------------------------------------------------------------

    /// @notice Combined native MON balance across all current members.
    function combinedNativeBalance() external view returns (uint256 total) {
        address[] memory members = registry.membersOf(address(this));
        for (uint256 i = 0; i < members.length; ++i) {
            total += members[i].balance;
        }
    }

    /// @notice Combined ERC-20 balance across all current members.
    /// @dev Reverts if `token` is not a contract or any `balanceOf` call fails.
    function combinedERC20Balance(address token) external view returns (uint256 total) {
        if (token.code.length == 0) revert NotAContract(token);
        address[] memory members = registry.membersOf(address(this));
        for (uint256 i = 0; i < members.length; ++i) {
            (bool ok, uint256 balance) = _staticBalanceOf(token, members[i]);
            if (!ok) revert ERC20BalanceCallFailed(token, members[i]);
            total += balance;
        }
    }

    /// @notice Combined ERC-721 balance across all current members.
    /// @dev Reverts if `collection` is not a contract or any `balanceOf` call fails.
    function combinedERC721Balance(address collection) public view returns (uint256 total) {
        if (collection.code.length == 0) revert NotAContract(collection);
        address[] memory members = registry.membersOf(address(this));
        for (uint256 i = 0; i < members.length; ++i) {
            (bool ok, uint256 balance) = _staticBalanceOf(collection, members[i]);
            if (!ok) revert ERC721BalanceCallFailed(collection, members[i]);
            total += balance;
        }
    }

    /// @notice Whether the combined ERC-721 balance is at least `minimum`.
    /// @dev Propagates the aggregation revert instead of returning a misleading false.
    function meetsERC721Threshold(address collection, uint256 minimum) external view returns (bool) {
        return combinedERC721Balance(collection) >= minimum;
    }

    // ---------------------------------------------------------------------
    // Internals
    // ---------------------------------------------------------------------

    /// @dev `balanceOf(address)` via staticcall. Returns ok=false when the call reverts
    ///      or returns something that is not a single word, so callers can raise a
    ///      typed error rather than silently counting the member as zero.
    function _staticBalanceOf(address target, address account) private view returns (bool, uint256) {
        (bool success, bytes memory data) =
            target.staticcall(abi.encodeWithSignature("balanceOf(address)", account));
        if (!success || data.length != 32) return (false, 0);
        return (true, abi.decode(data, (uint256)));
    }
}
