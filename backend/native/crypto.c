#define _POSIX_C_SOURCE 200809L
#include "crypto.h"

#include <openssl/core_names.h>
#include <openssl/crypto.h>
#include <openssl/evp.h>
#include <openssl/params.h>
#include <openssl/rand.h>

#include <errno.h>
#include <fcntl.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>

#ifdef _WIN32
#include <io.h>
#include <windows.h>
#define FILE_SEEK _fseeki64
#define FILE_TELL _ftelli64
#define FILE_CLOSE_FD _close
#define FILE_FDOPEN _fdopen
#define FILE_FILENO _fileno
#define FILE_SYNC _commit
typedef __int64 file_offset;

static wchar_t *wide_path(const char *path)
{
    int n = MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, path, -1, NULL, 0);
    wchar_t *value = n > 0 ? malloc((size_t)n * sizeof(*value)) : NULL;
    if (value != NULL && !MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS,
                                             path, -1, value, n)) {
        free(value);
        value = NULL;
    }
    return value;
}

FILE *open_input(const char *path)
{
    wchar_t *wide = wide_path(path);
    FILE *file = wide != NULL ? _wfopen(wide, L"rb") : NULL;
    free(wide);
    return file;
}

static int open_private(const char *path)
{
    wchar_t *wide = wide_path(path);
    int fd = wide != NULL ? _wopen(wide, _O_WRONLY | _O_CREAT | _O_EXCL |
                                   _O_BINARY | _O_NOINHERIT, _S_IREAD | _S_IWRITE) : -1;
    free(wide);
    return fd;
}

int remove_file(const char *path)
{
    wchar_t *wide = wide_path(path);
    int rc = wide != NULL ? _wunlink(wide) : -1;
    free(wide);
    return rc;
}

int publish_file(const char *temporary, const char *output)
{
    wchar_t *from = wide_path(temporary), *to = wide_path(output);
    int rc = (from != NULL && to != NULL && MoveFileExW(from, to, 0)) ? 0 : -1;
    free(from);
    free(to);
    return rc;
}

static int is_regular(FILE *file)
{
    struct _stat64 info;
    return _fstat64(FILE_FILENO(file), &info) == 0 &&
           (info.st_mode & _S_IFMT) == _S_IFREG;
}
#else
#include <unistd.h>
#define FILE_SEEK fseeko
#define FILE_TELL ftello
#define FILE_CLOSE_FD close
#define FILE_FDOPEN fdopen
#define FILE_FILENO fileno
#define FILE_SYNC fsync
typedef off_t file_offset;

FILE *open_input(const char *path) { return fopen(path, "rb"); }
static int open_private(const char *path)
{
    return open(path, O_WRONLY | O_CREAT | O_EXCL | O_CLOEXEC, 0600);
}
int remove_file(const char *path) { return unlink(path); }
int publish_file(const char *temporary, const char *output)
{
    /* Atomic no-clobber publication, including symlinks and hard links. */
    if (link(temporary, output) != 0) return -1;
    (void)unlink(temporary);
    return 0;
}
static int is_regular(FILE *file)
{
    struct stat info;
    return fstat(FILE_FILENO(file), &info) == 0 && S_ISREG(info.st_mode);
}
#endif

static const unsigned char magic[8] = {'C','G','C','R','Y','P','T','1'};
#define GCM_MAX_BYTES (UINT64_C(68719476704))

static int fail(crypto_error *error, int code, const char *message)
{
    error->code = code;
    snprintf(error->message, sizeof(error->message), "%s", message);
    return 0;
}

static void store_u32(unsigned char *p, uint32_t value)
{
    p[0] = (unsigned char)(value >> 24); p[1] = (unsigned char)(value >> 16);
    p[2] = (unsigned char)(value >> 8); p[3] = (unsigned char)value;
}

static uint32_t load_u32(const unsigned char *p)
{
    return (uint32_t)p[0] << 24 | (uint32_t)p[1] << 16 |
           (uint32_t)p[2] << 8 | (uint32_t)p[3];
}

