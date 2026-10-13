///*
// * ATECC608A Secure Wireless Telemetry Node
// * Board: ESP32-WROOM-32
// */
//
//#include <SparkFun_ATECCX08a_Arduino_Library.h>
//#include <Wire.h>
//#include <WiFi.h>
//#include <HTTPClient.h>
//#include <mbedtls/md.h>
//#include <ArduinoJson.h>
//
//#define I2C_SDA 21
//#define I2C_SCL 22
//#define SIGN_SLOT 0 
//
//ATECCX08A atecc;
//
//// --- Network Configurations ---
//const char* ssid = "BagBag";         
//const char* password = "1234567890"; 
//
//// FIXED: Hardcoded full string format to ensure no data loss during build
//const char* serverUrl = "http://10.126.92.23:5000/api/telemetry";
//
//unsigned long lastTxTime = 0;
//const unsigned long TX_INTERVAL = 5000; 
//
//void printHex(uint8_t* data, size_t length, String &outputStr) {
//  for (size_t i = 0; i < length; i++) {
//    if (data[i] < 0x10) outputStr += "0";
//    outputStr += String(data[i], HEX);
//  }
//}
//
//void computeSHA256(const String& data, byte* output) {
//  mbedtls_md_context_t ctx;
//  mbedtls_md_init(&ctx);
//  mbedtls_md_setup(&ctx, mbedtls_md_info_from_type(MBEDTLS_MD_SHA256), 0);
//  mbedtls_md_starts(&ctx);
//  mbedtls_md_update(&ctx, (const unsigned char*)data.c_str(), data.length());
//  mbedtls_md_finish(&ctx, output);
//  mbedtls_md_free(&ctx);
//}
//
//void setup() {
//  Serial.begin(115200);
//  Wire.begin(I2C_SDA, I2C_SCL);
//
//  if (atecc.begin() == false) {
//    Serial.println("[Error] ATECC608A initialization failed.");
//    while (1);
//  }
//  Serial.println("[Crypto] ATECC608A active.");
//
//  WiFi.begin(ssid, password);
//  Serial.print("[Wi-Fi] Connecting");
//  while (WiFi.status() != WL_CONNECTED) {
//    delay(500);
//    Serial.print(".");
//  }
//  Serial.println("\n[Wi-Fi] Connected! IP: " + WiFi.localIP().toString());
//}
//
//void loop() {
//  unsigned long now = millis();
//
//  if (now - lastTxTime >= TX_INTERVAL) {
//    lastTxTime = now;
//
//    if (WiFi.status() != WL_CONNECTED) {
//      Serial.println("[Wi-Fi] Lost connection. Reconnecting...");
//      return;
//    }
//
//    // 1. Gather/Simulate Sensor Data
//    float temperature = 24.0 + (random(-15, 15) / 10.0);
//    String payloadStr = "{\"temp\":" + String(temperature, 2) + ",\"ts\":" + String(now) + "}";
//
//    // 2. Cryptographic Hash calculation
//    byte messageHash[32];
//    computeSHA256(payloadStr, messageHash);
//
//    // 3. Command Hardware Signature Generation
//    if (!atecc.createSignature(messageHash, SIGN_SLOT)) {
//      Serial.println("[Crypto] Hardware signing operation failed.");
//      return;
//    }
//
//    String sigHex = "";
//    printHex(atecc.signature, 64, sigHex);
//
//    // 4. Construct JSON Transport Document
//    StaticJsonDocument<300> doc;
//    doc["payload"] = payloadStr;
//    doc["signature"] = sigHex;
//
//    String jsonPayload;
//    serializeJson(doc, jsonPayload);
//
//    // 5. Post to Laptop Node Server
//    HTTPClient http;
//    http.begin(serverUrl); 
//    http.addHeader("Content-Type", "application/json");
//
//    Serial.println("\n[Tx] Transmitting secure payload packet to " + String(serverUrl) + " ...");
//    int httpCode = http.POST(jsonPayload);
//
//    if (httpCode > 0) {
//      String serverResponse = http.getString();
//      Serial.println("[Tx Success] Gateway Code " + String(httpCode) + ": " + serverResponse);
//    } else {
//      Serial.println("[Tx Error] Post transmission failed: " + http.errorToString(httpCode));
//    }
//    http.end();
//  }
//}

/*
 * ATECC608A Secure Telemetry Node (USB Serial Mode)
 * Board: ESP32-WROOM-32
 */

#include <SparkFun_ATECCX08a_Arduino_Library.h>
#include <Wire.h>
#include <mbedtls/md.h>
#include <ArduinoJson.h>

#define I2C_SDA 21
#define I2C_SCL 22
#define SIGN_SLOT 0 

ATECCX08A atecc;

unsigned long lastTxTime = 0;
const unsigned long TX_INTERVAL = 5000; 

void printHex(uint8_t* data, size_t length, String &outputStr) {
  for (size_t i = 0; i < length; i++) {
    if (data[i] < 0x10) outputStr += "0";
    outputStr += String(data[i], HEX);
  }
}

void computeSHA256(const String& data, byte* output) {
  mbedtls_md_context_t ctx;
  mbedtls_md_init(&ctx);
  mbedtls_md_setup(&ctx, mbedtls_md_info_from_type(MBEDTLS_MD_SHA256), 0);
  mbedtls_md_starts(&ctx);
  mbedtls_md_update(&ctx, (const unsigned char*)data.c_str(), data.length());
  mbedtls_md_finish(&ctx, output);
  mbedtls_md_free(&ctx);
}

