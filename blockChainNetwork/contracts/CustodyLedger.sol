// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract CustodyLedger {

    struct CustodyEvent {
        bytes32 eventHash;
        bytes32 previousHash;
        string assetId;
        string deviceId;
        string receiverId;
        uint256 timestamp;
    }

    mapping(bytes32 => CustodyEvent) private custodyEvents;

    event CustodyTransferred(
        bytes32 indexed eventId,
        bytes32 indexed eventHash,
        bytes32 indexed previousHash,
        string assetId,
        string deviceId,
        string receiverId,
        uint256 timestamp
    );

    function recordCustodyEvent(
        bytes32 eventId,
        bytes32 eventHash,
        bytes32 previousHash,
        string calldata assetId,
        string calldata deviceId,
        string calldata receiverId,
        uint256 timestamp
    ) external {

        require(
            custodyEvents[eventId].timestamp == 0,
            "Event already exists"
        );

        custodyEvents[eventId] = CustodyEvent({
            eventHash: eventHash,
            previousHash: previousHash,
            assetId: assetId,
            deviceId: deviceId,
            receiverId: receiverId,
            timestamp: timestamp
        });

        emit CustodyTransferred(
            eventId,
            eventHash,
            previousHash,
            assetId,
            deviceId,
            receiverId,
            timestamp
        );
    }

    function getCustodyEvent(
        bytes32 eventId
    )
        external
        view
        returns (
            bytes32 eventHash,
            bytes32 previousHash,
            string memory assetId,
            string memory deviceId,
            string memory receiverId,
            uint256 timestamp
        )
    {
        CustodyEvent memory eventData = custodyEvents[eventId];

        return (
            eventData.eventHash,
            eventData.previousHash,
            eventData.assetId,
            eventData.deviceId,
            eventData.receiverId,
            eventData.timestamp
        );
    }
}