static int read_exact(FILE *file, unsigned char *data, size_t length, crypto_error *error)
{
    if (fread(data, 1, length, file) == length) return 1;
    return fail(error, ferror(file) ? CRYPTO_IO : CRYPTO_INVALID,
                ferror(file) ? "input_read_failed" : "truncated_file");
}

static int write_exact(FILE *file, const unsigned char *data, size_t length,
                       crypto_error *error)
{
    if (fwrite(data, 1, length, file) == length) return 1;
    return fail(error, CRYPTO_IO, "output_write_failed");
}

FILE *make_temporary(const char *output, char **path, crypto_error *error)
{
    unsigned char random[16];
    size_t length = strlen(output);
    int fd = -1;
    FILE *file;
    *path = malloc(length + 39);
    if (*path == NULL) {
        fail(error, CRYPTO_INTERNAL, "allocation_failed");
        return NULL;
    }
    for (int attempt = 0; attempt < 8; attempt++) {
        if (RAND_bytes(random, sizeof(random)) != 1) {
            free(*path);
            *path = NULL;
            fail(error, CRYPTO_INTERNAL, "random_failed");
            return NULL;
        }
        memcpy(*path, output, length);
        memcpy(*path + length, ".tmp.", 5);
        for (size_t i = 0; i < sizeof(random); i++) {
            snprintf(*path + length + 5 + 2*i, 3, "%02x", random[i]);
        }
        fd = open_private(*path);
        if (fd >= 0 || errno != EEXIST) break;
    }
    if (fd < 0) {
        /* We did not create this path: the caller must not unlink it. */
        free(*path);
        *path = NULL;
        fail(error, CRYPTO_IO, "temporary_file_failed");
        return NULL;
    }
    file = FILE_FDOPEN(fd, "wb");
    if (file == NULL) {
        FILE_CLOSE_FD(fd);
        remove_file(*path);
        free(*path);
        *path = NULL;
        fail(error, CRYPTO_IO, "temporary_stream_failed");
    }
    return file;
}

static int derive(const unsigned char *password, size_t password_length,
                   const unsigned char *header, unsigned char *keys, crypto_error *error)
{
    if (header[8] == 2 && header[10] == 2) {
        if (EVP_PBE_scrypt((const char *)password, password_length, header + 16, 16,
                          32768, 8, 1, 64 * 1024 * 1024, keys, 64) == 1) return 1;
        return fail(error, CRYPTO_INTERNAL, "key_derivation_failed");
    }
    if (PKCS5_PBKDF2_HMAC((const char *)password, (int)password_length,
                          header + 16, 16, (int)load_u32(header + 12),
                          EVP_sha256(), 64, keys) == 1) return 1;
    return fail(error, CRYPTO_INTERNAL, "key_derivation_failed");
}

static EVP_MAC_CTX *new_mac(const unsigned char *key, crypto_error *error)
{
    EVP_MAC *mac = EVP_MAC_fetch(NULL, "HMAC", NULL);
    EVP_MAC_CTX *ctx = mac != NULL ? EVP_MAC_CTX_new(mac) : NULL;
    char digest[] = "SHA256";
    OSSL_PARAM parameters[] = {
        OSSL_PARAM_construct_utf8_string(OSSL_MAC_PARAM_DIGEST, digest, 0),
        OSSL_PARAM_construct_end()
    };
    EVP_MAC_free(mac);
    if (ctx == NULL || EVP_MAC_init(ctx, key, 32, parameters) != 1) {
        EVP_MAC_CTX_free(ctx);
        fail(error, CRYPTO_INTERNAL, "mac_initialization_failed");
        return NULL;
    }
    return ctx;
}

static int update_mac(EVP_MAC_CTX *ctx, const unsigned char *data, size_t size,
                       crypto_error *error)
{
    if (EVP_MAC_update(ctx, data, size) == 1) return 1;
    return fail(error, CRYPTO_INTERNAL, "mac_update_failed");
}

static int finish_mac(EVP_MAC_CTX *ctx, unsigned char *tag, crypto_error *error)
{
    size_t length = 0;
    if (EVP_MAC_final(ctx, tag, &length, 32) == 1 && length == 32) return 1;
    return fail(error, CRYPTO_INTERNAL, "mac_final_failed");
}

