/*
 * vanity.cu - GPU pre-screener for TRON vanity addresses.
 * Full pipeline: cuRAND -> secp256k1 -> Keccak -> SHA256 -> Base58 mod check.
 * Outputs ONLY candidate private keys (32B each) to stdout.
 * Go CPU re-verifies every candidate with proven crypto for 100% correctness.
 *
 * Compile: nvcc -O3 -arch=native -use_fast_math -o vanity_worker vanity.cu -lcurand
 */

#include <stdio.h>
#include <stdlib.h>
#include <stdint.h>
#include <string.h>
#include <time.h>
#include <unistd.h>
#include <cuda_runtime.h>
#include <curand_kernel.h>

#define BATCH_SIZE (4 << 20)
#define BLOCK 256
#define CANDIDATE_MAX 256

// secp256k1 prime P (4 limbs LE)
__device__ __constant__ uint64_t P[4] = {
    0xFFFFFC2FFFFFFFFFULL,0xFFFFFEFFFFFFFFFFULL,
    0xFFFFFFFFFFFFFFFFULL,0xFFFFFFFFFFFFFFFFULL
};

// Generator G coordinates
__device__ __constant__ uint64_t GX[4] = {
    0x59F2815B16F81798ULL,0x029BFCDB2DCE28D9ULL,
    0x55A06295CE870B07ULL,0x79BE667EF9DCBBACULL
};
__device__ __constant__ uint64_t GY[4] = {
    0x9C47D08FFB10D4B8ULL,0xFD17B448A6855419ULL,
    0x5DA4FBFC0E1108A8ULL,0x483ADA7726A3C465ULL
};

// Keccak round constants
__device__ __constant__ uint64_t KRC[24] = {
    1ULL,0x8082ULL,0x800000000000808AULL,0x8000000080008000ULL,
    0x808BULL,0x80000001ULL,0x8000000080008081ULL,0x8000000000008009ULL,
    0x8AULL,0x88ULL,0x80008009ULL,0x8000000AULL,0x8000808BULL,
    0x800000000000008BULL,0x8000000000008089ULL,0x8000000000008003ULL,
    0x8000000000008002ULL,0x8000000000000080ULL,0x800AULL,
    0x800000008000000AULL,0x8000000080008081ULL,0x8000000000008080ULL,
    0x80000001ULL,0x8000000080008008ULL
};
__device__ __constant__ int KR[5][5] = {
    {0,36,3,41,18},{1,44,10,45,2},{62,6,43,15,61},{28,55,25,21,56},{27,20,39,8,14}
};

// SHA256 IV
__device__ __constant__ uint32_t SHA256_H0[8] = {
    0x6a09e667U,0xbb67ae85U,0x3c6ef372U,0xa54ff53aU,
    0x510e527fU,0x9b05688cU,0x1f83d9abU,0x5be0cd19U
};
__device__ __constant__ uint32_t SHA256_K[64] = {
    0x428a2f98U,0x71374491U,0xb5c0fbcfU,0xe9b5dba5U,0x3956c25bU,0x59f111f1U,
    0x923f82a4U,0xab1c5ed5U,0xd807aa98U,0x12835b01U,0x243185beU,0x550c7dc3U,
    0x72be5d74U,0x80deb1feU,0x9bdc06a7U,0xc19bf174U,0xe49b69c1U,0xefbe4786U,
    0x0fc19dc6U,0x240ca1ccU,0x2de92c6fU,0x4a7484aaU,0x5cb0a9dcU,0x76f988daU,
    0x983e5152U,0xa831c66dU,0xb00327c8U,0xbf597fc7U,0xc6e00bf3U,0xd5a79147U,
    0x06ca6351U,0x14292967U,0x27b70a85U,0x2e1b2138U,0x4d2c6dfcU,0x53380d13U,
    0x650a7354U,0x766a0abbU,0x81c2c92eU,0x92722c85U,0xa2bfe8a1U,0xa81a664bU,
    0xc24b8b70U,0xc76c51a3U,0xd192e819U,0xd6990624U,0xf40e3585U,0x106aa070U,
    0x19a4c116U,0x1e376c08U,0x2748774cU,0x34b0bcb5U,0x391c0cb3U,0x4ed8aa4aU,
    0x5b9cca4fU,0x682e6ff3U,0x748f82eeU,0x78a5636fU,0x84c87814U,0x8cc70208U,
    0x90befffaU,0xa4506cebU,0xbef9a3f7U,0xc67178f2U
};

