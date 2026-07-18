// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ONEBase} from "./ONEBase.t.sol";
import {ONERegistry} from "../src/ONERegistry.sol";
import {ONEIdentity} from "../src/ONEIdentity.sol";
import {MockERC20, MockERC721, RevertingERC721, MalformedERC721} from "./mocks/Mocks.sol";

contract ONEIdentityTest is ONEBase {
    bytes32 internal constant SALT_A = keccak256("salt.a");

    ONEIdentity internal one;
    address[] internal members;
    address internal primary;

    MockERC20 internal token;
    MockERC721 internal nft;

    function setUp() public override {
        super.setUp();
        (address oneAddr, address[] memory sortedMembers, address p) = _createOne(5, SALT_A);
        one = ONEIdentity(oneAddr);
        members = sortedMembers;
        primary = p;

        token = new MockERC20();
        nft = new MockERC721();
    }

    // ---------------------------------------------------------------------
    // Membership is read straight from the registry
    // ---------------------------------------------------------------------

    function test_ReadsMembershipFromRegistry() public view {
        assertEq(one.primaryOwner(), primary, "primary");
        assertEq(one.memberCount(), 5, "count");
        assertTrue(one.isActive(), "active");
        assertEq(one.getMembers(), members, "members");
    }

    /// @dev The identity holds no independent list: a registry-side removal is
    ///      immediately visible through the identity with no identity-side write.
    function test_MembershipChangesPropagateWithoutIdentityWrite() public {
        address secondary = members[0] == primary ? members[1] : members[0];

        vm.prank(secondary);
        registry.removeMember(address(one), secondary);

        assertEq(one.memberCount(), 4, "identity sees removal");
        address[] memory current = one.getMembers();
        for (uint256 i = 0; i < current.length; ++i) {
            assertTrue(current[i] != secondary, "removed member gone from identity view");
        }
    }

    function test_IdentityReportsInactiveWhenOnlyPrimaryRemains() public {
        for (uint256 i = 0; i < members.length; ++i) {
            if (members[i] == primary) continue;
            vm.prank(primary);
            registry.removeMember(address(one), members[i]);
        }
        assertFalse(one.isActive(), "inactive");
        assertEq(one.memberCount(), 1, "primary only");
    }

    // ---------------------------------------------------------------------
    // Native aggregation
    // ---------------------------------------------------------------------

    function test_CombinedNativeBalance() public {
        uint256 expected;
        for (uint256 i = 0; i < members.length; ++i) {
            uint256 amount = (i + 1) * 1 ether;
            vm.deal(members[i], amount);
            expected += amount;
        }
        assertEq(one.combinedNativeBalance(), expected, "sum of member balances");
    }

    function test_CombinedNativeBalanceFollowsMembership() public {
        for (uint256 i = 0; i < members.length; ++i) {
            vm.deal(members[i], 2 ether);
        }
        assertEq(one.combinedNativeBalance(), 10 ether, "five members");

        address secondary = members[0] == primary ? members[1] : members[0];
        vm.prank(secondary);
        registry.removeMember(address(one), secondary);

        assertEq(one.combinedNativeBalance(), 8 ether, "excludes departed member");
    }

    // ---------------------------------------------------------------------
    // ERC-20 aggregation
    // ---------------------------------------------------------------------

    function test_CombinedERC20Balance() public {
        uint256 expected;
        for (uint256 i = 0; i < members.length; ++i) {
            uint256 amount = (i + 1) * 100e18;
            token.mint(members[i], amount);
            expected += amount;
        }
        assertEq(one.combinedERC20Balance(address(token)), expected, "sum");
    }

    function test_CombinedERC20BalanceZeroWhenNoHoldings() public view {
        assertEq(one.combinedERC20Balance(address(token)), 0, "zero");
    }

    function test_RevertWhen_ERC20IsNotAContract() public {
        address notAToken = address(0xDEAD);
        vm.expectRevert(abi.encodeWithSelector(ONEIdentity.NotAContract.selector, notAToken));
        one.combinedERC20Balance(notAToken);
    }

    function test_RevertWhen_ERC20BalanceCallReverts() public {
        // RevertingERC721 exposes the same balanceOf(address) selector.
        address broken = address(new RevertingERC721());
        vm.expectPartialRevert(ONEIdentity.ERC20BalanceCallFailed.selector);
        one.combinedERC20Balance(broken);
    }

    // ---------------------------------------------------------------------
    // ERC-721 aggregation
    // ---------------------------------------------------------------------

    function test_CombinedERC721Balance() public {
        nft.mint(members[0], 1);
        nft.mint(members[1], 2);
        nft.mint(members[3], 4);
        assertEq(one.combinedERC721Balance(address(nft)), 7, "sum across members");
    }

    function test_CombinedERC721BalanceZeroWhenNoHoldings() public view {
        assertEq(one.combinedERC721Balance(address(nft)), 0, "zero");
    }

    function test_CombinedERC721BalanceFollowsMembership() public {
        for (uint256 i = 0; i < members.length; ++i) {
            nft.mint(members[i], 2);
        }
        assertEq(one.combinedERC721Balance(address(nft)), 10, "five members");

        address secondary = members[0] == primary ? members[1] : members[0];
        vm.prank(secondary);
        registry.removeMember(address(one), secondary);

        assertEq(one.combinedERC721Balance(address(nft)), 8, "excludes departed member");
    }

    // ---------------------------------------------------------------------
    // Threshold boundaries
    // ---------------------------------------------------------------------

    function test_MeetsERC721ThresholdBoundaries() public {
        nft.mint(members[0], 3);
        nft.mint(members[2], 2); // combined = 5

        assertTrue(one.meetsERC721Threshold(address(nft), 0), "zero threshold always met");
        assertTrue(one.meetsERC721Threshold(address(nft), 4), "below");
        assertTrue(one.meetsERC721Threshold(address(nft), 5), "exactly at threshold");
        assertFalse(one.meetsERC721Threshold(address(nft), 6), "one above");
    }

    function test_MeetsERC721ThresholdWithNoHoldings() public view {
        assertTrue(one.meetsERC721Threshold(address(nft), 0), "zero threshold met at zero balance");
        assertFalse(one.meetsERC721Threshold(address(nft), 1), "not met");
    }

    // ---------------------------------------------------------------------
    // Failure surfaces — never a silent partial total
    // ---------------------------------------------------------------------

    function test_RevertWhen_CollectionIsNotAContract() public {
        address notACollection = address(0xC0FFEE);
        vm.expectRevert(abi.encodeWithSelector(ONEIdentity.NotAContract.selector, notACollection));
        one.combinedERC721Balance(notACollection);
    }

    function test_RevertWhen_CollectionReverts() public {
        address broken = address(new RevertingERC721());
        vm.expectRevert(
            abi.encodeWithSelector(ONEIdentity.ERC721BalanceCallFailed.selector, broken, members[0])
        );
        one.combinedERC721Balance(broken);
    }

    function test_RevertWhen_CollectionReturnsMalformedData() public {
        address malformed = address(new MalformedERC721());
        vm.expectRevert(
            abi.encodeWithSelector(ONEIdentity.ERC721BalanceCallFailed.selector, malformed, members[0])
        );
        one.combinedERC721Balance(malformed);
    }

    /// @dev A broken collection must not degrade into `false`; the revert propagates.
    function test_RevertWhen_ThresholdCheckedOnBrokenCollection() public {
        address broken = address(new RevertingERC721());
        vm.expectPartialRevert(ONEIdentity.ERC721BalanceCallFailed.selector);
        one.meetsERC721Threshold(broken, 1);
    }

    /// @dev A collection that reverts only for a later member still fails loudly rather
    ///      than returning the partial total accumulated from earlier members.
    function test_RevertWhen_OneMemberOfManyFails() public {
        nft.mint(members[0], 5);
        SelectiveRevertERC721 selective = new SelectiveRevertERC721(members[3]);
        selective.mint(members[0], 5);

        vm.expectRevert(
            abi.encodeWithSelector(
                ONEIdentity.ERC721BalanceCallFailed.selector, address(selective), members[3]
            )
        );
        one.combinedERC721Balance(address(selective));
    }
}

/// @dev Reverts balanceOf only for one specific account.
contract SelectiveRevertERC721 {
    address public immutable badAccount;
    mapping(address => uint256) private _balances;

    error Nope();

    constructor(address badAccount_) {
        badAccount = badAccount_;
    }

    function mint(address to, uint256 count) external {
        _balances[to] += count;
    }

    function balanceOf(address account) external view returns (uint256) {
        if (account == badAccount) revert Nope();
        return _balances[account];
    }
}
