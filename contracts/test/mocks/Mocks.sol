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
