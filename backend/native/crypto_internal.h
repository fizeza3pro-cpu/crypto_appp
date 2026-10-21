#ifndef CRYPTO_INTERNAL_H
#define CRYPTO_INTERNAL_H
#include "crypto.h"
#include <stdio.h>
/* Shared UTF-8, private staging and atomic no-clobber file helpers. */
FILE *open_input(const char *path);
FILE *make_temporary(const char *output, char **path, crypto_error *error);
int remove_file(const char *path);
int publish_file(const char *temporary, const char *output);
#endif
