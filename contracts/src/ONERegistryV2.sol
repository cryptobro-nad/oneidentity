// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import {Create2} from "@openzeppelin/contracts/utils/Create2.sol";

import {IONERegistryV2} from "./IONERegistryV2.sol";
import {ONEIdentityV2} from "./ONEIdentityV2.sol";

/// @notice The single field V2 needs from the immutable V1 registry.
interface IV1Active {
    function activeOneOf(address wallet) external view returns (address);
}

/// @title ONERegistryV2
/// @notice Membership registry for the transfer-linked Verified ONE V2 flow.
///
/// @dev Trust model — READ THIS.
///      A secondary wallet NEVER touches this contract. Its control is proven by a
///      bare native-MON transfer to the primary, which an off-chain VERIFIER detects
///      and attests to. A link is only accepted when accompanied by that verifier's
///      signed {LinkAttestation}: the contract cryptographically enforces the
///      attestation before writing membership, so a primary calling in directly can
///      NOT add an arbitrary wallet. The primary still submits the final transaction
///      (or, on the hidden relayer path, co-signs it); ONE never touches funds — the
///      MON moves directly secondary→primary.
///
///      The verifier is a single, immutable authorised key (EOA or, via ERC-1271, a
///      multisig). It cannot edit memberships, move funds, remove wallets, or upgrade
///      anything — it can only attest that a challenge's transfer was observed. See
///      docs/verified-one-v2.md for the verifier-key configuration and rotation.
///
///      Immutable invariants: 2..20 members (cap fixed), one active ONE per wallet,
///      V2 refuses wallets already active in V1 or V2, the primary is never removable
///      (a member may remove itself), and every join/leave is an event.
contract ONERegistryV2 is IONERegistryV2, EIP712 {
    // ---------------------------------------------------------------------
    // Constants (immutable policy — no governance)
    // ---------------------------------------------------------------------

    uint256 public constant MIN_MEMBERS = 2;
    uint256 public constant MAX_MEMBERS = 20; // includes the primary; fixed forever
    uint16 public constant VERSION = 2;

    /// @notice EIP-712 type of the verifier's off-chain attestation.
    bytes32 public constant LINK_ATTESTATION_TYPEHASH = keccak256(
        "LinkAttestation(address primary,address secondary,address one,bytes32 challengeId,uint256 amount,bytes32 txHash,uint256 txBlock,uint256 deadline,uint256 verifierNonce)"
    );

    // ---------------------------------------------------------------------
    // Immutable dependencies
    // ---------------------------------------------------------------------

    /// @notice The deployed V1 registry, read-only, to reject wallets bound in V1.
    IV1Active public immutable v1;

    /// @notice The authorised off-chain verifier. Its signature over a {LinkAttestation}
    ///         is required for every link. Rotatable ONLY by {verifierAdmin} via
    ///         {setVerifier}, so a compromised key can be revoked immediately.
    address public verifier;

    /// @notice The sole authority permitted to rotate the verifier — a designated
    ///         multisig. Immutable. Its ONLY power is {setVerifier}: it cannot link
    ///         or remove wallets, modify identities, move funds, change the member
    ///         cap, upgrade, pause, or deactivate anything.
    address public immutable verifierAdmin;

    // ---------------------------------------------------------------------
    // Types
    // ---------------------------------------------------------------------

    /// @dev What the verifier signs after detecting a challenge's transfer. Every
    ///      field is bound into the signature; the EIP-712 domain also binds the
    ///      chain id and this registry, so an attestation is useless anywhere else.
    struct LinkAttestation {
        address primary; // the connected primary
        address secondary; // the wallet being linked
        address one; // existing, or predicted for a first link
        bytes32 challengeId; // unique per challenge
        uint256 amount; // exact verification amount (wei)
        bytes32 txHash; // the detected transfer
        uint256 txBlock; // its block number
        uint256 deadline; // attestation validity
        uint256 verifierNonce; // verifier-side replay dimension
    }

    struct One {
        address primary;
        bool exists;
        address[] members; // unsorted; includes the primary
    }

    // ---------------------------------------------------------------------
    // Storage
    // ---------------------------------------------------------------------

    mapping(address one => One) private _ones;

    /// @notice The active ONE a wallet currently belongs to in V2, or 0 if free.
    mapping(address wallet => address one) public activeOneOf;

    /// @notice Per-primary creation counter, seeding a unique CREATE2 identity each time.
    mapping(address primary => uint256) public creationCount;

    /// @notice A challenge id may back at most one link.
    mapping(bytes32 challengeId => bool) public challengeUsed;

    /// @notice A transfer transaction may back at most one link.
    mapping(bytes32 txHash => bool) public transferUsed;

    address[] private _allOnes;

    // ---------------------------------------------------------------------
    // Events (rich enough to reconstruct join/leave history by block/timestamp)
    // ---------------------------------------------------------------------

    event OneCreated(address indexed one, address indexed primary);
    event MemberLinked(address indexed one, address indexed wallet, bytes32 indexed challengeId);
    event MemberRemoved(address indexed one, address indexed wallet, address indexed removedBy);
    event IdentityDeactivated(address indexed one, address indexed primary);
    event VerifierChanged(address indexed previousVerifier, address indexed newVerifier);

    // ---------------------------------------------------------------------
    // Errors
    // ---------------------------------------------------------------------

    error ZeroAddress();
    error NotVerifierAdmin(address caller);
    error ZeroWallet();
    error SameWallet(address wallet);
    error WalletAlreadyInV2(address wallet, address one);
    error WalletActiveInV1(address wallet, address one);
    error NotThePrimary(address caller, address primary);
    error CallerNotAttestedPrimary(address caller, address attestedPrimary);
    error MemberCapReached(uint256 cap);
    error UnknownOne(address one);
    error OneNotActive(address one);
    error CannotRemovePrimary(address primary);
    error NotAuthorizedToRemove(address caller);
    error NotAMember(address one, address wallet);
    error AttestationExpired(uint256 deadline);
    error ChallengeAlreadyUsed(bytes32 challengeId);
    error TransferAlreadyUsed(bytes32 txHash);
    error InvalidAttestation();
    error InvalidPrimaryConsent(address primary);
    error IdentityMismatch(address expected, address actual);

    // ---------------------------------------------------------------------
    // Construction
    // ---------------------------------------------------------------------

    /// @param v1Registry     The immutable V1 ONERegistry address on this chain.
    /// @param verifier_      The initial authorised attester (EOA or ERC-1271 contract).
    /// @param verifierAdmin_ The multisig allowed to rotate the verifier — nothing else.
    constructor(address v1Registry, address verifier_, address verifierAdmin_) EIP712("ONE Link", "1") {
        if (verifier_ == address(0) || verifierAdmin_ == address(0)) revert ZeroAddress();
        v1 = IV1Active(v1Registry);
        verifier = verifier_;
        verifierAdmin = verifierAdmin_;
    }

    // ---------------------------------------------------------------------
    // Verifier rotation (the ONLY privileged action in this contract)
    // ---------------------------------------------------------------------

    /// @notice Rotate the authorised verifier. Callable ONLY by {verifierAdmin}.
    /// @dev Emergency-capable (no timelock): a compromised verifier can be revoked
    ///      at once. Rotation touches nothing else — used challenge ids, used
    ///      transfer hashes, identities, and memberships all persist. Attestations
    ///      from the previous verifier stop being accepted the instant this returns;
    ///      attestations from the new verifier are not valid before it.
    function setVerifier(address newVerifier) external {
        if (msg.sender != verifierAdmin) revert NotVerifierAdmin(msg.sender);
        if (newVerifier == address(0)) revert ZeroAddress();
        emit VerifierChanged(verifier, newVerifier);
        verifier = newVerifier;
    }

    // ---------------------------------------------------------------------
    // Linking — verifier-attested, primary-authorised
    // ---------------------------------------------------------------------

    /// @notice Link `att.secondary` into the caller's Verified ONE. The caller must be
    ///         the attested primary, and the verifier must have signed `att`. Creates
    ///         the ONE on first use.
    /// @dev A direct call with no/invalid verifier signature reverts — this is the
    ///      on-chain enforcement that a transfer was detected. ONE never touches funds.
    function approveLink(LinkAttestation calldata att, bytes calldata verifierSig)
        external
        returns (address one)
    {
        if (msg.sender != att.primary) revert CallerNotAttestedPrimary(msg.sender, att.primary);
        _consumeAttestation(att, verifierSig);
        one = _linkAndBind(att);
    }

    /// @notice Relayer / smart-contract-wallet variant: the verifier attests AND the
    ///         primary co-signs the same attestation (EOA or ERC-1271), so anyone may
    ///         submit. NOT surfaced in the launch UI.
    function confirmLinkWithSig(
        LinkAttestation calldata att,
        bytes calldata verifierSig,
        bytes calldata primarySig
    ) external returns (address one) {
        bytes32 digest = _consumeAttestation(att, verifierSig);
        if (!SignatureChecker.isValidSignatureNow(att.primary, digest, primarySig)) {
            revert InvalidPrimaryConsent(att.primary);
        }
        one = _linkAndBind(att);
    }

    /// @dev Validates the verifier attestation and burns its single-use ids. Returns
    ///      the signed digest so callers can also check a co-signature over it. Marks
    ///      the ids used BEFORE the link so a reverting {_link} rolls the marks back.
    function _consumeAttestation(LinkAttestation calldata att, bytes calldata verifierSig)
        internal
        returns (bytes32 digest)
    {
        if (block.timestamp > att.deadline) revert AttestationExpired(att.deadline);
        if (challengeUsed[att.challengeId]) revert ChallengeAlreadyUsed(att.challengeId);
        if (transferUsed[att.txHash]) revert TransferAlreadyUsed(att.txHash);

        digest = _hashTypedDataV4(
            keccak256(
                abi.encode(
                    LINK_ATTESTATION_TYPEHASH,
                    att.primary,
                    att.secondary,
                    att.one,
                    att.challengeId,
                    att.amount,
                    att.txHash,
                    att.txBlock,
                    att.deadline,
                    att.verifierNonce
                )
            )
        );
        if (!SignatureChecker.isValidSignatureNow(verifier, digest, verifierSig)) revert InvalidAttestation();

        challengeUsed[att.challengeId] = true;
        transferUsed[att.txHash] = true;
    }

    /// @dev Performs the create-or-add and enforces the attested identity address.
    function _linkAndBind(LinkAttestation calldata att) internal returns (address one) {
        one = _link(att.primary, att.secondary, att.challengeId);
        if (one != att.one) revert IdentityMismatch(att.one, one);
    }

    /// @dev Shared create-or-add logic.
    function _link(address primary, address secondary, bytes32 challengeId) internal returns (address one) {
        if (secondary == address(0)) revert ZeroWallet();
        if (primary == secondary) revert SameWallet(primary);

        _requireFree(secondary);

        one = activeOneOf[primary];
        if (one == address(0)) {
            // First link → create the ONE {primary, secondary}.
            _requireFree(primary);
            one = _deployIdentity(primary);

            One storage rec = _ones[one];
            rec.primary = primary;
            rec.exists = true;
            rec.members.push(primary);
            rec.members.push(secondary);

            activeOneOf[primary] = one;
            activeOneOf[secondary] = one;
            _allOnes.push(one);

            emit OneCreated(one, primary);
            emit MemberLinked(one, primary, bytes32(0));
            emit MemberLinked(one, secondary, challengeId);
        } else {
            // Extend an existing ONE.
            One storage rec = _ones[one];
            if (rec.primary != primary) revert NotThePrimary(primary, rec.primary);
            if (rec.members.length >= MAX_MEMBERS) revert MemberCapReached(MAX_MEMBERS);

            rec.members.push(secondary);
            activeOneOf[secondary] = one;

            emit MemberLinked(one, secondary, challengeId);
        }
    }

    /// @dev A wallet must be bound in neither V2 nor the immutable V1 registry.
    function _requireFree(address wallet) internal view {
        address v2one = activeOneOf[wallet];
        if (v2one != address(0)) revert WalletAlreadyInV2(wallet, v2one);
        address v1one = v1.activeOneOf(wallet);
        if (v1one != address(0)) revert WalletActiveInV1(wallet, v1one);
    }

    /// @dev Deterministic CREATE2 deploy of a fresh identity for `primary`.
    function _deployIdentity(address primary) internal returns (address one) {
        uint256 n = creationCount[primary];
        unchecked {
            creationCount[primary] = n + 1;
        }
        bytes32 salt = keccak256(abi.encode(primary, n));
        one = address(new ONEIdentityV2{salt: salt}(address(this)));
    }

    /// @notice Address the NEXT identity for `primary` will deploy to.
    /// @dev The verifier uses this to bind an attestation to the exact ONE address for a first link.
    function predictIdentityAddress(address primary) external view returns (address) {
        bytes32 salt = keccak256(abi.encode(primary, creationCount[primary]));
        bytes32 initCodeHash = keccak256(abi.encodePacked(type(ONEIdentityV2).creationCode, abi.encode(address(this))));
        return Create2.computeAddress(salt, initCodeHash, address(this));
    }

    // ---------------------------------------------------------------------
    // Removal
    // ---------------------------------------------------------------------

    /// @notice Remove a secondary. Callable by the primary (evict) or the wallet itself (leave).
    /// @dev The primary is never removable. Dropping below two members deactivates the
    ///      ONE permanently and frees the primary to create a new one. Self-removal is
    ///      the on-chain recourse for a wallet that was linked without wanting to be.
    function removeMember(address one, address wallet) external {
        One storage rec = _ones[one];
        if (!rec.exists) revert UnknownOne(one);
        if (rec.members.length < MIN_MEMBERS) revert OneNotActive(one);

        address primary = rec.primary;
        if (wallet == primary) revert CannotRemovePrimary(primary);
        if (msg.sender != wallet && msg.sender != primary) revert NotAuthorizedToRemove(msg.sender);

        uint256 len = rec.members.length;
        uint256 index = type(uint256).max;
        for (uint256 i = 0; i < len; ++i) {
            if (rec.members[i] == wallet) {
                index = i;
                break;
            }
        }
        if (index == type(uint256).max) revert NotAMember(one, wallet);

        rec.members[index] = rec.members[len - 1];
        rec.members.pop();
        activeOneOf[wallet] = address(0);

        emit MemberRemoved(one, wallet, msg.sender);

        if (rec.members.length < MIN_MEMBERS) {
            activeOneOf[primary] = address(0);
            emit IdentityDeactivated(one, primary);
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

    function isMemberOf(address one, address wallet) external view returns (bool) {
        if (!_ones[one].exists) revert UnknownOne(one);
        address[] storage m = _ones[one].members;
        for (uint256 i = 0; i < m.length; ++i) {
            if (m[i] == wallet) return true;
        }
        return false;
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

    /// @notice EIP-712 domain separator (binds attestations to this chain and registry).
    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }
}
