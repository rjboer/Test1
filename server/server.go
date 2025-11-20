package server

import (
	"log"
	"net/http"
	"time"

	"test1/handlers"
)

// Server wires together HTTP handlers, storage, and event broadcasting.
type Server struct {
	addr    string
	store   *Store
	broker  *Broker
	handler *handlers.Handler
	logger  *log.Logger
}

// NewServer constructs a server with default dependencies.
func NewServer(addr string, logger *log.Logger) *Server {
	store := NewStore()
	broker := NewBroker(logger)
	handler := handlers.New(store, broker, logger)

	return &Server{
		addr:    addr,
		store:   store,
		broker:  broker,
		handler: handler,
		logger:  logger,
	}
}

// Start launches the HTTP server.
func (s *Server) Start() error {
	mux := http.NewServeMux()
	s.handler.RegisterRoutes(mux)

	srv := &http.Server{
		Addr:         s.addr,
		Handler:      mux,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 0,
		IdleTimeout:  60 * time.Second,
	}

	if s.logger != nil {
		s.logger.Printf("listening on %s", s.addr)
	}
	return srv.ListenAndServe()
}