// Base58 constants: simplified modular check
// Mathematical truth: payload % 58^N ∈ {0, S, 2S, ..., 57S} where S = (58^N - 1)/57
// iff the last N base58 characters are identical.
// So we just check: (payload % 58^N) % S == 0
#define B58_POW4  11316496ULL     // 58^4
#define B58_S4    198535ULL       // (58^4 - 1) / 57

// ================================================================
// Helpers
// ================================================================
__device__ __forceinline__ uint64_t ROT64(uint64_t x,int n){return (x<<n)|(x>>(64-n));}
__device__ __forceinline__ uint32_t ROTR32(uint32_t x,int n){return (x>>n)|(x<<(32-n));}

__device__ int fe_cmp(const uint64_t*a,const uint64_t*b){
    for(int i=3;i>=0;i--){if(a[i]!=b[i])return a[i]>b[i]?1:-1;}
    return 0;
}
__device__ int fe_is_zero(const uint64_t*a){return !(a[0]|a[1]|a[2]|a[3]);}

// fe_add: r = (a + b) mod P
__device__ void fe_add(uint64_t*r,const uint64_t*a,const uint64_t*b){
    uint64_t c=0;
    for(int i=0;i<4;i++){
        uint64_t s=a[i]+b[i],c1=(s<a[i]);
        r[i]=s+c;uint64_t c2=(r[i]<s);c=c1+c2;
    }
    if(fe_cmp(r,P)>=0){uint64_t bo=0;for(int i=0;i<4;i++){uint64_t s=P[i]+bo;bo=(r[i]<s)?1ULL:0ULL;r[i]-=s;}}
}

// fe_double: r = (2*a) mod P. Safe: uses fe_add.
__device__ void fe_double(uint64_t*r,const uint64_t*a){fe_add(r,a,a);}

// fe_sub: r = (a - b) mod P
__device__ void fe_sub(uint64_t*r,const uint64_t*a,const uint64_t*b){
    if(fe_cmp(a,b)<0){uint64_t t[4];fe_add(t,a,P);uint64_t bo=0;for(int i=0;i<4;i++){uint64_t s=b[i]+bo;bo=(t[i]<s)?1ULL:0ULL;r[i]=t[i]-s;}}
    else{uint64_t bo=0;for(int i=0;i<4;i++){uint64_t s=b[i]+bo;bo=(a[i]<s)?1ULL:0ULL;r[i]=a[i]-s;}}
}

// fe_mul: r = a * b mod P (schoolbook + 2^256 ≡ δ reduction).
// δ = 2^256 mod P = 0x1000003D1 (33 bits, P = 2^256 - δ).
__device__ void fe_mul(uint64_t*r,const uint64_t*a,const uint64_t*b){
    // ---- schoolbook a*b -> t[0..7] ----
    uint64_t t[8]={0};
    for(int ai=0;ai<4;ai++){
        for(int bj=0;bj<4;bj++){
            uint64_t lo=a[ai]*b[bj];
            uint64_t hi=__umul64hi(a[ai],b[bj]);
            int k=ai+bj;
            while(lo){uint64_t s=t[k]+lo;lo=(s<t[k]);t[k]=s;k++;}
            k=ai+bj+1;
            while(hi){uint64_t s=t[k]+hi;hi=(s<t[k]);t[k]=s;k++;}
        }
    }
    // ---- reduction: t_hi * δ + t_lo (δ = 0x1000003D1) ----
    #define DELTA 0x1000003D1ULL
    uint64_t w[5]={t[0],t[1],t[2],t[3],0};
    for(int i=0;i<4;i++){
        uint64_t x=t[4+i]; if(!x) continue;
        uint64_t lo=x*DELTA, hi=__umul64hi(x,DELTA);
        int p=i;
        while(lo){uint64_t s=w[p]+lo;lo=(s<w[p]);w[p]=s;p++;}
        p=i+1;
        while(hi){uint64_t s=w[p]+hi;hi=(s<w[p]);w[p]=s;p++;}
    }
    #undef DELTA
    // w[4] * 2^256 ≡ w[4] * δ
    if(w[4]){
        uint64_t lo=w[4]*0x1000003D1ULL;
        for(int p=0;lo;p++){uint64_t s=w[p]+lo;lo=(s<w[p]);w[p]=s;}
    }
    r[0]=w[0];r[1]=w[1];r[2]=w[2];r[3]=w[3];
    while(fe_cmp(r,P)>=0){uint64_t bo=0;for(int i=0;i<4;i++){uint64_t s=P[i]+bo;bo=(r[i]<s)?1ULL:0ULL;r[i]-=s;}}
}

