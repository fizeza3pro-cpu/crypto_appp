"""Real native/API regressions, with independent OpenSSL CLI interop checks."""
import hashlib
import io
import json
from pathlib import Path
import struct
import subprocess

import pytest
from werkzeug.datastructures import MultiDict

BASE = "http://localhost:8080"
PASS = b"exam-test-password-only"
OPENSSL = "openssl"


def native(binary, *args, password=None):
    frame = struct.pack(">I", len(password)) + password if password else b""
    return subprocess.run([str(binary), *map(str, args)], input=frame, capture_output=True, timeout=30)


@pytest.fixture(scope="module")
def keys(binary, tmp_path_factory):
    root = tmp_path_factory.mktemp("expanded-keys")
    private, public = root / "private.pem", root / "public.pem"
    result = native(binary, "keygen", private, public, password=PASS)
    assert result.returncode == 0, result.stderr
    return private, public, json.loads(result.stdout)


def api(client, endpoint, data):
    token = client.get("/api/v1/session", base_url=BASE).json["csrf_token"]
    return client.post("/api/v1/"+endpoint, base_url=BASE,
                       headers={"Origin": BASE, "X-CSRF-Token": token}, data=data, content_type="multipart/form-data")


def upload(content=b"confidential report\x00\xff" * 200, name="báo cáo.bin"):
    return io.BytesIO(content), name


def clean(app):
    assert not list(Path(app.config["CRYPTO_TEMP_DIR"]).iterdir())
    slots = app.extensions["crypto_slots"]
    assert slots.acquire(False) and slots.acquire(False)
    slots.release(); slots.release()


@pytest.mark.parametrize("algorithm", ["aes-256-gcm", "aes-256-cbc-hmac-sha256", "aes-128-gcm", "chacha20-poly1305"])
@pytest.mark.parametrize("kdf", ["pbkdf2", "scrypt"])
@pytest.mark.parametrize("size", [0, 65537])
def test_all_password_suites(binary, tmp_path, algorithm, kdf, size):
    source, encrypted, restored = [tmp_path / n for n in ["plain", "cipher", "restored"]]
    source.write_bytes(bytes(i % 251 for i in range(size)))
    result = native(binary, "encrypt", algorithm, source, encrypted, kdf, password=PASS)
    assert result.returncode == 0, result.stderr
    result = native(binary, "decrypt", encrypted, restored, password=PASS)
    assert result.returncode == 0, result.stderr
    assert source.read_bytes() == restored.read_bytes()
    restored.unlink()
    damaged = bytearray(encrypted.read_bytes()); damaged[-1] ^= 1; encrypted.write_bytes(damaged)
    assert native(binary, "decrypt", encrypted, restored, password=PASS).returncode == 3
    assert not restored.exists() and not list(tmp_path.glob("*.tmp.*"))


def test_bounded_scrypt_and_native_caps(binary, tmp_path):
    source, cipher, out = [tmp_path / n for n in ["plain", "cipher", "out"]]
    source.write_bytes(b"example")
    assert native(binary, "encrypt", "aes-128-gcm", source, cipher, "scrypt", password=PASS).returncode == 0
    data = bytearray(cipher.read_bytes()); data[12:16] = b"\xff"*4; cipher.write_bytes(data)
    assert native(binary, "decrypt", cipher, out, password=PASS).returncode == 2
    assert not out.exists()
    caps = json.loads(native(binary, "--capabilities").stdout)
    assert "chacha20-poly1305" in caps["algorithms"] and caps["scrypt_available"]


