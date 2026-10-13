import { network } from "hardhat";

async function main() {

    const { ethers } = await network.connect();

    console.log("Deploying CustodyLedger...");

    const CustodyLedger =
        await ethers.getContractFactory("CustodyLedger");

    const custodyLedger =
        await CustodyLedger.deploy();

    await custodyLedger.waitForDeployment();

    const address =
        await custodyLedger.getAddress();

    console.log("=================================");
    console.log("CustodyLedger deployed!");
    console.log("Contract:", address);
    console.log("=================================");
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});