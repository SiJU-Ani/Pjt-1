const { ethers } = require("ethers");
require("dotenv").config();

const RPC_URL = process.env.BLOCKCHAIN_RPC_URL;
const PRIVATE_KEY = process.env.BLOCKCHAIN_PRIVATE_KEY;
const CONTRACT_ADDRESS =
    process.env.CUSTODY_CONTRACT_ADDRESS;

if (!RPC_URL) {
    throw new Error("BLOCKCHAIN_RPC_URL is missing");
}

if (!PRIVATE_KEY) {
    throw new Error("BLOCKCHAIN_PRIVATE_KEY is missing");
}

if (!CONTRACT_ADDRESS) {
    throw new Error("CUSTODY_CONTRACT_ADDRESS is missing");
}

const ABI = require("./CustodyLedgerABI.json");

const provider = new ethers.JsonRpcProvider(
    RPC_URL
);

const wallet = new ethers.Wallet(
    PRIVATE_KEY,
    provider
);

const contract = new ethers.Contract(
    CONTRACT_ADDRESS,
    ABI,
    wallet
);

console.log(
    "[Blockchain] Wallet:",
    wallet.address
);

console.log(
    "[Blockchain] Contract:",
    CONTRACT_ADDRESS
);


/*
 * Create deterministic event hash.
 */
function createEventHash(event) {

    const canonicalEvent = JSON.stringify({
        asset_id: event.asset_id,
        device_id: event.device_id,
        receiver_id: event.receiver_id,
        timestamp: event.timestamp,
        payload: event.payload
    });

    return ethers.keccak256(
        ethers.toUtf8Bytes(canonicalEvent)
    );
}


/*
 * Create deterministic event ID.
 */
function createEventId(eventHash) {

    return ethers.keccak256(
        ethers.toUtf8Bytes(
            `CUSTODY_EVENT:${eventHash}`
        )
    );
}


/*
 * Record verified event on Ethereum.
 */
async function recordCustodyEvent(event) {

    const eventHash =
        createEventHash(event);

    const eventId =
        createEventId(eventHash);

    /*
     * First version:
     * zero hash means this is the first event
     * in this chain.
     */
    const previousHash = ethers.ZeroHash;

    console.log("\n[Blockchain]");
    console.log("Event ID:", eventId);
    console.log("Event Hash:", eventHash);
    console.log("Previous Hash:", previousHash);

    const tx =
        await contract.recordCustodyEvent(
            eventId,
            eventHash,
            previousHash,
            event.asset_id,
            event.device_id,
            event.receiver_id,
            event.timestamp
        );

    console.log(
        "[Blockchain] Transaction:",
        tx.hash
    );

    const receipt = await tx.wait();

    console.log(
        "[Blockchain] Confirmed in block:",
        receipt.blockNumber
    );

    return {
        eventId,
        eventHash,
        previousHash,
        transactionHash: tx.hash,
        blockNumber: receipt.blockNumber
    };
}


module.exports = {
    recordCustodyEvent,
    createEventHash,
    createEventId
};