static int authenticate_cbc(FILE *input, const unsigned char *header,
                            uint64_t length, const unsigned char *key,
                            const unsigned char *expected, crypto_error *error)
{
    EVP_MAC_CTX *mac = new_mac(key, error);
    unsigned char buffer[CRYPTO_BUFFER_SIZE], tag[32];
    int ok = 0;
    if (mac == NULL) goto done;
    if (FILE_SEEK(input, CRYPTO_HEADER_SIZE, SEEK_SET) != 0) {
        fail(error, CRYPTO_IO, "input_seek_failed"); goto done;
    }
    if (!update_mac(mac, header, CRYPTO_HEADER_SIZE, error)) goto done;
    while (length > 0) {
        size_t n = length > sizeof(buffer) ? sizeof(buffer) : (size_t)length;
        if (!read_exact(input, buffer, n, error) ||
            !update_mac(mac, buffer, n, error)) goto done;
        length -= n;
    }
    if (!finish_mac(mac, tag, error)) goto done;
    if (CRYPTO_memcmp(tag, expected, 32) != 0) {
        fail(error, CRYPTO_AUTH, "authentication_failed"); goto done;
    }
    ok = 1;
done:
    EVP_MAC_CTX_free(mac);
    OPENSSL_cleanse(buffer, sizeof(buffer));
    OPENSSL_cleanse(tag, sizeof(tag));
    return ok;
}

static int parse_header(const unsigned char *h, int *algorithm, crypto_error *error)
{
    uint32_t iterations = load_u32(h + 12);
    int v1 = CRYPTO_memcmp(h, magic, 8) == 0 && h[8] == 1 && h[10] == 0;
    int v2 = memcmp(h, "CGCRYPT2", 8) == 0 && h[8] == 2 && (h[10] == 1 || h[10] == 2);
    if ((!v1 && !v2) || h[11] || h[50] || h[51] ||
        ((v2 && h[10] == 2) ? iterations != 32768 : (iterations < 200000 || iterations > 2000000))) {
        return fail(error, CRYPTO_INVALID, "invalid_header");
    }
    *algorithm = h[9];
    if ((*algorithm == CRYPTO_GCM || (v2 && (*algorithm == CRYPTO_AES128 || *algorithm == CRYPTO_CHACHA))) && h[48] == 16 && h[49] == 12 &&
        h[44] == 0 && h[45] == 0 && h[46] == 0 && h[47] == 0) return 1;
    if (*algorithm == CRYPTO_CBC_HMAC && h[48] == 32 && h[49] == 16) return 1;
    return fail(error, CRYPTO_INVALID, "unsupported_algorithm_or_parameters");
}