__device__ void fe_sqr(uint64_t*r,const uint64_t*a){fe_mul(r,a,a);}

// fe_inv: Fermat a^(P-2)
__device__ void fe_inv(uint64_t*r,const uint64_t*a){
    static const uint64_t e[4]={0xFFFFFC2DFFFFFFFFULL,0xFFFFFEFFFFFFFFFFULL,0xFFFFFFFFFFFFFFFFULL,0xFFFFFFFFFFFFFFFFULL};
    uint64_t t[4]={1,0,0,0};
    for(int bit=255;bit>=0;bit--){fe_sqr(t,t);if(e[bit/64]&(1ULL<<(bit%64)))fe_mul(t,t,a);}
    r[0]=t[0];r[1]=t[1];r[2]=t[2];r[3]=t[3];
}

// ================================================================
// Jacobian point ops (secp256k1: y^2 = x^3 + 7)
// ================================================================

__device__ void jac_double(uint64_t*x3,uint64_t*y3,uint64_t*z3,
    const uint64_t*x1,const uint64_t*y1,const uint64_t*z1)
{
    if(fe_is_zero(y1)){x3[0]=x3[1]=x3[2]=x3[3]=0;y3[0]=y3[1]=y3[2]=y3[3]=0;z3[0]=z3[1]=z3[2]=z3[3]=0;return;}

    uint64_t A[4],B[4],C[4],D[4],E[4],F[4],X[4];
    fe_sqr(A,x1);
    fe_sqr(B,y1);
    fe_sqr(C,B);
    fe_add(X,x1,B);
    fe_sqr(D,X);
    fe_sub(D,D,A);
    fe_sub(D,D,C);      // D = (X1+B)^2 - A - C = 2X1Y1^2
    fe_double(D,D);     // D = 4X1Y1^2  (formula needs 2*((X1+B)^2-A-C))

    fe_add(E,A,A);
    fe_add(E,E,A);       // E = 3A = 3X1^2
    fe_sqr(F,E);         // F = E^2 = 9X1^4
    
    fe_add(C,C,C);
    fe_add(C,C,C);
    fe_add(C,C,C);       // C = 8C = 8Y1^4
    
    fe_add(z3,y1,y1);
    fe_mul(z3,z3,z1);     // Z3 = 2*Y1*Z1
}

// jac_mixed_add: Jacobian P + Affine Q -> Jacobian R
__device__ void jac_mixed_add(
    uint64_t*x3,uint64_t*y3,uint64_t*z3,
    const uint64_t*x1,const uint64_t*y1,const uint64_t*z1,
    const uint64_t*x2,const uint64_t*y2)
{
    if(fe_is_zero(z1)){
        for(int i=0;i<4;i++){x3[i]=x2[i];y3[i]=y2[i];}
        z3[0]=1;z3[1]=z3[2]=z3[3]=0;
        return;
    }
    uint64_t H[4],r[4],U1[4],U2[4],S1[4],S2[4];
    fe_sqr(U2,z1);          // U2 = Z1^2
    fe_mul(U2,x2,U2);       // U2 = X2 * Z1^2
    for(int i=0;i<4;i++)U1[i]=x1[i];  // U1 = X1 (affine Q has Z2=1)
    fe_sqr(S2,z1);          // S2 = Z1^2
    fe_mul(S2,S2,z1);       // S2 = Z1^3
    fe_mul(S2,y2,S2);       // S2 = Y2 * Z1^3
    for(int i=0;i<4;i++)S1[i]=y1[i];  // S1 = Y1
    fe_sub(H,U2,U1);
    fe_sub(r,S2,S1);

    if(fe_is_zero(H)){
        x3[0]=x3[1]=x3[2]=x3[3]=0;y3[0]=y3[1]=y3[2]=y3[3]=0;z3[0]=z3[1]=z3[2]=z3[3]=0;
        return;
    }

    uint64_t HH[4],HHH[4],V[4],J[4],T[4];
    fe_sqr(HH,H);
    fe_mul(HHH,HH,H);
    fe_mul(V,U1,HH);
    fe_sqr(x3,r);
    fe_sub(x3,x3,HHH);
    fe_add(T,V,V);
    fe_sub(x3,x3,T);
    fe_sub(y3,V,x3);
    fe_mul(y3,r,y3);
    fe_mul(J,S1,HHH);
    fe_sub(y3,y3,J);
    fe_mul(z3,H,z1);
}

