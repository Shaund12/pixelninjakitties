// hardhat.config.cjs
require("@nomicfoundation/hardhat-ethers");
require("@nomicfoundation/hardhat-verify");      // ← add this line
require("dotenv").config();

module.exports = {
    solidity: "0.8.23",                            // match the contract
    networks: {
        vitruveo: {
            url: process.env.RPC_URL,             // https://rpc.vitruveo.xyz
            accounts: [process.env.DEPLOYER_KEY || process.env.PRIVATE_KEY]
        }
    },
    etherscan: {
        // any non-empty string is fine if the explorer ignores it
        apiKey: { vitruveo: "placeholder" },
        customChains: [
            {
                network: "vitruveo",
                chainId: 1490,
                urls: {
                    apiURL: "https://explorer-new.vitruveo.xyz/api",
                    browserURL: "https://explorer-new.vitruveo.xyz"
                }
            }
        ]
    }
};
