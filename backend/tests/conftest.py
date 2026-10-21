import os
from pathlib import Path
import sys

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from cryptoweb import create_app  # noqa: E402


@pytest.fixture(scope="session")
def binary():
    value = ROOT / "build" / ("crypto-cli.exe" if os.name == "nt" else "crypto-cli")
    if not value.is_file():
        pytest.fail("Build native code first: python scripts/build.py")
    return value


@pytest.fixture
def app(tmp_path, binary):
    temporary = tmp_path / "jobs"
    temporary.mkdir()
    return create_app({
        "TESTING": True,
        "SECRET_KEY": "test-key-not-used-outside-tests",
        "CRYPTO_BINARY": str(binary),
        "CRYPTO_TEMP_DIR": str(temporary),
        "ALLOWED_HOSTS": {"localhost:8080", "127.0.0.1:8080"},
    })
