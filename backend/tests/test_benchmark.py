import io
import statistics
import subprocess
from pathlib import Path

import pytest
from werkzeug.datastructures import MultiDict

BASE = "http://localhost:8080"
ENDPOINT = "/api/v1/crypto/benchmark"


def headers(client):
    return {"X-CSRF-Token": client.get("/api/v1/session", base_url=BASE).json["csrf_token"], "Origin": BASE}


def post(client, content=b"benchmark data" * 1000, **fields):
    return client.post(ENDPOINT, base_url=BASE, headers=headers(client),
                       data={"file": (io.BytesIO(content), "test.bin"), "password": "mật khẩu đo", "runs": "1", **fields})


def assert_clean(app):
    assert not list(Path(app.config["CRYPTO_TEMP_DIR"]).iterdir())
    slots = app.extensions["crypto_slots"]
    assert slots.acquire(False) and slots.acquire(False)
    slots.release()
    slots.release()


def test_real_native_benchmark_metrics_and_cleanup(app):
    content = bytes(range(256)) * 100
    response = post(app.test_client(), content, runs="2")
    assert response.status_code == 200
    report = response.json
    assert report["runs"] == 2
    assert report["input_bytes"] == len(content)
    assert report["pbkdf2_iterations"] == 600000
    assert report["timing_scope"] == "native_process_wall_clock"
    assert report["includes_kdf"] and report["includes_file_io"] and report["includes_process_startup"]
    assert report["includes_http_transfer"] is False
    assert "no-store" in response.headers["Cache-Control"]
    for item in report["results"]:
        assert len(item["samples_ms"]) == 2
        assert all(value > 0 for value in item["samples_ms"])
        assert item["median_ms"] == statistics.median(item["samples_ms"])
        assert item["min_ms"] <= item["median_ms"] <= item["max_ms"]
        assert item["mean_ms"] == statistics.mean(item["samples_ms"])
        assert item["stddev_ms"] == statistics.pstdev(item["samples_ms"])
        assert item["throughput_mib_s"] == pytest.approx(len(content) / 1048576 / (item["median_ms"] / 1000))
        gcm = item["algorithm"] != "aes-256-cbc-hmac-sha256"
        overhead = 68 if gcm else 84 + 16 - len(content) % 16
        assert item["overhead_bytes"] == overhead
        assert item["output_bytes"] == len(content) + overhead
        assert item["iv_bytes"] == (12 if gcm else 16)
        assert item["tag_bytes"] == (16 if gcm else 32)
    assert "mật khẩu đo" not in response.get_data(as_text=True)
    assert_clean(app)


@pytest.mark.parametrize("fields", [{"runs": "0"}, {"runs": "4"}, {"runs": "1.5"}, {"runs": "x"},
                                         {"password": ""}, {"password": "a" * 1025}, {"algorithm": "des"}])
def test_benchmark_invalid_fields(app, fields):
    assert post(app.test_client(), **fields).status_code == 400
    assert_clean(app)


def test_benchmark_limits_empty_file_and_csrf(app):
    client = app.test_client()
    assert post(client, b"").status_code == 400
    app.config["BENCHMARK_MAX_FILE_BYTES"] = 16
    assert post(client, b"x" * 17).status_code == 413
    app.config["MAX_FILE_BYTES"] = 8
    assert post(client, b"x" * 9).status_code == 413
    assert client.post(ENDPOINT, base_url=BASE).status_code == 403
    assert client.post(ENDPOINT, base_url=BASE, headers=headers(client), json={}).status_code == 415
    assert_clean(app)


def test_benchmark_malformed_multipart(app):
    client = app.test_client()
    for data in [
        {"password": "x"},
        MultiDict([("file", (io.BytesIO(b"x"), "x")), ("password", "one"), ("password", "two")]),
        MultiDict([("file", (io.BytesIO(b"x"), "x")), ("file", (io.BytesIO(b"y"), "y")), ("password", "x")]),
    ]:
        assert client.post(ENDPOINT, base_url=BASE, headers=headers(client), data=data,
                           content_type="multipart/form-data").status_code == 400
        assert_clean(app)


def test_benchmark_timeout_and_secret_frame_cleanup(app, monkeypatch):
    frames = []
    def timeout(command, **kwargs):
        assert "mật khẩu đo" not in " ".join(command)
        assert kwargs["shell"] is False
        assert 0 < kwargs["timeout"] <= app.config["CRYPTO_TIMEOUT_SECONDS"]
        frames.append(kwargs["input"])
        raise subprocess.TimeoutExpired(command, 1)
    monkeypatch.setattr(subprocess, "run", timeout)
    assert post(app.test_client()).status_code == 504
    assert frames and not any(frames[0])
    assert_clean(app)


def test_benchmark_native_failures_and_busy(app, monkeypatch):
    client = app.test_client()
    slots = app.extensions["crypto_slots"]
    assert slots.acquire(False) and slots.acquire(False)
    assert post(client).status_code == 429
    slots.release()
    slots.release()
    monkeypatch.setattr(subprocess, "run", lambda *a, **kw: subprocess.CompletedProcess(a[0], 5))
    assert post(client).status_code == 500
    assert_clean(app)
    app.config["CRYPTO_BINARY"] = str(Path(app.config["CRYPTO_TEMP_DIR"]) / "missing")
    assert post(client).status_code == 503
    assert_clean(app)