// scalar_mult_G: k * G -> Jacobian (rx,ry,rz)
__device__ void scalar_mult_G(uint64_t*rx,uint64_t*ry,uint64_t*rz,const uint64_t*k){
    rx[0]=rx[1]=rx[2]=rx[3]=0;ry[0]=ry[1]=ry[2]=ry[3]=0;rz[0]=rz[1]=rz[2]=rz[3]=0;
    int started=0;
    uint64_t dx[4],dy[4],dz[4];
    for(int bit=255;bit>=0;bit--){
        if(started){jac_double(dx,dy,dz,rx,ry,rz);for(int i=0;i<4;i++){rx[i]=dx[i];ry[i]=dy[i];rz[i]=dz[i];}}
        if(k[bit/64]&(1ULL<<(bit%64))){
            if(!started){for(int i=0;i<4;i++){rx[i]=GX[i];ry[i]=GY[i];}rz[0]=1;rz[1]=rz[2]=rz[3]=0;started=1;}
            else{jac_mixed_add(dx,dy,dz,rx,ry,rz,GX,GY);for(int i=0;i<4;i++){rx[i]=dx[i];ry[i]=dy[i];rz[i]=dz[i];}}
        }
    }
}

// ================================================================
// Keccak-256 of 64 bytes (X_BE || Y_BE) -> 20-byte raw address
// ================================================================
__device__ void keccak256_64to20(uint8_t*hash20,const uint64_t*x,const uint64_t*y){
    uint64_t state[25]={0};
    // Load 64 bytes: X then Y, both big-endian
    for(int limb=0;limb<4;limb++){
        int src=3-limb;uint64_t vx=x[src];
        for(int b=0;b<8;b++){
            int bp=limb*8+b,si=bp/8,sh=(bp%8)*8;
            state[si]|=((vx>>(56-8*b))&0xFFULL)<<sh;
        }
    }
    for(int limb=0;limb<4;limb++){
        int src=3-limb;uint64_t vy=y[src];
        for(int b=0;b<8;b++){
            int bp=32+limb*8+b,si=bp/8,sh=(bp%8)*8;
            state[si]|=((vy>>(56-8*b))&0xFFULL)<<sh;
        }
    }
    state[8]^=0x01;state[16]^=0x8000000000000000ULL;

    for(int r=0;r<24;r++){
        uint64_t C[5],D[5],B[25];
        for(int i=0;i<5;i++)C[i]=state[i]^state[i+5]^state[i+10]^state[i+15]^state[i+20];
        for(int i=0;i<5;i++)D[i]=C[(i+4)%5]^ROT64(C[(i+1)%5],1);
        for(int i=0;i<5;i++)for(int j=0;j<5;j++)state[i+5*j]^=D[i];
        for(int i=0;i<5;i++)for(int j=0;j<5;j++)B[(i+3*j)%5+5*i]=ROT64(state[i+5*j],KR[i][j]);
        for(int i=0;i<5;i++)for(int j=0;j<5;j++)state[i+5*j]=B[i+5*j]^((~B[(i+1)%5+5*j])&B[(i+2)%5+5*j]);
        state[0]^=KRC[r];
    }
    for(int i=0;i<20;i++){int wi=(12+i)/8,bi=(12+i)%8;hash20[i]=(uint8_t)(state[wi]>>(8*bi));}
}

// ================================================================
// SHA256 of 21 bytes (0x41||hash20)
// ================================================================
__device__ void sha256_21(uint8_t*out32,const uint8_t*in21){
    uint32_t w[64],a=SHA256_H0[0],b=SHA256_H0[1],c=SHA256_H0[2],d=SHA256_H0[3],
              e=SHA256_H0[4],f=SHA256_H0[5],g=SHA256_H0[6],h=SHA256_H0[7];
    for(int i=0;i<5;i++)w[i]=((uint32_t)in21[i*4]<<24)|((uint32_t)in21[i*4+1]<<16)|((uint32_t)in21[i*4+2]<<8)|in21[i*4+3];
    w[5]=((uint32_t)in21[20]<<24)|0x00800000U;
    for(int i=6;i<15;i++)w[i]=0;w[15]=168;
    for(int i=0;i<64;i++){
        if(i>=16){uint32_t s0=ROTR32(w[i-15],7)^ROTR32(w[i-15],18)^(w[i-15]>>3),s1=ROTR32(w[i-2],17)^ROTR32(w[i-2],19)^(w[i-2]>>10);w[i]=w[i-16]+s0+w[i-7]+s1;}
        uint32_t S1=ROTR32(e,6)^ROTR32(e,11)^ROTR32(e,25),ch=(e&f)^(~e&g),t1=h+S1+ch+SHA256_K[i]+w[i],
                 S0=ROTR32(a,2)^ROTR32(a,13)^ROTR32(a,22),maj=(a&b)^(a&c)^(b&c),t2=S0+maj;
        h=g;g=f;f=e;e=d+t1;d=c;c=b;b=a;a=t1+t2;
    }
    uint32_t hv[8]={a+SHA256_H0[0],b+SHA256_H0[1],c+SHA256_H0[2],d+SHA256_H0[3],e+SHA256_H0[4],f+SHA256_H0[5],g+SHA256_H0[6],h+SHA256_H0[7]};
    for(int i=0;i<8;i++){out32[i*4]=(uint8_t)(hv[i]>>24);out32[i*4+1]=(uint8_t)(hv[i]>>16);out32[i*4+2]=(uint8_t)(hv[i]>>8);out32[i*4+3]=(uint8_t)hv[i];}
}

