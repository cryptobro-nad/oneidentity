// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @dev Minimal balance-only ERC-20 stand-in. Enough for aggregation tests.
contract MockERC20 {
    string public name = "Mock";
    string public symbol = "MCK";
    uint8 public decimals = 18;
    mapping(address => uint256) public balanceOf;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }
}

/// @dev Minimal balance-only ERC-721 stand-in.
contract MockERC721 {
    mapping(address => uint256) public balanceOf;

    function mint(address to, uint256 count) external {
        balanceOf[to] += count;
    }
}

/// @dev A collection whose balanceOf always reverts.
contract RevertingERC721 {
    error Nope();

    function balanceOf(address) external pure returns (uint256) {
        revert Nope();
    }
}

/// @dev A contract that answers balanceOf with malformed (short) return data.
contract MalformedERC721 {
    fallback() external {
        assembly {
            mstore(0, 1)
            return(0, 8)
        }
    }
}

/// @dev A contract that answers balanceOf with no return data at all.
contract EmptyReturnERC721 {
    fallback() external {
        assembly {
            return(0, 0)
        }
    }
}

/// @dev Hostile collection: returns 64 KiB of returndata, the first word of which is a
///      plausible balance. A caller that copied all returndata would pay for ~2048 words
///      of memory expansion; a caller that only checked the first word would accept the
///      forged balance. The bounded reader must do neither.
contract HugeReturndataERC721 {
    uint256 public constant RETURN_BYTES = 65_536;

    fallback() external {
        assembly {
            // First word looks like a balance of 1_000_000.
            mstore(0x00, 1000000)
            return(0x00, 65536)
        }
    }
}
