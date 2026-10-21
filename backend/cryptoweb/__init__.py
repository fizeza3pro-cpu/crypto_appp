"""Local-only API. Encryption lives in native/crypto.c, not in Python."""

from __future__ import annotations

import hmac
import json
import os
import secrets
import statistics
import struct
import subprocess
import tempfile
import threading
import time
import unicodedata
from pathlib import Path
from urllib.parse import quote

from flask import Flask, Request, Response, g, jsonify, request, send_from_directory, session
from werkzeug.exceptions import HTTPException
from .catalog import SUITES

ROOT = Path(__file__).resolve().parents[1]
ALGORITHMS = tuple(SUITES)


class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str):
        self.status, self.code, self.message = status, code, message


class PrivateUploadRequest(Request):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._private_streams = []

    def _get_file_stream(self, total_content_length, content_type, filename=None, content_length=None):
        # Multipart parser streams directly to a private per-request directory.
        stream = tempfile.TemporaryFile(mode="w+b", dir=g.job_directory)
        self._private_streams.append(stream)
        return stream

    def close(self):
        # A malformed/oversized multipart body can fail before request.files exists.
        for stream in self._private_streams:
            stream.close()
        self._private_streams.clear()
        super().close()


class DownloadStream:
    """Owns the result and its directory until WSGI closes the response iterator."""

    def __init__(self, path: Path, directory, slots):
        self.file = path.open("rb")
        self.directory, self.slots, self.closed = directory, slots, False

    def __iter__(self):
        return self

    def __next__(self):
        if self.closed:
            raise StopIteration
        block = self.file.read(65536)
        if not block:
            self.close()
            raise StopIteration
        return block

    def close(self):
        if not self.closed:
            self.closed = True
            try:
                self.file.close()
                self.directory.cleanup()
            finally:
                self.slots.release()


def attachment_name(filename: str, encrypt: bool) -> str:
    # Names are for Content-Disposition only; never filesystem paths.
    filename = filename.replace("\\", "/").rsplit("/", 1)[-1]
    filename = "".join(c for c in filename if not unicodedata.category(c).startswith("C"))
    filename = filename.strip(" .")[:180] or "file"
    if encrypt:
        return filename + ".enc"
    if filename.lower().endswith(".enc"):
        filename = filename[:-4].strip(" .") or "file"
    path = Path(filename)
    return f"{path.stem}.decrypted{path.suffix}"


