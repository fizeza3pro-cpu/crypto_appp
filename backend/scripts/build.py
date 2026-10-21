"""Build the C/OpenSSL worker used by the web API."""

import os
from pathlib import Path
import shlex
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[1]


def main():
    cc = os.environ.get("CC", "gcc")
    if not shutil.which(cc) or not shutil.which("pkg-config"):
        raise SystemExit("Need GCC, pkg-config and OpenSSL 3 development files. See README.md.")
    try:
        version = subprocess.check_output(["pkg-config", "--modversion", "openssl"], text=True).strip()
        if int(version.split(".")[0]) < 3:
            raise SystemExit("OpenSSL 3 or newer is required")
        flags = shlex.split(subprocess.check_output(
            ["pkg-config", "--cflags", "--libs", "openssl"], text=True))
    except subprocess.CalledProcessError:
        raise SystemExit("OpenSSL development files not found. See README.md.") from None
    build = ROOT / "build"
    build.mkdir(exist_ok=True)
    binary = build / ("crypto-cli.exe" if os.name == "nt" else "crypto-cli")
    command = [cc, "-D_FILE_OFFSET_BITS=64", "-std=c11", "-O2", "-Wall", "-Wextra",
               "-Wpedantic", "-Werror", "-fstack-protector-strong"]
    if os.name == "nt":
        command.append("-municode")
    command += [str(ROOT / "native" / "main.c"), str(ROOT / "native" / "crypto.c"),
                str(ROOT / "native" / "advanced.c"),
                str(ROOT / "native" / "benchmark.c"),
                "-o", str(binary), *flags]
    subprocess.run(command, check=True, cwd=ROOT)
    subprocess.run([str(binary), "--version"], check=True, cwd=ROOT)
    print(f"Built: {binary}")


if __name__ == "__main__":
    main()
