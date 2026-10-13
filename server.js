// const express = require('express');
// const crypto = require('crypto');

// const {
//     recordCustodyEvent
// } = require('./blockchain/blockchainService');

// const app = express();

// app.use(express.json());


// // ============================================================
// // CONFIGURATION
// // ============================================================

// const PORT = 5000;
// const HOST = '0.0.0.0';


// // ============================================================
// // ATECC608A P-256 PUBLIC KEY
// // ============================================================
// //
// // Format:
// // 04 || X (32 bytes) || Y (32 bytes)
// // Total = 65 bytes
// //

// const PUBLIC_KEY_HEX =
//     "045E72E9407E837DA8699A072BD6C700195A143C93DB4B8CD646E256E4625D2FC125EA49C3F10DF0D241C9A60367F7D3CA4F96175AAC0764B8309EE2A44A9A437C";


// // ============================================================
// // ATECC608A RAW PUBLIC KEY -> PEM
// // ============================================================

// function convertRawPublicKeyToPem(pubKeyHex) {

//     const rawPublicKey = Buffer.from(pubKeyHex, 'hex');

//     // P-256 uncompressed EC public key must be 65 bytes
//     // 1 byte  = 0x04
//     // 32 bytes = X
//     // 32 bytes = Y

//     if (rawPublicKey.length !== 65) {
//         throw new Error(
//             `Invalid public key length: ${rawPublicKey.length}. Expected 65 bytes.`
//         );
//     }

//     if (rawPublicKey[0] !== 0x04) {
//         throw new Error(
//             'Invalid EC public key format. Expected 0x04 prefix.'
//         );
//     }

//     /*
//      * ASN.1 DER SubjectPublicKeyInfo prefix for:
//      *
//      * id-ecPublicKey
//      * prime256v1 / secp256r1
//      *
//      * This prefix represents:
//      *
//      * SEQUENCE {
//      *   SEQUENCE {
//      *     OBJECT IDENTIFIER id-ecPublicKey
//      *     OBJECT IDENTIFIER prime256v1
//      *   }
//      *   BIT STRING {
//      *     04 || X || Y
//      *   }
//      * }
//      */

//     const spkiPrefix = Buffer.from([
//         0x30, 0x59,
//         0x30, 0x13,
//         0x06, 0x07,
//         0x2A, 0x86, 0x48, 0xCE, 0x3D, 0x02, 0x01,
//         0x06, 0x08,
//         0x2A, 0x86, 0x48, 0xCE, 0x3D, 0x03, 0x01, 0x07,
//         0x03, 0x42,
//         0x00
//     ]);

//     const derKey = Buffer.concat([
//         spkiPrefix,
//         rawPublicKey
//     ]);

//     const base64Key = derKey.toString('base64');

//     const pem = [
//         '-----BEGIN PUBLIC KEY-----',
//         base64Key.match(/.{1,64}/g).join('\n'),
//         '-----END PUBLIC KEY-----'
//     ].join('\n');

//     return pem;
// }


// // ============================================================
// // ATECC608A RAW SIGNATURE -> DER SIGNATURE
// // ============================================================
// //
// // ATECC608A returns:
// //
// //     r = 32 bytes
// //     s = 32 bytes
// //
// // Total:
// //
// //     r || s = 64 bytes
// //
// // Node.js crypto.verify() expects ASN.1 DER:
// //
// //     SEQUENCE {
// //         INTEGER r
// //         INTEGER s
// //     }
// // ============================================================

// function rawSignatureToDer(signatureHex) {

//     const rawSignature = Buffer.from(signatureHex, 'hex');

//     if (rawSignature.length !== 64) {
//         throw new Error(
//             `Invalid signature length: ${rawSignature.length}. Expected 64 bytes.`
//         );
//     }

//     // First 32 bytes = r
//     let r = rawSignature.subarray(0, 32);

//     // Last 32 bytes = s
//     let s = rawSignature.subarray(32, 64);

