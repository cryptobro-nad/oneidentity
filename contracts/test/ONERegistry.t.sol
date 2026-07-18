// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ONEBase} from "./ONEBase.t.sol";
import {ONERegistry} from "../src/ONERegistry.sol";
import {ONEIdentity} from "../src/ONEIdentity.sol";

contract ONERegistryTest is ONEBase {
    bytes32 internal constant SALT_A = keccak256("salt.a");
    bytes32 internal constant SALT_B = keccak256("salt.b");

    /// @dev Placeholder auths for cases that must revert during list validation,
    ///      i.e. before any signature is inspected.
    function _emptyAuths(uint256 n) internal pure returns (ONERegistry.JoinAuth[] memory auths) {
        auths = new ONERegistry.JoinAuth[](n);
    }

    // ---------------------------------------------------------------------
    // Creation — happy paths
    // ---------------------------------------------------------------------

    function test_CreateTwoWallets() public {
        (address one, address[] memory members, address primary) = _createOne(2, SALT_A);

        assertTrue(one != address(0), "identity deployed");
        assertTrue(registry.exists(one), "recorded");
        assertTrue(registry.isActive(one), "active");
        assertEq(registry.primaryOf(one), primary, "primary");
        assertEq(registry.memberCountOf(one), 2, "count");
        assertEq(registry.membersOf(one), members, "members");
        assertEq(registry.activeOneOf(members[0]), one, "member 0 bound");
        assertEq(registry.activeOneOf(members[1]), one, "member 1 bound");
        assertEq(registry.totalOnes(), 1, "total");
    }

    function test_CreateFiveWallets() public {
        (address one, address[] memory members, address primary) = _createOne(5, SALT_A);

        assertEq(registry.memberCountOf(one), 5, "count");
        assertTrue(registry.isActive(one), "active");
        assertEq(registry.primaryOf(one), primary, "primary");
        for (uint256 i = 1; i < members.length; ++i) {
            assertTrue(members[i] > members[i - 1], "stored list sorted ascending");
            assertEq(registry.activeOneOf(members[i]), one, "bound");
        }
        // Every secondary consumed exactly one nonce; the primary signed nothing.
        assertEq(registry.nonces(primary), 0, "primary nonce untouched");
    }

    function test_PredictedAddressMatchesDeployment() public {
        address primary = vm.addr(pks[0]);
        address[] memory members = _sorted(_addrs(3));
        address predicted = registry.predictOneAddress(primary, members, SALT_A);

        ONERegistry.JoinAuth[] memory auths = _buildAuths(members, primary, SALT_A, block.timestamp + 1 hours);
        vm.prank(primary);
        address one = registry.createOne(members, SALT_A, auths);

        assertEq(one, predicted, "CREATE2 address predictable before submission");
    }

    function test_IdentityIsLinkedToRegistry() public {
        (address one,,) = _createOne(2, SALT_A);
        assertEq(address(ONEIdentity(one).registry()), address(registry), "identity points at registry");
    }

    // ---------------------------------------------------------------------
    // Creation — member list validation
    // ---------------------------------------------------------------------

    function test_RevertWhen_OneWallet() public {
        address primary = vm.addr(pks[0]);
        address[] memory members = _sorted(_addrs(1));
        vm.prank(primary);
        vm.expectRevert(abi.encodeWithSelector(ONERegistry.InvalidMemberCount.selector, 1));
        registry.createOne(members, SALT_A, _emptyAuths(0));
    }

    function test_RevertWhen_SixWallets() public {
        address primary = vm.addr(pks[0]);
        address[] memory members = _sorted(_addrs(6));
        vm.prank(primary);
        vm.expectRevert(abi.encodeWithSelector(ONERegistry.InvalidMemberCount.selector, 6));
        registry.createOne(members, SALT_A, _emptyAuths(5));
    }

    function test_RevertWhen_ZeroAddressMember() public {
        address primary = vm.addr(pks[0]);
        address[] memory members = new address[](3);
        members[0] = address(0); // sorts first, so ordering alone would accept it
        members[1] = vm.addr(pks[0]);
        members[2] = vm.addr(pks[1]);
        members = _sorted(members);

        vm.prank(primary);
        vm.expectRevert(abi.encodeWithSelector(ONERegistry.ZeroAddressMember.selector, 0));
        registry.createOne(members, SALT_A, _emptyAuths(2));
    }

    function test_RevertWhen_DuplicateMember() public {
        address primary = vm.addr(pks[0]);
        address[] memory members = new address[](3);
        members[0] = vm.addr(pks[0]);
        members[1] = vm.addr(pks[1]);
        members[2] = vm.addr(pks[1]);
        members = _sorted(members);

        // After sorting, the duplicate pair is adjacent; find where.
        uint256 dupIndex;
        for (uint256 i = 1; i < members.length; ++i) {
            if (members[i] == members[i - 1]) dupIndex = i;
        }

        vm.prank(primary);
        vm.expectRevert(
            abi.encodeWithSelector(ONERegistry.DuplicateMember.selector, members[dupIndex], dupIndex)
        );
        registry.createOne(members, SALT_A, _emptyAuths(2));
    }

    function test_RevertWhen_UnsortedMembers() public {
        address primary = vm.addr(pks[0]);
        address[] memory sortedMembers = _sorted(_addrs(3));

        // Reverse the sorted list so index 1 is the first descending step.
        address[] memory members = new address[](3);
        members[0] = sortedMembers[2];
        members[1] = sortedMembers[1];
        members[2] = sortedMembers[0];

        vm.prank(primary);
        vm.expectRevert(abi.encodeWithSelector(ONERegistry.UnsortedMembers.selector, 1));
        registry.createOne(members, SALT_A, _emptyAuths(2));
    }

    function test_RevertWhen_SubmitterNotInMemberList() public {
        address outsider = vm.addr(pks[5]);
        address[] memory members = _sorted(_addrs(3));

        vm.prank(outsider);
        vm.expectRevert(abi.encodeWithSelector(ONERegistry.PrimaryNotInMemberList.selector, outsider));
        registry.createOne(members, SALT_A, _emptyAuths(2));
    }

    function test_RevertWhen_AuthCountMismatch() public {
        address primary = vm.addr(pks[0]);
        address[] memory members = _sorted(_addrs(3));

        vm.prank(primary);
        vm.expectRevert(abi.encodeWithSelector(ONERegistry.AuthCountMismatch.selector, 2, 1));
        registry.createOne(members, SALT_A, _emptyAuths(1));
    }

    // ---------------------------------------------------------------------
    // Creation — signature validation
    // ---------------------------------------------------------------------

    /// @dev Two-wallet fixture where the single secondary's auth is supplied by the caller.
    function _createTwoWith(ONERegistry.JoinAuth memory auth, bytes32 salt)
        internal
        returns (address primary, address secondary, address[] memory members)
    {
        primary = vm.addr(pks[0]);
        secondary = vm.addr(pks[1]);
        members = _sorted(_addrs(2));

        ONERegistry.JoinAuth[] memory auths = new ONERegistry.JoinAuth[](1);
        auths[0] = auth;

        vm.prank(primary);
        registry.createOne(members, salt, auths);
    }

    function test_RevertWhen_WrongSigner() public {
        address primary = vm.addr(pks[0]);
        address secondary = vm.addr(pks[1]);
        address impostor = vm.addr(pks[2]);
        address[] memory members = _sorted(_addrs(2));
        uint256 deadline = block.timestamp + 1 hours;

        bytes32 digest =
            _digest(address(registry), secondary, primary, _membersHash(members), SALT_A, 0, deadline);
        // Correct digest, wrong key.
        ONERegistry.JoinAuth memory auth =
            ONERegistry.JoinAuth({deadline: deadline, signature: _sign(pks[2], digest)});

        vm.expectRevert(abi.encodeWithSelector(ONERegistry.InvalidSignature.selector, secondary, impostor));
        _createTwoWith(auth, SALT_A);
    }

    function test_RevertWhen_WrongPrimaryInSignature() public {
        address secondary = vm.addr(pks[1]);
        address wrongPrimary = vm.addr(pks[2]);
        address[] memory members = _sorted(_addrs(2));
        uint256 deadline = block.timestamp + 1 hours;

        bytes32 digest =
            _digest(address(registry), secondary, wrongPrimary, _membersHash(members), SALT_A, 0, deadline);
        ONERegistry.JoinAuth memory auth =
            ONERegistry.JoinAuth({deadline: deadline, signature: _sign(pks[1], digest)});

        vm.expectPartialRevert(ONERegistry.InvalidSignature.selector);
        _createTwoWith(auth, SALT_A);
    }

    function test_RevertWhen_WrongMembersHash() public {
        address primary = vm.addr(pks[0]);
        address secondary = vm.addr(pks[1]);
        address[] memory members = _sorted(_addrs(2));
        address[] memory otherMembers = _sorted(_addrs(3));
        uint256 deadline = block.timestamp + 1 hours;

        bytes32 digest =
            _digest(address(registry), secondary, primary, _membersHash(otherMembers), SALT_A, 0, deadline);
        ONERegistry.JoinAuth memory auth =
            ONERegistry.JoinAuth({deadline: deadline, signature: _sign(pks[1], digest)});

        assertTrue(_membersHash(members) != _membersHash(otherMembers), "hashes differ");
        vm.expectPartialRevert(ONERegistry.InvalidSignature.selector);
        _createTwoWith(auth, SALT_A);
    }

    function test_RevertWhen_WrongSalt() public {
        address primary = vm.addr(pks[0]);
        address secondary = vm.addr(pks[1]);
        address[] memory members = _sorted(_addrs(2));
        uint256 deadline = block.timestamp + 1 hours;

        // Signed over SALT_B, submitted with SALT_A.
        bytes32 digest =
            _digest(address(registry), secondary, primary, _membersHash(members), SALT_B, 0, deadline);
        ONERegistry.JoinAuth memory auth =
            ONERegistry.JoinAuth({deadline: deadline, signature: _sign(pks[1], digest)});

        vm.expectPartialRevert(ONERegistry.InvalidSignature.selector);
        _createTwoWith(auth, SALT_A);
    }

    function test_RevertWhen_WrongNonce() public {
        address primary = vm.addr(pks[0]);
        address secondary = vm.addr(pks[1]);
        address[] memory members = _sorted(_addrs(2));
        uint256 deadline = block.timestamp + 1 hours;

        // Current nonce is 0; sign over 1.
        bytes32 digest =
            _digest(address(registry), secondary, primary, _membersHash(members), SALT_A, 1, deadline);
        ONERegistry.JoinAuth memory auth =
            ONERegistry.JoinAuth({deadline: deadline, signature: _sign(pks[1], digest)});

        vm.expectPartialRevert(ONERegistry.InvalidSignature.selector);
        _createTwoWith(auth, SALT_A);
    }

    function test_RevertWhen_SignatureExpired() public {
        address primary = vm.addr(pks[0]);
        address secondary = vm.addr(pks[1]);
        address[] memory members = _sorted(_addrs(2));
        uint256 deadline = block.timestamp - 1;

        bytes32 digest =
            _digest(address(registry), secondary, primary, _membersHash(members), SALT_A, 0, deadline);
        ONERegistry.JoinAuth memory auth =
            ONERegistry.JoinAuth({deadline: deadline, signature: _sign(pks[1], digest)});

        vm.expectRevert(abi.encodeWithSelector(ONERegistry.SignatureExpired.selector, secondary, deadline));
        _createTwoWith(auth, SALT_A);
    }

    function test_RevertWhen_WrongVerifyingContract() public {
        address primary = vm.addr(pks[0]);
        address secondary = vm.addr(pks[1]);
        address[] memory members = _sorted(_addrs(2));
        uint256 deadline = block.timestamp + 1 hours;

        // Signed against a different registry address: same struct, different domain.
        address foreignRegistry = address(new ONERegistry());
        bytes32 digest =
            _digest(foreignRegistry, secondary, primary, _membersHash(members), SALT_A, 0, deadline);
        ONERegistry.JoinAuth memory auth =
            ONERegistry.JoinAuth({deadline: deadline, signature: _sign(pks[1], digest)});

        vm.expectPartialRevert(ONERegistry.InvalidSignature.selector);
        _createTwoWith(auth, SALT_A);
    }

    function test_RevertWhen_CreationSaltReused() public {
        (address one, address[] memory members, address primary) = _createOne(2, SALT_A);
        address secondary = members[0] == primary ? members[1] : members[0];

        // Free both wallets so only the salt guard can stop the second attempt.
        vm.prank(secondary);
        registry.removeMember(one, secondary);

        ONERegistry.JoinAuth[] memory auths = _buildAuths(members, primary, SALT_A, block.timestamp + 1 hours);
        vm.prank(primary);
        vm.expectRevert(abi.encodeWithSelector(ONERegistry.CreationSaltAlreadyUsed.selector, SALT_A));
        registry.createOne(members, SALT_A, auths);
    }

    /// @dev A consumed signature cannot be replayed: the wallet's nonce has advanced,
    ///      so the identical signature no longer recovers against the new digest.
    function test_RevertWhen_SignatureReplayAfterNonceConsumed() public {
        (address one, address[] memory members, address primary) = _createOne(2, SALT_A);
        address secondary = members[0] == primary ? members[1] : members[0];

        assertEq(registry.nonces(secondary), 1, "nonce consumed by creation");

        // Leave the ONE so the wallet is free again.
        vm.prank(secondary);
        registry.removeMember(one, secondary);

        uint256 deadline = block.timestamp + 1 hours;
        // Re-sign everything correctly for a fresh salt but with the already-spent nonce 0.
        bytes32 digest =
            _digest(address(registry), secondary, primary, _membersHash(members), SALT_B, 0, deadline);
        ONERegistry.JoinAuth[] memory auths = new ONERegistry.JoinAuth[](1);
        auths[0] = ONERegistry.JoinAuth({deadline: deadline, signature: _sign(_pkOf(secondary), digest)});

        vm.prank(primary);
        vm.expectPartialRevert(ONERegistry.InvalidSignature.selector);
        registry.createOne(members, SALT_B, auths);
    }

    function test_RevertWhen_WalletAlreadyInActiveOne() public {
        (address one, address[] memory members, address primary) = _createOne(2, SALT_A);
        address taken = members[0] == primary ? members[1] : members[0];

        // A different primary tries to pull the same wallet into a second ONE.
        address newPrimary = vm.addr(pks[2]);
        address[] memory two = new address[](2);
        two[0] = taken;
        two[1] = newPrimary;
        two = _sorted(two);

        vm.prank(newPrimary);
        vm.expectRevert(abi.encodeWithSelector(ONERegistry.WalletAlreadyInActiveOne.selector, taken, one));
        registry.createOne(two, SALT_B, _emptyAuths(1));
    }

    // ---------------------------------------------------------------------
    // Removal
    // ---------------------------------------------------------------------

    function test_SecondaryRemovesItself() public {
        (address one, address[] memory members, address primary) = _createOne(3, SALT_A);
        address secondary = members[0] == primary ? members[1] : members[0];

        vm.prank(secondary);
        vm.expectEmit(true, true, true, true, address(registry));
        emit ONERegistry.MemberRemoved(one, secondary, secondary);
        registry.removeMember(one, secondary);

        assertEq(registry.memberCountOf(one), 2, "count drops");
        assertTrue(registry.isActive(one), "still active with two");
        assertEq(registry.activeOneOf(secondary), address(0), "wallet freed");

        address[] memory remaining = registry.membersOf(one);
        for (uint256 i = 0; i < remaining.length; ++i) {
            assertTrue(remaining[i] != secondary, "removed from list");
        }
        assertTrue(remaining[1] > remaining[0], "list still sorted");
    }

    function test_PrimaryRemovesSecondary() public {
        (address one, address[] memory members, address primary) = _createOne(3, SALT_A);
        address secondary = members[0] == primary ? members[1] : members[0];

        vm.prank(primary);
        registry.removeMember(one, secondary);

        assertEq(registry.memberCountOf(one), 2, "count drops");
        assertEq(registry.activeOneOf(secondary), address(0), "wallet freed");
    }

    function test_RevertWhen_UnauthorizedRemoval() public {
        (address one, address[] memory members, address primary) = _createOne(3, SALT_A);
        address secondary = members[0] == primary ? members[1] : members[0];
        address outsider = vm.addr(pks[5]);

        vm.prank(outsider);
        vm.expectRevert(abi.encodeWithSelector(ONERegistry.NotAuthorizedToRemove.selector, outsider));
        registry.removeMember(one, secondary);
    }

    /// @dev A secondary cannot evict a different secondary.
    function test_RevertWhen_SecondaryRemovesOtherSecondary() public {
        (address one, address[] memory members, address primary) = _createOne(3, SALT_A);

        address s1;
        address s2;
        for (uint256 i = 0; i < members.length; ++i) {
            if (members[i] == primary) continue;
            if (s1 == address(0)) s1 = members[i];
            else s2 = members[i];
        }

        vm.prank(s1);
        vm.expectRevert(abi.encodeWithSelector(ONERegistry.NotAuthorizedToRemove.selector, s1));
        registry.removeMember(one, s2);
    }

    function test_RevertWhen_PrimaryRemovesItself() public {
        (address one,, address primary) = _createOne(3, SALT_A);

        vm.prank(primary);
        vm.expectRevert(abi.encodeWithSelector(ONERegistry.CannotRemovePrimary.selector, primary));
        registry.removeMember(one, primary);
    }

    function test_RevertWhen_RemovingNonMember() public {
        (address one,, address primary) = _createOne(3, SALT_A);
        address outsider = vm.addr(pks[5]);

        vm.prank(primary);
        vm.expectRevert(abi.encodeWithSelector(ONERegistry.NotAMember.selector, one, outsider));
        registry.removeMember(one, outsider);
    }

    function test_RevertWhen_RemovingFromUnknownOne() public {
        address ghost = address(0xBEEF);
        vm.expectRevert(abi.encodeWithSelector(ONERegistry.UnknownOne.selector, ghost));
        registry.removeMember(ghost, vm.addr(pks[1]));
    }

    // ---------------------------------------------------------------------
    // Deactivation lifecycle
    // ---------------------------------------------------------------------

    function test_BecomesInactiveWhenOnlyPrimaryRemains() public {
        (address one, address[] memory members, address primary) = _createOne(2, SALT_A);
        address secondary = members[0] == primary ? members[1] : members[0];

        vm.prank(secondary);
        vm.expectEmit(true, true, false, true, address(registry));
        emit ONERegistry.OneDeactivated(one, primary);
        registry.removeMember(one, secondary);

        assertFalse(registry.isActive(one), "inactive");
        assertEq(registry.memberCountOf(one), 1, "primary remains");
        assertEq(registry.membersOf(one)[0], primary, "primary is the survivor");
        assertEq(registry.activeOneOf(primary), address(0), "primary freed");
        // Permanently queryable.
        assertTrue(registry.exists(one), "record retained");
    }

    function test_RevertWhen_RemovingFromInactiveOne() public {
        (address one, address[] memory members, address primary) = _createOne(2, SALT_A);
        address secondary = members[0] == primary ? members[1] : members[0];

        vm.prank(secondary);
        registry.removeMember(one, secondary);

        vm.prank(primary);
        vm.expectRevert(abi.encodeWithSelector(ONERegistry.OneNotActive.selector, one));
        registry.removeMember(one, primary);
    }

    function test_InactivePrimaryMayCreateNewOne() public {
        (address oldOne, address[] memory members, address primary) = _createOne(2, SALT_A);
        address secondary = members[0] == primary ? members[1] : members[0];

        vm.prank(secondary);
        registry.removeMember(oldOne, secondary);
        assertFalse(registry.isActive(oldOne), "old ONE inactive");

        // New ONE with a different partner.
        address newPartner = vm.addr(pks[2]);
        address[] memory two = new address[](2);
        two[0] = primary;
        two[1] = newPartner;
        two = _sorted(two);

        ONERegistry.JoinAuth[] memory auths = _buildAuths(two, primary, SALT_B, block.timestamp + 1 hours);
        vm.prank(primary);
        address newOne = registry.createOne(two, SALT_B, auths);

        assertTrue(newOne != oldOne, "distinct address");
        assertTrue(registry.isActive(newOne), "new ONE active");
        assertEq(registry.activeOneOf(primary), newOne, "primary rebound");
        assertEq(registry.totalOnes(), 2, "both retained");

        // The old ONE stays permanently queryable as inactive.
        assertTrue(registry.exists(oldOne), "old record kept");
        assertFalse(registry.isActive(oldOne), "still inactive");
        assertEq(registry.memberCountOf(oldOne), 1, "old membership frozen at one");
    }

    function test_UnknownOneQueriesRevert() public {
        address ghost = address(0xBEEF);
        vm.expectRevert(abi.encodeWithSelector(ONERegistry.UnknownOne.selector, ghost));
        registry.isActive(ghost);
    }
}