def test_pkcs8_fingerprint_and_cli_signature_interop(binary, keys, tmp_path):
    private, public, info = keys
    assert b"BEGIN ENCRYPTED PRIVATE KEY" in private.read_bytes()
    der = subprocess.run([OPENSSL, "pkey", "-pubin", "-in", str(public), "-outform", "DER"], capture_output=True, check=True).stdout
    assert hashlib.sha256(der).hexdigest() == info["fingerprint"]
    # ASN.1 confirms explicit iteration and PRF rather than trusting a label in the UI.
    asn = subprocess.run([OPENSSL, "asn1parse", "-in", str(private)], capture_output=True, check=True).stdout
    assert b"hmacWithSHA256" in asn and b"aes-256-cbc" in asn and b"0927C0" in asn
    plain, sig = tmp_path / "report", tmp_path / "signature"
    plain.write_bytes(b"A report that must remain authentic\x00" * 3000)
    assert native(binary, "sign", plain, private, sig, password=PASS).returncode == 0
    verified = subprocess.run([OPENSSL, "dgst", "-sha256", "-verify", str(public), "-signature", str(sig),
        "-sigopt", "rsa_padding_mode:pss", "-sigopt", "rsa_pss_saltlen:32", "-sigopt", "rsa_mgf1_md:sha256", str(plain)], capture_output=True)
    assert verified.returncode == 0, verified.stderr
    external = tmp_path / "external.sig"
    signed = subprocess.run([OPENSSL, "dgst", "-sha256", "-sign", str(private), "-passin", "stdin",
        "-sigopt", "rsa_padding_mode:pss", "-sigopt", "rsa_pss_saltlen:32", "-sigopt", "rsa_mgf1_md:sha256", "-out", str(external), str(plain)], input=PASS+b"\n", capture_output=True)
    assert signed.returncode == 0, signed.stderr
    assert json.loads(native(binary, "verify", plain, public, external).stdout)["valid"]
    plain.write_bytes(b"Modified report")
    assert not json.loads(native(binary, "verify", plain, public, sig).stdout)["valid"]
    assert native(binary, "sign", plain, private, tmp_path / "bad.sig", password=b"wrong").returncode == 3


@pytest.mark.parametrize("size", [0, 1, 65537])
def test_hybrid_cli_oaep_and_tamper(binary, keys, tmp_path, size):
    private, public, _ = keys
    source, cipher, restored = [tmp_path / n for n in ["source", "cipher", "restored"]]
    source.write_bytes(bytes(i % 251 for i in range(size)))
    assert native(binary, "hybrid-encrypt", source, cipher, public).returncode == 0
    assert native(binary, "hybrid-decrypt", cipher, restored, private, password=PASS).returncode == 0
    assert restored.read_bytes() == source.read_bytes()
    data = cipher.read_bytes(); wraplen = int.from_bytes(data[12:16], "big")
    assert wraplen == 384 and len(data) == size+464
    wrapped = tmp_path / "wrapped"; wrapped.write_bytes(data[64:64+wraplen])
    unwrapped = subprocess.run([OPENSSL,"pkeyutl","-decrypt","-inkey",str(private),"-passin","stdin",
        "-pkeyopt","rsa_padding_mode:oaep","-pkeyopt","rsa_oaep_md:sha256","-pkeyopt","rsa_mgf1_md:sha256","-in",str(wrapped)],input=PASS+b"\n",capture_output=True)
    assert unwrapped.returncode == 0 and len(unwrapped.stdout) == 32
    for offset in [16, 48, 64, len(data)-1]:
        mutated = bytearray(data); mutated[offset] ^= 1; cipher.write_bytes(mutated)
        restored.unlink(missing_ok=True)
        assert native(binary,"hybrid-decrypt",cipher,restored,private,password=PASS).returncode != 0
        assert not restored.exists() and not list(tmp_path.glob("*.tmp.*"))
    assert native(binary,"hybrid-encrypt",source,public,public).returncode != 0
    assert public.read_bytes().startswith(b"-----BEGIN PUBLIC KEY")


def test_expanded_api_workflows(app, keys):
    private, public, info = keys; client = app.test_client()
    response = api(client,"keys/inspect",{"public_key":upload(public.read_bytes(),"public.pem")})
    assert response.status_code == 200 and response.json["fingerprint"] == info["fingerprint"]
    response = api(client,"crypto/hybrid/encrypt",{"file":upload(),"public_key":upload(public.read_bytes(),"public.pem")})
    assert response.status_code == 200; encrypted = response.data; response.close(); clean(app)
    response = api(client,"crypto/inspect",{"file":upload(encrypted)})
    assert response.json["authenticated"] is False and response.json["format"] == "CGHYBRD1"
    response = api(client,"crypto/hybrid/decrypt",{"file":upload(encrypted),"private_key":upload(private.read_bytes(),"private.pem"),"password":PASS.decode()})
    assert response.status_code == 200 and response.data == upload()[0].getvalue(); response.close(); clean(app)
    response = api(client,"signatures/sign",{"file":upload(),"private_key":upload(private.read_bytes(),"private.pem"),"password":PASS.decode()})
    assert response.status_code == 200; sig=response.data; response.close(); clean(app)
    for content, valid in [(upload()[0].getvalue(),True),(b"tampered",False)]:
        response = api(client,"signatures/verify",{"file":upload(content),"public_key":upload(public.read_bytes(),"public.pem"),"signature":upload(sig,"report.sig")})
        assert response.status_code == 200 and response.json["valid"] is valid and not response.json["identity_verified"]
    clean(app)