// SHA256 of exactly 32 bytes
__device__ void sha256_32(uint8_t*out32,const uint8_t*in32){
    uint32_t w[64],a=SHA256_H0[0],b=SHA256_H0[1],c=SHA256_H0[2],d=SHA256_H0[3],
              e=SHA256_H0[4],f=SHA256_H0[5],g=SHA256_H0[6],h=SHA256_H0[7];
    for(int i=0;i<8;i++)w[i]=((uint32_t)in32[i*4]<<24)|((uint32_t)in32[i*4+1]<<16)|((uint32_t)in32[i*4+2]<<8)|in32[i*4+3];
    w[8]=0x80000000U;for(int i=9;i<15;i++)w[i]=0;w[15]=256;
    for(int i=0;i<64;i++){
        if(i>=16){uint32_t s0=ROTR32(w[i-15],7)^ROTR32(w[i-15],18)^(w[i-15]>>3),s1=ROTR32(w[i-2],17)^ROTR32(w[i-2],19)^(w[i-2]>>10);w[i]=w[i-16]+s0+w[i-7]+s1;}
        uint32_t S1=ROTR32(e,6)^ROTR32(e,11)^ROTR32(e,25),ch=(e&f)^(~e&g),t1=h+S1+ch+SHA256_K[i]+w[i],
                 S0=ROTR32(a,2)^ROTR32(a,13)^ROTR32(a,22),maj=(a&b)^(a&c)^(b&c),t2=S0+maj;
        h=g;g=f;f=e;e=d+t1;d=c;c=b;b=a;a=t1+t2;
    }
    uint32_t hv[8]={a+SHA256_H0[0],b+SHA256_H0[1],c+SHA256_H0[2],d+SHA256_H0[3],e+SHA256_H0[4],f+SHA256_H0[5],g+SHA256_H0[6],h+SHA256_H0[7]};
    for(int i=0;i<8;i++){out32[i*4]=(uint8_t)(hv[i]>>24);out32[i*4+1]=(uint8_t)(hv[i]>>16);out32[i*4+2]=(uint8_t)(hv[i]>>8);out32[i*4+3]=(uint8_t)hv[i];}
}

__device__ uint32_t dsha256_cs(const uint8_t*pre21){uint8_t h1[32],h2[32];sha256_21(h1,pre21);sha256_32(h2,h1);return ((uint32_t)h2[0]<<24)|((uint32_t)h2[1]<<16)|((uint32_t)h2[2]<<8)|h2[3];}

// payload_mod: computes (25-byte big-endian payload) % M.
// Memory-safe: r * 256 + byte fits in uint64_t (max ~5.6e14 < 1.8e19).
__device__ uint64_t payload_mod(const uint8_t* p25, uint64_t M) {
    uint64_t r = 0;
    for (int i = 0; i < 25; i++) {
        r = (r * 256 + p25[i]) % M;
    }
    return r;
}

