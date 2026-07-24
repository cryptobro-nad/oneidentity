// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {DeployONERegistryV2} from "../script/DeployONERegistryV2.s.sol";
import {VerifyONERegistryV2} from "../script/VerifyONERegistryV2.s.sol";
import {ONERegistryV2} from "../src/ONERegistryV2.sol";

/// @notice Exercises the staging deploy + verify scripts in-EVM (simulation),
///         proving the env-fed logic, the address(0) guards, and the post-deploy
///         assertions before any real broadcast.
///
/// @dev Calls the parameterised `deploy`/`verify` functions directly. Env vars
///      are process-global and racy under forge's parallel test runner, so the
///      tests never touch them; `run()` is the thin env→params wrapper.
contract DeployONERegistryV2Test is Test {
    address internal constant V1 = address(0xf8E62d8D16acB49eeEeCF13DE48f1f6898c2F915);
    address internal constant VERIFIER = address(0x00000000000000000000000000000000DeaDBeef);
    address internal constant VADMIN = address(0x0000000000000000000000000000000000a11cE5);
    uint256 internal constant DEPLOYER_PK = 0xA11CE;

    DeployONERegistryV2 internal deployer;
    VerifyONERegistryV2 internal verifier;

    function setUp() public {
        vm.chainId(143);
        deployer = new DeployONERegistryV2();
        verifier = new VerifyONERegistryV2();
    }

    function test_DeploySimulationWiresConstructorAndPolicy() public {
        ONERegistryV2 registry = deployer.deploy(DEPLOYER_PK, V1, VERIFIER, VADMIN);

        assertEq(address(registry.v1()), V1, "v1");
        assertEq(registry.verifier(), VERIFIER, "verifier");
        assertEq(registry.verifierAdmin(), VADMIN, "verifierAdmin");
        assertEq(registry.MAX_MEMBERS(), 20, "MAX_MEMBERS");
        assertEq(registry.MIN_MEMBERS(), 2, "MIN_MEMBERS");
        assertEq(uint256(registry.VERSION()), 2, "VERSION");
        assertEq(registry.totalOnes(), 0, "totalOnes");

        (, string memory name, string memory version, uint256 chainId, address vc,,) =
            registry.eip712Domain();
        assertEq(keccak256(bytes(name)), keccak256(bytes("ONE Link")), "domain name");
        assertEq(keccak256(bytes(version)), keccak256(bytes("1")), "domain version");
        assertEq(chainId, 143, "domain chainId");
        assertEq(vc, address(registry), "domain verifyingContract");
    }

    function test_RevertWhen_VerifierIsZero() public {
        vm.expectRevert(abi.encodeWithSelector(DeployONERegistryV2.ZeroConstructorArg.selector, "STAGING_VERIFIER_ADDRESS"));
        deployer.deploy(DEPLOYER_PK, V1, address(0), VADMIN);
    }

    function test_RevertWhen_VerifierAdminIsZero() public {
        vm.expectRevert(abi.encodeWithSelector(DeployONERegistryV2.ZeroConstructorArg.selector, "STAGING_VERIFIER_ADMIN_ADDRESS"));
        deployer.deploy(DEPLOYER_PK, V1, VERIFIER, address(0));
    }

    function test_RevertWhen_V1IsZero() public {
        vm.expectRevert(abi.encodeWithSelector(DeployONERegistryV2.ZeroConstructorArg.selector, "V1_REGISTRY_ADDRESS"));
        deployer.deploy(DEPLOYER_PK, address(0), VERIFIER, VADMIN);
    }

    function test_RevertWhen_WrongChain() public {
        vm.chainId(1);
        vm.expectRevert(abi.encodeWithSelector(DeployONERegistryV2.WrongChain.selector, 143, 1));
        deployer.deploy(DEPLOYER_PK, V1, VERIFIER, VADMIN);
    }

    function test_VerifyScriptPassesAgainstAGoodDeployment() public {
        ONERegistryV2 registry = new ONERegistryV2(V1, VERIFIER, VADMIN);
        // Cross-checks supplied → all must match the on-chain values.
        verifier.verify(address(registry), V1, VERIFIER, VADMIN);
    }

    function test_VerifyScriptPassesWithoutOptionalCrossChecks() public {
        ONERegistryV2 registry = new ONERegistryV2(V1, VERIFIER, VADMIN);
        verifier.verify(address(registry), address(0), address(0), address(0));
    }

    function test_VerifyScriptRevertsOnExpectedMismatch() public {
        ONERegistryV2 registry = new ONERegistryV2(V1, VERIFIER, VADMIN);
        vm.expectRevert(abi.encodeWithSelector(VerifyONERegistryV2.ExpectedMismatch.selector, "STAGING_VERIFIER_ADDRESS"));
        verifier.verify(address(registry), V1, address(0x1234), VADMIN);
    }

    function test_VerifyScriptRevertsWhenRegistryAddressMissing() public {
        vm.expectRevert(VerifyONERegistryV2.MissingRegistryAddress.selector);
        verifier.verify(address(0), address(0), address(0), address(0));
    }
}