//     // Remove unnecessary leading zeroes
//     r = trimLeadingZeros(r);
//     s = trimLeadingZeros(s);

//     // DER INTEGER is signed.
//     // If MSB is 1, prepend 0x00 so it remains positive.

//     if (r[0] & 0x80) {
//         r = Buffer.concat([
//             Buffer.from([0x00]),
//             r
//         ]);
//     }

//     if (s[0] & 0x80) {
//         s = Buffer.concat([
//             Buffer.from([0x00]),
//             s
//         ]);
//     }

//     // DER INTEGER r
//     const rDer = Buffer.concat([
//         Buffer.from([0x02, r.length]),
//         r
//     ]);

//     // DER INTEGER s
//     const sDer = Buffer.concat([
//         Buffer.from([0x02, s.length]),
//         s
//     ]);

//     // DER SEQUENCE
//     const sequenceLength =
//         rDer.length + sDer.length;

//     const derSignature = Buffer.concat([
//         Buffer.from([0x30, sequenceLength]),
//         rDer,
//         sDer
//     ]);

//     return derSignature;
// }


// // ============================================================
// // REMOVE LEADING ZERO BYTES
// // ============================================================

// function trimLeadingZeros(buffer) {

//     let start = 0;

//     while (
//         start < buffer.length - 1 &&
//         buffer[start] === 0x00
//     ) {
//         start++;
//     }

//     return buffer.subarray(start);
// }


// // ============================================================
// // BUILD PUBLIC KEY ONCE AT STARTUP
// // ============================================================

// let publicKeyPem;

// try {

//     publicKeyPem =
//         convertRawPublicKeyToPem(PUBLIC_KEY_HEX);

//     console.log(
//         '[Crypto] ATECC608A public key loaded.'
//     );

//     // Test that Node/OpenSSL can actually parse it
//     const publicKeyObject =
//         crypto.createPublicKey(publicKeyPem);

//     console.log(
//         '[Crypto] Public key type:',
//         publicKeyObject.asymmetricKeyType
//     );

// } catch (error) {

//     console.error(
//         '[Crypto] Public key initialization failed:',
//         error.message
//     );

//     process.exit(1);
// }


// // ============================================================
// // HEALTH CHECK
// // ============================================================

// app.get('/', (req, res) => {

//     res.json({
//         status: 'online',
//         service: 'ATECC608A Secure Telemetry Gateway',
//         crypto: 'ECDSA P-256 / SHA-256',
//         blockchain: 'Ethereum'
//     });
// });


// // ============================================================
// // TELEMETRY ENDPOINT
// // ============================================================

// app.post('/api/telemetry', async (req, res) => {

//     console.log('\n========================================');
//     console.log('[Gateway] Telemetry packet received');
//     console.log('========================================');

//     const { payload, signature } = req.body;


//     // --------------------------------------------------------
//     // Validate request
//     // --------------------------------------------------------

//     if (
//         typeof payload !== 'string' ||
//         typeof signature !== 'string'
//     ) {

//         console.log(
//             '[Gateway] Invalid request body.'
//         );

//         return res.status(400).json({

//             status: 'failed',

//             error:
//                 'payload and signature are required'
//         });
//     }


//     // --------------------------------------------------------
//     // Validate signature format
//     // --------------------------------------------------------

//     if (!/^[0-9a-fA-F]+$/.test(signature)) {

//         return res.status(400).json({

//             status: 'failed',

//             error:
//                 'Signature must contain hexadecimal characters only'
//         });
//     }


//     if (signature.length !== 128) {

//         return res.status(400).json({

//             status: 'failed',

//             error:
//                 `Invalid signature size. Received ${signature.length / 2} bytes, expected 64 bytes.`
//         });
//     }


//     try {

//         console.log('[Gateway] Payload:');
//         console.log(payload);

//         console.log(
//             '[Gateway] Raw signature:',
//             signature
//         );


//         // ----------------------------------------------------
//         // Convert ATECC608A raw signature to DER
//         // ----------------------------------------------------

