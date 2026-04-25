package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/martincollado/kubeislands-engine/internal/k8s"
	"github.com/martincollado/kubeislands-engine/internal/world"
	"github.com/martincollado/kubeislands-engine/internal/ws"
)

// Injected at build time via -ldflags.
var (
	version = "dev"
	commit  = "unknown"
)

func main() {
	addr := flag.String("addr", ":8081", "listen address")
	tickHz := flag.Float64("hz", 10, "simulation tick rate")
	flag.Parse()

	log.SetFlags(log.LstdFlags | log.Lmsgprefix)
	log.SetPrefix("[kube-engine] ")
	log.Printf("version=%s commit=%s", version, commit)

	// Build world state from seed
	state := world.New()
	log.Println("world state initialized from seed")

	// WebSocket hub
	hub := ws.NewHub(state.Snapshot)

	// Try to connect to a real K8s cluster (optional)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	if watcher := k8s.New(state); watcher != nil {
		state.ClearSeed()
		go watcher.Start(ctx)
		log.Println("k8s watcher started — live cluster mode (seed cleared)")
	} else {
		log.Println("no k8s cluster — running simulation only")
	}

	// Simulation + broadcast loop
	tickDur := time.Duration(float64(time.Second) / *tickHz)
	go func() {
		ticker := time.NewTicker(tickDur)
		defer ticker.Stop()
		pingTimer := time.NewTicker(15 * time.Second)
		defer pingTimer.Stop()

		for {
			select {
			case <-ticker.C:
				evts := state.Tick(tickDur.Seconds())
				for _, evt := range evts {
					hub.BroadcastEvent(evt)
				}
				if ops := state.DiffSince(); len(ops) > 0 {
					hub.BroadcastDiff(ops)
				}
			case <-pingTimer.C:
				hub.BroadcastPing()
			case <-ctx.Done():
				return
			}
		}
	}()

	// HTTP server
	mux := http.NewServeMux()
	mux.Handle("/ws/world", hub)
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(map[string]string{
			"status":  "ok",
			"version": version,
			"commit":  commit,
		})
	})
	mux.HandleFunc("/version", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/plain")
		_, _ = fmt.Fprintf(w, "%s (%s)\n", version, commit)
	})
	mux.HandleFunc("/readyz", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})

	srv := &http.Server{Addr: *addr, Handler: mux}

	go func() {
		log.Printf("listening on %s", *addr)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("server error: %v", err)
		}
	}()

	// Graceful shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	log.Println("shutting down…")
	cancel()
	shutCtx, shutCancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer shutCancel()
	_ = srv.Shutdown(shutCtx)
}
