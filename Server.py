import requests
import hashlib
from ecdsa import SigningKey, VerifyingKey, NIST256p

ESP32_URL = "http://192.168.4.1"

print("\n--- Receiver Handshake Simulation (Zero-Trust Validation Loop) ---")

# 1. Generate Receiver Key Pair (NIST P-256)
# This matches the ECDSA curve expected by the ATECC608B
print("[1] Generating Receiver Identity (NIST P-256)...")
receiver_priv_key = SigningKey.generate(curve=NIST256p)
receiver_pub_key = receiver_priv_key.get_verifying_key().to_string().hex()
print(f"    Receiver Public Key: {receiver_pub_key[:16]}...{receiver_pub_key[-16:]}")

# 2. Pull Challenge & Device Public Key from ESP32
print(f"\n[2] Requesting parameters from {ESP32_URL}/challenge...")
try:
    response = requests.get(f"{ESP32_URL}/challenge", timeout=5)
    challenge_data = response.json()
    commit_hash = challenge_data.get("current_commit")
    device_pub_key = challenge_data.get("device_pubkey")
    print(f"    Received Commit Anchor: {commit_hash}")
    print(f"    Received Device Hardware PubKey: {device_pub_key[:16]}...{device_pub_key[-16:]}")
except Exception as e:
    print("\n[ERROR] Connection failed. Please ensure you are connected to the 'ColdChain_Logger_001' network.")
    exit()

# 3. Sign the Hash
# Proves that the receiver acknowledges the historical custody data up to this hash
print("\n[3] Signing the commit hash with the Receiver's Private Key...")
signature = receiver_priv_key.sign(bytes.fromhex(commit_hash)).hex()
print(f"    Signature: {signature[:16]}...{signature[-16:]}")

# 4. Execute the Handoff (POST Request)
handoff_payload = {
    "receiver_id": "Warehouse_Dock_42",
    "public_key": receiver_pub_key,
    "signature": signature
}

print(f"\n[4] Executing custody transfer to {ESP32_URL}/handoff...")
try:
    headers = {'Content-Type': 'application/json'}
    post_response = requests.post(f"{ESP32_URL}/handoff", json=handoff_payload, headers=headers, timeout=5)
    result = post_response.json()
    
    if result.get("status") == "success":
        print("    Device Response: Success!")
        device_sig = result.get("device_signature")
        handoff_hash_received = result.get("handoff_hash")
        
        print(f"    Handoff Hash (Anchor): {handoff_hash_received}")
        print(f"    Device Signature (Receipt): {device_sig[:16]}...{device_sig[-16:]}")
        
        # 5. Local Zero-Trust Mutual Verification
        # Reconstruct the expected hash payload independently to verify the receipt
        payload = bytes.fromhex(commit_hash) + bytes.fromhex(receiver_pub_key) + bytes.fromhex(signature)
        computed_handoff_hash = hashlib.sha256(payload).digest()
        
        # Verify that our computed handoff hash matches what the device claims
        if computed_handoff_hash.hex() != handoff_hash_received:
            print("\n[WARNING] Handoff hash mismatch between computed value and device output.")
            
        print("\n[5] Verifying Device's Hardware Receipt Signature locally...")
        try:
            vk = VerifyingKey.from_string(bytes.fromhex(device_pub_key), curve=NIST256p)
            vk.verify(bytes.fromhex(device_sig), computed_handoff_hash)
            print("\n=======================================================")
            print("SUCCESS: Zero-Trust Mutual Custody Transfer Verified!")
            print("=======================================================")
        except Exception as ver_err:
            print(f"\n[CRITICAL ERROR] Device receipt signature could not be verified: {ver_err}")
    else:
        print(f"\n[ERROR] Handoff rejected by device: {result.get('message')}")
        
except Exception as e:
    print(f"\n[ERROR] Handoff transaction failed: {e}")