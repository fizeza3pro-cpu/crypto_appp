import io
from pathlib import Path
import subprocess
from urllib.parse import quote

import pytest
from werkzeug.datastructures import MultiDict

BASE = "http://localhost:8080"


def token(client):
    result = client.get("/api/v1/session", base_url=BASE)
    assert result.status_code == 200
    return {"X-CSRF-Token": result.json["csrf_token"], "Origin": BASE}


def post(client, endpoint="encrypt", *, headers=None, content=b"file data", filename="report.pdf", **fields):
    return client.post(f"/api/v1/crypto/{endpoint}", base_url=BASE,
                       headers=headers if headers is not None else token(client),
                       data={"file": (io.BytesIO(content), filename), "password": "mật khẩu", **fields})


@pytest.mark.parametrize("algorithm", ["aes-256-gcm", "aes-256-cbc-hmac-sha256"])
def test_round_trip_and_cleanup(app, algorithm):
    client = app.test_client()
    content = bytes(range(256)) * 900
    response = post(client, content=content, filename="tài liệu.pdf", algorithm=algorithm)
    assert response.status_code == 200
    assert "filename*=UTF-8''" + quote("tài liệu.pdf.enc", safe="") in response.headers["Content-Disposition"]
    encrypted = response.get_data()
    response.close()
    assert not list(Path(app.config["CRYPTO_TEMP_DIR"]).iterdir())
    response = post(client, "decrypt", content=encrypted, filename="tài liệu.pdf.enc")
    assert response.status_code == 200
    assert response.get_data() == content
    assert quote("tài liệu.decrypted.pdf", safe="") in response.headers["Content-Disposition"]
    response.close()
    assert not list(Path(app.config["CRYPTO_TEMP_DIR"]).iterdir())


def test_rejected_password_and_corruption(app):
    client = app.test_client()
    response = post(client)
    encrypted = response.get_data()
    response.close()
    for data, password in ((encrypted, "wrong"), (encrypted[:-1] + bytes([encrypted[-1] ^ 1]), "mật khẩu")):
        response = post(client, "decrypt", content=data, password=password)
        assert response.status_code == 422
        assert response.json["error"]["code"] == "authentication_failed"
    assert not list(Path(app.config["CRYPTO_TEMP_DIR"]).iterdir())


def test_origin_host_csrf_and_remote_address(app):
    client = app.test_client()
    assert post(client, headers={}).status_code == 403
    headers = token(client)
    assert post(client, headers={**headers, "Origin": "https://evil.example"}).status_code == 403
    assert post(client, headers={**headers, "Origin": "null"}).status_code == 403
    assert post(client, headers={**headers, "Sec-Fetch-Site": "cross-site"}).status_code == 403
    assert post(client, headers={**headers, "X-CSRF-Token": "é"}).status_code == 403
    assert client.get("/api/v1/session", base_url="http://attacker.test:8080").status_code == 400
    assert client.get("/api/v1/health", base_url=BASE,
                      environ_overrides={"REMOTE_ADDR": "10.0.0.1"}).status_code == 403
    assert not list(Path(app.config["CRYPTO_TEMP_DIR"]).iterdir())


@pytest.mark.parametrize("fields", [{"password": ""}, {"password": "a" * 1025}, {"algorithm": "des"}, {"unexpected": "x"}])
def test_invalid_fields(app, fields):
    response = post(app.test_client(), **fields)
    assert response.status_code == 400
    assert not list(Path(app.config["CRYPTO_TEMP_DIR"]).iterdir())


def test_duplicate_fields_and_missing_file(app):
    client = app.test_client()
    headers = token(client)
    response = client.post("/api/v1/crypto/encrypt", base_url=BASE, headers=headers,
                           data=MultiDict([("file", (io.BytesIO(b"x"), "x")),
                                           ("password", "one"), ("password", "two")]))
    assert response.status_code == 400
    response = client.post("/api/v1/crypto/encrypt", base_url=BASE, headers=headers,
                           data={"password": "x"}, content_type="multipart/form-data")
    assert response.status_code == 400
    assert not list(Path(app.config["CRYPTO_TEMP_DIR"]).iterdir())


