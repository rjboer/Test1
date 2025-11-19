package main

import (
	"log"
	"os"

	"test1/server"
)

func main() {
	addr := ":8080"
	if envAddr := os.Getenv("PORT"); envAddr != "" {
		addr = ":" + envAddr
	}

	logger := log.New(os.Stdout, "boards ", log.LstdFlags)
	srv := server.NewServer(addr, logger)

	if err := srv.Start(); err != nil {
		logger.Fatalf("server exited: %v", err)
	}
}
