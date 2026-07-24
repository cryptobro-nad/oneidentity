// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";

import {ONERegistryV2} from "../src/ONERegistryV2.sol";

/// @title DeployONERegistryV2
/// @notice Deploys the single immutable `ONERegistryV2` for Verified ONE V2.
///
/// @dev STAGING deployment helper. Scope is one contract: `ONEIdentityV2`
///      instances are created only by `approveLink` via CREATE2 — this script
///      never creates a ONE and never touches V1.
///
///      Reads everything from the environment; NO value is hardcoded and the
///      deployer private key is NEVER printed:
///        DEPLOYER_PRIVATE_KEY          (used to sign; only its public addr logged)
///        V1_REGISTRY_ADDRESS           (immutable V1 registry on this chain)
///        STAGING_VERIFIER_ADDRESS      (constructor verifier_)
///        STAGING_VERIFIER_ADMIN_ADDRESS(constructor verifierAdmin_)
///
///      Every constructor address is validated non-zero BEFORE any broadcast,
///      and post-deploy assertions revert the whole run on any mismatch, so a
///      broadcast cannot silently produce a bad deployment.
///
///      Dry-run (simulation, sends nothing):
///        forge script script/DeployONERegistryV2.s.sol --rpc-url $MONAD_MAINNET_RPC_URL
///      Broadcast (real deployment):
///        forge script script/DeployONERegistryV2.s.sol --rpc-url $MONAD_MAINNET_RPC_URL --broadcast
contract DeployONERegistryV2 is Script {
    /// @dev Monad Mainnet. The deployment aborts anywhere else.
    uint256 internal constant EXPECTED_CHAIN_ID = 143;
    uint256 internal constant EXPECTED_MAX_MEMBERS = 20;
    uint256 internal constant EXPECTED_MIN_MEMBERS = 2;
    uint16 internal constant EXPECTED_VERSION = 2;

    error WrongChain(uint256 expected, uint256 actual);
    error ZeroConstructorArg(string which);
    error NoBytecodeAtRegistry(address registry);
    error ConstructorMismatch(string field);
    error PolicyMismatch(string field);
    error DomainMismatch(string field);

    /// @dev Env wrapper: reads all inputs then delegates to `deploy`. The
    ///      deployer key is read here and passed on; it is never printed.
    function run() external returns (ONERegistryV2 registry) {
        return deploy(
            vm.envUint("DEPLOYER_PRIVATE_KEY"),
            vm.envAddress("V1_REGISTRY_ADDRESS"),
            vm.envAddress("STAGING_VERIFIER_ADDRESS"),
            vm.envAddress("STAGING_VERIFIER_ADMIN_ADDRESS")
        );
    }

    /// @dev All deployment logic, parameterised so it is testable without env
    ///      vars (which are process-global and racy under parallel test runs).
    function deploy(
        uint256 deployerPk,
        address v1Registry,
        address verifier,
        address verifierAdmin
    ) public returns (ONERegistryV2 registry) {
        // ------------------------------------------------------------------
        // 1. Chain guard — before anything is broadcast.
        // ------------------------------------------------------------------
        if (block.chainid != EXPECTED_CHAIN_ID) {
            revert WrongChain(EXPECTED_CHAIN_ID, block.chainid);
        }

        // ------------------------------------------------------------------
        // 2. Validate constructor inputs. address(0) is rejected for every one
        //    BEFORE broadcasting.
        // ------------------------------------------------------------------
        if (v1Registry == address(0)) revert ZeroConstructorArg("V1_REGISTRY_ADDRESS");
        if (verifier == address(0)) revert ZeroConstructorArg("STAGING_VERIFIER_ADDRESS");
        if (verifierAdmin == address(0)) revert ZeroConstructorArg("STAGING_VERIFIER_ADMIN_ADDRESS");

        // Deployer address is derived from the key; the key itself is NEVER
        // printed. `vm.addr` does not expose it.
        address deployer = vm.addr(deployerPk);

        bytes32 registryInitCodeHash = keccak256(
            abi.encodePacked(
                type(ONERegistryV2).creationCode,
                abi.encode(v1Registry, verifier, verifierAdmin)
            )
        );

        console.log("=======================================================");
        console.log("ONE V2  -  Monad Mainnet Registry deployment (STAGING)");
        console.log("=======================================================");
        console.log("Chain ID              :", block.chainid);
        console.log("Deployer (public)     :", deployer);
        console.log("Deployer balance (wei):", deployer.balance);
        console.log("Deployer nonce        :", vm.getNonce(deployer));
        console.log("Block number          :", block.number);
        console.log("Constructor v1Registry:", v1Registry);
        console.log("Constructor verifier  :", verifier);
        console.log("Constructor vAdmin    :", verifierAdmin);
        console.log("Registry initcode size:", type(ONERegistryV2).creationCode.length);
        console.log("Registry initcode hash:");
        console.logBytes32(registryInitCodeHash);

        // ------------------------------------------------------------------
        // 3. Deploy.
        // ------------------------------------------------------------------
        uint256 gasBefore = gasleft();
        vm.startBroadcast(deployerPk);
        registry = new ONERegistryV2(v1Registry, verifier, verifierAdmin);
        vm.stopBroadcast();
        uint256 gasUsed = gasBefore - gasleft();

        console.log("-------------------------------------------------------");
        console.log("Registry deployed     :", address(registry));
        console.log("Gas used (approx)     :", gasUsed);

        // ------------------------------------------------------------------
        // 4. Post-deployment assertions. Any failure reverts the whole script.
        // ------------------------------------------------------------------
        _assertBytecode(address(registry));
        _assertConstructor(registry, v1Registry, verifier, verifierAdmin);
        _assertPolicy(registry);
        _assertDomain(registry);

        console.log("-------------------------------------------------------");
        console.log("All post-deployment checks passed. No ONE was created.");
        console.log("=======================================================");
        console.log("Record NEXT_PUBLIC_ONE_REGISTRY_V2_ADDRESS =", address(registry));
        console.log("Deployer public address                    =", deployer);
        console.log("verifier()                                 =", registry.verifier());
        console.log("verifierAdmin()                            =", registry.verifierAdmin());
        console.log("v1()                                       =", address(registry.v1()));
        console.log("chainId                                    =", block.chainid);
        console.log("Tx hash: see broadcast/DeployONERegistryV2.s.sol/143/run-latest.json");
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

    /// @dev The deployed contract must carry exactly the addresses we passed.
    function _assertConstructor(
        ONERegistryV2 registry,
        address v1Registry,
        address verifier,
        address verifierAdmin
    ) internal view {
        if (address(registry.v1()) != v1Registry) revert ConstructorMismatch("v1");
        if (registry.verifier() != verifier) revert ConstructorMismatch("verifier");
        if (registry.verifierAdmin() != verifierAdmin) revert ConstructorMismatch("verifierAdmin");
    }

    /// @dev Immutable policy: fixed cap, min members, version.
    function _assertPolicy(ONERegistryV2 registry) internal view {
        if (registry.MAX_MEMBERS() != EXPECTED_MAX_MEMBERS) revert PolicyMismatch("MAX_MEMBERS");
        if (registry.MIN_MEMBERS() != EXPECTED_MIN_MEMBERS) revert PolicyMismatch("MIN_MEMBERS");
        if (registry.VERSION() != EXPECTED_VERSION) revert PolicyMismatch("VERSION");
        console.log("-------------------------------------------------------");
        console.log("Policy: MAX_MEMBERS=20, MIN_MEMBERS=2, VERSION=2 (immutable).");
    }

    /// @dev The EIP-712 domain every LinkAttestation binds to. A wrong domain
    ///      would make every verifier signature unverifiable on-chain.
    function _assertDomain(ONERegistryV2 registry) internal view {
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
        if (verifyingContract != address(registry)) revert DomainMismatch("verifyingContract");
        if (salt != bytes32(0)) revert DomainMismatch("salt");

        console.log("  LINK_ATTESTATION_TYPEHASH:");
        console.logBytes32(registry.LINK_ATTESTATION_TYPEHASH());
    }
}
