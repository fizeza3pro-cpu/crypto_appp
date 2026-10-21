"""Stable format identifiers. These are cipher suites, not arbitrary EVP names."""
SUITES = {
    "aes-256-gcm": dict(name="AES-256-GCM", number=1, key_bits=256, iv_bytes=12, tag_bytes=16, authentication="GCM"),
    "aes-256-cbc-hmac-sha256": dict(name="AES-256-CBC + HMAC-SHA256", number=2, key_bits=256, iv_bytes=16, tag_bytes=32, authentication="HMAC-SHA256 (Encrypt-then-MAC)"),
    "aes-128-gcm": dict(name="AES-128-GCM", number=3, key_bits=128, iv_bytes=12, tag_bytes=16, authentication="GCM"),
    "chacha20-poly1305": dict(name="ChaCha20-Poly1305", number=4, key_bits=256, iv_bytes=12, tag_bytes=16, authentication="Poly1305"),
}
