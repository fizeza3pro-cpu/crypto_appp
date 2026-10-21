"""Start the local API without debug mode or Flask's development server."""

import os

from waitress import serve

from cryptoweb import create_app

if __name__ == "__main__":
    port = int(os.environ.get("CRYPTO_PORT", "8080"))
    if not 1024 <= port <= 65535:
        raise SystemExit("CRYPTO_PORT must be between 1024 and 65535")
    app = create_app()
    if not os.path.isfile(app.config["CRYPTO_BINARY"]):
        raise SystemExit("Native binary not found. Run: python scripts/build.py")
    print(f"Crypto App backend: http://127.0.0.1:{port}/api/v1/health", flush=True)
    serve(app, host="127.0.0.1", port=port, threads=4,
          max_request_body_size=app.config["MAX_CONTENT_LENGTH"],
          max_request_header_size=16384, channel_timeout=180)
