// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";

import {ONERegistryV2} from "../src/ONERegistryV2.sol";

/// @title VerifyONERegistryV2
/// @notice Read-only post-deployment checks against a deployed `ONERegistryV2`.
///
/// @dev Broadcasts nothing and needs no key — run with a plain `--rpc-url`.
///      Reads NEXT_PUBLIC_ONE_REGISTRY_V2_ADDRESS (the deployed registry).
///      If the following are ALSO set, each is asserted equal to the on-chain
///      value (recommended, so a wrong deploy cannot look correct):
///        V1_REGISTRY_ADDRESS, STAGING_VERIFIER_ADDRESS, STAGING_VERIFIER_ADMIN_ADDRESS
///
///          forge script script/VerifyONERegistryV2.s.sol --rpc-url $MONAD_MAINNET_RPC_URL
///
///      Every failure reverts with a named error.
contract VerifyONERegistryV2 is Script {
    uint256 internal constant EXPECTED_CHAIN_ID = 143;
    uint256 internal constant EXPECTED_MAX_MEMBERS = 20;
    uint256 internal constant EXPECTED_MIN_MEMBERS = 2;
    uint16 internal constant EXPECTED_VERSION = 2;

    error WrongChain(uint256 expected, uint256 actual);
    error MissingRegistryAddress();
    error NoBytecode(address registry);
    error PolicyMismatch(string field);
    error DomainMismatch(string field);
    error ExpectedMismatch(string field);
    error DirtyState(string check);

    /// @dev Env wrapper: reads the registry address plus the optional expected
    ///      values, then delegates to `verify`.
    function run() external view {
        verify(
            vm.envAddress("NEXT_PUBLIC_ONE_REGISTRY_V2_ADDRESS"),
            vm.envOr("V1_REGISTRY_ADDRESS", address(0)),
            vm.envOr("STAGING_VERIFIER_ADDRESS", address(0)),
            vm.envOr("STAGING_VERIFIER_ADMIN_ADDRESS", address(0))
        );
    }

    /// @dev All checks, parameterised so they are testable without process-global
    ///      env vars. An expected address of 0 means "skip that cross-check".
    function verify(
        address registryAddress,
        address expectV1,
        address expectVerifier,
        address expectAdmin
    ) public view {
        if (block.chainid != EXPECTED_CHAIN_ID) {
            revert WrongChain(EXPECTED_CHAIN_ID, block.chainid);
        }

        if (registryAddress == address(0)) revert MissingRegistryAddress();
        ONERegistryV2 registry = ONERegistryV2(registryAddress);

        console.log("=======================================================");
        console.log("ONE V2  -  Registry post-deployment verification");
        console.log("=======================================================");
        console.log("Chain ID :", block.chainid);
        console.log("Registry :", registryAddress);
        console.log("Block    :", block.number);

        // --- eth_getCode ---------------------------------------------------
        uint256 size;
        assembly {
            size := extcodesize(registryAddress)
        }
        if (size == 0) revert NoBytecode(registryAddress);
        console.log("-------------------------------------------------------");
        console.log("Runtime bytecode size :", size, "bytes");
        console.log("Runtime bytecode hash :");
        console.logBytes32(keccak256(registryAddress.code));

        // --- Wiring --------------------------------------------------------
        address v1 = address(registry.v1());
        address verifier = registry.verifier();
        address verifierAdmin = registry.verifierAdmin();
        console.log("-------------------------------------------------------");
        console.log("v1()          :", v1);
        console.log("verifier()    :", verifier);
        console.log("verifierAdmin :", verifierAdmin);

        // --- Optional cross-check against the intended values --------------
        if (expectV1 != address(0) && expectV1 != v1) revert ExpectedMismatch("V1_REGISTRY_ADDRESS");
        if (expectVerifier != address(0) && expectVerifier != verifier) revert ExpectedMismatch("STAGING_VERIFIER_ADDRESS");
        if (expectAdmin != address(0) && expectAdmin != verifierAdmin) revert ExpectedMismatch("STAGING_VERIFIER_ADMIN_ADDRESS");

        // --- Immutable policy ----------------------------------------------
        console.log("-------------------------------------------------------");
        console.log("MAX_MEMBERS :", registry.MAX_MEMBERS());
        console.log("MIN_MEMBERS :", registry.MIN_MEMBERS());
        console.log("VERSION     :", registry.VERSION());
        if (registry.MAX_MEMBERS() != EXPECTED_MAX_MEMBERS) revert PolicyMismatch("MAX_MEMBERS");
        if (registry.MIN_MEMBERS() != EXPECTED_MIN_MEMBERS) revert PolicyMismatch("MIN_MEMBERS");
        if (registry.VERSION() != EXPECTED_VERSION) revert PolicyMismatch("VERSION");

        // --- Clean initial state -------------------------------------------
        console.log("totalOnes   :", registry.totalOnes());
        if (registry.totalOnes() != 0) revert DirtyState("totalOnes should be 0");
        address probe = address(uint160(uint256(keccak256("one.v2.verify.probe"))));
        if (registry.exists(probe)) revert DirtyState("exists(probe) should be false");
        if (registry.activeOneOf(probe) != address(0)) revert DirtyState("activeOneOf(probe) != 0");

        // --- EIP-712 domain -------------------------------------------------
        (
            ,
            string memory name,
            string memory version,
            uint256 chainId,
            address verifyingContract,
            bytes32 salt,
        ) = registry.eip712Domain();

        console.log("-------------------------------------------------------");
        console.log("EIP-712 domain");
        console.log("  name              :", name);
        console.log("  version           :", version);
        console.log("  chainId           :", chainId);
        console.log("  verifyingContract :", verifyingContract);
        if (keccak256(bytes(name)) != keccak256(bytes("ONE Link"))) revert DomainMismatch("name");
        if (keccak256(bytes(version)) != keccak256(bytes("1"))) revert DomainMismatch("version");
        if (chainId != EXPECTED_CHAIN_ID) revert DomainMismatch("chainId");
        if (verifyingContract != registryAddress) revert DomainMismatch("verifyingContract");
        if (salt != bytes32(0)) revert DomainMismatch("salt");
        console.log("  LINK_ATTESTATION_TYPEHASH:");
        console.logBytes32(registry.LINK_ATTESTATION_TYPEHASH());

        console.log("=======================================================");
        console.log("All read-only checks passed.");
        console.log("=======================================================");
    }
}