def test_upload_limit_and_encrypted_overhead(app):
    app.config.update(MAX_FILE_BYTES=128, MAX_CONTENT_LENGTH=1024 * 1024)
    client = app.test_client()
    assert post(client, content=b"x" * 129).status_code == 413
    response = post(client, content=b"x" * 128)
    assert response.status_code == 200
    encrypted = response.get_data()
    response.close()
    assert len(encrypted) > 128
    response = post(client, "decrypt", content=encrypted)
    assert response.status_code == 200
    assert response.get_data() == b"x" * 128
    response.close()
    app.config["MAX_CONTENT_LENGTH"] = 32
    assert post(client, content=b"x" * 128).status_code == 413
    assert not list(Path(app.config["CRYPTO_TEMP_DIR"]).iterdir())


def test_busy_and_aborted_download_cleanup(app):
    slots = app.extensions["crypto_slots"]
    assert slots.acquire(False) and slots.acquire(False)
    client = app.test_client()
    assert post(client).status_code == 429
    slots.release()
    slots.release()
    response = post(client, content=b"x" * 200000)
    assert response.status_code == 200
    response.close()  # Client aborts before consuming the full response.
    assert not list(Path(app.config["CRYPTO_TEMP_DIR"]).iterdir())
    assert slots.acquire(False) and slots.acquire(False)
    slots.release()
    slots.release()


def test_timeout_native_missing_and_no_password_in_arguments(app, monkeypatch):
    client = app.test_client()
    def timeout(command, **kwargs):
        assert "mật khẩu" not in " ".join(command)
        assert kwargs["shell"] is False
        assert kwargs["input"][4:] == "mật khẩu".encode()
        raise subprocess.TimeoutExpired(command, 1)
    monkeypatch.setattr(subprocess, "run", timeout)
    assert post(client).status_code == 504
    assert not list(Path(app.config["CRYPTO_TEMP_DIR"]).iterdir())
    app.config["CRYPTO_BINARY"] = str(Path(app.config["CRYPTO_TEMP_DIR"]) / "missing.exe")
    assert client.get("/api/v1/health", base_url=BASE).status_code == 503
    assert post(client).status_code == 503


def test_product_catalog_and_security_headers(app):
    client = app.test_client()
    plans = client.get("/api/v1/plans", base_url=BASE)
    assert plans.json["illustrative"] is True
    assert plans.json["subscriptions_enabled"] is False
    assert [item["id"] for item in plans.json["items"]] == ["free", "plus", "pro"]
    assert client.get("/api/v1/testimonials", base_url=BASE).json["items"] == []
    response = client.get("/api/v1/session", base_url=BASE)
    assert "HttpOnly" in response.headers["Set-Cookie"]
    assert "SameSite=Strict" in response.headers["Set-Cookie"]
    assert response.headers["Cache-Control"] == "no-store"
    assert response.headers["X-Content-Type-Options"] == "nosniff"
    assert "Access-Control-Allow-Origin" not in response.headers
    assert client.get("/not-found", base_url=BASE).status_code == 404


def test_download_filename_cannot_escape_or_inject_headers(app):
    client = app.test_client()
    response = post(client, filename="../../secret.txt")
    assert response.status_code == 200
    assert "secret.txt.enc" in response.headers["Content-Disposition"]
    assert "../" not in response.headers["Content-Disposition"]
    response.close()
    assert not list(Path(app.config["CRYPTO_TEMP_DIR"]).iterdir())


def test_failed_multipart_parser_releases_private_streams(app):
    app.config["MAX_FORM_PARTS"] = 4  # Exercise parser limit independently of the larger tool forms.
    client = app.test_client()
    headers = token(client)
    data = MultiDict([("file", (io.BytesIO(b"x" * 100), "first.bin")),
                      ("password", "test"), ("algorithm", "aes-256-gcm"),
                      ("extra1", "a"), ("extra2", "b")])
    result = client.post("/api/v1/crypto/encrypt", base_url=BASE, headers=headers, data=data)
    assert result.status_code == 413
    assert not list(Path(app.config["CRYPTO_TEMP_DIR"]).iterdir())
    result = post(client)
    assert result.status_code == 200
    result.close()
    assert not list(Path(app.config["CRYPTO_TEMP_DIR"]).iterdir())
