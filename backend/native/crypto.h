#ifndef CRYPTO_APP_CRYPTO_H
#define CRYPTO_APP_CRYPTO_H

#include <stddef.h>

#define CRYPTO_PASSWORD_MAX 1024
#define CRYPTO_ITERATIONS 600000U
#define CRYPTO_HEADER_SIZE 52
#define CRYPTO_BUFFER_SIZE 65536

enum crypto_algorithm { CRYPTO_GCM = 1, CRYPTO_CBC_HMAC = 2, CRYPTO_AES128 = 3, CRYPTO_CHACHA = 4 };
enum crypto_status {
    CRYPTO_OK = 0, CRYPTO_INVALID = 2, CRYPTO_AUTH = 3,
    CRYPTO_IO = 4, CRYPTO_INTERNAL = 5
};

typedef struct {
    int code;
    char message[192];
} crypto_error;

/* Paths are UTF-8. Output must not exist. Password is an explicit byte string. */
int crypto_transform(int encrypt, int algorithm, const char *input_path,
                     const char *output_path, const unsigned char *password,
                     size_t password_length, crypto_error *error);
int crypto_transform_ex(int encrypt, int algorithm, int scrypt, const char *input_path,
                        const char *output_path, const unsigned char *password,
                        size_t password_length, crypto_error *error);
int crypto_advanced(int argc, char **argv, const unsigned char *password,
                    size_t password_length, crypto_error *error);
int crypto_benchmark(const char *mode, const char *input, const unsigned char *password,
                     size_t password_length, crypto_error *error);

#endif
