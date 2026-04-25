// WebSocket hub — manages connected clients and broadcasts messages.
package ws

import (
	"encoding/json"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/martincollado/kubeislands-engine/internal/proto"
)

const (
	writeWait  = 10 * time.Second
	pongWait   = 60 * time.Second
	pingPeriod = 15 * time.Second
	maxMsgSize = 512 * 1024 // 512 KB
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 64 * 1024,
	CheckOrigin:     func(r *http.Request) bool { return true }, // open in dev; tighten in prod
}

// Hub manages a set of active WebSocket connections.
type Hub struct {
	mu      sync.RWMutex
	clients map[*client]struct{}

	// Called on new connection to get the current snapshot
	SnapshotFn func() proto.WorldState
}

// NewHub creates a Hub.
func NewHub(snapshotFn func() proto.WorldState) *Hub {
	return &Hub{
		clients:    make(map[*client]struct{}),
		SnapshotFn: snapshotFn,
	}
}

// BroadcastDiff sends a diff message to all connected clients.
func (h *Hub) BroadcastDiff(ops []proto.Op) {
	if len(ops) == 0 {
		return
	}
	msg := proto.ServerMsg{
		Kind: proto.MsgDiff,
		T:    time.Now().UnixMilli(),
		Ops:  ops,
	}
	h.broadcast(msg)
}

// BroadcastEvent sends a cluster event to all connected clients.
func (h *Hub) BroadcastEvent(evt proto.ClusterEvent) {
	msg := proto.ServerMsg{
		Kind:  proto.MsgEvent,
		T:     evt.T,
		Event: &evt,
	}
	h.broadcast(msg)
}

// BroadcastPing sends a heartbeat to all clients.
func (h *Hub) BroadcastPing() {
	msg := proto.ServerMsg{Kind: proto.MsgPing, T: time.Now().UnixMilli()}
	h.broadcast(msg)
}

func (h *Hub) broadcast(msg proto.ServerMsg) {
	data, err := json.Marshal(msg)
	if err != nil {
		log.Printf("hub: marshal error: %v", err)
		return
	}
	h.mu.RLock()
	defer h.mu.RUnlock()
	for c := range h.clients {
		select {
		case c.send <- data:
		default:
			// slow client — drop frame
		}
	}
}

// ServeHTTP upgrades the connection and registers the client.
func (h *Hub) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("ws upgrade: %v", err)
		return
	}
	c := &client{hub: h, conn: conn, send: make(chan []byte, 256)}
	h.mu.Lock()
	h.clients[c] = struct{}{}
	h.mu.Unlock()

	go c.writePump()
	go c.readPump()

	// Send initial snapshot
	snap := h.SnapshotFn()
	msg := proto.ServerMsg{
		Kind:  proto.MsgSnapshot,
		T:     time.Now().UnixMilli(),
		State: &snap,
	}
	data, _ := json.Marshal(msg)
	c.send <- data
}

// client is a single WebSocket connection.
type client struct {
	hub  *Hub
	conn *websocket.Conn
	send chan []byte
}

func (c *client) readPump() {
	defer func() {
		c.hub.mu.Lock()
		delete(c.hub.clients, c)
		c.hub.mu.Unlock()
		c.conn.Close()
	}()
	c.conn.SetReadLimit(maxMsgSize)
	_ = c.conn.SetReadDeadline(time.Now().Add(pongWait))
	c.conn.SetPongHandler(func(string) error {
		return c.conn.SetReadDeadline(time.Now().Add(pongWait))
	})
	for {
		_, _, err := c.conn.ReadMessage()
		if err != nil {
			break
		}
		// Client messages ignored for now (v1)
	}
}

func (c *client) writePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()
	for {
		select {
		case data, ok := <-c.send:
			_ = c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				_ = c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			if err := c.conn.WriteMessage(websocket.TextMessage, data); err != nil {
				return
			}
		case <-ticker.C:
			_ = c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}
