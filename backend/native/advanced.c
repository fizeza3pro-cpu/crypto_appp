#define _POSIX_C_SOURCE 200809L
#include "crypto_internal.h"
#include <openssl/crypto.h>
#include <openssl/evp.h>
#include <openssl/pem.h>
#include <openssl/pkcs12.h>
#include <openssl/rand.h>
#include <openssl/rsa.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#ifdef _WIN32
#include <io.h>
#define SEEK_FILE _fseeki64
#define TELL_FILE _ftelli64
#define SYNC_FILE(f) _commit(_fileno(f))
#else
#include <unistd.h>
#define SEEK_FILE fseeko
#define TELL_FILE ftello
#define SYNC_FILE(f) fsync(fileno(f))
#endif

static int problem(crypto_error *e, int code, const char *message)
{
    e->code = code;
    snprintf(e->message, sizeof(e->message), "%s", message);
    return 0;
}

static int write_bytes(FILE *f, const void *p, size_t n)
{ return fwrite(p, 1, n, f) == n; }

static int read_bytes(FILE *f, void *p, size_t n)
{ return fread(p, 1, n, f) == n; }

static uint32_t u32(const unsigned char *p)
{ return (uint32_t)p[0]<<24 | (uint32_t)p[1]<<16 | (uint32_t)p[2]<<8 | p[3]; }

static void put32(unsigned char *p, uint32_t n)
{ p[0]=(unsigned char)(n>>24); p[1]=(unsigned char)(n>>16); p[2]=(unsigned char)(n>>8); p[3]=(unsigned char)n; }

static void hex(const unsigned char *bytes, size_t n, char *out)
{
    for (size_t i=0; i<n; i++) snprintf(out+2*i, 3, "%02x", bytes[i]);
}

static int commit(FILE **f, const char *tmp, const char *path)
{
    int ok = fflush(*f) == 0 && SYNC_FILE(*f) == 0;
    if (fclose(*f) != 0) ok = 0;
    *f = NULL;
    return ok && publish_file(tmp, path) == 0;
}

/* Restrict key input before ASN.1 parsing. Only RSA SPKI public keys and
 * encrypted PKCS#8 private keys are accepted, never interactive passphrases. */
static EVP_PKEY *read_key(const char *path, int private_key,
                          const unsigned char *pass, size_t passlen, crypto_error *e)
{
    FILE *f = open_input(path);
    unsigned char data[16385];
    size_t n = f ? fread(data, 1, sizeof(data), f) : 0;
    int ok = f && !ferror(f) && n > 0 && n < sizeof(data);
    if (f) fclose(f);
    BIO *bio = ok ? BIO_new_mem_buf(data, (int)n) : NULL;
    EVP_PKEY *key = NULL;
    if (bio && private_key) {
        X509_SIG *encrypted = PEM_read_bio_PKCS8(bio, NULL, NULL, NULL);
        PKCS8_PRIV_KEY_INFO *info = encrypted ? PKCS8_decrypt(encrypted, (const char *)pass, (int)passlen) : NULL;
        key = info ? EVP_PKCS82PKEY(info) : NULL;
        PKCS8_PRIV_KEY_INFO_free(info);
        X509_SIG_free(encrypted);
    } else if (bio) key = PEM_read_bio_PUBKEY(bio, NULL, NULL, NULL);
    BIO_free(bio);
    OPENSSL_cleanse(data, sizeof(data));
    if (!key || !EVP_PKEY_is_a(key, "RSA") || EVP_PKEY_get_bits(key) < 2048 || EVP_PKEY_get_bits(key) > 4096) {
        EVP_PKEY_free(key);
        problem(e, private_key ? CRYPTO_AUTH : CRYPTO_INVALID,
                private_key ? "private_key_or_password_invalid" : "invalid_rsa_public_key");
        return NULL;
    }
    EVP_PKEY_CTX *check = EVP_PKEY_CTX_new_from_pkey(NULL, key, NULL);
    int valid = check && (private_key ? EVP_PKEY_pairwise_check(check) : EVP_PKEY_public_check(check)) > 0;
    EVP_PKEY_CTX_free(check);
    if (!valid) {
        EVP_PKEY_free(key);
        problem(e, private_key ? CRYPTO_AUTH : CRYPTO_INVALID, "invalid_rsa_key_parameters");
        return NULL;
    }
    return key;
}

