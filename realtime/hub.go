package realtime

import (
	"log"
)

// Hub maintains active websocket clients and broadcasts mutations.
type Hub struct {
	clients    map[*Client]bool
	register   chan *Client
	unregister chan *Client
	broadcast  chan []byte
}

// NewHub creates a hub with initialized channels.
func NewHub() *Hub {
	return &Hub{
		clients:    make(map[*Client]bool),
		register:   make(chan *Client),
		unregister: make(chan *Client),
		broadcast:  make(chan []byte, 32),
	}
}

// Run processes hub events; it should be executed as a goroutine.
func (h *Hub) Run() {
	for {
		select {
		case client := <-h.register:
			h.clients[client] = true
		case client := <-h.unregister:
			if _, ok := h.clients[client]; ok {
				delete(h.clients, client)
				close(client.send)
			}
		case message := <-h.broadcast:
			for client := range h.clients {
				select {
				case client.send <- message:
				default:
					close(client.send)
					delete(h.clients, client)
				}
			}
		}
	}
}

// Broadcast enqueues a message for all connected clients.
func (h *Hub) Broadcast(message []byte) {
	select {
	case h.broadcast <- message:
	default:
		log.Printf("dropping broadcast message due to full channel")
	}
}
