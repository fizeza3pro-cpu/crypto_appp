import hashlib
import hmac
import os
import struct
import subprocess

import pytest

ALGORITHMS = ["aes-256-gcm", "aes-256-cbc-hmac-sha256"]


def invoke(binary, arguments, password=b"test-password", framed=None):
    frame = struct.pack(">I", len(password)) + password if framed is None else framed
    return subprocess.run([str(binary), *map(str, arguments)], input=frame,
                          capture_output=True, timeout=30, check=False)


@pytest.mark.parametrize("algorithm", ALGORITHMS)
@pytest.mark.parametrize("size", [0, 1, 16, 65535, 65536, 65537, 131209])
def test_round_trip(binary, tmp_path, algorithm, size):
    plain = tmp_path / "báo cáo có dấu.bin"
    encrypted = tmp_path / "encrypted.enc"
    restored = tmp_path / "restored.bin"
    payload = bytes(range(256)) * (size // 256) + bytes(range(size % 256))
    plain.write_bytes(payload)
    password = "mật khẩu 🔒\nkhông mất dấu".encode()
    result = invoke(binary, ["encrypt", algorithm, plain, encrypted], password)
    assert result.returncode == 0, result.stderr
    assert plain.read_bytes() == payload
    assert encrypted.read_bytes()[:8] == b"CGCRYPT1"
    assert struct.unpack(">I", encrypted.read_bytes()[12:16])[0] == 600000
    result = invoke(binary, ["decrypt", encrypted, restored], password)
    assert result.returncode == 0, result.stderr
    assert hashlib.sha256(restored.read_bytes()).digest() == hashlib.sha256(payload).digest()
    assert not list(tmp_path.glob("*.tmp.*"))
    if os.name != "nt":
        assert restored.stat().st_mode & 0o777 == 0o600


@pytest.fixture(params=ALGORITHMS)
def encrypted_file(request, binary, tmp_path):
    plain, encrypted = tmp_path / "source", tmp_path / "original.enc"
    plain.write_bytes(b"important data" * 5000)
    result = invoke(binary, ["encrypt", request.param, plain, encrypted])
    assert result.returncode == 0, result.stderr
    return encrypted


def test_wrong_password(binary, tmp_path, encrypted_file):
    output = tmp_path / "wrong"
    result = invoke(binary, ["decrypt", encrypted_file, output], b"incorrect")
    assert result.returncode == 3
    assert not output.exists()
    assert not list(tmp_path.glob("*.tmp.*"))


@pytest.mark.parametrize("offset", [0, 8, 9, 12, 16, 32, 48, 52, -1])
def test_tampering(binary, tmp_path, encrypted_file, offset):
    damaged = bytearray(encrypted_file.read_bytes())
    damaged[offset] ^= 1
    encrypted_file.write_bytes(damaged)
    output = tmp_path / "output"
    result = invoke(binary, ["decrypt", encrypted_file, output])
    assert result.returncode in {2, 3}
    assert not output.exists()
    assert not list(tmp_path.glob("*.tmp.*"))


@pytest.mark.parametrize("cut", [1, 20, 53])
def test_truncation(binary, tmp_path, encrypted_file, cut):
    encrypted_file.write_bytes(encrypted_file.read_bytes()[:-cut])
    output = tmp_path / "output"
    assert invoke(binary, ["decrypt", encrypted_file, output]).returncode in {2, 3}
    assert not output.exists()


def test_randomness_and_no_clobber(binary, tmp_path):
    source, first, second = [tmp_path / name for name in ("source", "first", "second")]
    source.write_bytes(b"same content")
    for output in (first, second):
        assert invoke(binary, ["encrypt", ALGORITHMS[0], source, output]).returncode == 0
    assert first.read_bytes() != second.read_bytes()
    before = first.read_bytes()
    assert invoke(binary, ["encrypt", ALGORITHMS[0], source, first]).returncode == 4
    assert first.read_bytes() == before
    assert invoke(binary, ["encrypt", ALGORITHMS[0], source, source]).returncode == 4
    assert source.read_bytes() == b"same content"
    hardlink = tmp_path / "hardlink"
    os.link(source, hardlink)
    assert invoke(binary, ["encrypt", ALGORITHMS[0], source, hardlink]).returncode == 4
    assert source.read_bytes() == b"same content"


@pytest.mark.parametrize("frame", [b"", b"\0\0\0\0", struct.pack(">I", 1025), struct.pack(">I", 5) + b"x"])
def test_invalid_password_frames(binary, tmp_path, frame):
    source, output = tmp_path / "source", tmp_path / "output"
    source.write_bytes(b"test")
    assert invoke(binary, ["encrypt", ALGORITHMS[0], source, output], framed=frame).returncode == 2
    assert not output.exists()


def test_unsupported_algorithm(binary, tmp_path):
    assert invoke(binary, ["encrypt", "des", tmp_path / "source", tmp_path / "out"]).returncode == 2


def test_legacy_200k_header_compatibility(binary, tmp_path):
    # Independently construct a valid old CGCRYPT1 CBC file via OpenSSL CLI.
    source, payload, encrypted, restored = [tmp_path / p for p in ("plain", "cipher", "old.enc", "restored")]
    source.write_bytes(b"legacy CBC interoperability" * 7)
    salt, iv = bytes(range(16)), bytes(range(16, 32))
    material = hashlib.pbkdf2_hmac("sha256", b"legacy-password", salt, 200000, 64)
    # Fixed test key only; never pass a user's password or key on a command line.
    result = subprocess.run(["openssl", "enc", "-aes-256-cbc", "-K", material[:32].hex(),
                             "-iv", iv.hex(), "-in", str(source), "-out", str(payload)],
                            capture_output=True, check=False)
    assert result.returncode == 0, result.stderr
    header = b"CGCRYPT1" + bytes([1, 2, 0, 0]) + struct.pack(">I", 200000) + salt + iv + bytes([32, 16, 0, 0])
    body = header + payload.read_bytes()
    encrypted.write_bytes(body + hmac.digest(material[32:], body, "sha256"))
    assert invoke(binary, ["decrypt", encrypted, restored], b"legacy-password").returncode == 0
    assert restored.read_bytes() == source.read_bytes()
