package main

import (
	"log"

	"test1/server"
)

func main() {
	logger := log.Default()
	srv := server.NewServer(":8080", logger)

	logger.Printf("starting server on %s", ":8080")
	if err := srv.Start(); err != nil {
		logger.Fatalf("server stopped: %v", err)
	}
}