static int fingerprint(EVP_PKEY *key, unsigned char out[32])
{
    unsigned char *der = NULL;
    int n = i2d_PUBKEY(key, &der);
    unsigned int length = 0;
    int ok = n > 0 && EVP_Digest(der, (size_t)n, out, &length, EVP_sha256(), NULL) == 1 && length == 32;
    OPENSSL_free(der);
    return ok;
}

static void key_json(EVP_PKEY *key, int valid, int verification)
{
    unsigned char fp[32]; char encoded[65];
    if (!fingerprint(key, fp)) return;
    hex(fp, 32, encoded);
    printf("{\"type\":\"RSA\",\"bits\":%d,\"fingerprint\":\"%s\"", EVP_PKEY_get_bits(key), encoded);
    if (verification) printf(",\"valid\":%s,\"algorithm\":\"RSA-PSS-SHA256\",\"salt_bytes\":32", valid ? "true" : "false");
    puts("}");
}

static int generate(const char *private_path, const char *public_path,
                    const unsigned char *pass, size_t passlen, crypto_error *e)
{
    EVP_PKEY_CTX *ctx = EVP_PKEY_CTX_new_from_name(NULL, "RSA", NULL);
    EVP_PKEY *key = NULL;
    PKCS8_PRIV_KEY_INFO *info = NULL;
    X509_SIG *encrypted = NULL;
    unsigned char salt[16];
    FILE *priv = NULL, *pub = NULL;
    char *privtmp = NULL, *pubtmp = NULL;
    int ok = 0, published = 0;
    if (!ctx || EVP_PKEY_keygen_init(ctx) <= 0 ||
        EVP_PKEY_CTX_set_rsa_keygen_bits(ctx, 3072) <= 0 || EVP_PKEY_generate(ctx, &key) <= 0 ||
        RAND_bytes(salt, sizeof(salt)) != 1) goto done;
    info = EVP_PKEY2PKCS8(key);
    encrypted = info ? PKCS8_encrypt(-1, EVP_aes_256_cbc(), (const char *)pass, (int)passlen,
                                    salt, sizeof(salt), 600000, info) : NULL;
    priv = encrypted ? make_temporary(private_path, &privtmp, e) : NULL;
    pub = priv ? make_temporary(public_path, &pubtmp, e) : NULL;
    if (!pub || PEM_write_PKCS8(priv, encrypted) != 1 || PEM_write_PUBKEY(pub, key) != 1) goto done;
    if (!commit(&priv, privtmp, private_path)) goto done;
    published = 1;
    if (!commit(&pub, pubtmp, public_path)) goto done;
    key_json(key, 0, 0);
    ok = 1;
done:
    if (priv) fclose(priv);
    if (pub) fclose(pub);
    if (privtmp) { remove_file(privtmp); free(privtmp); }
    if (pubtmp) { remove_file(pubtmp); free(pubtmp); }
    if (!ok && published) remove_file(private_path);
    X509_SIG_free(encrypted); PKCS8_PRIV_KEY_INFO_free(info);
    EVP_PKEY_free(key); EVP_PKEY_CTX_free(ctx);
    if (!ok && !e->code) problem(e, CRYPTO_INTERNAL, "key_generation_or_publish_failed");
    return ok;
}

/* CGHYBRD1: fixed 64-byte header, RSA-OAEP wrapped 32-byte DEK,
 * AES-256-GCM ciphertext, 16-byte tag. Header AND wrapped key are AAD.
 * Header: magic[8], version=1, cipher=1, reserved[2], wraplen u32,
 * SPKI-SHA256[32], nonce[12], reserved[4]. Single recipient. */