//         const derSignature =
//             rawSignatureToDer(signature);

//         console.log(
//             '[Crypto] DER signature:',
//             derSignature.toString('hex')
//         );


//         // ----------------------------------------------------
//         // Verify ECDSA
//         // ----------------------------------------------------

//         const verifier =
//             crypto.createVerify('SHA256');

//         /*
//          * IMPORTANT:
//          *
//          * ESP32 performs:
//          *
//          *     SHA256(payload)
//          *
//          * and then asks the ATECC608A to sign
//          * that SHA-256 digest.
//          *
//          * Node's createVerify('SHA256') hashes
//          * the supplied payload before performing
//          * ECDSA verification.
//          *
//          * Therefore both sides operate on:
//          *
//          *     SHA256(payload)
//          */

//         verifier.update(payload, 'utf8');
//         verifier.end();

//         const isVerified =
//             verifier.verify(
//                 publicKeyPem,
//                 derSignature
//             );


//         // ----------------------------------------------------
//         // SUCCESS: ATECC608A SIGNATURE VALID
//         // ----------------------------------------------------

//         if (isVerified) {

//             console.log(
//                 '\n[VERIFIED] Cryptographic signature VALID'
//             );

//             console.log(
//                 '[Security] Payload authenticated successfully.'
//             );

//             console.log(
//                 '[Telemetry]',
//                 payload
//             );


//             // ====================================================
//             // BLOCKCHAIN INTEGRATION
//             // ====================================================

//             console.log(
//                 '[Blockchain] Preparing custody event...'
//             );


//             /*
//              * Prototype event metadata.
//              *
//              * Later these values can come from:
//              *
//              * - receiver request
//              * - asset registry
//              * - ESP32 configuration
//              * - custody/handoff API
//              */

//             const blockchainEvent = {

//                 asset_id: 'ASSET_001',

//                 device_id: 'ESP32_001',

//                 receiver_id: 'Warehouse_Dock_42',

//                 timestamp:
//                     Math.floor(Date.now() / 1000),

//                 payload: payload
//             };


//             try {

//                 /*
//                  * VERY IMPORTANT:
//                  *
//                  * This is called ONLY after the
//                  * ATECC608A signature has been
//                  * successfully verified.
//                  */

//                 const blockchainResult =
//                     await recordCustodyEvent(
//                         blockchainEvent
//                     );


//                 console.log(
//                     '[Blockchain] Event successfully recorded.'
//                 );

//                 console.log(
//                     '[Blockchain] Transaction:',
//                     blockchainResult.transactionHash
//                 );

//                 console.log(
//                     '[Blockchain] Block:',
//                     blockchainResult.blockNumber
//                 );

//                 console.log(
//                     '========================================\n'
//                 );


//                 // ------------------------------------------------
//                 // SUCCESS RESPONSE
//                 // ------------------------------------------------

//                 return res.status(200).json({

//                     status: 'verified',

//                     message:
//                         'Signature matches ATECC608A public key.',

//                     authenticated: true,

//                     payload: payload,

//                     blockchain: {

//                         network: 'local-hardhat',

//                         recorded: true,

//                         event_id:
//                             blockchainResult.eventId,

//                         event_hash:
//                             blockchainResult.eventHash,

//                         previous_hash:
//                             blockchainResult.previousHash,

//                         transaction_hash:
//                             blockchainResult.transactionHash,

//                         block_number:
//                             blockchainResult.blockNumber
//                     }
//                 });


//             } catch (blockchainError) {

//                 // ----------------------------------------------
//                 // BLOCKCHAIN FAILURE
//                 // ----------------------------------------------

//                 console.error(
//                     '\n[Blockchain Error]',
//                     blockchainError.message
//                 );

//                 console.log(
//                     '[Security] Device signature was valid.'
//                 );

//                 console.log(
//                     '[Blockchain] Event was NOT anchored.'
//                 );

//                 console.log(
//                     '========================================\n'
//                 );


