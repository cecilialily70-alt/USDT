// Package checker verifies TRON vanity address patterns (4 trailing identical chars).
//
// Filter strategy (two-stage for each length):
//   1. Fast: compute the 25-byte address payload mod 58^4, check against
//      58 precomputed target values (one per Base58 character).
//   2. Slow (only if stage 1 passes): full Base58 encode and verify.
package checker

import (
	"crypto/sha256"
	"math/big"

	"github.com/mr-tron/base58"
)

// Match holds a found vanity address with its private key.
type Match struct {
	Address    string // Base58 TRON address (34 chars, starting with 'T')
	PrivateKey string // hex-encoded 32-byte private key
	Pattern    byte   // the repeated character (e.g. 'A', '1')
	VanityLen  int    // how many trailing identical chars (6 or 7)
}

// Base58 alphabet for TRON (same as Bitcoin).
const base58Alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"

var (
	base58Pow4  = new(big.Int).Exp(big.NewInt(58), big.NewInt(4), nil)
	modTargets4 [58]*big.Int
	targetChar  [58]byte
)

func init() {
	num4 := new(big.Int).Sub(base58Pow4, big.NewInt(1))
	div := big.NewInt(57)
	for i := 0; i < 58; i++ {
		modTargets4[i] = new(big.Int).Mul(big.NewInt(int64(i)), num4)
		modTargets4[i].Div(modTargets4[i], div)
		targetChar[i] = base58Alphabet[i]
	}
}

// buildPayload constructs the 25-byte TRON address payload:
//   0x41 || hash20 || checksum4
func buildPayload(hash20 []byte) []byte {
	payload := make([]byte, 25)
	payload[0] = 0x41
	copy(payload[1:21], hash20)
	h1 := sha256.Sum256(payload[:21])
	h2 := sha256.Sum256(h1[:])
	copy(payload[21:25], h2[:4])
	return payload
}

// checkModFilter checks if a 25-byte payload matches any N-char vanity pattern.
// Returns (matched char, true) or (0, false).
func checkModFilter(payload []byte, targets [58]*big.Int, powN *big.Int) (byte, bool) {
	val := new(big.Int).SetBytes(payload)
	rem := new(big.Int).Mod(val, powN)
	for i := 0; i < 58; i++ {
		if rem.Cmp(targets[i]) == 0 {
			return targetChar[i], true
		}
	}
	return 0, false
}

// verifySuffix checks that the last N chars of the address are all equal to c.
func verifySuffix(address string, n int, c byte) bool {
	if len(address) < n+1 {
		return false
	}
	suffix := address[len(address)-n:]
	for i := 0; i < len(suffix); i++ {
		if suffix[i] != c {
			return false
		}
	}
	return true
}

// CheckFull performs Base58 encoding and verifies 4-char trailing pattern.
func CheckFull(privateKey []byte, hash20 []byte) *Match {
	payload := buildPayload(hash20)

	c4, ok4 := checkModFilter(payload, modTargets4, base58Pow4)
	if ok4 {
		address := base58.Encode(payload)
		if verifySuffix(address, 4, c4) {
			return &Match{
				Address:    address,
				PrivateKey: fmtHex(privateKey),
				Pattern:    c4,
				VanityLen:  4,
			}
		}
	}
	return nil
}

// fmtHex encodes bytes as a lowercase hex string.
func fmtHex(data []byte) string {
	const hexChars = "0123456789abcdef"
	out := make([]byte, len(data)*2)
	for i, b := range data {
		out[i*2] = hexChars[b>>4]
		out[i*2+1] = hexChars[b&0x0F]
	}
	return string(out)
}