static int hybrid(int encrypt, const char *input, const char *output, const char *keypath,
                  const unsigned char *pass, size_t passlen, crypto_error *e)
{
    EVP_PKEY *key = read_key(keypath, !encrypt, pass, passlen, e);
    EVP_PKEY_CTX *rsa = key ? EVP_PKEY_CTX_new_from_pkey(NULL, key, NULL) : NULL;
    EVP_CIPHER_CTX *cipher = EVP_CIPHER_CTX_new();
    FILE *in = NULL, *out = NULL;
    char *tmp = NULL;
    unsigned char h[64] = {0}, wrapped[512], dek[512] = {0}, fp[32], tag[16];
    unsigned char buffer[65536], result[65552];
    size_t wrappedlen = sizeof(wrapped), deklen = sizeof(dek), count;
    uint64_t remaining = 0, total = 0;
    int n = 0, ok = 0;
    if (!key || !rsa || !cipher) goto done;
    if ((encrypt ? EVP_PKEY_encrypt_init(rsa) : EVP_PKEY_decrypt_init(rsa)) <= 0 ||
        EVP_PKEY_CTX_set_rsa_padding(rsa, RSA_PKCS1_OAEP_PADDING) <= 0 ||
        EVP_PKEY_CTX_set_rsa_oaep_md(rsa, EVP_sha256()) <= 0 ||
        EVP_PKEY_CTX_set_rsa_mgf1_md(rsa, EVP_sha256()) <= 0 || !fingerprint(key, fp)) goto done;
    in = open_input(input);
    if (!in) { problem(e, CRYPTO_IO, "input_open_failed"); goto done; }
    if (encrypt) {
        memcpy(h, "CGHYBRD1", 8); h[8] = 1; h[9] = 1;
        memcpy(h+16, fp, 32);
        if (RAND_bytes(dek, 32) != 1 || RAND_bytes(h+48, 12) != 1 ||
            EVP_PKEY_encrypt(rsa, wrapped, &wrappedlen, dek, 32) <= 0) goto done;
        put32(h+12, (uint32_t)wrappedlen);
    } else {
        if (!read_bytes(in, h, sizeof(h)) || memcmp(h,"CGHYBRD1",8) || h[8]!=1 || h[9]!=1 ||
            h[10] || h[11] || h[60] || h[61] || h[62] || h[63]) {
            problem(e, CRYPTO_INVALID, "invalid_hybrid_header"); goto done;
        }
        wrappedlen = u32(h+12);
        if (wrappedlen != (size_t)EVP_PKEY_get_size(key) || wrappedlen > sizeof(wrapped) ||
            CRYPTO_memcmp(fp, h+16, 32) || !read_bytes(in, wrapped, wrappedlen)) {
            problem(e, CRYPTO_AUTH, "recipient_or_file_invalid"); goto done;
        }
        if (EVP_PKEY_decrypt(rsa, dek, &deklen, wrapped, wrappedlen) <= 0 || deklen != 32) {
            problem(e, CRYPTO_AUTH, "authentication_failed"); goto done;
        }
        if (SEEK_FILE(in, 0, SEEK_END) != 0) goto done;
        int64_t size = (int64_t)TELL_FILE(in);
        if (size < (int64_t)(64 + wrappedlen + 16)) { problem(e, CRYPTO_INVALID, "truncated_file"); goto done; }
        remaining = (uint64_t)size - 64 - wrappedlen - 16;
        if (remaining > UINT64_C(68719476704) || SEEK_FILE(in, -16, SEEK_END) != 0 ||
            !read_bytes(in, tag, 16) || SEEK_FILE(in, (int64_t)(64+wrappedlen), SEEK_SET) != 0) goto done;
    }
    if (EVP_CipherInit_ex(cipher, EVP_aes_256_gcm(), NULL, dek, h+48, encrypt) != 1 ||
        EVP_CipherUpdate(cipher, NULL, &n, h, sizeof(h)) != 1 ||
        EVP_CipherUpdate(cipher, NULL, &n, wrapped, (int)wrappedlen) != 1) goto done;
    out = make_temporary(output, &tmp, e);
    if (!out || (encrypt && (!write_bytes(out,h,sizeof(h)) || !write_bytes(out,wrapped,wrappedlen)))) goto done;
    for (;;) {
        if (encrypt) {
            count = fread(buffer, 1, sizeof(buffer), in);
            if (!count) { if (ferror(in)) goto done; break; }
            total += count;
            if (total > UINT64_C(68719476704)) goto done;
        } else {
            if (!remaining) break;
            count = remaining > sizeof(buffer) ? sizeof(buffer) : (size_t)remaining;
            if (!read_bytes(in, buffer, count)) goto done;
            remaining -= count;
        }
        if (EVP_CipherUpdate(cipher,result,&n,buffer,(int)count)!=1 || !write_bytes(out,result,(size_t)n)) goto done;
    }
    if (!encrypt && EVP_CIPHER_CTX_ctrl(cipher, EVP_CTRL_AEAD_SET_TAG, 16, tag) != 1) goto done;
    if (EVP_CipherFinal_ex(cipher,result,&n)!=1) { problem(e,CRYPTO_AUTH,"authentication_failed"); goto done; }
    if (!write_bytes(out,result,(size_t)n)) goto done;
    if (encrypt && (EVP_CIPHER_CTX_ctrl(cipher,EVP_CTRL_AEAD_GET_TAG,16,tag)!=1 || !write_bytes(out,tag,16))) goto done;
    if (!commit(&out,tmp,output)) { problem(e,CRYPTO_IO,"output_exists_or_publish_failed"); goto done; }
    ok = 1;
done:
    if (in) fclose(in);
    if (out) fclose(out);
    if (tmp) { remove_file(tmp); free(tmp); }
    EVP_CIPHER_CTX_free(cipher); EVP_PKEY_CTX_free(rsa); EVP_PKEY_free(key);
    OPENSSL_cleanse(dek,sizeof(dek)); OPENSSL_cleanse(buffer,sizeof(buffer)); OPENSSL_cleanse(result,sizeof(result));
    if (!ok && !e->code) problem(e,CRYPTO_INTERNAL,"hybrid_processing_failed");
    return ok;
}