int crypto_transform_ex(int encrypt, int algorithm, int scrypt, const char *input_path,
                     const char *output_path, const unsigned char *password,
                     size_t password_length, crypto_error *error)
{
    FILE *input = NULL, *output = NULL;
    char *temporary = NULL;
    EVP_CIPHER_CTX *ctx = NULL;
    EVP_MAC_CTX *mac = NULL;
    unsigned char header[CRYPTO_HEADER_SIZE] = {0}, keys[64] = {0};
    unsigned char buffer[CRYPTO_BUFFER_SIZE], result[CRYPTO_BUFFER_SIZE + 16];
    unsigned char expected[32] = {0}, actual[32] = {0};
    uint64_t length = 0, remaining = 0, total = 0;
    file_offset size;
    int n = 0, ok = 0;
    size_t count;
    const EVP_CIPHER *cipher;
    *error = (crypto_error){0};

    if (password == NULL || password_length == 0 || password_length > CRYPTO_PASSWORD_MAX ||
        (encrypt && (algorithm < CRYPTO_GCM || algorithm > CRYPTO_CHACHA))) {
        fail(error, CRYPTO_INVALID, "invalid_arguments"); goto done;
    }
    input = open_input(input_path);
    if (input == NULL || !is_regular(input)) {
        fail(error, CRYPTO_IO, "input_open_failed"); goto done;
    }

    if (encrypt) {
        memcpy(header, magic, 8);
        header[8] = 1; header[9] = (unsigned char)algorithm;
        if (scrypt || algorithm >= CRYPTO_AES128) {
            memcpy(header, "CGCRYPT2", 8); header[8] = 2;
            header[10] = scrypt ? 2 : 1;
        }
        store_u32(header + 12, scrypt ? 32768 : CRYPTO_ITERATIONS);
        header[48] = algorithm == CRYPTO_CBC_HMAC ? 32 : 16;
        header[49] = algorithm == CRYPTO_CBC_HMAC ? 16 : 12;
        if (RAND_bytes(header + 16, 16) != 1 ||
            RAND_bytes(header + 32, header[49]) != 1) {
            fail(error, CRYPTO_INTERNAL, "random_failed"); goto done;
        }
    } else {
        if (!read_exact(input, header, sizeof(header), error) ||
            !parse_header(header, &algorithm, error)) goto done;
        if (FILE_SEEK(input, 0, SEEK_END) != 0 || (size = FILE_TELL(input)) < 0) {
            fail(error, CRYPTO_IO, "input_seek_failed"); goto done;
        }
        if ((uint64_t)size < CRYPTO_HEADER_SIZE + (uint64_t)header[48]) {
            fail(error, CRYPTO_INVALID, "truncated_file"); goto done;
        }
        length = (uint64_t)size - CRYPTO_HEADER_SIZE - header[48];
        if ((algorithm == CRYPTO_CBC_HMAC && (length == 0 || length % 16 != 0)) ||
            (algorithm != CRYPTO_CBC_HMAC && length > GCM_MAX_BYTES)) {
            fail(error, CRYPTO_INVALID, "invalid_ciphertext_length"); goto done;
        }
        if (FILE_SEEK(input, -(file_offset)header[48], SEEK_END) != 0) {
            fail(error, CRYPTO_IO, "input_seek_failed"); goto done;
        }
        if (!read_exact(input, expected, header[48], error)) goto done;
    }
    if (!derive(password, password_length, header, keys, error)) goto done;
    if (!encrypt && algorithm == CRYPTO_CBC_HMAC &&
        !authenticate_cbc(input, header, length, keys + 32, expected, error)) goto done;

    ctx = EVP_CIPHER_CTX_new();
    cipher = algorithm == CRYPTO_GCM ? EVP_aes_256_gcm() :
             algorithm == CRYPTO_AES128 ? EVP_aes_128_gcm() :
             algorithm == CRYPTO_CHACHA ? EVP_chacha20_poly1305() : EVP_aes_256_cbc();
    if (ctx == NULL || EVP_CipherInit_ex(ctx, cipher, NULL, NULL, NULL, encrypt) != 1 ||
        (algorithm != CRYPTO_CBC_HMAC &&
         EVP_CIPHER_CTX_ctrl(ctx, EVP_CTRL_GCM_SET_IVLEN, header[49], NULL) != 1) ||
        EVP_CipherInit_ex(ctx, NULL, NULL, keys, header + 32, encrypt) != 1) {
        fail(error, CRYPTO_INTERNAL, "cipher_initialization_failed"); goto done;
    }
    if (algorithm != CRYPTO_CBC_HMAC) {
        if (EVP_CipherUpdate(ctx, NULL, &n, header, sizeof(header)) != 1) {
            fail(error, CRYPTO_INTERNAL, "aad_failed"); goto done;
        }
    } else {
        mac = new_mac(keys + 32, error);
        if (mac == NULL || !update_mac(mac, header, sizeof(header), error)) goto done;
    }

    output = make_temporary(output_path, &temporary, error);
    if (output == NULL) goto done;
    if (encrypt) {
        if (!write_exact(output, header, sizeof(header), error)) goto done;
    } else if (FILE_SEEK(input, CRYPTO_HEADER_SIZE, SEEK_SET) != 0) {
        fail(error, CRYPTO_IO, "input_seek_failed"); goto done;
    }

    remaining = length;
    for (;;) {
        if (encrypt) {
            count = fread(buffer, 1, sizeof(buffer), input);
            if (count == 0) {
                if (ferror(input)) { fail(error, CRYPTO_IO, "input_read_failed"); goto done; }
                break;
            }
            total += count;
            if (algorithm != CRYPTO_CBC_HMAC && total > GCM_MAX_BYTES) {
                fail(error, CRYPTO_INVALID, "gcm_file_too_large"); goto done;
            }
        } else {
            if (remaining == 0) break;
            count = remaining > sizeof(buffer) ? sizeof(buffer) : (size_t)remaining;
            if (!read_exact(input, buffer, count, error)) goto done;
            remaining -= count;
            if (mac != NULL && !update_mac(mac, buffer, count, error)) goto done;
        }
        if (EVP_CipherUpdate(ctx, result, &n, buffer, (int)count) != 1) {
            fail(error, CRYPTO_INTERNAL, "cipher_update_failed"); goto done;
        }
        if (!write_exact(output, result, (size_t)n, error)) goto done;
        if (encrypt && mac != NULL && !update_mac(mac, result, (size_t)n, error)) goto done;
    }

    /* Check the second CBC pass too, in case the input changed after verification. */
    if (!encrypt && mac != NULL) {
        if (!finish_mac(mac, actual, error)) goto done;
        if (CRYPTO_memcmp(actual, expected, 32) != 0) {
            fail(error, CRYPTO_AUTH, "authentication_failed"); goto done;
        }
    }
    if (!encrypt && algorithm != CRYPTO_CBC_HMAC &&
        EVP_CIPHER_CTX_ctrl(ctx, EVP_CTRL_GCM_SET_TAG, header[48], expected) != 1) {
        fail(error, CRYPTO_INTERNAL, "tag_setup_failed"); goto done;
    }
    if (EVP_CipherFinal_ex(ctx, result, &n) != 1) {
        fail(error, encrypt ? CRYPTO_INTERNAL : CRYPTO_AUTH,
             encrypt ? "cipher_final_failed" : "authentication_failed"); goto done;
    }
    if (!write_exact(output, result, (size_t)n, error)) goto done;
    if (encrypt) {
        if (mac != NULL) {
            if (!update_mac(mac, result, (size_t)n, error) ||
                !finish_mac(mac, actual, error)) goto done;
        } else if (EVP_CIPHER_CTX_ctrl(ctx, EVP_CTRL_GCM_GET_TAG, header[48], actual) != 1) {
            fail(error, CRYPTO_INTERNAL, "tag_read_failed"); goto done;
        }
        if (!write_exact(output, actual, header[48], error)) goto done;
    }
    if (fflush(output) != 0 || FILE_SYNC(FILE_FILENO(output)) != 0) {
        fail(error, CRYPTO_IO, "output_sync_failed"); goto done;
    }
    if (fclose(output) != 0) {
        output = NULL; fail(error, CRYPTO_IO, "output_close_failed"); goto done;
    }
    output = NULL;
    if (publish_file(temporary, output_path) != 0) {
        fail(error, CRYPTO_IO, "output_exists_or_publish_failed"); goto done;
    }
    ok = 1;
done:
    if (output != NULL) fclose(output);
    if (input != NULL) fclose(input);
    if (temporary != NULL) { (void)remove_file(temporary); free(temporary); }
    EVP_CIPHER_CTX_free(ctx);
    EVP_MAC_CTX_free(mac);
    OPENSSL_cleanse(keys, sizeof(keys));
    OPENSSL_cleanse(buffer, sizeof(buffer));
    OPENSSL_cleanse(result, sizeof(result));
    OPENSSL_cleanse(expected, sizeof(expected));
    OPENSSL_cleanse(actual, sizeof(actual));
    return ok ? CRYPTO_OK : error->code;
}

int crypto_transform(int encrypt, int algorithm, const char *input_path,
                     const char *output_path, const unsigned char *password,
                     size_t password_length, crypto_error *error)
{
    return crypto_transform_ex(encrypt, algorithm, 0, input_path, output_path,
                               password, password_length, error);
}
