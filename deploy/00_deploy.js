// deploy/00_deploy.js
// ------------------------------------------------------------
// npx hardhat run deploy/00_deploy.js --network vitruveo
// ------------------------------------------------------------
import hardhat from "hardhat";
import dotenv from "dotenv";
dotenv.config();

const { ethers } = hardhat;

async function main() {
    /* 1 . constants ------------------------------------------------ */
    const USDC = "0xbCfB3FCa16b12C7756CD6C24f1cC0AC0E38569CF";   // Vitruveo mainnet
    const TREASURY = process.env.TREASURY;
    if (!TREASURY) throw new Error("Missing TREASURY env var");

    const humanPrice = process.env.INIT_PRICE_USDC || "0.01";   // default 0.01
    const ROYALTY_BPS = Number(process.env.ROYALTY_BPS || 500); // default 5 %
    const ID_OFFSET = Number(process.env.ID_OFFSET || 1);   // start IDs at 1

    const INIT_PRICE = ethers.parseUnits(humanPrice, 6);        // 6-decimals

    console.log(`→ Deploying AiNFTPaid
     price      : ${humanPrice} USDC
     treasury   : ${TREASURY}
     royalty    : ${ROYALTY_BPS / 100}% 
     idOffset   : ${ID_OFFSET}\n`);

    /* 2 . deploy --------------------------------------------------- */
    const Factory = await ethers.getContractFactory("AiNFTPaid");
    const nft = await Factory.deploy(
        USDC,
        TREASURY,
        INIT_PRICE,
        ROYALTY_BPS,
        ID_OFFSET
    );

    const receipt = await nft.deploymentTransaction().wait();
    console.log(`✔︎ Deployed at ${await nft.getAddress()}
     gas used : ${receipt.gasUsed}`);
}

main().catch(err => {
    console.error(err);
    process.exitCode = 1;
});
