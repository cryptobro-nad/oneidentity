// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";

import {ONERegistry} from "../src/ONERegistry.sol";

/// @title VerifyONERegistry
/// @notice Read-only post-deployment checks against an already-deployed Registry.
///
/// @dev Broadcasts nothing and needs no key — run it with a plain `--rpc-url`.
///      Reads `ONE_REGISTRY_ADDRESS` from the environment.
///
///          forge script script/VerifyONERegistry.s.sol \
///            --rpc-url https://rpc.monad.xyz
///
///      Every failure reverts with a named error so a bad deployment cannot be
///      mistaken for a good one.
contract VerifyONERegistry is Script {
    uint256 internal constant EXPECTED_CHAIN_ID = 143;

    error WrongChain(uint256 expected, uint256 actual);
    error MissingRegistryAddress();
    error NoBytecode(address registry);
    error DomainMismatch(string field);
    error DirtyState(string check);

    function run() external view {
        if (block.chainid != EXPECTED_CHAIN_ID) {
            revert WrongChain(EXPECTED_CHAIN_ID, block.chainid);
        }

        address registryAddress = vm.envAddress("ONE_REGISTRY_ADDRESS");
        if (registryAddress == address(0)) revert MissingRegistryAddress();

        ONERegistry registry = ONERegistry(registryAddress);

        console.log("=======================================================");
        console.log("ONE  -  Registry post-deployment verification");
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

        // --- Constants -----------------------------------------------------
        console.log("-------------------------------------------------------");
        console.log("MIN_MEMBERS :", registry.MIN_MEMBERS());
        console.log("MAX_MEMBERS :", registry.MAX_MEMBERS());
        console.log("totalOnes   :", registry.totalOnes());

        // --- Unknown-address reads ------------------------------------------
        // Two independent probes: a deterministic one and a pseudo-random one
        // derived from the current block, so a single unlucky collision cannot
        // make a dirty registry look clean.
        _probe(registry, address(uint160(uint256(keccak256("one.verify.probe.static")))), "static");
        _probe(
            registry,
            address(uint160(uint256(keccak256(abi.encode(block.number, block.timestamp))))),
            "block-derived"
        );

        // --- EIP-712 domain --------------------------------------------------
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

        if (keccak256(bytes(name)) != keccak256(bytes("ONE"))) revert DomainMismatch("name");
        if (keccak256(bytes(version)) != keccak256(bytes("1"))) revert DomainMismatch("version");
        if (chainId != EXPECTED_CHAIN_ID) revert DomainMismatch("chainId");
        if (verifyingContract != registryAddress) revert DomainMismatch("verifyingContract");
        if (salt != bytes32(0)) revert DomainMismatch("salt");

        bytes32 domainSeparator = keccak256(
            abi.encode(
                keccak256(
                    "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
                ),
                keccak256(bytes(name)),
                keccak256(bytes(version)),
                chainId,
                verifyingContract
            )
        );
        console.log("  domainSeparator   :");
        console.logBytes32(domainSeparator);
        console.log("  JOIN_ONE_TYPEHASH :");
        console.logBytes32(registry.JOIN_ONE_TYPEHASH());

        console.log("=======================================================");
        console.log("All read-only checks passed.");
        console.log("=======================================================");
    }

    /// @dev An address that has never touched the registry must be unknown,
    ///      unbound and at nonce zero.
    function _probe(ONERegistry registry, address probe, string memory label) internal view {
        console.log("-------------------------------------------------------");
        console.log("Probe address (%s): %s", label, probe);

        // `exists(x)` is the real API. There is no `isOne(x)` on this contract.
        bool known = registry.exists(probe);
        address boundTo = registry.activeOneOf(probe);
        uint256 nonce = registry.nonces(probe);

        console.log("  exists()      :", known);
        console.log("  activeOneOf() :", boundTo);
        console.log("  nonces()      :", nonce);

        if (known) revert DirtyState("exists(probe) should be false");
        if (boundTo != address(0)) revert DirtyState("activeOneOf(probe) should be address(0)");
        if (nonce != 0) revert DirtyState("nonces(probe) should be 0");

        // `activeOneOf` already covers the primary case: `_record` binds every
        // member including the primary, so a non-zero result here would catch a
        // primary binding too. There is no separate `activeOneOfPrimary` index.
    }
}
