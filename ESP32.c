/*
 * Secure Offline Wi-Fi Micro-Ledger (Zero-Trust Handoff) - TRL 4
 * Board: ESP32-WROOM-32
 */

#include <SparkFun_ATECCX08a_Arduino_Library.h>
#include <Wire.h>
#include <WiFi.h>
#include <WebServer.h>
#include <mbedtls/md.h>
#include <ArduinoJson.h>
#include <LittleFS.h>

#define I2C_SDA 21
#define I2C_SCL 22

ATECCX08A atecc;
WebServer server(80);

unsigned long lastSensorTime = 0;
unsigned long lastCommitTime = 0;
const unsigned long SENSOR_INTERVAL = 15000;
const unsigned long COMMIT_INTERVAL = 60000;

String blobBuffer = "";
byte prevCommitHash[32] = {0};
byte devicePubKey[64] = {0};
bool hasCachedPubKey = false;

const char* LEDGER_FILE = "/ledger.jsonl";

// --- Utilities ---
String toHexString(byte* data, int length) {
  String hex = "";
  for(int i = 0; i < length; i++) {
    if(data[i] < 0x10) hex += "0";
    hex += String(data[i], HEX);
  }
  return hex;
}

void hexStringToBytes(String hex, byte* output, int expectedLength) {
  for (int i = 0; i < expectedLength; i++) {
    String byteString = hex.substring(i * 2, i * 2 + 2);
    output[i] = (byte) strtol(byteString.c_str(), NULL, 16);
  }
}

void computeSHA256(const byte* data, size_t length, byte* output) {
  mbedtls_md_context_t ctx;
  mbedtls_md_init(&ctx);
  mbedtls_md_setup(&ctx, mbedtls_md_info_from_type(MBEDTLS_MD_SHA256), 0);
  mbedtls_md_starts(&ctx);
  mbedtls_md_update(&ctx, data, length);
  mbedtls_md_finish(&ctx, output);
  mbedtls_md_free(&ctx);
}

// --- Local Storage Management ---
void appendToLedger(const String& entry) {
  File file = LittleFS.open(LEDGER_FILE, "a");
  if(!file) {
    Serial.println("[FS] ERROR: Failed to open ledger file for appending.");
    return;
  }
  file.println(entry);
  file.close();
  Serial.println("[FS] New event persisted to append-only flash.");
}

void loadLastState() {
  if(!LittleFS.begin(true)){
    Serial.println("[FS] ERROR: LittleFS initialization failed.");
    return;
  }
  
  if(!LittleFS.exists(LEDGER_FILE)) {
    Serial.println("[FS] Ledger file not found. Starting genesis chain.");
    return;
  }
  
  File file = LittleFS.open(LEDGER_FILE, "r");
  if(!file) {
    Serial.println("[FS] ERROR: Failed to read ledger file.");
    return;
  }
  
  String lastLine = "";
  while(file.available()) {
    String line = file.readStringUntil('\n');
    line.trim();
    if(line.length() > 0) {
      lastLine = line;
    }
  }
  file.close();
  
  if(lastLine.length() > 0) {
    StaticJsonDocument<1024> doc;
    DeserializationError error = deserializeJson(doc, lastLine);
    if(!error) {
      String hashHex = doc["hash"].as<String>();
      if(hashHex.length() == 64) {
        hexStringToBytes(hashHex, prevCommitHash, 32);
        Serial.print("[FS] Restored state anchor from flash: ");
        Serial.println(hashHex);
      }
    } else {
      Serial.print("[FS] Error parsing last log entry: ");
      Serial.println(error.c_str());
    }
  }
}

// --- API Endpoints ---
void handleChallenge() {
  String response = "{\"current_commit\":\"" + toHexString(prevCommitHash, 32) + "\"";
  if (hasCachedPubKey) {
    response += ",\"device_pubkey\":\"" + toHexString(devicePubKey, 64) + "\"";
  }
  response += "}";
  server.send(200, "application/json", response);
  Serial.println("[Wi-Fi] Sent challenge parameters and device public key.");
}

