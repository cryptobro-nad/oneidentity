// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @notice Read surface the ONEIdentity contracts depend on.
/// @dev Kept minimal so identities never learn about mutation entrypoints.
interface IONERegistry {
    /// @return The primary wallet of `one`.
    function primaryOf(address one) external view returns (address);

    /// @return The current, sorted member list of `one`.
    function membersOf(address one) external view returns (address[] memory);

    /// @return Number of current members of `one`.
    function memberCountOf(address one) external view returns (uint256);

    /// @return True while `one` still has at least two members.
    function isActive(address one) external view returns (bool);
}
