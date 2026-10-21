#include "crypto.h"
#include <openssl/crypto.h>
#include <openssl/evp.h>
#include <openssl/kdf.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#ifdef _WIN32
#include <fcntl.h>
#include <io.h>
#include <windows.h>
#endif

static int run(int argc, char **argv)
{
    unsigned char prefix[4], password[CRYPTO_PASSWORD_MAX] = {0};
    uint32_t length;
    int encrypt, algorithm = CRYPTO_GCM, code, scrypt = 0, advanced = 0;
    crypto_error error;
    const char *input = NULL, *output = NULL;
    if (argc == 2 && strcmp(argv[1], "--version") == 0) {
        printf("crypto-cli 2.0.0; %s\n", OpenSSL_version(OPENSSL_VERSION));
        return 0;
    }
    if (argc == 2 && strcmp(argv[1], "--capabilities") == 0) {
        const char *names[] = {"AES-256-GCM", "AES-256-CBC", "AES-128-GCM", "CHACHA20-POLY1305"};
        const char *ids[] = {"aes-256-gcm", "aes-256-cbc-hmac-sha256", "aes-128-gcm", "chacha20-poly1305"};
        printf("{\"openssl\":\"%s\",\"algorithms\":[", OpenSSL_version(OPENSSL_VERSION));
        int comma = 0;
        for (int i=0; i<4; i++) {
            EVP_CIPHER *cipher = EVP_CIPHER_fetch(NULL, names[i], NULL);
            if (cipher) { printf("%s\"%s\"", comma ? "," : "", ids[i]); comma = 1; }
            EVP_CIPHER_free(cipher);
        }
        EVP_KDF *kdf = EVP_KDF_fetch(NULL, "SCRYPT", NULL);
        printf("],\"scrypt_available\":%s}\n", kdf ? "true" : "false");
        EVP_KDF_free(kdf);
        return 0;
    }
    encrypt = (argc == 5 || argc == 6) && strcmp(argv[1], "encrypt") == 0;
    if (encrypt) {
        if (strcmp(argv[2], "aes-256-gcm") == 0) algorithm = CRYPTO_GCM;
        else if (strcmp(argv[2], "aes-256-cbc-hmac-sha256") == 0) algorithm = CRYPTO_CBC_HMAC;
        else if (strcmp(argv[2], "aes-128-gcm") == 0) algorithm = CRYPTO_AES128;
        else if (strcmp(argv[2], "chacha20-poly1305") == 0) algorithm = CRYPTO_CHACHA;
        else { fputs("unsupported_algorithm\n", stderr); return CRYPTO_INVALID; }
        input = argv[3]; output = argv[4];
        if (argc == 6) {
            if (strcmp(argv[5], "scrypt") == 0) scrypt = 1;
            else if (strcmp(argv[5], "pbkdf2") != 0) return CRYPTO_INVALID;
        }
    } else if (argc == 4 && strcmp(argv[1], "decrypt") == 0) {
        input = argv[2]; output = argv[3];
    } else if (argc >= 3) {
        advanced = 1;
    } else {
        fputs("Usage: crypto-cli encrypt ALGORITHM INPUT OUTPUT | decrypt INPUT OUTPUT\n"
              "Password protocol on stdin: 4-byte big-endian length, then password bytes.\n",
              stderr);
        return CRYPTO_INVALID;
    }
#ifdef _WIN32
    _setmode(_fileno(stdin), _O_BINARY);
#endif
    if (advanced && (strcmp(argv[1], "keyinfo") == 0 || strcmp(argv[1], "hybrid-encrypt") == 0 ||
                     strcmp(argv[1], "verify") == 0 || strcmp(argv[1], "hash") == 0 || strcmp(argv[1], "benchmark-core") == 0)) {
        code = crypto_advanced(argc, argv, NULL, 0, &error);
        if (code) fprintf(stderr, "%s\n", error.message);
        return code;
    }
    if (fread(prefix, 1, 4, stdin) != 4) {
        fputs("missing_password_frame\n", stderr); return CRYPTO_INVALID;
    }
    length = (uint32_t)prefix[0] << 24 | (uint32_t)prefix[1] << 16 |
             (uint32_t)prefix[2] << 8 | (uint32_t)prefix[3];
    if (length == 0 || length > sizeof(password) ||
        fread(password, 1, length, stdin) != length) {
        OPENSSL_cleanse(password, sizeof(password));
        fputs("invalid_password_frame\n", stderr); return CRYPTO_INVALID;
    }
    code = advanced ? crypto_advanced(argc, argv, password, length, &error) :
           crypto_transform_ex(encrypt, algorithm, scrypt, input, output, password, length, &error);
    OPENSSL_cleanse(password, sizeof(password));
    if (code != 0) fprintf(stderr, "%s\n", error.message);
    return code;
}

#ifdef _WIN32
/* Windows tests use the same UTF-8 path contract as the Linux implementation. */
int wmain(int argc, wchar_t **wide_argv)
{
    char **argv = calloc((size_t)argc, sizeof(*argv));
    int code = CRYPTO_INTERNAL;
    if (argv == NULL) return code;
    for (int i = 0; i < argc; i++) {
        int n = WideCharToMultiByte(CP_UTF8, 0, wide_argv[i], -1, NULL, 0, NULL, NULL);
        argv[i] = n > 0 ? malloc((size_t)n) : NULL;
        if (argv[i] == NULL) goto done;
        WideCharToMultiByte(CP_UTF8, 0, wide_argv[i], -1, argv[i], n, NULL, NULL);
    }
    code = run(argc, argv);
done:
    for (int i = 0; i < argc; i++) free(argv[i]);
    free(argv);
    return code;
}
#else
int main(int argc, char **argv) { return run(argc, argv); }
#endif