void handleHandoff() {
  Serial.println("\n[Wi-Fi] Processing handoff request...");
  
  if (server.hasArg("plain") == false) {
    server.send(400, "application/json", "{\"status\":\"error\",\"message\":\"Empty payload\"}");
    return;
  }

  StaticJsonDocument<512> doc;
  DeserializationError error = deserializeJson(doc, server.arg("plain"));
  if (error) {
    server.send(400, "application/json", "{\"status\":\"error\",\"message\":\"Malformed JSON\"}");
    return;
  }

  String receiverPubKeyHex = doc["public_key"];
  String signatureHex = doc["signature"];
  String receiverId = doc["receiver_id"];

  if (receiverPubKeyHex.length() != 128 || signatureHex.length() != 128) {
    server.send(400, "application/json", "{\"status\":\"error\",\"message\":\"Invalid structural length\"}");
    return;
  }

  byte receiverPubKey[64];
  byte signature[64];
  
  hexStringToBytes(receiverPubKeyHex, receiverPubKey, 64);
  hexStringToBytes(signatureHex, signature, 64);

  // 1. Verify the receiver's possession of identity over the prevCommitHash
  if (atecc.verifySignature(prevCommitHash, signature, receiverPubKey)) {
    Serial.println("[CRYPTO] Receiver signature verified successfully.");
    
    // 2. Build the combined payload for the Custody Receipt (Countersignature)
    // Combined = prevCommitHash (32B) + receiverPubKey (64B) + signature (64B) = 160 Bytes
    byte handoffPayload[160];
    memcpy(handoffPayload, prevCommitHash, 32);
    memcpy(handoffPayload + 32, receiverPubKey, 64);
    memcpy(handoffPayload + 96, signature, 64);
    
    byte handoffHash[32];
    computeSHA256(handoffPayload, 160, handoffHash);
    
    // 3. Generate Hardware Countersignature (using Slot 0 Private Key)
    if (atecc.createSignature(handoffHash)) {
      byte deviceSignature[64];
      memcpy(deviceSignature, atecc.signature, 64);
      
      // 4. Save structural event to local LittleFS ledger
      String entry = "{\"type\":\"handoff\",\"timestamp\":" + String(millis()) + 
                     ",\"hash\":\"" + toHexString(handoffHash, 32) + 
                     "\",\"prev\":\"" + toHexString(prevCommitHash, 32) + 
                     "\",\"receiver_id\":\"" + receiverId + 
                     "\",\"receiver_pubkey\":\"" + receiverPubKeyHex + 
                     "\",\"receiver_sig\":\"" + signatureHex + 
                     "\",\"device_sig\":\"" + toHexString(deviceSignature, 64) + "\"}";
      appendToLedger(entry);
      
      // 5. Update state anchor for the next leg of the custody journey
      memcpy(prevCommitHash, handoffHash, 32);
      
      // 6. Return response containing the custody receipt countersignature
      String response = "{\"status\":\"success\",\"message\":\"Custody transferred.\",\"handoff_hash\":\"" + toHexString(handoffHash, 32) + "\",\"device_signature\":\"" + toHexString(deviceSignature, 64) + "\"}";
      server.send(200, "application/json", response);
      Serial.println("[SYSTEM] Transfer successfully authorized. Receipt dispatched.");
    } else {
      Serial.println("[CRYPTO] ERROR: Device failed to sign the receipt.");
      server.send(500, "application/json", "{\"status\":\"error\",\"message\":\"Internal cryptoprocessor error\"}");
    }
  } else {
    Serial.println("[CRYPTO] Verification failure. Handshake rejected.");
    server.send(401, "application/json", "{\"status\":\"error\",\"message\":\"Cryptographic authentication failed\"}");
  }
}

void setup() {
  Serial.begin(115200);
  while (!Serial) delay(10);
  Wire.begin(I2C_SDA, I2C_SCL);

  Serial.println("\n--- Booting Secure Micro-Ledger (TRL 4) ---");

  if (!atecc.begin()) {
    Serial.println("[CRITICAL] ATECC608B failed to wake up!");
    while (1);
  }
  
  // Cache the internal Device Public Key
  if (atecc.generatePublicKey() == true) {
    memcpy(devicePubKey, atecc.publicKey64Bytes, 64);
    hasCachedPubKey = true;
    Serial.print("[CRYPTO] Device Public Key Loaded: ");
    Serial.println(toHexString(devicePubKey, 64));
  } else {
    Serial.println("[WARNING] Could not retrieve internal public key.");
  }

  // Load persistent state from Flash
  loadLastState();

  WiFi.softAP("ColdChain_Logger_001", "12345678");
  Serial.print("[OK] Wi-Fi AP Started. IP: ");
  Serial.println(WiFi.softAPIP());

  server.on("/challenge", HTTP_GET, handleChallenge);
  server.on("/handoff", HTTP_POST, handleHandoff);
  server.begin();
  
  Serial.println("System Online. Awaiting handoff...");
}

void loop() {
  server.handleClient();
  unsigned long currentMillis = millis();

  // Polling sensor readings
  if (currentMillis - lastSensorTime >= SENSOR_INTERVAL) {
    lastSensorTime = currentMillis;
    float t = 2.0 + (random(-5, 6) / 10.0);       
    float h = 60.0 + (random(-20, 21) / 10.0);    
    int s = (random(0, 100) > 95) ? 1 : 0;        
    String reading = "{\"t\":" + String(t, 2) + ",\"h\":" + String(h, 2) + ",\"s\":" + String(s) + "}";
    if (blobBuffer.length() > 0) blobBuffer += ",";
    blobBuffer += reading;
  }

  // Chaining and signing block commit
  if (currentMillis - lastCommitTime >= COMMIT_INTERVAL && blobBuffer.length() > 0) {
    lastCommitTime = currentMillis;
    String treeData = "[" + blobBuffer + "]";
    byte treeHash[32];
    byte commitHash[32];

    computeSHA256((const byte*)treeData.c_str(), treeData.length(), treeHash);
    byte combined[64];
    memcpy(combined, treeHash, 32);
    memcpy(combined + 32, prevCommitHash, 32);
    computeSHA256(combined, 64, commitHash);

    if (atecc.createSignature(commitHash)) {
      // Save data, state hashes, and link to ledger file
      String entry = "{\"type\":\"commit\",\"timestamp\":" + String(millis()) + 
                     ",\"hash\":\"" + toHexString(commitHash, 32) + 
                     "\",\"tree_hash\":\"" + toHexString(treeHash, 32) + 
                     "\",\"data\":" + treeData + "}";
      appendToLedger(entry);

      memcpy(prevCommitHash, commitHash, 32);
      blobBuffer = ""; 
      Serial.println("[CRYPTO] Chained commit generated and saved.");
    }
  }
}