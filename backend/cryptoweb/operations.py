"""Bounded request-scoped tools. All cryptographic operations execute in C/OpenSSL."""
import json
import os
import re
import shutil
import statistics
from pathlib import Path
import struct
import subprocess
import tempfile
import time
from urllib.parse import quote

from flask import Response, g, jsonify, request

from . import ApiError, DownloadStream, attachment_name
from .catalog import SUITES


def register_operations(app, slots):
    class Job:
        def __enter__(self):
            self.directory = None
            self.transferred = False
            if not slots.acquire(False):
                raise ApiError(429, "busy", "Ứng dụng đang bận. Hãy thử lại sau.")
            try:
                if request.mimetype != "multipart/form-data":
                    raise ApiError(415, "multipart_required", "Hãy gửi dữ liệu bằng multipart/form-data.")
                self.directory = tempfile.TemporaryDirectory(prefix="crypto-tool-", dir=app.config["CRYPTO_TEMP_DIR"])
                self.root = Path(self.directory.name)
                g.job_directory = self.directory.name
                self.deadline = time.perf_counter() + app.config["CRYPTO_TIMEOUT_SECONDS"]
                return self
            except BaseException:
                slots.release()
                raise

        def __exit__(self, kind, value, traceback):
            request.close()
            if not self.transferred:
                try:
                    self.directory.cleanup()
                finally:
                    slots.release()
            if kind and issubclass(kind, subprocess.TimeoutExpired):
                raise ApiError(504, "processing_timeout", "Quá thời gian xử lý. Hãy thử tệp nhỏ hơn.") from None
            if kind and issubclass(kind, OSError):
                raise ApiError(503, "native_unavailable", "Không thể chạy module C/OpenSSL hoặc ghi tệp tạm.") from None

        def fields(self, files, forms):
            if set(request.files) != set(files) or any(len(v) != 1 for _, v in request.files.lists()):
                raise ApiError(400, "invalid_files", "Thiếu tệp hoặc có trường tệp không hợp lệ.")
            if set(request.form) - set(forms) or any(len(v) != 1 for _, v in request.form.lists()):
                raise ApiError(400, "invalid_fields", "Các trường gửi lên không hợp lệ.")

        def upload(self, field, limit=None):
            upload = request.files[field]
            if not upload.filename:
                raise ApiError(400, "missing_file", "Hãy chọn đủ các tệp cần thiết.")
            path = self.root / field  # Never use the user's filename as a path.
            limit = app.config["MAX_FILE_BYTES"] if limit is None else limit
            size = 0
            with path.open("xb") as output:
                if os.name != "nt":
                    os.fchmod(output.fileno(), 0o600)
                while block := upload.stream.read(65536):
                    size += len(block)
                    if size > limit:
                        raise ApiError(413, "file_too_large", "Tệp vượt giới hạn dung lượng cho phép.")
                    output.write(block)
            upload.close()
            return path

        def run(self, args, password=None):
            frame = bytearray()
            if password is not None:
                frame.extend(struct.pack(">I", len(password)))
                frame.extend(password)
            try:
                completed = subprocess.run([app.config["CRYPTO_BINARY"], *map(str, args)], input=frame,
                    capture_output=True, shell=False, timeout=max(0.001, self.deadline-time.perf_counter()), check=False)
            finally:
                frame[:] = b"\0" * len(frame)
            if completed.returncode == 3:
                raise ApiError(422, "authentication_failed", "Không thể xác thực: khóa, mật khẩu không đúng hoặc tệp đã thay đổi/hỏng.")
            if completed.returncode == 2:
                raise ApiError(422, "invalid_crypto_input", "Khóa hoặc định dạng tệp không được hỗ trợ. Dùng khóa RSA 2048–4096 bit và khóa riêng PKCS#8 có mật khẩu.")
            if completed.returncode != 0:
                raise ApiError(500, "crypto_failed", "OpenSSL không thể hoàn thành tác vụ. Hãy kiểm tra tệp đầu vào và dung lượng đĩa.")
            return json.loads(completed.stdout) if completed.stdout.strip() else None

        def download(self, path, name):
            stream = DownloadStream(path, self.directory, slots)
            response = Response(stream, mimetype="application/octet-stream")
            response.content_length = path.stat().st_size
            response.headers["Content-Disposition"] = f"attachment; filename=\"result.bin\"; filename*=UTF-8''{quote(name, safe='')}"
            self.transferred = True
            return response

    def password(field="password", creating=False):
        value = request.form.get(field, "").encode("utf-8")
        if not 1 <= len(value) <= 1024 or (creating and len(request.form.get(field, "")) < 12):
            raise ApiError(400, "invalid_password", "Mật khẩu cần ít nhất 12 ký tự khi tạo khóa, tối đa 1024 byte UTF-8.")
        return value

    def settings():
        algorithm = request.form.get("algorithm", "aes-256-gcm")
        kdf = request.form.get("kdf", "pbkdf2")
        if algorithm not in SUITES or kdf not in {"pbkdf2", "scrypt"}:
            raise ApiError(400, "invalid_settings", "Thuật toán hoặc KDF không được hỗ trợ.")
        return algorithm, kdf

    @app.post("/api/v1/keys/generate")
    def generate():
        with Job() as job:
            job.fields([], ["password"])
            private, public = job.root / "private.pem", job.root / "public.pem"
            info = job.run(["keygen", private, public], password(creating=True))
            return jsonify(**info, private_pem=private.read_text("ascii"), public_pem=public.read_text("ascii"),
                           protection="PKCS#8 / PBES2 / AES-256-CBC / PBKDF2-HMAC-SHA256 / 600000")

    @app.post("/api/v1/keys/inspect")
    def keyinfo():
        with Job() as job:
            job.fields(["public_key"], [])
            public = job.upload("public_key", 16384)
            content = public.read_bytes()
            if not re.fullmatch(rb"\s*-----BEGIN PUBLIC KEY-----\r?\n[A-Za-z0-9+/=\r\n]+-----END PUBLIC KEY-----\s*", content):
                raise ApiError(422, "invalid_public_pem", "Tệp phải chỉ chứa một khóa công khai SPKI PEM, không kèm khóa riêng hoặc nội dung khác.")
            info = job.run(["keyinfo", public])
            return jsonify(**info, public_pem=public.read_text("ascii"))

    @app.post("/api/v1/crypto/hybrid/encrypt")
    def hybrid_encrypt():
        with Job() as job:
            job.fields(["file", "public_key"], [])
            source, public = job.upload("file"), job.upload("public_key", 16384)
            output = job.root / "output"
            job.run(["hybrid-encrypt", source, output, public])
            return job.download(output, attachment_name(request.files["file"].filename, True))

    @app.post("/api/v1/crypto/hybrid/decrypt")
    def hybrid_decrypt():
        with Job() as job:
            job.fields(["file", "private_key"], ["password"])
            source = job.upload("file", app.config["MAX_FILE_BYTES"] + 1024)
            private = job.upload("private_key", 16384)
            output = job.root / "output"
            job.run(["hybrid-decrypt", source, output, private], password())
            return job.download(output, attachment_name(request.files["file"].filename, False))

    @app.post("/api/v1/signatures/sign")
    def sign():
        with Job() as job:
            job.fields(["file", "private_key"], ["password"])
            source, private = job.upload("file"), job.upload("private_key", 16384)
            output = job.root / "signature"
            job.run(["sign", source, private, output], password())
            name = attachment_name(request.files["file"].filename, True)[:-4] + ".sig"
            return job.download(output, name)

    @app.post("/api/v1/signatures/verify")
    def verify():
        with Job() as job:
            job.fields(["file", "public_key", "signature"], [])
            source, public, sig = job.upload("file"), job.upload("public_key", 16384), job.upload("signature", 1024)
            result = job.run(["verify", source, public, sig])
            return jsonify(**result, identity_verified=False, trusted_timestamp=False)

    @app.post("/api/v1/tools/hash")
    def hash_file():
        with Job() as job:
            job.fields(["file"], ["algorithm"])
            algorithm = request.form.get("algorithm", "sha256")
            if algorithm not in {"sha256", "sha512", "sha3-256"}:
                raise ApiError(400, "invalid_algorithm", "Chọn SHA-256, SHA-512 hoặc SHA3-256.")
            return jsonify(job.run(["hash", algorithm, job.upload("file")]))

    @app.post("/api/v1/crypto/rekey")
    def rekey():
        with Job() as job:
            job.fields(["file"], ["password", "new_password", "algorithm", "kdf"])
            algorithm, kdf = settings()
            source = job.upload("file", app.config["MAX_FILE_BYTES"] + 100)
            plain, output = job.root / "plain", job.root / "output"
            job.run(["decrypt", source, plain], password())
            job.run(["encrypt", algorithm, plain, output, kdf], password("new_password"))
            plain.unlink()
            name = attachment_name(request.files["file"].filename, True)[:-4]
            return job.download(output, name + ".rekey.enc")

    @app.post("/api/v1/crypto/benchmark/core")
    def core_benchmark():
        with Job() as job:
            job.fields(["file"], [])
            source = job.upload("file", min(app.config["MAX_FILE_BYTES"], 16*1024*1024))
            if source.stat().st_size == 0:
                raise ApiError(400, "empty_benchmark_file", "Hãy chọn tệp có dữ liệu để đo.")
            result = job.run(["benchmark-core", source])
            for item in result["results"]:
                for action in ["encrypt", "decrypt"]:
                    values = item[action+"_samples_ms"]
                    median = statistics.median(values)
                    item[action+"_median_ms"] = median
                    item[action+"_mib_s"] = result["input_bytes"]/1048576/(median/1000) if median > 0 else None
                    item[action+"_stddev_ms"] = statistics.pstdev(values)
            return jsonify(**result, includes_kdf=False, includes_file_io=False, includes_process_startup=False,
                           timing_scope="in_memory_cipher_init_update_final_and_authentication")

    @app.post("/api/v1/crypto/benchmark/kdf")
    def kdf_benchmark():
        with Job() as job:
            job.fields([], ["password"])
            result = job.run(["benchmark-kdf", "3"], password())
            for item in result["results"]:
                item["median_ms"] = statistics.median(item["samples_ms"])
                item["stddev_ms"] = statistics.pstdev(item["samples_ms"])
            return jsonify(**result, includes_file_io=False, includes_process_startup=False, timing_scope="key_derivation_only")

    @app.post("/api/v1/tools/tamper-test")
    def tamper_test():
        with Job() as job:
            job.fields(["file"], ["password"])
            source = job.upload("file", min(app.config["MAX_FILE_BYTES"], 16 * 1024 * 1024))
            secret = password()
            plain = job.root / "plain"
            job.run(["decrypt", source, plain], secret)
            plain.unlink()
            with source.open("rb") as f:
                h = f.read(52)
            size = source.stat().st_size
            cases = [("header", "Thay đổi salt trong header", 16),
                     ("ciphertext", "Thay đổi ciphertext", 52 if size > 52+h[48] else size-1),
                     ("tag", "Thay đổi tag xác thực", size-1), ("truncate", "Cắt ngắn tệp", None)]
            if size == 52+h[48]:
                cases = [item for item in cases if item[0] != "ciphertext"]
            results = []
            for id, label, offset in cases:
                mutated = job.root / id
                shutil.copyfile(source, mutated)
                with mutated.open("r+b") as f:
                    if offset is None:
                        f.truncate(size-1)
                    else:
                        f.seek(offset); byte = f.read(1); f.seek(offset); f.write(bytes([byte[0] ^ 1]))
                try:
                    job.run(["decrypt", mutated, plain], secret)
                    results.append(dict(id=id, label=label, rejected=False, plaintext_published=plain.exists()))
                except ApiError as error:
                    if error.status != 422:
                        raise
                    results.append(dict(id=id, label=label, rejected=True, reason=error.code, plaintext_published=plain.exists()))
                if plain.exists():
                    plain.unlink()
                mutated.unlink()
            return jsonify(baseline_authenticated=True, all_rejected=all(i["rejected"] for i in results), results=results)

    @app.post("/api/v1/crypto/inspect")
    def inspect():
        with Job() as job:
            job.fields(["file"], [])
            source = job.upload("file", app.config["MAX_FILE_BYTES"] + 1024)
            with source.open("rb") as f:
                h = f.read(64)
            common = dict(authenticated=False, file_bytes=source.stat().st_size,
                          warning="Thông số đọc từ header chưa được xác thực. Chỉ tin cậy sau khi giải mã thành công.")
            if len(h) >= 64 and h[:8] == b"CGHYBRD1" and h[8:12] == b"\1\1\0\0" and h[60:64] == b"\0"*4:
                wraplen = int.from_bytes(h[12:16], "big")
                if wraplen not in {256, 384, 512} or source.stat().st_size < 64+wraplen+16:
                    raise ApiError(422, "invalid_header", "Header hoặc độ dài tệp không hợp lệ.")
                return jsonify(**common, format="CGHYBRD1", algorithm="AES-256-GCM + RSA-OAEP-SHA256",
                               recipient_fingerprint=h[16:48].hex(), nonce=h[48:60].hex(), tag_bytes=16, header_bytes=64+wraplen)
            if len(h) < 52:
                raise ApiError(422, "invalid_header", "Tệp quá ngắn.")
            v1 = h[:9] == b"CGCRYPT1\1" and h[10] == 0
            v2 = h[:9] == b"CGCRYPT2\2" and h[10] in {1, 2}
            spec = next((v for v in SUITES.values() if v["number"] == h[9]), None)
            cost = int.from_bytes(h[12:16], "big")
            is_scrypt = v2 and h[10] == 2
            if (not (v1 or v2) or not spec or (v1 and h[9] > 2) or h[11] or any(h[50:52]) or
                (cost != 32768 if is_scrypt else not 200000 <= cost <= 2000000) or
                h[48] != spec["tag_bytes"] or h[49] != spec["iv_bytes"] or
                (h[9] != 2 and any(h[44:48])) or source.stat().st_size < 52+h[48] or
                (h[9] == 2 and (source.stat().st_size-52-h[48] == 0 or (source.stat().st_size-52-h[48]) % 16 != 0))):
                raise ApiError(422, "invalid_header", "Header không hợp lệ hoặc không được hỗ trợ.")
            return jsonify(**common, format="CGCRYPT2" if v2 else "CGCRYPT1", algorithm=spec["name"],
                           kdf="scrypt" if is_scrypt else "PBKDF2-HMAC-SHA256", cost=cost,
                           salt=h[16:32].hex(), nonce=h[32:32+h[49]].hex(), tag_bytes=h[48], header_bytes=52)
