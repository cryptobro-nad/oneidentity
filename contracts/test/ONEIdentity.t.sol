// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ONEBase} from "./ONEBase.t.sol";
import {ONERegistry} from "../src/ONERegistry.sol";
import {ONEIdentity} from "../src/ONEIdentity.sol";
import {
    MockERC20,
    MockERC721,
    RevertingERC721,
    MalformedERC721,
    EmptyReturnERC721,
    HugeReturndataERC721
} from "./mocks/Mocks.sol";

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

    /// @dev Drives the fixture ONE down to its primary alone.
    function _deactivate() internal {
        for (uint256 i = 0; i < members.length; ++i) {
            if (members[i] == primary) continue;
            vm.prank(primary);
            registry.removeMember(address(one), members[i]);
        }
        assertFalse(one.isActive(), "fixture deactivated");
    }

    function test_IdentityReportsInactiveWhenOnlyPrimaryRemains() public {
        _deactivate();
        assertFalse(one.isActive(), "inactive");
        assertEq(one.memberCount(), 1, "primary only");
    }

    // ---------------------------------------------------------------------
    // Inactive identities cannot act as verified identities
    // ---------------------------------------------------------------------

    function test_ActiveIdentityCanAggregate() public {
        vm.deal(members[0], 1 ether);
        token.mint(members[0], 5e18);
        nft.mint(members[0], 3);

        assertTrue(one.isActive(), "active");
        assertEq(one.combinedNativeBalance(), 1 ether, "native");
        assertEq(one.combinedERC20Balance(address(token)), 5e18, "erc20");
        assertEq(one.combinedERC721Balance(address(nft)), 3, "erc721");
        assertTrue(one.meetsERC721Threshold(address(nft), 3), "threshold");
    }

    function test_RevertWhen_InactiveCombinedNativeBalance() public {
        vm.deal(primary, 1 ether);
        _deactivate();
        vm.expectRevert(ONEIdentity.InactiveIdentity.selector);
        one.combinedNativeBalance();
    }

    function test_RevertWhen_InactiveCombinedERC20Balance() public {
        token.mint(primary, 100e18);
        _deactivate();
        vm.expectRevert(ONEIdentity.InactiveIdentity.selector);
        one.combinedERC20Balance(address(token));
    }

    function test_RevertWhen_InactiveCombinedERC721Balance() public {
        nft.mint(primary, 9);
        _deactivate();
        vm.expectRevert(ONEIdentity.InactiveIdentity.selector);
        one.combinedERC721Balance(address(nft));
    }

    function test_RevertWhen_InactiveMeetsERC721Threshold() public {
        nft.mint(primary, 9);
        _deactivate();
        // Would comfortably pass on the primary's solo holdings; must still revert.
        vm.expectRevert(ONEIdentity.InactiveIdentity.selector);
        one.meetsERC721Threshold(address(nft), 1);
    }

    /// @dev The inactive check precedes token validation, so a bad token address is not
    ///      what surfaces — the identity's own status is the reason.
    function test_InactiveCheckPrecedesTokenValidation() public {
        _deactivate();
        vm.expectRevert(ONEIdentity.InactiveIdentity.selector);
        one.combinedERC20Balance(address(0xDEAD));
    }

    function test_MetadataRemainsQueryableWhileInactive() public {
        _deactivate();

        assertEq(one.primaryOwner(), primary, "primary still readable");
        assertEq(one.memberCount(), 1, "count still readable");
        assertFalse(one.isActive(), "status still readable");

        address[] memory current = one.getMembers();
        assertEq(current.length, 1, "primary alone");
        assertEq(current[0], primary, "primary is the survivor");
    }

    /// @dev The old ONE keeps answering metadata forever, even once the primary has
    ///      moved on to a new ONE, but never resumes aggregating.
    function test_OldIdentityStaysQueryableAfterPrimaryCreatesNewOne() public {
        _deactivate();
        address oldOne = address(one);

        // Primary is free again; build a fresh ONE with an unused wallet.
        address newPartner = vm.addr(pks[5]);
        address[] memory pair = new address[](2);
        pair[0] = primary;
        pair[1] = newPartner;
        pair = _sorted(pair);

        bytes32 saltB = keccak256("salt.b");
        ONERegistry.JoinAuth[] memory auths = _buildAuths(pair, primary, saltB, block.timestamp + 1 hours);
        vm.prank(primary);
        ONEIdentity newOne = ONEIdentity(registry.createOne(pair, saltB, auths));

        assertTrue(address(newOne) != oldOne, "distinct identity address");
        assertTrue(newOne.isActive(), "new ONE active");

        // Old identity: metadata intact, aggregation still closed.
        assertEq(ONEIdentity(oldOne).primaryOwner(), primary, "old primary readable");
        assertEq(ONEIdentity(oldOne).memberCount(), 1, "old membership frozen");
        assertFalse(ONEIdentity(oldOne).isActive(), "old ONE still inactive");
        vm.expectRevert(ONEIdentity.InactiveIdentity.selector);
        ONEIdentity(oldOne).combinedNativeBalance();

        // The new ONE aggregates normally.
        vm.deal(pair[0], 1 ether);
        vm.deal(pair[1], 2 ether);
        assertEq(newOne.combinedNativeBalance(), 3 ether, "new ONE aggregates");
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

    function test_RevertWhen_CollectionReturnsNoData() public {
        address empty = address(new EmptyReturnERC721());
        vm.expectRevert(
            abi.encodeWithSelector(ONEIdentity.ERC721BalanceCallFailed.selector, empty, members[0])
        );
        one.combinedERC721Balance(empty);
    }

    /// @dev A hostile collection returning 64 KiB with a plausible balance in the first
    ///      word must be rejected outright — not truncated to that word, and not allowed
    ///      to inflate our memory. The bounded reader copies one word but checks
    ///      `returndatasize()`, so the oversized reply fails the exact-32-bytes test.
    function test_RevertWhen_CollectionReturnsExcessiveData() public {
        HugeReturndataERC721 hostile = new HugeReturndataERC721();
        vm.expectRevert(
            abi.encodeWithSelector(ONEIdentity.ERC721BalanceCallFailed.selector, address(hostile), members[0])
        );
        one.combinedERC721Balance(address(hostile));
    }

    function test_RevertWhen_ERC20ReturnsExcessiveData() public {
        HugeReturndataERC721 hostile = new HugeReturndataERC721();
        vm.expectPartialRevert(ONEIdentity.ERC20BalanceCallFailed.selector);
        one.combinedERC20Balance(address(hostile));
    }

    /// @dev Reading a hostile 64 KiB responder must not cost meaningfully more than
    ///      reading a well-behaved one: the return buffer is pinned at one word, so we
    ///      never pay to expand memory for the callee's output.
    function test_ExcessiveReturndataDoesNotInflateCallerGas() public {
        HugeReturndataERC721 hostile = new HugeReturndataERC721();
        address wellBehaved = address(new RevertingERC721());

        uint256 before = gasleft();
        try one.combinedERC721Balance(wellBehaved) {} catch {}
        uint256 revertingCost = before - gasleft();

        before = gasleft();
        try one.combinedERC721Balance(address(hostile)) {} catch {}
        uint256 hostileCost = before - gasleft();

        // The hostile contract burns its own gas building 64 KiB, but the overhead
        // charged to us stays bounded rather than scaling with its output.
        assertLt(hostileCost, revertingCost + 30_000, "no returndata-driven gas blowup");
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
