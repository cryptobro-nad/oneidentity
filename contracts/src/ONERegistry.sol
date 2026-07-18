// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

import {IONERegistry} from "./IONERegistry.sol";
import {ONEIdentity} from "./ONEIdentity.sol";

/// @title ONERegistry
/// @notice The single mutable source of membership truth for every ONE identity.
/// @dev Identities are deployed by this registry and hold no member list of their own;
///      they read back through {membersOf}. Creation requires an EIP-712 `JoinOne`
///      signature from every secondary wallet, submitted by the primary wallet.
contract ONERegistry is IONERegistry, EIP712 {
    // ---------------------------------------------------------------------
    // Types
    // ---------------------------------------------------------------------

    /// @dev Storage record for one ONE. `members` stays sorted ascending at all times.
    struct One {
        address primary;
        bool exists;
        address[] members;
    }

    /// @notice Per-secondary authorisation supplied by the primary at creation time.
    /// @dev The nonce is *not* supplied — it is read from {nonces} so a signature can
    ///      never be replayed after the wallet's nonce advances.
    struct JoinAuth {
        uint256 deadline;
        bytes signature;
    }

    // ---------------------------------------------------------------------
    // Constants
    // ---------------------------------------------------------------------

    uint256 public constant MIN_MEMBERS = 2;
    uint256 public constant MAX_MEMBERS = 5;

    bytes32 public constant JOIN_ONE_TYPEHASH = keccak256(
        "JoinOne(address wallet,address primaryWallet,bytes32 membersHash,bytes32 salt,uint256 nonce,uint256 deadline)"
    );

    // ---------------------------------------------------------------------
    // Storage
    // ---------------------------------------------------------------------

    mapping(address one => One) private _ones;

    /// @notice The active ONE a wallet currently belongs to, or address(0) if free.
    mapping(address wallet => address one) public activeOneOf;

    /// @notice Signature nonce per wallet. Consumed on every accepted JoinOne signature.
    mapping(address wallet => uint256) public nonces;

    /// @notice Guards against reusing a (primary, membersHash, salt) creation intent.
    mapping(bytes32 creationSalt => bool) public creationSaltUsed;

    /// @notice Every ONE ever created, active or not.
    address[] private _allOnes;

    // ---------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------

    event OneCreated(address indexed one, address indexed primary, address[] members, bytes32 salt);
    event MemberRemoved(address indexed one, address indexed wallet, address indexed removedBy);
    event OneDeactivated(address indexed one, address indexed primary);

    // ---------------------------------------------------------------------
    // Errors
    // ---------------------------------------------------------------------

    error InvalidMemberCount(uint256 provided);
    error ZeroAddressMember(uint256 index);
    error DuplicateMember(address wallet, uint256 index);
    error UnsortedMembers(uint256 index);
    error PrimaryNotInMemberList(address primary);
    error WalletAlreadyInActiveOne(address wallet, address one);
    error AuthCountMismatch(uint256 expected, uint256 provided);
    error SignatureExpired(address wallet, uint256 deadline);
    error InvalidSignature(address expected, address recovered);
    error CreationSaltAlreadyUsed(bytes32 salt);
    error UnknownOne(address one);
    error OneNotActive(address one);
    error CannotRemovePrimary(address primary);
    error NotAuthorizedToRemove(address caller);
    error NotAMember(address one, address wallet);

    // ---------------------------------------------------------------------
    // Construction
    // ---------------------------------------------------------------------

    constructor() EIP712("ONE", "1") {}

    // ---------------------------------------------------------------------
    // Creation
    // ---------------------------------------------------------------------

    /// @notice Create a new ONE identity. Must be called by the intended primary wallet.
    /// @param sortedMembers Primary + all secondaries, strictly ascending, no zero address.
    /// @param salt          Caller-chosen salt binding this creation intent; also seeds CREATE2.
    /// @param auths         One entry per secondary, in the same order the secondaries appear
    ///                      in `sortedMembers` (i.e. `sortedMembers` with the primary removed).
    /// @return one The address of the freshly deployed ONEIdentity.
    function createOne(address[] calldata sortedMembers, bytes32 salt, JoinAuth[] calldata auths)
        external
        returns (address one)
    {
        _validateMemberList(sortedMembers);
        _requireAllWalletsFree(sortedMembers, msg.sender);

        if (auths.length != sortedMembers.length - 1) {
            revert AuthCountMismatch(sortedMembers.length - 1, auths.length);
        }

        bytes32 creationSalt = _consumeCreationSalt(msg.sender, sortedMembers, salt);
        _verifyAllJoins(sortedMembers, msg.sender, keccak256(abi.encode(sortedMembers)), salt, auths);

        one = address(new ONEIdentity{salt: creationSalt}(address(this)));
        _record(one, msg.sender, sortedMembers);

        emit OneCreated(one, msg.sender, sortedMembers, salt);
    }

    /// @notice Address a ONE would deploy to for a given creation intent.
    /// @dev Lets the frontend show the ONE address before the transaction is sent.
    function predictOneAddress(address primary, address[] calldata sortedMembers, bytes32 salt)
        external
        view
        returns (address)
    {
        bytes32 membersHash = keccak256(abi.encode(sortedMembers));
        bytes32 creationSalt = keccak256(abi.encode(primary, membersHash, salt));
        bytes32 initCodeHash =
            keccak256(abi.encodePacked(type(ONEIdentity).creationCode, abi.encode(address(this))));
        return address(
            uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), address(this), creationSalt, initCodeHash))))
        );
    }

    // ---------------------------------------------------------------------
    // Removal
    // ---------------------------------------------------------------------

    /// @notice Remove a secondary wallet. Callable by that wallet itself or by the primary.
    /// @dev The primary can never be removed; when the last secondary leaves the ONE
    ///      goes inactive and every wallet — including the primary — is freed.
    function removeMember(address one, address wallet) external {
        One storage record = _ones[one];
        if (!record.exists) revert UnknownOne(one);
        if (record.members.length < MIN_MEMBERS) revert OneNotActive(one);

        address primary = record.primary;
        if (wallet == primary) revert CannotRemovePrimary(primary);
        if (msg.sender != wallet && msg.sender != primary) revert NotAuthorizedToRemove(msg.sender);

        uint256 len = record.members.length;
        uint256 index = type(uint256).max;
        for (uint256 i = 0; i < len; ++i) {
            if (record.members[i] == wallet) {
                index = i;
                break;
            }
        }
        if (index == type(uint256).max) revert NotAMember(one, wallet);

        // Ordered shift keeps `members` sorted ascending, which membersHash depends on.
        for (uint256 i = index; i + 1 < len; ++i) {
            record.members[i] = record.members[i + 1];
        }
        record.members.pop();
        activeOneOf[wallet] = address(0);

        emit MemberRemoved(one, wallet, msg.sender);

        // Only the primary is left: the ONE is permanently inactive but stays queryable,
        // and the primary is freed to create a new ONE.
        if (record.members.length < MIN_MEMBERS) {
            activeOneOf[primary] = address(0);
            emit OneDeactivated(one, primary);
        }
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    function primaryOf(address one) external view returns (address) {
        if (!_ones[one].exists) revert UnknownOne(one);
        return _ones[one].primary;
    }

    function membersOf(address one) external view returns (address[] memory) {
        if (!_ones[one].exists) revert UnknownOne(one);
        return _ones[one].members;
    }

    function memberCountOf(address one) external view returns (uint256) {
        if (!_ones[one].exists) revert UnknownOne(one);
        return _ones[one].members.length;
    }

    function isActive(address one) external view returns (bool) {
        if (!_ones[one].exists) revert UnknownOne(one);
        return _ones[one].members.length >= MIN_MEMBERS;
    }

    function exists(address one) external view returns (bool) {
        return _ones[one].exists;
    }

    function totalOnes() external view returns (uint256) {
        return _allOnes.length;
    }

    function oneAt(uint256 index) external view returns (address) {
        return _allOnes[index];
    }

    /// @notice EIP-712 digest a wallet must sign to join a ONE.
    /// @dev Exposed so the frontend and tests derive the digest the same way the registry does.
    function joinOneDigest(
        address wallet,
        address primaryWallet,
        bytes32 membersHash,
        bytes32 salt,
        uint256 nonce,
        uint256 deadline
    ) public view returns (bytes32) {
        return _hashTypedDataV4(
            keccak256(
                abi.encode(JOIN_ONE_TYPEHASH, wallet, primaryWallet, membersHash, salt, nonce, deadline)
            )
        );
    }

    /// @notice Canonical members hash. Callers must pass the list already sorted.
    function membersHashOf(address[] calldata sortedMembers) external pure returns (bytes32) {
        return keccak256(abi.encode(sortedMembers));
    }

    // ---------------------------------------------------------------------
    // Internals
    // ---------------------------------------------------------------------

    /// @dev Enforces size, zero-address, duplicate and ordering rules.
    ///      Strict ascending ordering alone would not exclude address(0) (it sorts first),
    ///      so the zero check is separate and explicit.
    function _validateMemberList(address[] calldata sortedMembers) private pure {
        uint256 count = sortedMembers.length;
        if (count < MIN_MEMBERS || count > MAX_MEMBERS) revert InvalidMemberCount(count);

        for (uint256 i = 0; i < count; ++i) {
            if (sortedMembers[i] == address(0)) revert ZeroAddressMember(i);
            if (i > 0) {
                if (sortedMembers[i] == sortedMembers[i - 1]) revert DuplicateMember(sortedMembers[i], i);
                if (sortedMembers[i] < sortedMembers[i - 1]) revert UnsortedMembers(i);
            }
        }
    }

    /// @dev Every member must be unbound, and the submitter must be one of them.
    function _requireAllWalletsFree(address[] calldata sortedMembers, address primary) private view {
        bool primaryPresent;
        for (uint256 i = 0; i < sortedMembers.length; ++i) {
            address member = sortedMembers[i];
            address existing = activeOneOf[member];
            if (existing != address(0)) revert WalletAlreadyInActiveOne(member, existing);
            if (member == primary) primaryPresent = true;
        }
        if (!primaryPresent) revert PrimaryNotInMemberList(primary);
    }

    /// @dev Burns the (primary, membersHash, salt) intent and returns the CREATE2 salt.
    function _consumeCreationSalt(address primary, address[] calldata sortedMembers, bytes32 salt)
        private
        returns (bytes32 creationSalt)
    {
        creationSalt = keccak256(abi.encode(primary, keccak256(abi.encode(sortedMembers)), salt));
        if (creationSaltUsed[creationSalt]) revert CreationSaltAlreadyUsed(salt);
        creationSaltUsed[creationSalt] = true;
    }

    /// @dev Verifies one signature per secondary. `authIndex` walks `auths` while `i`
    ///      walks `sortedMembers`, so the two stay aligned once the primary is skipped.
    function _verifyAllJoins(
        address[] calldata sortedMembers,
        address primary,
        bytes32 membersHash,
        bytes32 salt,
        JoinAuth[] calldata auths
    ) private {
        uint256 authIndex;
        for (uint256 i = 0; i < sortedMembers.length; ++i) {
            address member = sortedMembers[i];
            if (member == primary) continue;
            _verifyJoin(member, primary, membersHash, salt, auths[authIndex]);
            unchecked {
                ++authIndex;
            }
        }
    }

    /// @dev Writes the membership record and binds every wallet to the new ONE.
    function _record(address one, address primary, address[] calldata sortedMembers) private {
        One storage rec = _ones[one];
        rec.primary = primary;
        rec.exists = true;
        for (uint256 i = 0; i < sortedMembers.length; ++i) {
            rec.members.push(sortedMembers[i]);
            activeOneOf[sortedMembers[i]] = one;
        }
        _allOnes.push(one);
    }

    /// @dev Recovers the JoinOne signature and consumes the wallet's nonce.
    ///      Every field except `deadline` is reconstructed from registry state or the
    ///      primary's calldata, so a signature over a different wallet, primary, member
    ///      set, salt or nonce recovers to the wrong address and is rejected here.
    function _verifyJoin(
        address wallet,
        address primary,
        bytes32 membersHash,
        bytes32 salt,
        JoinAuth calldata auth
    ) private {
        if (block.timestamp > auth.deadline) revert SignatureExpired(wallet, auth.deadline);

        uint256 nonce = nonces[wallet];
        bytes32 digest = joinOneDigest(wallet, primary, membersHash, salt, nonce, auth.deadline);

        (address recovered, ECDSA.RecoverError err,) = ECDSA.tryRecover(digest, auth.signature);
        if (err != ECDSA.RecoverError.NoError || recovered != wallet) {
            revert InvalidSignature(wallet, recovered);
        }

        unchecked {
            nonces[wallet] = nonce + 1;
        }
    }
}
