// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @notice Read surface the ONEIdentityV2 contracts depend on.
/// @dev Kept minimal so identities never learn about mutation entrypoints. Mirrors
///      V1's IONERegistry plus {isMemberOf}, which V2 identities expose as isMember.
interface IONERegistryV2 {
    function primaryOf(address one) external view returns (address);
    function membersOf(address one) external view returns (address[] memory);
    function memberCountOf(address one) external view returns (uint256);
    function isActive(address one) external view returns (bool);
    function isMemberOf(address one, address wallet) external view returns (bool);
}
