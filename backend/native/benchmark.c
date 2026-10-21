#define _POSIX_C_SOURCE 200809L
#include "crypto_internal.h"
#include <openssl/crypto.h>
#include <openssl/evp.h>
#include <openssl/rand.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#ifdef _WIN32
#include <windows.h>
static double seconds(void) {
    LARGE_INTEGER value, frequency;
    QueryPerformanceCounter(&value); QueryPerformanceFrequency(&frequency);
    return (double)value.QuadPart/(double)frequency.QuadPart;
}
#else
#include <time.h>
static double seconds(void) {
    struct timespec now;
    clock_gettime(CLOCK_MONOTONIC,&now);
    return (double)now.tv_sec+(double)now.tv_nsec/1000000000.0;
}
#endif

/* In-memory operation only: includes context init, padding and tag/MAC.
 * Excludes RNG, file I/O, KDF, process startup, allocation and comparison.
 * Every measured decrypt is authenticated and compared to the original. */
static int memory_cipher(int algorithm, int encrypt, const unsigned char *key,
                         const unsigned char *nonce, const unsigned char *input, int length,
                         unsigned char *output, int *output_length, unsigned char *tag)
{
    const EVP_CIPHER *cipher = algorithm==0 ? EVP_aes_256_gcm() : algorithm==1 ? EVP_aes_256_cbc() :
                               algorithm==2 ? EVP_aes_128_gcm() : EVP_chacha20_poly1305();
    EVP_CIPHER_CTX *ctx = EVP_CIPHER_CTX_new();
    unsigned char mac[32]; size_t maclen=0;
    int n=0, last=0, ok=0;
    if (!ctx) goto done;
    if (algorithm==1 && !encrypt) {
        if (!EVP_Q_mac(NULL,"HMAC",NULL,"SHA256",NULL,key+32,32,input,(size_t)length,mac,sizeof(mac),&maclen) ||
            maclen!=32 || CRYPTO_memcmp(mac,tag,32)) goto done;
    }
    if (EVP_CipherInit_ex(ctx,cipher,NULL,key,nonce,encrypt)!=1 ||
        EVP_CipherUpdate(ctx,output,&n,input,length)!=1) goto done;
    if (algorithm!=1 && !encrypt && EVP_CIPHER_CTX_ctrl(ctx,EVP_CTRL_AEAD_SET_TAG,16,tag)!=1) goto done;
    if (EVP_CipherFinal_ex(ctx,output+n,&last)!=1) goto done;
    *output_length=n+last;
    if (encrypt) {
        if (algorithm==1) {
            if (!EVP_Q_mac(NULL,"HMAC",NULL,"SHA256",NULL,key+32,32,output,(size_t)*output_length,tag,32,&maclen) || maclen!=32) goto done;
        } else if (EVP_CIPHER_CTX_ctrl(ctx,EVP_CTRL_AEAD_GET_TAG,16,tag)!=1) goto done;
    }
    ok=1;
done:
    EVP_CIPHER_CTX_free(ctx);
    return ok;
}

static void samples(const double *values) {
    printf("[%.6f,%.6f,%.6f]",values[0],values[1],values[2]);
}

int crypto_benchmark(const char *mode, const char *input, const unsigned char *password,
                     size_t password_length, crypto_error *error)
{
    unsigned char key[64], nonce[16], tag[32], salt[16];
    unsigned char *plain=NULL, *cipher=NULL, *restored=NULL;
    FILE *f=NULL;
    size_t size=0;
    double encryption[4][3]={{0}}, decryption[4][3]={{0}}, kdf[2][3]={{0}};
    int ok=0;
    if (RAND_bytes(key,sizeof(key))!=1 || RAND_bytes(salt,sizeof(salt))!=1) goto done;
    if (strcmp(mode,"benchmark-kdf")==0) {
        if (!password || password_length==0) goto done;
        for (int run=-1; run<3; run++) for (int turn=0; turn<2; turn++) {
            int alg=run%2==0 ? turn : 1-turn;
            double start=seconds();
            int valid=alg==0 ? PKCS5_PBKDF2_HMAC((const char *)password,(int)password_length,salt,16,600000,EVP_sha256(),64,key) :
                              EVP_PBE_scrypt((const char *)password,password_length,salt,16,32768,8,1,64*1024*1024,key,64);
            double elapsed=(seconds()-start)*1000.0;
            if (valid!=1) goto done;
            if (run>=0) kdf[alg][run]=elapsed;
        }
        printf("{\"mode\":\"kdf\",\"runs\":3,\"warmup_runs\":1,\"derived_bytes\":64,\"openssl\":\"%s\",\"results\":[",OpenSSL_version(OPENSSL_VERSION));
        printf("{\"algorithm\":\"PBKDF2-HMAC-SHA256\",\"iterations\":600000,\"samples_ms\":"); samples(kdf[0]);
        printf("},{\"algorithm\":\"scrypt\",\"N\":32768,\"r\":8,\"p\":1,\"max_memory_bytes\":67108864,\"samples_ms\":"); samples(kdf[1]); puts("}]}");
        ok=1; goto done;
    }
    f=open_input(input);
    if (!f) goto done;
    plain=malloc(16*1024*1024+1);
    if (!plain) goto done;
    size=fread(plain,1,16*1024*1024+1,f);
    if (ferror(f) || !size || size>16*1024*1024) goto done;
    cipher=malloc(size+32); restored=malloc(size+32);
    if (!cipher || !restored) goto done;
    for (int run=-1; run<3; run++) for (int turn=0; turn<4; turn++) {
        int alg=run%2==0 ? turn : 3-turn;
        int encrypted=0, decrypted=0;
        if (RAND_bytes(nonce,sizeof(nonce))!=1) goto done;
        double start=seconds();
        if (!memory_cipher(alg,1,key,nonce,plain,(int)size,cipher,&encrypted,tag)) goto done;
        double enc=(seconds()-start)*1000.0;
        start=seconds();
        if (!memory_cipher(alg,0,key,nonce,cipher,encrypted,restored,&decrypted,tag)) goto done;
        double dec=(seconds()-start)*1000.0;
        if (decrypted!=(int)size || CRYPTO_memcmp(plain,restored,size)) goto done;
        if (run>=0) { encryption[alg][run]=enc; decryption[alg][run]=dec; }
    }
    printf("{\"mode\":\"core\",\"runs\":3,\"warmup_runs\":1,\"input_bytes\":%zu,\"roundtrip_verified\":true,\"openssl\":\"%s\",\"results\":[",size,OpenSSL_version(OPENSSL_VERSION));
    const char *names[]={"AES-256-GCM","AES-256-CBC + HMAC-SHA256","AES-128-GCM","ChaCha20-Poly1305"};
    for (int alg=0; alg<4; alg++) {
        printf("%s{\"algorithm\":\"%s\",\"encrypt_samples_ms\":",alg ? "," : "",names[alg]); samples(encryption[alg]);
        printf(",\"decrypt_samples_ms\":"); samples(decryption[alg]); printf("}");
    }
    puts("]}"); ok=1;
done:
    if (f) fclose(f);
    if (plain) { OPENSSL_cleanse(plain,size); free(plain); }
    if (cipher) { OPENSSL_cleanse(cipher,size+32); free(cipher); }
    if (restored) { OPENSSL_cleanse(restored,size+32); free(restored); }
    OPENSSL_cleanse(key,sizeof(key));
    if (!ok) { error->code=CRYPTO_INVALID; snprintf(error->message,sizeof(error->message),"benchmark_input_or_operation_failed"); }
    return ok ? 0 : error->code;
}
