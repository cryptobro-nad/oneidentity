// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IONERegistryV2} from "./IONERegistryV2.sol";

/// @title ONEIdentityV2
/// @notice A Verified ONE V2's unique public address. Holds no member list of its
///         own — every membership question is answered by the registry that
///         deployed it, so there is exactly one mutable source of truth.
/// @dev Intentionally minimal and stable. Unlike V1's identity it embeds NO asset
///      aggregation: portfolio balances are fetched live off-chain from the member
///      wallets, and are exactly the logic most likely to evolve, so keeping it out
///      of the identity means this contract never needs to change. The stable read
///      surface below is what future utilities (e.g. Swap Rank) build on.
contract ONEIdentityV2 {
    /// @notice The registry that deployed this identity and owns its membership.
    IONERegistryV2 public immutable registry;

    constructor(address registry_) {
        registry = IONERegistryV2(registry_);
    }

    /// @notice The primary wallet. Readable for the lifetime of the ONE.
    function primaryOwner() external view returns (address) {
        return registry.primaryOf(address(this));
    }

    /// @notice Current members. Readable for the lifetime of the ONE.
    function getMembers() external view returns (address[] memory) {
        return registry.membersOf(address(this));
    }

    /// @notice Current member count (includes the primary).
    function memberCount() external view returns (uint256) {
        return registry.memberCountOf(address(this));
    }

    /// @notice Whether `wallet` is a current member of this ONE.
    function isMember(address wallet) external view returns (bool) {
        return registry.isMemberOf(address(this), wallet);
    }

    /// @notice Whether this ONE still has at least two members.
    function isActive() external view returns (bool) {
        return registry.isActive(address(this));
    }

    /// @notice Identity model version. Always 2 for this contract.
    function version() external pure returns (uint16) {
        return 2;
    }
}
