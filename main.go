package main

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"

	"test1/realtime"
	"test1/storage"
)

func main() {
	store, err := storage.NewInMemoryStore("data.json")
	if err != nil {
		log.Fatalf("failed to initialize store: %v", err)
	}

	hub := realtime.NewHub()
	go hub.Run()

	mux := http.NewServeMux()
	mux.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		realtime.ServeWS(hub, w, r)
	})

	mux.HandleFunc("/boards", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			snapshot := store.GetSnapshot()
			writeJSON(w, snapshot.Boards, http.StatusOK)
		case http.MethodPost:
			var body struct {
				Name string `json:"name"`
			}
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Name == "" {
				http.Error(w, "invalid payload", http.StatusBadRequest)
				return
			}
			board, mutation, err := store.CreateBoard(body.Name)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			emitMutation(hub, mutation)
			writeJSON(w, board, http.StatusCreated)
		default:
			w.WriteHeader(http.StatusMethodNotAllowed)
		}
	})

	mux.HandleFunc("/boards/", func(w http.ResponseWriter, r *http.Request) {
		parts := strings.Split(strings.TrimPrefix(r.URL.Path, "/boards/"), "/")
		if len(parts) < 2 || parts[1] != "widgets" {
			http.NotFound(w, r)
			return
		}

		boardID := parts[0]
		switch r.Method {
		case http.MethodPost:
			var body struct {
				Kind    string `json:"kind"`
				Content string `json:"content"`
			}
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Kind == "" {
				http.Error(w, "invalid payload", http.StatusBadRequest)
				return
			}
			widget, mutation, err := store.AddWidget(boardID, body.Kind, body.Content)
			if err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
			emitMutation(hub, mutation)
			writeJSON(w, widget, http.StatusCreated)
		case http.MethodPut:
			if len(parts) != 3 {
				http.NotFound(w, r)
				return
			}
			widgetID := parts[2]
			var body struct {
				Content string `json:"content"`
			}
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				http.Error(w, "invalid payload", http.StatusBadRequest)
				return
			}
			widget, mutation, err := store.UpdateWidget(widgetID, body.Content)
			if err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
			emitMutation(hub, mutation)
			writeJSON(w, widget, http.StatusOK)
		default:
			w.WriteHeader(http.StatusMethodNotAllowed)
		}
	})

	mux.HandleFunc("/sessions", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}

		var body struct {
			User    string `json:"user"`
			BoardID string `json:"boardId"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.User == "" || body.BoardID == "" {
			http.Error(w, "invalid payload", http.StatusBadRequest)
			return
		}

		session, mutation, err := store.UpsertSession(body.User, body.BoardID)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		emitMutation(hub, mutation)
		writeJSON(w, session, http.StatusOK)
	})

	log.Println("server listening on :8080")
	log.Fatal(http.ListenAndServe(":8080", mux))
}

func emitMutation(hub *realtime.Hub, mutation storage.Mutation) {
	payload, err := json.Marshal(mutation)
	if err != nil {
		log.Printf("failed to marshal mutation: %v", err)
		return
	}
	hub.Broadcast(payload)
}

func writeJSON(w http.ResponseWriter, payload interface{}, status int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}