/* Raw interoperable RSA-PSS signature: SHA256, MGF1-SHA256, salt=32.
 * No timestamp or identity assertion; no ambiguous JSON canonicalisation. */
static int signature(int signing, const char *input, const char *keypath, const char *sigpath,
                     const unsigned char *pass, size_t passlen, crypto_error *e)
{
    EVP_PKEY *key = read_key(keypath, signing, pass, passlen, e);
    EVP_MD_CTX *md = EVP_MD_CTX_new();
    EVP_PKEY_CTX *pctx = NULL;
    FILE *in = NULL, *sigfile = NULL;
    unsigned char buffer[65536], sig[513];
    size_t count, siglen = 512;
    char *tmp = NULL;
    int ok = 0;
    if (!key || !md) goto done;
    if ((signing ? EVP_DigestSignInit(md,&pctx,EVP_sha256(),NULL,key) :
                   EVP_DigestVerifyInit(md,&pctx,EVP_sha256(),NULL,key)) != 1 ||
        EVP_PKEY_CTX_set_rsa_padding(pctx,RSA_PKCS1_PSS_PADDING) <= 0 ||
        EVP_PKEY_CTX_set_rsa_mgf1_md(pctx,EVP_sha256()) <= 0 ||
        EVP_PKEY_CTX_set_rsa_pss_saltlen(pctx,32) <= 0) goto done;
    in = open_input(input);
    if (!in) { problem(e,CRYPTO_IO,"input_open_failed"); goto done; }
    while ((count=fread(buffer,1,sizeof(buffer),in)) > 0) {
        if ((signing ? EVP_DigestSignUpdate(md,buffer,count) : EVP_DigestVerifyUpdate(md,buffer,count)) != 1) goto done;
    }
    if (ferror(in)) goto done;
    if (signing) {
        if (EVP_DigestSignFinal(md,sig,&siglen)!=1) goto done;
        sigfile = make_temporary(sigpath,&tmp,e);
        if (!sigfile || !write_bytes(sigfile,sig,siglen) || !commit(&sigfile,tmp,sigpath)) goto done;
    } else {
        sigfile = open_input(sigpath);
        if (!sigfile) { problem(e,CRYPTO_IO,"signature_open_failed"); goto done; }
        siglen = fread(sig,1,sizeof(sig),sigfile);
        if (ferror(sigfile)) goto done;
        int valid = siglen == (size_t)EVP_PKEY_get_size(key) && EVP_DigestVerifyFinal(md,sig,siglen)==1;
        key_json(key,valid,1);
    }
    ok = 1;
done:
    if (in) fclose(in);
    if (sigfile) fclose(sigfile);
    if (tmp) { remove_file(tmp); free(tmp); }
    EVP_MD_CTX_free(md); EVP_PKEY_free(key);
    OPENSSL_cleanse(buffer,sizeof(buffer));
    if (!ok && !e->code) problem(e,CRYPTO_INTERNAL,"signature_processing_failed");
    return ok;
}

