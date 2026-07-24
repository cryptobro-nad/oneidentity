// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {IERC1271} from "@openzeppelin/contracts/interfaces/IERC1271.sol";

import {ONERegistry} from "../src/ONERegistry.sol";
import {ONERegistryV2} from "../src/ONERegistryV2.sol";
import {ONEIdentityV2} from "../src/ONEIdentityV2.sol";

/// @dev A minimal ERC-1271 smart-contract wallet: valid iff its owner EOA signed.
contract MockERC1271Wallet is IERC1271 {
    address public owner;

    constructor(address owner_) {
        owner = owner_;
    }

    function isValidSignature(bytes32 hash, bytes calldata signature) external view returns (bytes4) {
        (uint8 v, bytes32 r, bytes32 s) = abi.decode(signature, (uint8, bytes32, bytes32));
        return ecrecover(hash, v, r, s) == owner ? bytes4(0x1626ba7e) : bytes4(0xffffffff);
    }
}

contract ONERegistryV2Test is Test {
    ONERegistry internal v1;
    ONERegistryV2 internal v2;

    bytes32 internal constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 internal constant LINK_ATTESTATION_TYPEHASH = keccak256(
        "LinkAttestation(address primary,address secondary,address one,bytes32 challengeId,uint256 amount,bytes32 txHash,uint256 txBlock,uint256 deadline,uint256 verifierNonce)"
    );
    bytes32 internal constant JOIN_ONE_TYPEHASH = keccak256(
        "JoinOne(address wallet,address primaryWallet,bytes32 membersHash,bytes32 salt,uint256 nonce,uint256 deadline)"
    );

    uint256 internal verifierPk;
    address internal verifierAddr;
    uint256 internal verifier2Pk;
    address internal verifier2Addr;
    address internal admin = address(0xA11CE); // the designated multisig

    uint256 internal pkP;
    uint256[] internal pkS;
    address internal P;

    uint256 internal counter;

    function setUp() public {
        v1 = new ONERegistry();
        verifierPk = uint256(keccak256("v2.verifier"));
        verifierAddr = vm.addr(verifierPk);
        verifier2Pk = uint256(keccak256("v2.verifier.rotated"));
        verifier2Addr = vm.addr(verifier2Pk);
        v2 = new ONERegistryV2(address(v1), verifierAddr, admin);
        vm.warp(1_700_000_000);
        vm.roll(1000);

        pkP = uint256(keccak256("v2.primary"));
        P = vm.addr(pkP);
        for (uint256 i = 0; i < 25; ++i) {
            pkS.push(uint256(keccak256(abi.encodePacked("v2.secondary", i))));
        }
    }

    // ------------------------------------------------------------------ utils

    function S(uint256 i) internal view returns (address) {
        return vm.addr(pkS[i]);
    }

    function _sign(uint256 pk, bytes32 digest) internal pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        return abi.encodePacked(r, s, v);
    }

    function _domain(address verifyingContract) internal view returns (bytes32) {
        return keccak256(
            abi.encode(DOMAIN_TYPEHASH, keccak256("ONE Link"), keccak256("1"), block.chainid, verifyingContract)
        );
    }

    function _digest(ONERegistryV2.LinkAttestation memory a, address verifyingContract)
        internal
        view
        returns (bytes32)
    {
        bytes32 structHash = keccak256(
            abi.encode(
                LINK_ATTESTATION_TYPEHASH,
                a.primary,
                a.secondary,
                a.one,
                a.challengeId,
                a.amount,
                a.txHash,
                a.txBlock,
                a.deadline,
                a.verifierNonce
            )
        );
        return keccak256(abi.encodePacked("\x19\x01", _domain(verifyingContract), structHash));
    }

    function _oneFor(address primary) internal view returns (address) {
        address existing = v2.activeOneOf(primary);
        return existing == address(0) ? v2.predictIdentityAddress(primary) : existing;
    }

    function _buildAtt(address primary, address secondary) internal returns (ONERegistryV2.LinkAttestation memory a) {
        counter++;
        a = ONERegistryV2.LinkAttestation({
            primary: primary,
            secondary: secondary,
            one: _oneFor(primary),
            challengeId: keccak256(abi.encodePacked("chal", counter)),
            amount: 0.01 ether + counter,
            txHash: keccak256(abi.encodePacked("tx", counter)),
            txBlock: block.number,
            deadline: block.timestamp + 10 minutes,
            verifierNonce: counter
        });
    }

    /// @dev A fully valid, verifier-signed link submitted by the primary.
    function _linkAs(uint256 primaryPk, address secondary) internal returns (address one) {
        address primary = vm.addr(primaryPk);
        ONERegistryV2.LinkAttestation memory a = _buildAtt(primary, secondary);
        bytes memory sig = _sign(verifierPk, _digest(a, address(v2)));
        vm.prank(primary);
        one = v2.approveLink(a, sig);
    }

    /// @dev Binds two wallets in V1 by creating a 2-member V1 ONE.
    function _bindInV1(uint256 primaryPk, uint256 secondaryPk) internal {
        address p = vm.addr(primaryPk);
        address s = vm.addr(secondaryPk);
        address[] memory members = new address[](2);
        (members[0], members[1]) = p < s ? (p, s) : (s, p);
        bytes32 membersHash = keccak256(abi.encode(members));
        bytes32 salt = keccak256("v1.salt");
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 v1Domain =
            keccak256(abi.encode(DOMAIN_TYPEHASH, keccak256("ONE"), keccak256("1"), block.chainid, address(v1)));
        bytes32 sh = keccak256(abi.encode(JOIN_ONE_TYPEHASH, s, p, membersHash, salt, v1.nonces(s), deadline));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", v1Domain, sh));
        ONERegistry.JoinAuth[] memory auths = new ONERegistry.JoinAuth[](1);
        auths[0] = ONERegistry.JoinAuth({deadline: deadline, signature: _sign(secondaryPk, digest)});
        vm.prank(p);
        v1.createOne(members, salt, auths);
    }

    // =================================================================
    // BYPASS IMPOSSIBILITY — the whole point of the fix
    // =================================================================

    function test_Bypass_DirectApproveLinkWithoutVerifierSigReverts() public {
        ONERegistryV2.LinkAttestation memory a = _buildAtt(P, S(0));
        vm.prank(P);
        vm.expectRevert(ONERegistryV2.InvalidAttestation.selector);
        v2.approveLink(a, hex""); // no verifier signature
        assertEq(v2.activeOneOf(P), address(0)); // nothing linked
    }

    function test_Bypass_AttestationSignedByNonVerifierReverts() public {
        ONERegistryV2.LinkAttestation memory a = _buildAtt(P, S(0));
        bytes memory forged = _sign(pkP, _digest(a, address(v2))); // signed by the primary, not the verifier
        vm.prank(P);
        vm.expectRevert(ONERegistryV2.InvalidAttestation.selector);
        v2.approveLink(a, forged);
    }

    function test_Bypass_CallerMustBeAttestedPrimary() public {
        ONERegistryV2.LinkAttestation memory a = _buildAtt(P, S(0));
        bytes memory sig = _sign(verifierPk, _digest(a, address(v2)));
        vm.prank(S(5)); // someone other than the attested primary submits
        vm.expectRevert(abi.encodeWithSelector(ONERegistryV2.CallerNotAttestedPrimary.selector, S(5), P));
        v2.approveLink(a, sig);
    }

    function test_Bypass_TamperedFieldInvalidatesSignature() public {
        ONERegistryV2.LinkAttestation memory a = _buildAtt(P, S(0));
        bytes memory sig = _sign(verifierPk, _digest(a, address(v2)));
        a.secondary = S(1); // change the target after signing
        vm.prank(P);
        vm.expectRevert(ONERegistryV2.InvalidAttestation.selector);
        v2.approveLink(a, sig);
    }

    function test_Bypass_WrongRegistryInDomainInvalidatesSignature() public {
        ONERegistryV2.LinkAttestation memory a = _buildAtt(P, S(0));
        // Verifier signs for a DIFFERENT registry address in the domain.
        bytes memory sig = _sign(verifierPk, _digest(a, address(0xBEEF)));
        vm.prank(P);
        vm.expectRevert(ONERegistryV2.InvalidAttestation.selector);
        v2.approveLink(a, sig);
    }

    function test_Bypass_VerifierAttestingWrongOneRevertsOnBind() public {
        ONERegistryV2.LinkAttestation memory a = _buildAtt(P, S(0));
        address realOne = a.one;
        a.one = address(0xDEAD); // verifier attests a wrong identity address
        bytes memory sig = _sign(verifierPk, _digest(a, address(v2)));
        vm.prank(P);
        vm.expectRevert(abi.encodeWithSelector(ONERegistryV2.IdentityMismatch.selector, address(0xDEAD), realOne));
        v2.approveLink(a, sig);
    }

    // =================================================================
    // Replay / reuse
    // =================================================================

    function test_RevertWhen_ChallengeReused() public {
        _linkAs(pkP, S(0)); // consumes challenge/tx #1
        // Reuse the same challengeId with a fresh tx for a new secondary.
        counter++; // fresh tx & one values, but override challengeId to #1
        ONERegistryV2.LinkAttestation memory a = _buildAtt(P, S(1));
        a.challengeId = keccak256(abi.encodePacked("chal", uint256(1)));
        bytes memory sig = _sign(verifierPk, _digest(a, address(v2)));
        vm.prank(P);
        vm.expectRevert(abi.encodeWithSelector(ONERegistryV2.ChallengeAlreadyUsed.selector, a.challengeId));
        v2.approveLink(a, sig);
    }

    function test_RevertWhen_TransferReused() public {
        _linkAs(pkP, S(0)); // consumes tx #1
        ONERegistryV2.LinkAttestation memory a = _buildAtt(P, S(1));
        a.txHash = keccak256(abi.encodePacked("tx", uint256(1))); // reuse the transfer
        bytes memory sig = _sign(verifierPk, _digest(a, address(v2)));
        vm.prank(P);
        vm.expectRevert(abi.encodeWithSelector(ONERegistryV2.TransferAlreadyUsed.selector, a.txHash));
        v2.approveLink(a, sig);
    }

    function test_RevertWhen_AttestationExpired() public {
        ONERegistryV2.LinkAttestation memory a = _buildAtt(P, S(0));
        a.deadline = block.timestamp - 1;
        bytes memory sig = _sign(verifierPk, _digest(a, address(v2)));
        vm.prank(P);
        vm.expectRevert(abi.encodeWithSelector(ONERegistryV2.AttestationExpired.selector, a.deadline));
        v2.approveLink(a, sig);
    }

    function test_FailedLinkDoesNotBurnChallenge() public {
        // Secondary already in V2 → link reverts; the challenge id must remain reusable.
        _linkAs(pkP, S(0));
        ONERegistryV2.LinkAttestation memory a = _buildAtt(vm.addr(pkS[10]), S(0)); // S0 busy
        bytes32 cid = a.challengeId;
        bytes memory sig = _sign(verifierPk, _digest(a, address(v2)));
        vm.prank(vm.addr(pkS[10]));
        vm.expectRevert(); // WalletAlreadyInV2
        v2.approveLink(a, sig);
        assertFalse(v2.challengeUsed(cid)); // rolled back
    }

    // =================================================================
    // Membership (happy paths and invariants, all attested)
    // =================================================================

    function test_ApproveLink_CreatesOneWithPrimaryAndSecondary() public {
        address one = _linkAs(pkP, S(0));
        assertEq(v2.primaryOf(one), P);
        assertEq(v2.memberCountOf(one), 2);
        assertTrue(v2.isActive(one));
        assertTrue(v2.isMemberOf(one, S(0)));
        assertEq(v2.activeOneOf(S(0)), one);

        ONEIdentityV2 id = ONEIdentityV2(one);
        assertEq(id.primaryOwner(), P);
        assertTrue(id.isMember(S(0)));
        assertEq(id.version(), 2);
    }

    function test_ApproveLink_AddsFurtherSecondaries() public {
        address one = _linkAs(pkP, S(0));
        _linkAs(pkP, S(1));
        _linkAs(pkP, S(2));
        assertEq(v2.memberCountOf(one), 4);
    }

    function test_RevertWhen_DuplicateWalletMembership() public {
        _linkAs(pkP, S(0));
        ONERegistryV2.LinkAttestation memory a = _buildAtt(vm.addr(pkS[10]), S(0));
        bytes memory sig = _sign(verifierPk, _digest(a, address(v2)));
        address bound = v2.activeOneOf(S(0)); // before prank — a call here would consume it
        vm.prank(vm.addr(pkS[10]));
        vm.expectRevert(abi.encodeWithSelector(ONERegistryV2.WalletAlreadyInV2.selector, S(0), bound));
        v2.approveLink(a, sig);
    }

    function test_RevertWhen_SecondaryActiveInV1() public {
        _bindInV1(pkS[20], pkS[21]);
        address v1one = v1.activeOneOf(S(21));
        ONERegistryV2.LinkAttestation memory a = _buildAtt(P, S(21));
        bytes memory sig = _sign(verifierPk, _digest(a, address(v2)));
        vm.prank(P);
        vm.expectRevert(abi.encodeWithSelector(ONERegistryV2.WalletActiveInV1.selector, S(21), v1one));
        v2.approveLink(a, sig);
    }

    function test_RevertWhen_PrimaryActiveInV1_OnCreate() public {
        _bindInV1(pkP, pkS[22]);
        // Predict against a fresh (unbound) primary is fine; the create path reverts.
        ONERegistryV2.LinkAttestation memory a = _buildAtt(P, S(0));
        address v1one = v1.activeOneOf(P);
        bytes memory sig = _sign(verifierPk, _digest(a, address(v2)));
        vm.prank(P);
        vm.expectRevert(abi.encodeWithSelector(ONERegistryV2.WalletActiveInV1.selector, P, v1one));
        v2.approveLink(a, sig);
    }

    function test_RevertWhen_LinkingSelf() public {
        ONERegistryV2.LinkAttestation memory a = _buildAtt(P, P);
        bytes memory sig = _sign(verifierPk, _digest(a, address(v2)));
        vm.prank(P);
        vm.expectRevert(abi.encodeWithSelector(ONERegistryV2.SameWallet.selector, P));
        v2.approveLink(a, sig);
    }

    function test_RevertWhen_NonPrimaryAddsToOne() public {
        _linkAs(pkP, S(0)); // S(0) is now a secondary
        ONERegistryV2.LinkAttestation memory a = _buildAtt(S(0), S(1)); // S0 poses as primary
        bytes memory sig = _sign(verifierPk, _digest(a, address(v2)));
        vm.prank(S(0));
        vm.expectRevert(abi.encodeWithSelector(ONERegistryV2.NotThePrimary.selector, S(0), P));
        v2.approveLink(a, sig);
    }

    function test_RevertWhen_ExceedingTwentyMembers() public {
        address one = _linkAs(pkP, S(0)); // 2
        for (uint256 i = 1; i <= 18; ++i) {
            _linkAs(pkP, S(i)); // up to 20
        }
        assertEq(v2.memberCountOf(one), 20);
        ONERegistryV2.LinkAttestation memory a = _buildAtt(P, S(19));
        bytes memory sig = _sign(verifierPk, _digest(a, address(v2)));
        vm.prank(P);
        vm.expectRevert(abi.encodeWithSelector(ONERegistryV2.MemberCapReached.selector, 20));
        v2.approveLink(a, sig);
    }

    function test_PredictedAddressMatchesDeployed() public {
        address predicted = v2.predictIdentityAddress(P);
        address one = _linkAs(pkP, S(0));
        assertEq(one, predicted);
    }

    // =================================================================
    // Removal
    // =================================================================

    function test_PrimaryEvictsSecondary() public {
        address one = _linkAs(pkP, S(0));
        _linkAs(pkP, S(1));
        vm.prank(P);
        v2.removeMember(one, S(0));
        assertFalse(v2.isMemberOf(one, S(0)));
        assertEq(v2.activeOneOf(S(0)), address(0));
    }

    function test_SecondaryRemovesItself() public {
        address one = _linkAs(pkP, S(0));
        _linkAs(pkP, S(1));
        vm.prank(S(0));
        v2.removeMember(one, S(0));
        assertFalse(v2.isMemberOf(one, S(0)));
    }

    function test_RevertWhen_RemovingPrimary() public {
        address one = _linkAs(pkP, S(0));
        vm.prank(P);
        vm.expectRevert(abi.encodeWithSelector(ONERegistryV2.CannotRemovePrimary.selector, P));
        v2.removeMember(one, P);
    }

    function test_RevertWhen_UnauthorizedRemoval() public {
        address one = _linkAs(pkP, S(0));
        _linkAs(pkP, S(1));
        vm.prank(S(1));
        vm.expectRevert(abi.encodeWithSelector(ONERegistryV2.NotAuthorizedToRemove.selector, S(1)));
        v2.removeMember(one, S(0));
    }

    function test_LastSecondaryLeave_DeactivatesAndFreesPrimary() public {
        address one = _linkAs(pkP, S(0));
        vm.prank(P);
        v2.removeMember(one, S(0));
        assertFalse(v2.isActive(one));
        assertEq(v2.activeOneOf(P), address(0));
        assertTrue(v2.exists(one));
    }

    function test_RelinkRemovedWalletIntoAnotherOne() public {
        address one = _linkAs(pkP, S(0));
        _linkAs(pkP, S(1));
        vm.prank(P);
        v2.removeMember(one, S(0));
        address one2 = _linkAs(pkS[15], S(0)); // fresh primary links the freed wallet
        assertTrue(v2.isMemberOf(one2, S(0)));
        assertTrue(one2 != one);
    }

    // =================================================================
    // confirmLinkWithSig (hidden path): verifier + primary co-signature
    // =================================================================

    function test_ConfirmLinkWithSig_EOA() public {
        ONERegistryV2.LinkAttestation memory a = _buildAtt(P, S(0));
        bytes32 digest = _digest(a, address(v2));
        bytes memory vSig = _sign(verifierPk, digest);
        bytes memory pSig = _sign(pkP, digest); // primary co-signs the same attestation

        address relayer = address(0xBEEF);
        vm.prank(relayer);
        address one = v2.confirmLinkWithSig(a, vSig, pSig);
        assertEq(one, a.one);
        assertTrue(v2.isMemberOf(one, S(0)));
    }

    function test_ConfirmLinkWithSig_ERC1271Primary() public {
        uint256 ownerPk = uint256(keccak256("scw.owner"));
        MockERC1271Wallet scw = new MockERC1271Wallet(vm.addr(ownerPk));
        address primary = address(scw);

        ONERegistryV2.LinkAttestation memory a = _buildAtt(primary, S(0));
        bytes32 digest = _digest(a, address(v2));
        bytes memory vSig = _sign(verifierPk, digest);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(ownerPk, digest);
        bytes memory pSig = abi.encode(v, r, s); // mock decodes (v,r,s)

        address one = v2.confirmLinkWithSig(a, vSig, pSig);
        assertEq(v2.primaryOf(one), primary);
        assertTrue(v2.isMemberOf(one, S(0)));
    }

    function test_RevertWhen_ConfirmLinkWithSig_BadPrimaryConsent() public {
        ONERegistryV2.LinkAttestation memory a = _buildAtt(P, S(0));
        bytes32 digest = _digest(a, address(v2));
        bytes memory vSig = _sign(verifierPk, digest);
        bytes memory pSig = _sign(pkS[3], digest); // wrong signer for primary consent
        vm.expectRevert(abi.encodeWithSelector(ONERegistryV2.InvalidPrimaryConsent.selector, P));
        v2.confirmLinkWithSig(a, vSig, pSig);
    }

    function test_RevertWhen_ConfirmLinkWithSig_NoVerifierAttestation() public {
        ONERegistryV2.LinkAttestation memory a = _buildAtt(P, S(0));
        bytes32 digest = _digest(a, address(v2));
        bytes memory pSig = _sign(pkP, digest);
        vm.expectRevert(ONERegistryV2.InvalidAttestation.selector);
        v2.confirmLinkWithSig(a, hex"", pSig); // no verifier sig
    }

    // =================================================================
    // Concurrency & events
    // =================================================================

    function test_ConcurrentIndependentLinks() public {
        address one1 = _linkAs(pkP, S(0));
        address one2 = _linkAs(pkS[15], S(1));
        assertTrue(one1 != one2);
        assertEq(v2.activeOneOf(S(0)), one1);
        assertEq(v2.activeOneOf(S(1)), one2);
    }

    function test_EmitsLifecycleEventsOnCreate() public {
        ONERegistryV2.LinkAttestation memory a = _buildAtt(P, S(0));
        bytes memory sig = _sign(verifierPk, _digest(a, address(v2)));
        vm.recordLogs();
        vm.prank(P);
        v2.approveLink(a, sig);
        // OneCreated + MemberLinked(primary) + MemberLinked(secondary).
        assertEq(vm.getRecordedLogs().length, 3);
    }

    // =================================================================
    // Verifier rotation (only the multisig admin, and only this)
    // =================================================================

    function test_RevertWhen_UnauthorisedVerifierRotation() public {
        vm.prank(P); // not the admin
        vm.expectRevert(abi.encodeWithSelector(ONERegistryV2.NotVerifierAdmin.selector, P));
        v2.setVerifier(verifier2Addr);
    }

    function test_RevertWhen_ZeroVerifier() public {
        vm.prank(admin);
        vm.expectRevert(ONERegistryV2.ZeroAddress.selector);
        v2.setVerifier(address(0));
    }

    function test_SuccessfulVerifierRotation() public {
        vm.expectEmit(true, true, false, false, address(v2));
        emit ONERegistryV2.VerifierChanged(verifierAddr, verifier2Addr);
        vm.prank(admin);
        v2.setVerifier(verifier2Addr);
        assertEq(v2.verifier(), verifier2Addr);
    }

    function test_OldVerifierRejectedImmediatelyAfterRotation() public {
        vm.prank(admin);
        v2.setVerifier(verifier2Addr);
        // Attestation signed by the OLD verifier is no longer accepted.
        ONERegistryV2.LinkAttestation memory a = _buildAtt(P, S(0));
        bytes memory oldSig = _sign(verifierPk, _digest(a, address(v2)));
        vm.prank(P);
        vm.expectRevert(ONERegistryV2.InvalidAttestation.selector);
        v2.approveLink(a, oldSig);
    }

    function test_NewVerifierAcceptedAfterRotation() public {
        vm.prank(admin);
        v2.setVerifier(verifier2Addr);
        ONERegistryV2.LinkAttestation memory a = _buildAtt(P, S(0));
        bytes memory newSig = _sign(verifier2Pk, _digest(a, address(v2)));
        vm.prank(P);
        address one = v2.approveLink(a, newSig);
        assertTrue(v2.isMemberOf(one, S(0)));
    }

    function test_UsedChallengeAndTxSurviveRotation() public {
        // Link under verifier 1 → consumes challenge/tx #1.
        _linkAs(pkP, S(0));
        bytes32 usedChallenge = keccak256(abi.encodePacked("chal", uint256(1)));
        bytes32 usedTx = keccak256(abi.encodePacked("tx", uint256(1)));
        assertTrue(v2.challengeUsed(usedChallenge));
        assertTrue(v2.transferUsed(usedTx));

        vm.prank(admin);
        v2.setVerifier(verifier2Addr);

        // The new verifier cannot resurrect a consumed challenge id.
        ONERegistryV2.LinkAttestation memory a = _buildAtt(P, S(1));
        a.challengeId = usedChallenge;
        bytes memory sig = _sign(verifier2Pk, _digest(a, address(v2)));
        vm.prank(P);
        vm.expectRevert(abi.encodeWithSelector(ONERegistryV2.ChallengeAlreadyUsed.selector, usedChallenge));
        v2.approveLink(a, sig);

        // ...nor a consumed transfer hash.
        ONERegistryV2.LinkAttestation memory b = _buildAtt(P, S(1));
        b.txHash = usedTx;
        bytes memory sig2 = _sign(verifier2Pk, _digest(b, address(v2)));
        vm.prank(P);
        vm.expectRevert(abi.encodeWithSelector(ONERegistryV2.TransferAlreadyUsed.selector, usedTx));
        v2.approveLink(b, sig2);
    }

    function test_MembershipsUnchangedAfterRotation() public {
        address one = _linkAs(pkP, S(0));
        _linkAs(pkP, S(1));
        assertEq(v2.memberCountOf(one), 3);

        vm.prank(admin);
        v2.setVerifier(verifier2Addr);

        // Existing identity + membership untouched.
        assertEq(v2.memberCountOf(one), 3);
        assertEq(v2.primaryOf(one), P);
        assertTrue(v2.isMemberOf(one, S(0)));
        assertTrue(v2.isMemberOf(one, S(1)));
        assertTrue(v2.isActive(one));
    }

    function test_VerifierAdminHasNoOtherAuthority() public {
        address one = _linkAs(pkP, S(0));
        _linkAs(pkP, S(1));

        // The admin cannot remove a member (not primary, not the wallet).
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(ONERegistryV2.NotAuthorizedToRemove.selector, admin));
        v2.removeMember(one, S(0));

        // The admin has no link authority either: a direct approveLink still needs a
        // valid verifier attestation and to be the attested primary.
        ONERegistryV2.LinkAttestation memory a = _buildAtt(admin, S(2));
        vm.prank(admin);
        vm.expectRevert(ONERegistryV2.InvalidAttestation.selector);
        v2.approveLink(a, hex"");
    }
}
