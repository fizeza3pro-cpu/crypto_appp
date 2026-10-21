from pathlib import Path


def test_frontend_and_api_have_separate_content_policies(app, tmp_path):
    frontend = tmp_path / "frontend"
    assets = frontend / "assets"
    assets.mkdir(parents=True)
    (frontend / "index.html").write_text('<!doctype html><html lang="vi"><title>Crypto App</title></html>', encoding="utf-8")
    (assets / "app-123.js").write_text('console.info("test")', encoding="utf-8")
    app.config["FRONTEND_DIR"] = str(frontend)
    client = app.test_client()
    result = client.get("/", base_url="http://localhost:8080")
    assert result.status_code == 200
    assert "Crypto App" in result.get_data(as_text=True)
    assert "script-src 'self'" in result.headers["Content-Security-Policy"]
    for path in ("/workspace", "/workspace/", "/workspace?tab=benchmark"):
        page = client.get(path, base_url="http://localhost:8080")
        assert page.status_code == 200
        assert page.get_data() == result.get_data()
        assert "script-src 'self'" in page.headers["Content-Security-Policy"]
        page.close()
    asset = client.get("/assets/app-123.js", base_url="http://localhost:8080")
    assert asset.status_code == 200
    assert "max-age=31536000" in asset.headers["Cache-Control"]
    result.close()
    asset.close()
    result = client.get("/api/v1/health", base_url="http://localhost:8080")
    assert "default-src 'none'" in result.headers["Content-Security-Policy"]
    assert result.headers["Cache-Control"] == "no-store"
    for path in ("/assets/../index.html", "/assets/../../README.md", "/README.md", "/native/crypto.c"):
        result = client.get(path, base_url="http://localhost:8080")
        assert result.status_code == 404


def test_missing_frontend_build_is_a_404_not_a_filesystem_leak(app, tmp_path):
    app.config["FRONTEND_DIR"] = str(Path(tmp_path) / "missing-build")
    result = app.test_client().get("/", base_url="http://localhost:8080")
    assert result.status_code == 404
    assert "missing-build" not in result.get_data(as_text=True)


def test_landing_images_are_served_from_the_public_images_directory(app, tmp_path):
    frontend = tmp_path / "frontend"
    images = frontend / "images" / "landing"
    images.mkdir(parents=True)
    content = b"RIFF\x00\x00\x00\x00WEBP"
    (images / "lock.webp").write_bytes(content)
    (frontend / "private.txt").write_text("not public", encoding="utf-8")
    app.config["FRONTEND_DIR"] = str(frontend)
    client = app.test_client()
    result = client.get("/images/landing/lock.webp", base_url="http://localhost:8080")
    assert result.status_code == 200
    assert result.mimetype == "image/webp"
    assert result.get_data() == content
    assert "max-age=86400" in result.headers["Cache-Control"]
    assert result.headers["X-Content-Type-Options"] == "nosniff"
    result.close()
    for path in ("/images/missing.jpg", "/images/../private.txt", "/images/../../README.md"):
        result = client.get(path, base_url="http://localhost:8080")
        assert result.status_code == 404
        assert b"not public" not in result.get_data()