//                 /*
//                  * The device IS authenticated,
//                  * but the blockchain record failed.
//                  *
//                  * Therefore we must NOT report
//                  * the event as successfully anchored.
//                  */

//                 return res.status(502).json({

//                     status:
//                         'verified_but_not_anchored',

//                     message:
//                         'ATECC608A signature is valid, but blockchain recording failed.',

//                     authenticated: true,

//                     payload: payload,

//                     blockchain: {

//                         recorded: false,

//                         error:
//                             blockchainError.message
//                     }
//                 });
//             }
//         }


//         // ----------------------------------------------------
//         // SIGNATURE INVALID
//         // ----------------------------------------------------

//         console.log(
//             '\n[SECURITY ALERT] Signature INVALID'
//         );

//         console.log(
//             '[Security] Packet rejected.'
//         );

//         console.log(
//             '========================================\n'
//         );

//         return res.status(401).json({

//             status: 'failed',

//             message:
//                 'Cryptographic signature validation failed.',

//             authenticated: false
//         });


//     } catch (error) {

//         console.error(
//             '\n[Crypto Error]',
//             error.message
//         );

//         console.log(
//             '========================================\n'
//         );

//         return res.status(500).json({

//             status: 'error',

//             error: error.message
//         });
//     }
// });


// // ============================================================
// // ERROR HANDLER
// // ============================================================

// app.use((err, req, res, next) => {

//     console.error(
//         '[Express Error]',
//         err.message
//     );

//     res.status(500).json({

//         status: 'error',

//         error: err.message
//     });
// });


// // ============================================================
// // START SERVER
// // ============================================================

// app.listen(PORT, HOST, () => {

//     console.log('');
//     console.log('========================================');
//     console.log('🚀 ATECC608A SECURITY GATEWAY');
//     console.log('========================================');

//     console.log(
//         `Server: http://10.164.50.23:${PORT}`
//     );

//     console.log(
//         `Endpoint: http://10.164.50.23:${PORT}/api/telemetry`
//     );

//     console.log(
//         'Protocol: HTTP'
//     );

//     console.log(
//         'Crypto: ECDSA P-256'
//     );

//     console.log(
//         'Hash: SHA-256'
//     );

//     console.log(
//         'Signature: ATECC608A'
//     );

//     console.log(
//         'Blockchain: Ethereum'
//     );

//     console.log(
//         '========================================'
//     );

//     console.log('');
// });

const crypto = require('crypto');
const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');
const { recordCustodyEvent } = require('./blockchain/blockchainService');

// ============================================================
// SERIAL PORT CONFIGURATION
// ============================================================
// Windows: 'COM3', 'COM4', etc.
// Linux/macOS: '/dev/ttyUSB0', '/dev/ttyACM0', '/dev/cu.usbserial-...'
const SERIAL_PORT_PATH = 'COM9';
const BAUD_RATE = 115200;

// ============================================================
// ATECC608A PUBLIC KEY (P-256)
// ============================================================
const PUBLIC_KEY_HEX =
    "045E72E9407E837DA8699A072BD6C700195A143C93DB4B8CD646E256E4625D2FC125EA49C3F10DF0D241C9A60367F7D3CA4F96175AAC0764B8309EE2A44A9A437C";

function convertRawPublicKeyToPem(pubKeyHex) {
    const rawPublicKey = Buffer.from(pubKeyHex, 'hex');
    if (rawPublicKey.length !== 65 || rawPublicKey[0] !== 0x04) {
        throw new Error('Invalid uncompressed P-256 public key.');
    }

    const spkiPrefix = Buffer.from([
        0x30, 0x59, 0x30, 0x13, 0x06, 0x07, 0x2A, 0x86, 0x48, 0xCE, 0x3D, 0x02, 0x01,
        0x06, 0x08, 0x2A, 0x86, 0x48, 0xCE, 0x3D, 0x03, 0x01, 0x07, 0x03, 0x42, 0x00
    ]);

    const derKey = Buffer.concat([spkiPrefix, rawPublicKey]);
    return [
        '-----BEGIN PUBLIC KEY-----',
        derKey.toString('base64').match(/.{1,64}/g).join('\n'),
        '-----END PUBLIC KEY-----'
    ].join('\n');
}