def create_app(test_config=None) -> Flask:
    app = Flask(__name__, static_folder=None)
    app.request_class = PrivateUploadRequest
    max_file_bytes = int(os.environ.get("CRYPTO_MAX_FILE_MB", "256")) * 1024 * 1024
    port = int(os.environ.get("CRYPTO_PORT", "8080"))
    app.config.from_mapping(
        SECRET_KEY=secrets.token_bytes(32),
        SESSION_COOKIE_NAME="crypto_local_session",
        SESSION_COOKIE_HTTPONLY=True,
        SESSION_COOKIE_SAMESITE="Strict",
        SESSION_COOKIE_SECURE=False,  # HTTP loopback; never expose this app publicly.
        TRUSTED_HOSTS=["127.0.0.1", "localhost"],
        MAX_FILE_BYTES=max_file_bytes,
        MAX_CONTENT_LENGTH=max_file_bytes + 65536,
        MAX_FORM_MEMORY_SIZE=131072,
        MAX_FORM_PARTS=8,
        CRYPTO_BINARY=str(ROOT / "build" / ("crypto-cli.exe" if os.name == "nt" else "crypto-cli")),
        CRYPTO_TIMEOUT_SECONDS=120,
        CRYPTO_MAX_CONCURRENT=2,
        CRYPTO_TEMP_DIR=os.environ.get("CRYPTO_TEMP_DIR"),
        BENCHMARK_MAX_FILE_BYTES=min(max_file_bytes, 64 * 1024 * 1024),
        FRONTEND_DIR=str(ROOT.parent / "frontend" / "dist"),
        ALLOWED_HOSTS={f"localhost:{port}", f"127.0.0.1:{port}"},
    )
    if test_config:
        app.config.update(test_config)
    if app.config["MAX_FILE_BYTES"] <= 0 or app.config["CRYPTO_MAX_CONCURRENT"] <= 0:
        raise ValueError("File size and concurrency limits must be positive")
    slots = threading.BoundedSemaphore(app.config["CRYPTO_MAX_CONCURRENT"])
    app.extensions["crypto_slots"] = slots

    @app.before_request
    def local_access_and_csrf():
        if request.remote_addr not in {"127.0.0.1", "::1"}:
            raise ApiError(403, "local_only", "API chỉ cho phép truy cập trên máy này.")
        if request.host.lower() not in app.config["ALLOWED_HOSTS"]:
            raise ApiError(400, "invalid_host", "Địa chỉ truy cập không hợp lệ.")
        origin = request.headers.get("Origin")
        if origin is not None and origin != f"http://{request.host.lower()}":
            raise ApiError(403, "invalid_origin", "Yêu cầu phải đến từ cùng địa chỉ ứng dụng.")
        if request.headers.get("Sec-Fetch-Site") == "cross-site":
            raise ApiError(403, "invalid_origin", "Không chấp nhận yêu cầu từ website khác.")
        if request.method not in {"GET", "HEAD", "OPTIONS"}:
            expected = session.get("csrf_token", "")
            supplied = request.headers.get("X-CSRF-Token", "")
            if not expected or not hmac.compare_digest(expected.encode("utf-8"), supplied.encode("utf-8")):
                raise ApiError(403, "invalid_csrf", "Phiên chưa hợp lệ. Hãy tải lại phiên ứng dụng.")

    @app.after_request
    def response_headers(response):
        if request.path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-store"
        else:
            response.headers.setdefault("Cache-Control", "no-cache")
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["Content-Security-Policy"] = (
            "default-src 'none'; frame-ancestors 'none'" if request.path.startswith("/api/") else
            "default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; "
            "img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; "
            "base-uri 'self'; frame-ancestors 'none'; form-action 'self'"
        )
        return response

    @app.errorhandler(ApiError)
    def api_error(error):
        return jsonify(error={"code": error.code, "message": error.message}), error.status

    @app.errorhandler(HTTPException)
    def http_error(error):
        messages = {
            400: "Yêu cầu không hợp lệ.", 404: "Không tìm thấy API.",
            405: "Phương thức không được hỗ trợ.", 413: "Tệp hoặc nội dung gửi lên vượt giới hạn.",
        }
        return jsonify(error={"code": f"http_{error.code}",
                              "message": messages.get(error.code, "Yêu cầu không thể thực hiện.")}), error.code

    @app.errorhandler(Exception)
    def unexpected_error(_error):
        # Do not log request bodies, passwords, subprocess stdin or local paths.
        app.logger.error("Unhandled backend error; sensitive request details omitted")
        return jsonify(error={"code": "internal_error", "message": "Có lỗi xử lý nội bộ."}), 500

    @app.get("/api/v1/health")
    def health():
        ready = Path(app.config["CRYPTO_BINARY"]).is_file()
        return jsonify(status="ok" if ready else "not_ready", version="2.0.0",
                       native_ready=ready), 200 if ready else 503

    @app.get("/api/v1/session")
    def bootstrap_session():
        if "csrf_token" not in session:
            session["csrf_token"] = secrets.token_urlsafe(32)
        return jsonify(csrf_token=session["csrf_token"])

    @app.get("/api/v1/capabilities")
    def capabilities():
        try:
            native = json.loads(subprocess.check_output([app.config["CRYPTO_BINARY"], "--capabilities"], timeout=5))
        except (OSError, subprocess.SubprocessError, ValueError):
            raise ApiError(503, "native_not_ready", "Cần biên dịch lại module C/OpenSSL.") from None
        return jsonify(
            openssl=native["openssl"],
            algorithms=[dict(id=id, name=spec["name"], recommended=id == ALGORITHMS[0]) for id, spec in SUITES.items() if id in native["algorithms"]],
            default_algorithm=ALGORITHMS[0], file_format="CGCRYPT1", kdf="PBKDF2-HMAC-SHA256",
            pbkdf2_iterations=600000, max_file_bytes=app.config["MAX_FILE_BYTES"],
            max_encrypted_file_bytes=app.config["MAX_FILE_BYTES"] + 1024,
            kdfs=[dict(id="pbkdf2", name="PBKDF2-HMAC-SHA256", iterations=600000),
                  *([dict(id="scrypt", name="scrypt", N=32768, r=8, p=1, max_memory_bytes=67108864)] if native["scrypt_available"] else [])],
            file_formats=["CGCRYPT1", "CGCRYPT2", "CGHYBRD1"],
            features=["password", "hybrid-rsa-oaep", "rsa-pss", "keygen", "hash", "inspect", "rekey"],
            max_concurrent=app.config["CRYPTO_MAX_CONCURRENT"], local_only=True,
            subscriptions_enabled=False,
            benchmark_max_file_bytes=min(app.config["BENCHMARK_MAX_FILE_BYTES"], app.config["MAX_FILE_BYTES"]),
            benchmark_max_runs=3,
        )

    @app.get("/api/v1/plans")
    def plans():
        # Landing-page draft, not an entitlement/payment implementation.
        return jsonify(illustrative=True, subscriptions_enabled=False, currency="VND", interval="month",
                       items=[
                           {"id": "free", "name": "Free", "price": 0, "featured": False,
                            "features": ["Mã hóa và giải mã tệp", "AES-256 với OpenSSL", "Xử lý cục bộ"]},
                           {"id": "plus", "name": "Plus", "price": 99000, "featured": True,
                            "features": ["Mọi tính năng của Free", "Xử lý nhiều tệp (dự kiến)", "Lưu tùy chọn (dự kiến)"]},
                           {"id": "pro", "name": "Pro", "price": 199000, "featured": False,
                            "features": ["Mọi tính năng của Plus", "Tùy chỉnh quy trình (dự kiến)", "Hỗ trợ ưu tiên (dự kiến)"]},
                       ])

    @app.get("/api/v1/testimonials")
    def testimonials():
        return jsonify(items=[], message="Chưa có phản hồi người dùng đã được xác nhận.")

    @app.get("/")
    @app.get("/workspace")
    @app.get("/workspace/")
    def frontend_page():
        return send_from_directory(app.config["FRONTEND_DIR"], "index.html", max_age=0)

    @app.get("/assets/<path:filename>")
    def frontend_asset(filename):
        return send_from_directory(Path(app.config["FRONTEND_DIR"]) / "assets", filename,
                                   max_age=31536000)

    @app.get("/images/<path:filename>")
    def frontend_image(filename):
        # Public landing-page media only; never expose the project directory.
        return send_from_directory(Path(app.config["FRONTEND_DIR"]) / "images", filename,
                                   mimetype="image/webp" if Path(filename).suffix.lower() == ".webp" else None,
                                   max_age=86400)

    @app.get("/favicon.svg")
    def frontend_favicon():
        return send_from_directory(app.config["FRONTEND_DIR"], "favicon.svg", max_age=86400)

    def transform(encrypt: bool):
        if not slots.acquire(blocking=False):
            raise ApiError(429, "busy", "Đang có nhiều tệp được xử lý. Hãy thử lại sau.")
        directory = None
        stream = None
        transferred = False
        try:
            if not Path(app.config["CRYPTO_BINARY"]).is_file():
                raise ApiError(503, "native_not_ready", "Cần biên dịch module C/OpenSSL trước.")
            if request.mimetype != "multipart/form-data":
                raise ApiError(415, "multipart_required", "Hãy gửi tệp bằng multipart/form-data.")
            directory = tempfile.TemporaryDirectory(prefix="crypto-job-", dir=app.config["CRYPTO_TEMP_DIR"])
            g.job_directory = directory.name
            allowed_fields = {"password", "algorithm", "kdf"} if encrypt else {"password"}
            if set(request.files) != {"file"} or len(request.files.getlist("file")) != 1:
                raise ApiError(400, "invalid_file", "Mỗi yêu cầu cần đúng một trường file.")
            if set(request.form) - allowed_fields or any(len(v) != 1 for _, v in request.form.lists()):
                raise ApiError(400, "invalid_fields", "Các trường gửi lên không hợp lệ.")
            password = request.form.get("password", "").encode("utf-8")
            if not 1 <= len(password) <= 1024:
                raise ApiError(400, "invalid_password", "Mật khẩu phải dài từ 1 đến 1024 byte UTF-8.")
            algorithm = request.form.get("algorithm", ALGORITHMS[0])
            if encrypt and algorithm not in ALGORITHMS:
                raise ApiError(400, "invalid_algorithm", "Thuật toán không được hỗ trợ.")
            kdf = request.form.get("kdf", "pbkdf2")
            if encrypt and kdf not in {"pbkdf2", "scrypt"}:
                raise ApiError(400, "invalid_kdf", "KDF không được hỗ trợ.")
            upload = request.files["file"]
            if not upload.filename:
                raise ApiError(400, "invalid_file", "Hãy chọn tệp đầu vào.")
            input_path, output_path = Path(directory.name) / "input", Path(directory.name) / "output"
            size = 0
            with input_path.open("xb") as destination:
                if os.name != "nt":
                    os.fchmod(destination.fileno(), 0o600)
                while block := upload.stream.read(65536):
                    size += len(block)
                    limit = app.config["MAX_FILE_BYTES"] + (0 if encrypt else 100)
                    if size > limit:
                        raise ApiError(413, "file_too_large", "Tệp vượt giới hạn dung lượng cho phép.")
                    destination.write(block)
            upload.close()
            command = [app.config["CRYPTO_BINARY"], "encrypt", algorithm] if encrypt else [app.config["CRYPTO_BINARY"], "decrypt"]
            command += [str(input_path), str(output_path)]
            if encrypt:
                command.append(kdf)
            frame = bytearray(struct.pack(">I", len(password)))
            frame.extend(password)
            del password
            try:
                completed = subprocess.run(command, input=frame, stdout=subprocess.DEVNULL,
                                           stderr=subprocess.DEVNULL, timeout=app.config["CRYPTO_TIMEOUT_SECONDS"],
                                           shell=False, check=False)
            finally:
                frame[:] = b"\0" * len(frame)
            if completed.returncode == 3:
                raise ApiError(422, "authentication_failed", "Mật khẩu sai hoặc tệp đã bị thay đổi/hỏng.")
            if completed.returncode == 2:
                raise ApiError(422, "invalid_encrypted_file", "Tệp mã hóa không đúng định dạng hoặc không được hỗ trợ.")
            if completed.returncode != 0 or not output_path.is_file():
                raise ApiError(500, "crypto_failed", "Không thể xử lý tệp. Kiểm tra dung lượng đĩa và module OpenSSL.")

            output_size = output_path.stat().st_size
            stream = DownloadStream(output_path, directory, slots)
            response = Response(stream, mimetype="application/octet-stream")
            response.content_length = output_size
            name = attachment_name(upload.filename, encrypt)
            # RFC 5987 filename* preserves Unicode without allowing header injection.
            fallback = "encrypted.enc" if encrypt else "decrypted.bin"
            response.headers["Content-Disposition"] = f"attachment; filename=\"{fallback}\"; filename*=UTF-8''{quote(name, safe='')}"
            response.headers["X-Crypto-Operation"] = "encrypt" if encrypt else "decrypt"
            transferred = True
            return response
        except subprocess.TimeoutExpired:
            raise ApiError(504, "processing_timeout", "Quá thời gian xử lý tệp. Hãy thử tệp nhỏ hơn.") from None
        except OSError:
            raise ApiError(503, "storage_or_native_unavailable", "Không thể mở file tạm hoặc chạy module mã hóa.") from None
        finally:
            # Closing multipart streams first also permits cleanup on Windows.
            request.close()
            if not transferred:
                if stream is not None:
                    stream.close()
                else:
                    try:
                        if directory is not None:
                            directory.cleanup()
                    finally:
                        slots.release()

    @app.post("/api/v1/crypto/encrypt")
    def encrypt_endpoint():
        return transform(True)

    @app.post("/api/v1/crypto/decrypt")
    def decrypt_endpoint():
        return transform(False)

    @app.post("/api/v1/crypto/benchmark")
    def benchmark_endpoint():
        """Time the real native worker, not HTTP transfer or an estimated AES speed."""
        if not slots.acquire(blocking=False):
            raise ApiError(429, "busy", "Đang có nhiều tệp được xử lý. Hãy thử lại sau.")
        directory = None
        frame = bytearray()
        try:
            if not Path(app.config["CRYPTO_BINARY"]).is_file():
                raise ApiError(503, "native_not_ready", "Cần biên dịch module C/OpenSSL trước.")
            if request.mimetype != "multipart/form-data":
                raise ApiError(415, "multipart_required", "Hãy gửi tệp bằng multipart/form-data.")
            directory = tempfile.TemporaryDirectory(prefix="crypto-benchmark-", dir=app.config["CRYPTO_TEMP_DIR"])
            g.job_directory = directory.name
            if set(request.files) != {"file"} or len(request.files.getlist("file")) != 1:
                raise ApiError(400, "invalid_file", "Mỗi yêu cầu cần đúng một trường file.")
            if set(request.form) - {"password", "runs"} or any(len(v) != 1 for _, v in request.form.lists()):
                raise ApiError(400, "invalid_fields", "Các trường gửi lên không hợp lệ.")
            runs_value = request.form.get("runs", "3")
            if runs_value not in {"1", "2", "3"}:
                raise ApiError(400, "invalid_runs", "Chọn từ 1 đến 3 lượt đo cho mỗi thuật toán.")
            runs = int(runs_value)
            password = request.form.get("password", "").encode("utf-8")
            if not 1 <= len(password) <= 1024:
                raise ApiError(400, "invalid_password", "Mật khẩu phải dài từ 1 đến 1024 byte UTF-8.")
            frame.extend(struct.pack(">I", len(password)))
            frame.extend(password)
            del password
            upload = request.files["file"]
            if not upload.filename:
                raise ApiError(400, "invalid_file", "Hãy chọn tệp đầu vào.")
            input_path = Path(directory.name) / "input"
            size = 0
            limit = min(app.config["BENCHMARK_MAX_FILE_BYTES"], app.config["MAX_FILE_BYTES"])
            with input_path.open("xb") as destination:
                if os.name != "nt":
                    os.fchmod(destination.fileno(), 0o600)
                while block := upload.stream.read(65536):
                    size += len(block)
                    if size > limit:
                        raise ApiError(413, "file_too_large", "Tệp vượt giới hạn đo hiệu năng cho phép.")
                    destination.write(block)
            upload.close()
            if size == 0:
                raise ApiError(400, "empty_benchmark_file", "Hãy chọn tệp có dữ liệu để đo tốc độ xử lý.")
            measurements = {algorithm: [] for algorithm in ALGORITHMS}
            output_sizes = {}
            deadline = time.perf_counter() + app.config["CRYPTO_TIMEOUT_SECONDS"]
            # Alternate which algorithm runs first, reducing fixed ordering bias.
            # No warmup is excluded; all requested runs are reported.
            for repeat in range(runs):
                order = ALGORITHMS if repeat % 2 == 0 else tuple(reversed(ALGORITHMS))
                for algorithm in order:
                    remaining = deadline - time.perf_counter()
                    if remaining <= 0:
                        raise subprocess.TimeoutExpired("benchmark", app.config["CRYPTO_TIMEOUT_SECONDS"])
                    output_path = Path(directory.name) / "output"
                    command = [app.config["CRYPTO_BINARY"], "encrypt", algorithm, str(input_path), str(output_path)]
                    started = time.perf_counter()
                    completed = subprocess.run(command, input=frame, stdout=subprocess.DEVNULL,
                                               stderr=subprocess.DEVNULL, timeout=remaining,
                                               shell=False, check=False)
                    elapsed = (time.perf_counter() - started) * 1000
                    if completed.returncode != 0 or not output_path.is_file():
                        raise ApiError(500, "crypto_failed", "Không thể đo mã hóa. Hãy kiểm tra module OpenSSL và dung lượng đĩa.")
                    measurements[algorithm].append(elapsed)
                    output_sizes[algorithm] = output_path.stat().st_size
                    output_path.unlink()  # Only this job's generated ciphertext; never the uploaded source.
            results = []
            for algorithm in ALGORITHMS:
                samples = measurements[algorithm]
                median = statistics.median(samples)
                spec = SUITES[algorithm]
                results.append(dict(
                    algorithm=algorithm, name=spec["name"],
                    samples_ms=samples, median_ms=median, min_ms=min(samples), max_ms=max(samples),
                    mean_ms=statistics.mean(samples), stddev_ms=statistics.pstdev(samples),
                    throughput_mib_s=size / 1048576 / (median / 1000) if median > 0 else 0,
                    output_bytes=output_sizes[algorithm], overhead_bytes=output_sizes[algorithm] - size,
                    key_bits=spec["key_bits"], salt_bytes=16, iv_bytes=spec["iv_bytes"],
                    tag_bytes=spec["tag_bytes"], authentication=spec["authentication"],
                ))
            return jsonify(input_bytes=size, runs=runs, results=results, kdf="PBKDF2-HMAC-SHA256",
                           pbkdf2_iterations=600000, file_format="CGCRYPT1", header_bytes=52,
                           timing_scope="native_process_wall_clock", includes_kdf=True,
                           includes_file_io=True, includes_process_startup=True, includes_http_transfer=False)
        except subprocess.TimeoutExpired:
            raise ApiError(504, "processing_timeout", "Quá thời gian đo. Hãy giảm dung lượng tệp hoặc số lượt đo.") from None
        except OSError:
            raise ApiError(503, "storage_or_native_unavailable", "Không thể mở file tạm hoặc chạy module mã hóa.") from None
        finally:
            frame[:] = b"\0" * len(frame)
            request.close()
            try:
                if directory is not None:
                    directory.cleanup()
            finally:
                slots.release()

    from .operations import register_operations
    register_operations(app, slots)
    return app
