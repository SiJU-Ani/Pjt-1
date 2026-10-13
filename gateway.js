const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const path = require('path');
const crypto = require('crypto');
const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');
const { recordCustodyEvent } = require('./blockchain/blockchainService');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// Port & Cryptographic config
const SERIAL_PORT_PATH = 'COM9'; // or /dev/ttyUSB0
const PUBLIC_KEY_HEX = "045E72E9407E837DA8699A072BD6C700195A143C93DB4B8CD646E256E4625D2FC125EA49C3F10DF0D241C9A60367F7D3CA4F96175AAC0764B8309EE2A44A9A437C";

function convertRawPublicKeyToPem(pubKeyHex) {
    const rawPublicKey = Buffer.from(pubKeyHex, 'hex');
    const spkiPrefix = Buffer.from([
        0x30, 0x59, 0x30, 0x13, 0x06, 0x07, 0x2A, 0x86, 0x48, 0xCE, 0x3D, 0x02, 0x01,
        0x06, 0x08, 0x2A, 0x86, 0x48, 0xCE, 0x3D, 0x03, 0x01, 0x07, 0x03, 0x42, 0x00
    ]);
    const derKey = Buffer.concat([spkiPrefix, rawPublicKey]);
    return `-----BEGIN PUBLIC KEY-----\n${derKey.toString('base64').match(/.{1,64}/g).join('\n')}\n-----END PUBLIC KEY-----`;
}

function trimLeadingZeros(buf) {
    let i = 0;
    while (i < buf.length - 1 && buf[i] === 0x00) i++;
    return buf.subarray(i);
}

function rawSignatureToDer(sigHex) {
    const raw = Buffer.from(sigHex, 'hex');
    let r = trimLeadingZeros(raw.subarray(0, 32));
    let s = trimLeadingZeros(raw.subarray(32, 64));
    if (r[0] & 0x80) r = Buffer.concat([Buffer.from([0x00]), r]);
    if (s[0] & 0x80) s = Buffer.concat([Buffer.from([0x00]), s]);
    const rDer = Buffer.concat([Buffer.from([0x02, r.length]), r]);
    const sDer = Buffer.concat([Buffer.from([0x02, s.length]), s]);
    return Buffer.concat([Buffer.from([0x30, rDer.length + sDer.length]), rDer, sDer]);
}

const publicKeyPem = convertRawPublicKeyToPem(PUBLIC_KEY_HEX);
const port = new SerialPort({ path: SERIAL_PORT_PATH, baudRate: 115200 });
const parser = port.pipe(new ReadlineParser({ delimiter: '\r\n' }));

parser.on('data', async (line) => {
    line = line.trim();
    if (!line.startsWith('{')) return;

    let packet;
    try {
        packet = JSON.parse(line);
    } catch {
        return;
    }

    const { payload, signature } = packet;
    if (!payload || !signature) return;

    const eventId = 'EVT_' + Date.now();

    // 1. Notify UI: Raw packet arrived
    io.emit('telemetry:received', {
        id: eventId,
        receivedAt: new Date().toISOString(),
        payload: JSON.parse(payload),
        rawPayload: payload,
        signatureHex: signature
    });

    try {
        // 2. Cryptographic Check
        const derSignature = rawSignatureToDer(signature);
        const verifier = crypto.createVerify('SHA256');
        verifier.update(payload, 'utf8');
        verifier.end();
        const isVerified = verifier.verify(publicKeyPem, derSignature);

        io.emit('crypto:result', {
            id: eventId,
            verified: isVerified,
            derSignature: derSignature.toString('hex')
        });

        if (!isVerified) return;

        // 3. Blockchain Settlement
        io.emit('blockchain:pending', { id: eventId });

        const blockchainResult = await recordCustodyEvent({
            asset_id: 'ASSET_001',
            device_id: 'ESP32_001',
            receiver_id: 'Warehouse_Dock_42',
            timestamp: Math.floor(Date.now() / 1000),
            payload: payload
        });

        io.emit('blockchain:confirmed', {
            id: eventId,
            txHash: blockchainResult.transactionHash,
            blockNumber: blockchainResult.blockNumber,
            eventHash: blockchainResult.eventHash
        });

    } catch (err) {
        io.emit('pipeline:error', { id: eventId, error: err.message });
    }
});

server.listen(3000, () => {
    console.log('[Dashboard Server] Running at http://localhost:3000');
});