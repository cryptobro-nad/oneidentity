// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {ONERegistry} from "../src/ONERegistry.sol";
import {ONEIdentity} from "../src/ONEIdentity.sol";

/// @dev Shared fixtures and signing helpers for the ONE test suites.
abstract contract ONEBase is Test {
    bytes32 internal constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");

    bytes32 internal constant JOIN_ONE_TYPEHASH = keccak256(
        "JoinOne(address wallet,address primaryWallet,bytes32 membersHash,bytes32 salt,uint256 nonce,uint256 deadline)"
    );

    ONERegistry internal registry;

    uint256[] internal pks;

    function setUp() public virtual {
        registry = new ONERegistry();
        // Six keys so the "six wallets fail" case has one to spare.
        for (uint256 i = 1; i <= 6; ++i) {
            pks.push(uint256(keccak256(abi.encodePacked("one.wallet", i))));
        }
        vm.warp(1_700_000_000);
    }

    // ---------------------------------------------------------------------
    // Signing
    // ---------------------------------------------------------------------

    /// @dev Domain separator built by hand so tests can point at a wrong verifying contract.
    function _domainSeparator(address verifyingContract) internal view returns (bytes32) {
        return keccak256(
            abi.encode(
                DOMAIN_TYPEHASH,
                keccak256(bytes("ONE")),
                keccak256(bytes("1")),
                block.chainid,
                verifyingContract
            )
        );
    }

    function _digest(
        address verifyingContract,
        address wallet,
        address primaryWallet,
        bytes32 membersHash,
        bytes32 salt,
        uint256 nonce,
        uint256 deadline
    ) internal view returns (bytes32) {
        bytes32 structHash = keccak256(
            abi.encode(JOIN_ONE_TYPEHASH, wallet, primaryWallet, membersHash, salt, nonce, deadline)
        );
        return keccak256(abi.encodePacked("\x19\x01", _domainSeparator(verifyingContract), structHash));
    }

    function _sign(uint256 pk, bytes32 digest) internal pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        return abi.encodePacked(r, s, v);
    }

    // ---------------------------------------------------------------------
    // Member list helpers
    // ---------------------------------------------------------------------

    function _addrs(uint256 count) internal view returns (address[] memory out) {
        out = new address[](count);
        for (uint256 i = 0; i < count; ++i) {
            out[i] = vm.addr(pks[i]);
        }
    }

    /// @dev Insertion sort — member lists are at most five entries.
    function _sorted(address[] memory input) internal pure returns (address[] memory out) {
        out = new address[](input.length);
        for (uint256 i = 0; i < input.length; ++i) {
            out[i] = input[i];
        }
        for (uint256 i = 1; i < out.length; ++i) {
            address key = out[i];
            uint256 j = i;
            while (j > 0 && out[j - 1] > key) {
                out[j] = out[j - 1];
                --j;
            }
            out[j] = key;
        }
    }

    function _membersHash(address[] memory members) internal pure returns (bytes32) {
        return keccak256(abi.encode(members));
    }

    /// @dev Private key matching `wallet`, searched over the fixture keys.
    function _pkOf(address wallet) internal view returns (uint256) {
        for (uint256 i = 0; i < pks.length; ++i) {
            if (vm.addr(pks[i]) == wallet) return pks[i];
        }
        revert("unknown wallet");
    }

    // ---------------------------------------------------------------------
    // Creation helpers
    // ---------------------------------------------------------------------

    /// @dev Builds one JoinAuth per secondary, in sorted-member order, all correctly signed.
    function _buildAuths(address[] memory sortedMembers, address primary, bytes32 salt, uint256 deadline)
        internal
        view
        returns (ONERegistry.JoinAuth[] memory auths)
    {
        bytes32 membersHash = _membersHash(sortedMembers);
        auths = new ONERegistry.JoinAuth[](sortedMembers.length - 1);
        uint256 k;
        for (uint256 i = 0; i < sortedMembers.length; ++i) {
            address member = sortedMembers[i];
            if (member == primary) continue;
            bytes32 digest = _digest(
                address(registry), member, primary, membersHash, salt, registry.nonces(member), deadline
            );
            auths[k] = ONERegistry.JoinAuth({deadline: deadline, signature: _sign(_pkOf(member), digest)});
            ++k;
        }
    }

    /// @dev Happy-path creation from the first `count` fixture wallets, primary = wallets[0].
    function _createOne(uint256 count, bytes32 salt)
        internal
        returns (address one, address[] memory sortedMembers, address primary)
    {
        primary = vm.addr(pks[0]);
        sortedMembers = _sorted(_addrs(count));
        ONERegistry.JoinAuth[] memory auths =
            _buildAuths(sortedMembers, primary, salt, block.timestamp + 1 hours);
        vm.prank(primary);
        one = registry.createOne(sortedMembers, salt, auths);
    }
}