def test_rekey_inspect_hash_lab(app):
    client = app.test_client()
    response=api(client,"crypto/encrypt",{"file":upload(),"password":"old secret","algorithm":"chacha20-poly1305","kdf":"scrypt"})
    assert response.status_code == 200; encrypted=response.data; response.close()
    inspected=api(client,"crypto/inspect",{"file":upload(encrypted)}).json
    assert inspected["format"] == "CGCRYPT2" and inspected["cost"] == 32768 and not inspected["authenticated"]
    lab=api(client,"tools/tamper-test",{"file":upload(encrypted),"password":"old secret"})
    assert lab.status_code == 200 and lab.json["all_rejected"]
    assert all(not i["plaintext_published"] for i in lab.json["results"])
    response=api(client,"crypto/rekey",{"file":upload(encrypted),"password":"old secret","new_password":"new secret","algorithm":"aes-128-gcm","kdf":"pbkdf2"})
    assert response.status_code == 200; rekeyed=response.data; response.close()
    response=api(client,"crypto/decrypt",{"file":upload(rekeyed),"password":"new secret"})
    assert response.status_code == 200 and response.data == upload()[0].getvalue(); response.close()
    response=api(client,"crypto/decrypt",{"file":upload(rekeyed),"password":"old secret"})
    assert response.status_code == 422
    for algorithm in ["sha256","sha512","sha3-256"]:
        response=api(client,"tools/hash",{"file":upload(b"abc"),"algorithm":algorithm})
        assert response.status_code == 200 and response.json["digest"] == hashlib.new(algorithm.replace("-","_"),b"abc").hexdigest()
    clean(app)


def test_tools_validation_cleanup_and_limits(app, keys):
    client=app.test_client(); private, public, _=keys
    assert api(client,"keys/generate",{"password":"short"}).status_code == 400
    assert api(client,"keys/inspect",{"public_key":upload(b"x"*16385)}).status_code == 413
    assert api(client,"keys/inspect",{"public_key":upload(private.read_bytes())}).status_code == 422
    assert api(client,"keys/inspect",{"public_key":upload(public.read_bytes()+private.read_bytes())}).status_code == 422
    assert api(client,"tools/hash",{"file":upload(),"algorithm":"md5"}).status_code == 400
    assert api(client,"tools/hash",MultiDict([("file",upload()),("algorithm","sha256"),("algorithm","sha512")])).status_code == 400
    assert client.post("/api/v1/keys/generate",base_url=BASE,data={"password":PASS.decode()}).status_code == 403
    assert api(client,"crypto/inspect",{"file":upload(b"CGCRYPT2"+b"\xff"*80)}).status_code == 422
    clean(app)


def test_key_generation_api(app):
    response=api(app.test_client(),"keys/generate",{"password":PASS.decode()})
    assert response.status_code == 200
    assert "BEGIN ENCRYPTED PRIVATE KEY" in response.json["private_pem"]
    assert "BEGIN PUBLIC KEY" in response.json["public_pem"]
    assert response.headers["Cache-Control"] == "no-store"
    assert len(response.json["fingerprint"]) == 64
    clean(app)


def test_isolated_benchmarks(app):
    client=app.test_client()
    response=api(client,"crypto/benchmark/core",{"file":upload(bytes(range(256))*1024)})
    assert response.status_code == 200, response.json
    report=response.json
    assert report["roundtrip_verified"] and not report["includes_kdf"] and not report["includes_file_io"]
    assert report["runs"] == 3 and report["warmup_runs"] == 1 and len(report["results"]) == 4
    for item in report["results"]:
        assert len(item["encrypt_samples_ms"]) == len(item["decrypt_samples_ms"]) == 3
        assert item["encrypt_median_ms"] > 0 and item["decrypt_median_ms"] > 0
    response=api(client,"crypto/benchmark/kdf",{"password":PASS.decode()})
    assert response.status_code == 200, response.json
    assert response.json["timing_scope"] == "key_derivation_only"
    assert len(response.json["results"]) == 2 and all(i["median_ms"] > 0 for i in response.json["results"])
    assert api(client,"crypto/benchmark/core",{"file":upload(b"")}).status_code == 400
    clean(app)
