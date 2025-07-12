const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
    console.log(`Deploying EnhancedSwapAggregator to Vitruveo...`);

    // Contract configuration
    const ROUTER_ADDRESS = "0x3295fd27D6e44529c51Ef05a5d16Ca17Fb9e10A8";
    const FACTORY_ADDRESS = "0x12a3E5Da7F742789F7e8d3E95Cc5E62277dC3372";
    const WVTRU_ADDRESS = "0x3ccc3F22462cAe34766820894D04a40381201ef9";
    const USDC_ADDRESS = "0xbCfB3FCa16b12C7756CD6C24f1cC0AC0E38569CF";
    const FEE_PERCENTAGE = 20; // 0.2% in basis points
    const FEE_WALLET_ADDRESS = "0x0327Fab0F5A79C884b9E3fc611d490a19147D235"; // Your fee wallet

    // Get the deployer account
    const [deployer] = await hre.ethers.getSigners();
    const deployerAddress = await deployer.getAddress();
    console.log(`Deploying from account: ${deployerAddress}`);

    // Check balance - fix to use the provider to get the balance
    const balance = await hre.ethers.provider.getBalance(deployerAddress);
    console.log(`Deployer balance: ${hre.ethers.utils.formatEther(balance)} VTRU`);

    // Deploy the contract
    console.log("Deploying EnhancedSwapAggregator...");
    const SwapAggregator = await hre.ethers.getContractFactory("EnhancedSwapAggregator");

    const swapAggregator = await SwapAggregator.deploy(
        ROUTER_ADDRESS,
        FACTORY_ADDRESS,
        FEE_WALLET_ADDRESS,
        FEE_PERCENTAGE,
        WVTRU_ADDRESS,
        USDC_ADDRESS
    );

    console.log("Waiting for deployment transaction to be mined...");
    await swapAggregator.deployed();
    console.log(`EnhancedSwapAggregator deployed to: ${swapAggregator.address}`);

    // Additional configuration if needed
    console.log("Setting up initial configuration...");

    try {
        // Configure tier thresholds and discounts (optional)
        const tierThresholds = [
            hre.ethers.utils.parseEther("0"),
            hre.ethers.utils.parseEther("1000"),
            hre.ethers.utils.parseEther("10000"),
            hre.ethers.utils.parseEther("100000")
        ];
        const tierDiscounts = [0, 500, 1000, 2000]; // 0%, 5%, 10%, 20% in basis points

        console.log("Setting tier thresholds...");
        const setTiersTx = await swapAggregator.setTierThresholds(tierThresholds);
        await setTiersTx.wait();
        console.log("Tier thresholds configured");

        console.log("Setting tier discounts...");
        const setDiscountsTx = await swapAggregator.setTierDiscounts(tierDiscounts);
        await setDiscountsTx.wait();
        console.log("Tier discounts configured");

        console.log("Initial configuration complete!");
    } catch (error) {
        console.warn("Warning: Failed to set initial configuration:", error.message);
        console.log("You may need to set tier thresholds and discounts manually after deployment.");
    }

    // Get network information
    const network = await hre.ethers.provider.getNetwork();

    // Output deployment information
    console.log("\n==== Deployment Summary ====");
    console.log(`Network: ${network.name || 'vitruveo'} (chainId: ${network.chainId})`);
    console.log(`EnhancedSwapAggregator: ${swapAggregator.address}`);
    console.log(`Fee Collector: ${FEE_WALLET_ADDRESS}`);
    console.log(`Fee Percentage: ${FEE_PERCENTAGE / 100}%`);
    console.log(`WVTRU Token: ${WVTRU_ADDRESS}`);
    console.log(`USDC Token: ${USDC_ADDRESS}`);
    console.log("==========================\n");

    // Save deployment info to a file
    const deploymentInfo = {
        network: network.chainId,
        networkName: network.name || 'vitruveo',
        swapAggregator: swapAggregator.address,
        router: ROUTER_ADDRESS,
        factory: FACTORY_ADDRESS,
        feeCollector: FEE_WALLET_ADDRESS,
        feePercentage: FEE_PERCENTAGE,
        wvtru: WVTRU_ADDRESS,
        usdc: USDC_ADDRESS,
        timestamp: new Date().toISOString()
    };

    const deployDir = path.join(__dirname, '../deployments');
    if (!fs.existsSync(deployDir)) {
        fs.mkdirSync(deployDir);
    }

    fs.writeFileSync(
        path.join(deployDir, 'swap-aggregator-vitruveo.json'),
        JSON.stringify(deploymentInfo, null, 2)
    );

    console.log("Deployment information saved to ./deployments/swap-aggregator-vitruveo.json");
}

// Execute the deployment
main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("Deployment failed:", error);
        process.exit(1);
    });