import { network } from "hardhat";

async function main() {

    const { ethers } = await network.connect();

    const [signer] = await ethers.getSigners();

    console.log("Signer:", signer.address);

    const contractAddress =
        "0x5FbDB2315678afecb367f032d93F642f64180aa3";

    const ledger = await ethers.getContractAt(
        "CustodyLedger",
        contractAddress
    );

    // ------------------------------------
    // 1. Create event ID
    // ------------------------------------

    const eventId = ethers.keccak256(
        ethers.toUtf8Bytes("EVT-000001")
    );

    // ------------------------------------
    // 2. Create event hash
    // ------------------------------------

    const eventData =
        "ASSET_001|DEVICE_001|Warehouse_Dock_42|1726821000";

    const eventHash = ethers.keccak256(
        ethers.toUtf8Bytes(eventData)
    );

    // First event has no previous event
    const previousHash = ethers.ZeroHash;

    console.log("\n========== CUSTODY EVENT ==========");
    console.log("Event ID:      ", eventId);
    console.log("Event Hash:    ", eventHash);
    console.log("Previous Hash: ", previousHash);

    // ------------------------------------
    // 3. Submit transaction
    // ------------------------------------

    console.log("\nSubmitting transaction...");

    const tx = await ledger.recordCustodyEvent(
        eventId,
        eventHash,
        previousHash,
        "ASSET_001",
        "DEVICE_001",
        "Warehouse_Dock_42",
        1726821000
    );

    console.log("Transaction:", tx.hash);

    // ------------------------------------
    // 4. Wait for block confirmation
    // ------------------------------------

    const receipt = await tx.wait();

    console.log("Confirmed!");
    console.log("Block:", receipt.blockNumber);

    // ------------------------------------
    // 5. Read event back
    // ------------------------------------

    const result =
        await ledger.getCustodyEvent(eventId);

    console.log("\n========== STORED ON BLOCKCHAIN ==========");

    console.log("Event Hash:    ", result[0]);
    console.log("Previous Hash: ", result[1]);
    console.log("Asset ID:      ", result[2]);
    console.log("Device ID:     ", result[3]);
    console.log("Receiver ID:   ", result[4]);
    console.log("Timestamp:     ", result[5].toString());

    console.log("\nSUCCESS: Custody event verified from blockchain.");
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});