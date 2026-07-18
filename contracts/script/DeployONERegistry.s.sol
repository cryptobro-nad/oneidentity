// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";

import {ONERegistry} from "../src/ONERegistry.sol";
import {ONEIdentity} from "../src/ONEIdentity.sol";

/// @title DeployONERegistry
/// @notice Deploys the single `ONERegistry` instance for Monad Mainnet.
///
/// @dev Scope is deliberately one contract. `ONEIdentity` instances are created
///      only by `ONERegistry.createOne()` via CREATE2 — this script never
///      deploys an identity and never creates a ONE. A ONE created here would
///      permanently bind real wallets to a registry that has not yet been
///      reviewed in production.
///
///      Run in simulation first (no `--broadcast`). See docs/MAINNET_DEPLOYMENT.md.
contract DeployONERegistry is Script {
    /// @dev Monad Mainnet. The deployment aborts anywhere else.
    uint256 internal constant EXPECTED_CHAIN_ID = 143;

    error WrongChain(uint256 expected, uint256 actual);
    error NoBytecodeAtRegistry(address registry);
    error DomainMismatch(string field);
    error UnexpectedInitialState(string check);

    function run() external returns (ONERegistry registry) {
        // ------------------------------------------------------------------
        // 1. Chain guard — before anything is broadcast.
        // ------------------------------------------------------------------
        if (block.chainid != EXPECTED_CHAIN_ID) {
            revert WrongChain(EXPECTED_CHAIN_ID, block.chainid);
        }

        // The sender is whatever --account / --sender resolves to. No private
        // key is ever read by this script.
        address deployer = msg.sender;

        console.log("=======================================================");
        console.log("ONE  -  Monad Mainnet Registry deployment");
        console.log("=======================================================");
        console.log("Chain ID          :", block.chainid);
        console.log("Deployer          :", deployer);
        console.log("Deployer balance  :", deployer.balance, "wei");
        console.log("Deployer nonce    :", vm.getNonce(deployer));
        console.log("Block number      :", block.number);
        console.log("Base fee (wei)    :", block.basefee);

        // Creation-code hash of the artifact about to be deployed. Recording
        // this makes the deployed contract auditable against this exact build.
        bytes32 registryInitCodeHash = keccak256(type(ONERegistry).creationCode);
        bytes32 identityInitCodeHash =
            keccak256(abi.encodePacked(type(ONEIdentity).creationCode, abi.encode(address(0))));
        console.log("Registry initcode size :", type(ONERegistry).creationCode.length);
        console.log("Registry initcode hash :");
        console.logBytes32(registryInitCodeHash);

        // ------------------------------------------------------------------
        // 2. Deploy.
        // ------------------------------------------------------------------
        uint256 gasBefore = gasleft();
        vm.startBroadcast();
        registry = new ONERegistry();
        vm.stopBroadcast();
        uint256 gasUsed = gasBefore - gasleft();

        console.log("-------------------------------------------------------");
        console.log("Registry deployed :", address(registry));
        console.log("Gas used (approx) :", gasUsed);

        // ------------------------------------------------------------------
        // 3. Post-deployment assertions. A failure here reverts the whole
        //    script, so a broadcast run cannot silently produce a bad deploy.
        // ------------------------------------------------------------------
        _assertBytecode(address(registry));
        _assertDomain(registry);
        _assertCleanInitialState(registry);

        console.log("-------------------------------------------------------");
        console.log("All post-deployment checks passed.");
        console.log("No ONE identity was created. Registry totalOnes:", registry.totalOnes());
        console.log("=======================================================");
        console.log("Record ONE_REGISTRY_ADDRESS =", address(registry));
        console.log("Identity initcode hash (salt-independent):");
        console.logBytes32(identityInitCodeHash);
        console.log("=======================================================");

        return registry;
    }

    // ----------------------------------------------------------------------
    // Checks
    // ----------------------------------------------------------------------

    function _assertBytecode(address registry) internal view {
        uint256 size;
        assembly {
            size := extcodesize(registry)
        }
        if (size == 0) revert NoBytecodeAtRegistry(registry);

        console.log("Runtime bytecode size :", size, "bytes");
        console.log("Runtime bytecode hash :");
        console.logBytes32(keccak256(registry.code));
    }

    /// @dev Reads the live EIP-712 domain through ERC-5267 and checks every
    ///      field the JoinOne signatures depend on. A wrong domain would make
    ///      every signature produced by the frontend unverifiable.
    function _assertDomain(ONERegistry registry) internal view {
        (
            bytes1 fields,
            string memory name,
            string memory version,
            uint256 chainId,
            address verifyingContract,
            bytes32 salt,
            uint256[] memory extensions
        ) = registry.eip712Domain();

        console.log("-------------------------------------------------------");
        console.log("EIP-712 domain");
        console.log("  name              :", name);
        console.log("  version           :", version);
        console.log("  chainId           :", chainId);
        console.log("  verifyingContract :", verifyingContract);
        console.log("  fields            :", uint8(fields));
        console.log("  extensions        :", extensions.length);

        if (keccak256(bytes(name)) != keccak256(bytes("ONE"))) revert DomainMismatch("name");
        if (keccak256(bytes(version)) != keccak256(bytes("1"))) revert DomainMismatch("version");
        if (chainId != EXPECTED_CHAIN_ID) revert DomainMismatch("chainId");
        if (verifyingContract != address(registry)) revert DomainMismatch("verifyingContract");
        if (salt != bytes32(0)) revert DomainMismatch("salt");

        // Derived separator, printed so the frontend can pin the exact value.
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
    }

    /// @dev A freshly deployed registry must know about nothing at all.
    function _assertCleanInitialState(ONERegistry registry) internal view {
        if (registry.totalOnes() != 0) revert UnexpectedInitialState("totalOnes");
        if (registry.MIN_MEMBERS() != 2) revert UnexpectedInitialState("MIN_MEMBERS");
        if (registry.MAX_MEMBERS() != 5) revert UnexpectedInitialState("MAX_MEMBERS");

        // Probe an arbitrary address: it must be unknown and unbound.
        address probe = address(uint160(uint256(keccak256("one.deploy.probe"))));
        if (registry.exists(probe)) revert UnexpectedInitialState("exists(probe)");
        if (registry.activeOneOf(probe) != address(0)) revert UnexpectedInitialState("activeOneOf");
        if (registry.nonces(probe) != 0) revert UnexpectedInitialState("nonces");

        console.log("-------------------------------------------------------");
        console.log("Initial state clean (totalOnes=0, probe address unbound).");
    }
}