function trimLeadingZeros(buffer) {
    let start = 0;
    while (start < buffer.length - 1 && buffer[start] === 0x00) {
        start++;
    }
    return buffer.subarray(start);
}

function rawSignatureToDer(signatureHex) {
    const rawSignature = Buffer.from(signatureHex, 'hex');
    if (rawSignature.length !== 64) {
        throw new Error(`Invalid signature length: ${rawSignature.length}. Expected 64 bytes.`);
    }

    let r = trimLeadingZeros(rawSignature.subarray(0, 32));
    let s = trimLeadingZeros(rawSignature.subarray(32, 64));

    if (r[0] & 0x80) r = Buffer.concat([Buffer.from([0x00]), r]);
    if (s[0] & 0x80) s = Buffer.concat([Buffer.from([0x00]), s]);

    const rDer = Buffer.concat([Buffer.from([0x02, r.length]), r]);
    const sDer = Buffer.concat([Buffer.from([0x02, s.length]), s]);

    return Buffer.concat([
        Buffer.from([0x30, rDer.length + sDer.length]),
        rDer,
        sDer
    ]);
}

// ------------------------------------------------------------
// INITIALIZE KEYS & PORT
// ------------------------------------------------------------
const publicKeyPem = convertRawPublicKeyToPem(PUBLIC_KEY_HEX);
crypto.createPublicKey(publicKeyPem); // Validate parsing

const port = new SerialPort({ path: SERIAL_PORT_PATH, baudRate: BAUD_RATE });
const parser = port.pipe(new ReadlineParser({ delimiter: '\r\n' }));

console.log(`[USB Gateway] Listening on ${SERIAL_PORT_PATH} @ ${BAUD_RATE} baud...`);

// ------------------------------------------------------------
// SERIAL DATA INGESTION
// ------------------------------------------------------------
parser.on('data', async (line) => {
    line = line.trim();
    if (!line.startsWith('{')) return; // Ignore startup debug logs

    let packet;
    try {
        packet = JSON.parse(line);
    } catch {
        console.error('[Gateway] Malformed JSON packet:', line);
        return;
    }

    const { payload, signature } = packet;
    if (!payload || !signature || signature.length !== 128) {
        console.error('[Gateway] Missing or malformed payload/signature structure.');
        return;
    }

    console.log('\n========================================');
    console.log('[Gateway] Packet Ingested via USB:');
    console.log('Payload  :', payload);
    console.log('Signature:', signature);

    try {
        const derSignature = rawSignatureToDer(signature);

        const verifier = crypto.createVerify('SHA256');
        verifier.update(payload, 'utf8');
        verifier.end();

        const isVerified = verifier.verify(publicKeyPem, derSignature);

        if (!isVerified) {
            console.log('[SECURITY ALERT] Signature INVALID. Packet rejected.');
            return;
        }

        console.log('[VERIFIED] Cryptographic signature VALID');

        // Anchor event on blockchain
        const blockchainEvent = {
            asset_id: 'ASSET_001',
            device_id: 'ESP32_USB_NODE',
            receiver_id: 'Local_Workstation',
            timestamp: Math.floor(Date.now() / 1000),
            payload: payload
        };

        const blockchainResult = await recordCustodyEvent(blockchainEvent);
        console.log('[Blockchain] Event Anchored successfully.');
        console.log('[Blockchain] Tx Hash:', blockchainResult.transactionHash);
        console.log('[Blockchain] Block  :', blockchainResult.blockNumber);
        console.log('========================================\n');

    } catch (err) {
        console.error('[Error] Processing failed:', err.message);
    }
});

port.on('error', (err) => {
    console.error('[Serial Port Error]:', err.message);
});