static int digest_file(const char *algorithm, const char *input, crypto_error *e)
{
    const EVP_MD *md = strcmp(algorithm,"sha256")==0 ? EVP_sha256() :
                       strcmp(algorithm,"sha512")==0 ? EVP_sha512() :
                       strcmp(algorithm,"sha3-256")==0 ? EVP_sha3_256() : NULL;
    FILE *in = md ? open_input(input) : NULL;
    EVP_MD_CTX *ctx = EVP_MD_CTX_new();
    unsigned char buffer[65536], hash[64]; char encoded[129];
    unsigned int len = 0; size_t count; int ok = 0;
    if (!in || !ctx || EVP_DigestInit_ex(ctx,md,NULL)!=1) goto done;
    while ((count=fread(buffer,1,sizeof(buffer),in)) > 0) if (EVP_DigestUpdate(ctx,buffer,count)!=1) goto done;
    if (ferror(in) || EVP_DigestFinal_ex(ctx,hash,&len)!=1) goto done;
    hex(hash,len,encoded);
    printf("{\"algorithm\":\"%s\",\"digest\":\"%s\"}\n",algorithm,encoded); ok=1;
done:
    if (in) fclose(in);
    EVP_MD_CTX_free(ctx); OPENSSL_cleanse(buffer,sizeof(buffer));
    if (!ok) problem(e,CRYPTO_INVALID,"digest_failed");
    return ok;
}

int crypto_advanced(int argc, char **argv, const unsigned char *password,
                    size_t password_length, crypto_error *error)
{
    int ok=0; *error=(crypto_error){0};
    if (argc==4 && strcmp(argv[1],"keygen")==0)
        ok=generate(argv[2],argv[3],password,password_length,error);
    else if (argc==3 && strcmp(argv[1],"keyinfo")==0) {
        EVP_PKEY *key=read_key(argv[2],0,NULL,0,error);
        if (key) { key_json(key,0,0); ok=1; } EVP_PKEY_free(key);
    } else if (argc==5 && (strcmp(argv[1],"hybrid-encrypt")==0 || strcmp(argv[1],"hybrid-decrypt")==0))
        ok=hybrid(strcmp(argv[1],"hybrid-encrypt")==0,argv[2],argv[3],argv[4],password,password_length,error);
    else if (argc==5 && (strcmp(argv[1],"sign")==0 || strcmp(argv[1],"verify")==0))
        ok=signature(strcmp(argv[1],"sign")==0,argv[2],argv[3],argv[4],password,password_length,error);
    else if (argc==4 && strcmp(argv[1],"hash")==0) ok=digest_file(argv[2],argv[3],error);
    else if (argc==3 && (strcmp(argv[1],"benchmark-core")==0 || strcmp(argv[1],"benchmark-kdf")==0))
        return crypto_benchmark(argv[1],argv[2],password,password_length,error);
    else problem(error,CRYPTO_INVALID,"invalid_command");
    return ok ? 0 : (error->code ? error->code : CRYPTO_INTERNAL);
}
