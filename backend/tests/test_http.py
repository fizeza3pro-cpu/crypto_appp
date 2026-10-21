"""Real Waitress HTTP round trip, not only Flask's in-process test client."""

import hashlib
from http.cookiejar import CookieJar
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
import uuid


def multipart(payload, name, password, algorithm=None):
    boundary = "crypto-test-" + uuid.uuid4().hex
    chunks = []
    fields = {"password": password}
    if algorithm is not None:
        fields["algorithm"] = algorithm
    for key, value in fields.items():
        chunks.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{key}"\r\n\r\n{value}\r\n'.encode())
    chunks += [f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{name}"\r\nContent-Type: application/octet-stream\r\n\r\n'.encode(),
               payload, f"\r\n--{boundary}--\r\n".encode()]
    return b"".join(chunks), f"multipart/form-data; boundary={boundary}"


def test_real_http_round_trip(binary, tmp_path):
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        port = probe.getsockname()[1]
    root = Path(__file__).resolve().parents[1]
    jobs = tmp_path / "http-jobs"
    jobs.mkdir()
    environment = {**os.environ, "CRYPTO_PORT": str(port), "CRYPTO_TEMP_DIR": str(jobs)}
    process = subprocess.Popen([sys.executable, "run.py"], cwd=root, env=environment,
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    base = f"http://127.0.0.1:{port}"
    browser = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(CookieJar()))
    try:
        for attempt in range(100):
            assert process.poll() is None, "HTTP server exited before startup"
            try:
                with browser.open(base + "/api/v1/health", timeout=1) as response:
                    assert json.load(response)["native_ready"]
                break
            except urllib.error.URLError:
                time.sleep(0.05)
        else:
            raise AssertionError("HTTP server did not start")
        with browser.open(base + "/api/v1/session", timeout=5) as response:
            csrf = json.load(response)["csrf_token"]
        original = bytes(range(256)) * 1024
        for algorithm in ("aes-256-gcm", "aes-256-cbc-hmac-sha256"):
            data, content_type = multipart(original, "report.pdf", "HTTP mật khẩu", algorithm)
            headers = {"Content-Type": content_type, "Origin": base, "X-CSRF-Token": csrf}
            upload = urllib.request.Request(base + "/api/v1/crypto/encrypt", data=data, headers=headers)
            with browser.open(upload, timeout=15) as response:
                assert response.status == 200
                assert response.headers["Content-Type"] == "application/octet-stream"
                encrypted = response.read()
            data, content_type = multipart(encrypted, "report.pdf.enc", "HTTP mật khẩu")
            headers["Content-Type"] = content_type
            upload = urllib.request.Request(base + "/api/v1/crypto/decrypt", data=data, headers=headers)
            with browser.open(upload, timeout=15) as response:
                assert hashlib.sha256(response.read()).digest() == hashlib.sha256(original).digest()
        for attempt in range(100):
            if not list(jobs.iterdir()):
                break
            time.sleep(0.02)
        assert not list(jobs.iterdir()), "HTTP stream did not clean temporary files"
    finally:
        process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=5)