// ================================================================
// Main kernel
// ================================================================
__global__ void vanity_kernel(curandState*states,uint8_t*out,uint32_t*cnt,uint32_t n){
    uint32_t tid=blockIdx.x*blockDim.x+threadIdx.x;
    if(tid>=n)return;
    curandState rng=states[tid];
    uint64_t priv[4];
    for(int i=0;i<4;i++){uint64_t lo=curand(&rng),hi=curand(&rng);priv[i]=lo|(hi<<32);}
    states[tid]=rng;

    uint64_t px[4],py[4],pz[4];
    scalar_mult_G(px,py,pz,priv);
    if(!fe_is_zero(pz)){
        uint64_t iz[4],iz2[4];
        fe_inv(iz,pz);fe_sqr(iz2,iz);fe_mul(px,px,iz2);fe_mul(iz2,iz2,iz);fe_mul(py,py,iz2);
    }
    uint8_t h20[20];keccak256_64to20(h20,px,py);

    uint8_t payload[25];payload[0]=0x41;
    for(int i=0;i<20;i++)payload[1+i]=h20[i];
    uint32_t cs=dsha256_cs(payload);
    payload[21]=(uint8_t)(cs>>24);payload[22]=(uint8_t)(cs>>16);payload[23]=(uint8_t)(cs>>8);payload[24]=(uint8_t)cs;

    uint64_t r4 = payload_mod(payload, B58_POW4);
    int matched = 0;
    if (r4 % B58_S4 == 0) {
        matched = 1;
    }

    if(matched){
        uint32_t idx=atomicAdd(cnt,1);
        if(idx<CANDIDATE_MAX){
            uint8_t*dst=out+idx*32;
            for(int limb=0;limb<4;limb++){uint64_t v=priv[3-limb];for(int b=0;b<8;b++)dst[limb*8+b]=(uint8_t)(v>>(56-8*b));}
        }
    }
}

// ================================================================
// cuRAND init + host main
// ================================================================
__global__ void init_rng(curandState*s,uint64_t seed,uint32_t n){
    uint32_t tid=blockIdx.x*blockDim.x+threadIdx.x;
    if(tid<n)curand_init(seed,tid,0,&s[tid]);
}

int main(int argc,char**argv){
    uint32_t batch=BATCH_SIZE;
    for(int i=1;i<argc;i++)if(!strcmp(argv[i],"--batch")&&i+1<argc)batch=(uint32_t)atoll(argv[++i]);
    batch=((batch+BLOCK-1)/BLOCK)*BLOCK;uint32_t grid=batch/BLOCK;

    {int n;cudaGetDeviceCount(&n);cudaDeviceProp p;for(int d=0;d<n;d++){cudaGetDeviceProperties(&p,d);fprintf(stderr,"[GPU] %s | VRAM %.1f GB | SMs %d\n",p.name,p.totalGlobalMem/1073741824.0,p.multiProcessorCount);}cudaSetDevice(0);}

    curandState*d_rng;uint8_t*d_out;uint32_t*d_cnt;
    cudaMalloc(&d_rng,(size_t)batch*sizeof(curandState));
    cudaMalloc(&d_out,CANDIDATE_MAX*32);
    cudaMalloc(&d_cnt,sizeof(uint32_t));
    cudaMemset(d_cnt,0,sizeof(uint32_t));
    init_rng<<<grid,BLOCK>>>(d_rng,(uint64_t)time(NULL)^((uint64_t)getpid()<<32),batch);
    cudaDeviceSynchronize();

    setvbuf(stdout,NULL,_IOFBF,16*1024*1024);
    fprintf(stderr,"[GPU] ready batch=%u grid=%u\n",batch,grid);

    uint8_t*h_out=(uint8_t*)malloc(CANDIDATE_MAX*32);
    struct timespec ts,tn;clock_gettime(CLOCK_MONOTONIC,&ts);uint64_t total=0;
    for(;;){
        cudaMemset(d_cnt,0,sizeof(uint32_t));
        vanity_kernel<<<grid,BLOCK>>>(d_rng,d_out,d_cnt,batch);
        cudaDeviceSynchronize();
        uint32_t nm=0;cudaMemcpy(&nm,d_cnt,sizeof(uint32_t),cudaMemcpyDeviceToHost);
        if(nm>0){uint32_t nc=(nm>CANDIDATE_MAX)?CANDIDATE_MAX:nm;cudaMemcpy(h_out,d_out,nc*32,cudaMemcpyDeviceToHost);fwrite(h_out,1,nc*32,stdout);}
        total+=batch;clock_gettime(CLOCK_MONOTONIC,&tn);
        double dt=(tn.tv_sec-ts.tv_sec)+(tn.tv_nsec-ts.tv_nsec)/1e9;
        if(dt>=10.0){fprintf(stderr,"[GPU] %.0f keys %.1f M/s matches=%u\n",(double)total,total/dt/1000000.0,nm);ts=tn;total=0;}
    }
    return 0;
}
