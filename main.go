// TRON vanity generator v6: GPU pre-screen + CPU verification.
//
// Architecture:
//   GPU: full pipeline (keys -> secp256k1 -> Keccak -> SHA256 -> Base58 mod check)
//        Outputs only 32B candidate private keys that pass the pre-screen.
//   Go:  re-derives every candidate with proven Go crypto (decred + sha3).
//        Only confirmed matches are sent to Telegram.
//
// Result: GPU speed + 100% correctness guaranteed by CPU verification.

package main

import (
	"bufio"
	"context"
	"flag"
	"fmt"
	"io"
	"log"
	"os"
	"os/exec"
	"os/signal"
	"runtime"
	"sync"
	"syscall"
	"time"

	"tron-address-generator/checker"
	"tron-address-generator/stats"
	"tron-address-generator/telegram"
	"tron-address-generator/verify"
)

const (
	defaultToken = "8611216521:AAGXFb_Popymx2FAi3T7VCXKOX64LRmFxHY"
	defaultChat  = "8500753537"
	keySize      = 32 // each candidate is 32 bytes (big-endian private key)
)

func defaultWorkers() int {
	n := runtime.NumCPU()
	if n > 48 {
		return 48
	}
	if n < 2 {
		return 2
	}
	return n
}

func main() {
	flag.Parse()
	numW := defaultWorkers()

	log.SetFlags(log.LstdFlags | log.Lmicroseconds)

	tg := telegram.NewClient(telegram.Config{BotToken: *botToken, ChatID: *chatID})
	st := stats.NewTracker()
	matchCh := make(chan *checker.Match, 64)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)

	// ---- Launch GPU pre-screener ----
	cmd := exec.CommandContext(ctx, *gpuBinary,
		"--batch", fmt.Sprintf("%d", *batchSize))
	cmd.Stderr = os.Stderr
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		log.Fatalf("pipe: %v", err)
	}
	if err := cmd.Start(); err != nil {
		log.Fatalf("start GPU: %v", err)
	}
	log.Printf("[GO] GPU PID %d | workers %d | batch %d",
		cmd.Process.Pid, numW, *batchSize)

	var wg sync.WaitGroup

	// ---- Pipe reader: reads 32-byte candidate private keys from GPU ----
	keyCh := make(chan []byte, 128)
	wg.Add(1)
	go func() {
		defer wg.Done()
		defer close(keyCh)
		br := bufio.NewReaderSize(stdout, 1<<20)
		for {
			kb := make([]byte, keySize)
			_, err := io.ReadFull(br, kb)
			if err != nil {
				return
			}
			keyCh <- kb
		}
	}()

	// ---- CPU verification workers ----
	for i := 0; i < numW; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for privKey := range keyCh {
				st.AddKeys(1)

				// 1. Re-derive raw address with proven Go crypto
				hash20 := verify.DeriveHash20(privKey)
				if hash20 == nil {
					continue // invalid key
				}

				// 2. Double-check the vanity pattern
				match := checker.CheckFull(privKey, hash20)
				if match != nil {
					st.AddMatch()
					log.Printf("[GO] VERIFIED! %s (%d chars '%c')",
						match.Address, match.VanityLen, match.Pattern)
					matchCh <- match
				} else {
					// GPU false positive — silently dropped
					// (GPU math may have rounding errors in secp256k1)
				}
			}
		}()
	}

	// ---- Telegram sender ----
	wg.Add(1)
	go func() {
		defer wg.Done()
		for {
			select {
			case <-ctx.Done():
				for {
					select {
					case m := <-matchCh:
						sendMatch(tg, m)
					default:
						return
					}
				}
			case m, ok := <-matchCh:
				if !ok {
					return
				}
				sendMatch(tg, m)
			}
		}
	}()

	// ---- 30-minute reporter ----
	wg.Add(1)
	go func() {
		defer wg.Done()
		sendStartup(tg, numW, *batchSize)
		ticker := time.NewTicker(30 * time.Minute)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				msg := st.ReportMessage()
				log.Printf("[GO] Stats: %s", msg)
				tg.SendMessage(msg)
			}
		}
	}()

	// ---- Wait for shutdown ----
	select {
	case sig := <-sigCh:
		log.Printf("[GO] Signal: %v", sig)
	case <-ctx.Done():
		log.Printf("[GO] Done")
	}

	cancel()
	if cmd.Process != nil {
		cmd.Process.Signal(syscall.SIGTERM)
		done := make(chan error, 1)
		go func() { done <- cmd.Wait() }()
		select {
		case <-time.After(3 * time.Second):
			cmd.Process.Kill()
		case <-done:
		}
	}
	wg.Wait()

	final := st.ReportMessage()
	tg.SendMessage("🏁 停止\n\n" + final)
}

func sendMatch(tg *telegram.Client, m *checker.Match) {
	msg := fmt.Sprintf(
		"🎯 TRON 靓号!\n\n🔹 地址: `%s`\n🔑 私钥: `%s`\n📌 后 %d 位都是 '%c'\n✅ CPU 验证通过",
		m.Address, m.PrivateKey, m.VanityLen, m.Pattern)
	tg.SendMessage(msg)
}

func sendStartup(tg *telegram.Client, workers, batch int) {
	msg := fmt.Sprintf(
		"🚀 TRON 靓号生成器 v7\n\n🎯 目标: 后 4 位相同\n"+
			"⚡ 架构: GPU狂暴初筛 + CPU严格复核\n"+
			"🖥  Workers: %d\n📦 GPU Batch: %d\n"+
			"🔐 加密: Go标准库 (100%%正确)\n⏰ 每30分钟报告",
		workers, batch)
	tg.SendMessage(msg)
}

var (
	botToken  = flag.String("token", defaultToken, "Telegram Bot Token")
	chatID    = flag.String("chat", defaultChat, "Telegram Chat ID")
	gpuBinary = flag.String("gpu", "./gpu/vanity_worker", "CUDA binary path")
	batchSize = flag.Int("batch", 4<<20, "GPU batch size")
)