void setup() {
  Serial.begin(115200);
  while (!Serial) { delay(10); } // Wait for USB CDC connection if applicable

  Wire.begin(I2C_SDA, I2C_SCL);

  if (!atecc.begin()) {
    // Print JSON-compatible error or standard log before stream begins
    Serial.println("{\"error\":\"ATECC608A initialization failed\"}");
    while (1);
  }
}

void loop() {
  unsigned long now = millis();

  if (now - lastTxTime >= TX_INTERVAL) {
    lastTxTime = now;

    // 1. Gather/Simulate Sensor Data
    float temperature = 31.0 + (random(-5, 5) / 10.0);
    String payloadStr = "{\"temp\":" + String(temperature, 2) + ",\"ts\":" + String(now) + "}";

    // 2. Cryptographic SHA-256 Digest
    byte messageHash[32];
    computeSHA256(payloadStr, messageHash);

    // 3. Hardware Signing via ATECC608A
    if (!atecc.createSignature(messageHash, SIGN_SLOT)) {
      return;
    }

    String sigHex = "";
    printHex(atecc.signature, 64, sigHex);

    // 4. Construct Transport JSON
    StaticJsonDocument<300> doc;
    doc["payload"] = payloadStr;
    doc["signature"] = sigHex;

    // 5. Emit single newline-terminated JSON packet across USB Serial
    serializeJson(doc, Serial);
    Serial.println();
  }
}

/*
 * ATECC608A + SHT31 Secure Telemetry Node (USB Serial Mode)
 * Board: ESP32-WROOM-32
 */

//#include <Wire.h>
//#include <SparkFun_ATECCX08a_Arduino_Library.h>
//#include <Adafruit_SHT31.h>
//#include <mbedtls/md.h>
//#include <ArduinoJson.h>
//
//#define I2C_SDA 21
//#define I2C_SCL 22
//#define SIGN_SLOT 0 
//
//ATECCX08A atecc;
//Adafruit_SHT31 sht31 = Adafruit_SHT31();
//
//unsigned long lastTxTime = 0;
//const unsigned long TX_INTERVAL = 5000; 
//
//void printHex(uint8_t* data, size_t length, String &outputStr) {
//  for (size_t i = 0; i < length; i++) {
//    if (data[i] < 0x10) outputStr += "0";
//    outputStr += String(data[i], HEX);
//  }
//}
//
//void computeSHA256(const String& data, byte* output) {
//  mbedtls_md_context_t ctx;
//  mbedtls_md_init(&ctx);
//  mbedtls_md_setup(&ctx, mbedtls_md_info_from_type(MBEDTLS_MD_SHA256), 0);
//  mbedtls_md_starts(&ctx);
//  mbedtls_md_update(&ctx, (const unsigned char*)data.c_str(), data.length());
//  mbedtls_md_finish(&ctx, output);
//  mbedtls_md_free(&ctx);
//}
//
//void setup() {
//  Serial.begin(115200);
//  while (!Serial) { delay(10); }
//
//  Wire.begin(I2C_SDA, I2C_SCL);
//
//  // 1. Initialize SHT31 Sensor
//  // Default I2C address is 0x44 (use 0x45 if ADR pin pulled HIGH)
//  if (!sht31.begin(0x44)) {
//    Serial.println("{\"error\":\"SHT31 sensor not detected at 0x44\"}");
//    while (1) delay(1000);
//  }
//
//  // 2. Initialize ATECC608A Cryptographic Co-processor
//  if (!atecc.begin()) {
//    Serial.println("{\"error\":\"ATECC608A initialization failed\"}");
//    while (1) delay(1000);
//  }
//}
//
//void loop() {
//  unsigned long now = millis();
//
//  if (now - lastTxTime >= TX_INTERVAL) {
//    lastTxTime = now;
//
//    // 1. Read real sensor telemetry from SHT31
//    float temperature = sht31.readTemperature();
//    float humidity = sht31.readHumidity();
//
//    // Check if read succeeded
//    if (isnan(temperature) || isnan(humidity)) {
//      Serial.println("{\"error\":\"Failed to read from SHT31 sensor\"}");
//      return;
//    }
//
//    // 2. Format deterministic JSON payload to sign
//    // Format: {"temp":24.52,"hum":55.10,"ts":15000}
//    String payloadStr = "{\"temp\":" + String(temperature, 2) + 
//                        ",\"hum\":" + String(humidity, 2) + 
//                        ",\"ts\":" + String(now) + "}";
//
//    // 3. Compute Cryptographic SHA-256 Digest of the payload
//    byte messageHash[32];
//    computeSHA256(payloadStr, messageHash);
//
//    // 4. Hardware ECDSA P-256 Signing via ATECC608A
//    if (!atecc.createSignature(messageHash, SIGN_SLOT)) {
//      Serial.println("{\"error\":\"ATECC608A signing failed\"}");
//      return;
//    }
//
//    String sigHex = "";
//    printHex(atecc.signature, 64, sigHex);
//
//    // 5. Build Outer JSON Container
//    StaticJsonDocument<350> doc;
//    doc["payload"] = payloadStr;
//    doc["signature"] = sigHex;
//
//    // 6. Transmit single-line JSON via USB Serial
//    serializeJson(doc, Serial);
//    Serial.println();
//  }
//}
