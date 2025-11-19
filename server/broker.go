package server

import (
	"log"
	"sync"
)

// Broker manages subscriptions to board events.
type Broker struct {
	mu          sync.RWMutex
	subscribers map[string]map[chan []byte]struct{}
	logger      *log.Logger
}

func NewBroker(logger *log.Logger) *Broker {
	return &Broker{
		subscribers: make(map[string]map[chan []byte]struct{}),
		logger:      logger,
	}
}

// Subscribe registers a listener for a board and returns the channel and a cleanup function.
func (b *Broker) Subscribe(boardID string) (<-chan []byte, func()) {
	ch := make(chan []byte, 10)

	b.mu.Lock()
	if _, ok := b.subscribers[boardID]; !ok {
		b.subscribers[boardID] = make(map[chan []byte]struct{})
	}
	b.subscribers[boardID][ch] = struct{}{}
	b.mu.Unlock()

	cancel := func() {
		b.mu.Lock()
		if subs, ok := b.subscribers[boardID]; ok {
			delete(subs, ch)
			if len(subs) == 0 {
				delete(b.subscribers, boardID)
			}
		}
		b.mu.Unlock()
		close(ch)
	}

	return ch, cancel
}

// Broadcast sends a message to all subscribers of a board.
func (b *Broker) Broadcast(boardID string, message []byte) {
	b.mu.RLock()
	subs := b.subscribers[boardID]
	b.mu.RUnlock()

	for ch := range subs {
		select {
		case ch <- message:
		default:
			if b.logger != nil {
				b.logger.Printf("dropping event for board %s: subscriber too slow", boardID)
			}
		}
	}
}
