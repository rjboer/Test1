package handlers

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"

	"test1/models"
)

// BoardStore abstracts persistence for boards.
type BoardStore interface {
	ListBoards() []models.Board
	CreateBoard(board models.Board) models.Board
	GetBoard(id string) (models.Board, bool)
	UpdateBoard(board models.Board) (models.Board, bool)
	DeleteBoard(id string) bool
}

// EventBroadcaster represents a pub-sub style event bus.
type EventBroadcaster interface {
	Broadcast(boardID string, message []byte)
	Subscribe(boardID string) (<-chan []byte, func())
}

// Handler encapsulates HTTP handlers for the collaborative board service.
type Handler struct {
	store  BoardStore
	events EventBroadcaster
	logger *log.Logger
}

func New(store BoardStore, events EventBroadcaster, logger *log.Logger) *Handler {
	return &Handler{store: store, events: events, logger: logger}
}

// RegisterRoutes attaches handler functions to the provided ServeMux.
func (h *Handler) RegisterRoutes(mux *http.ServeMux) {
	mux.Handle("/static/", http.StripPrefix("/static/", http.FileServer(http.FS(staticFS))))
	mux.HandleFunc("/", h.serveIndex)
	mux.HandleFunc("/boards", h.handleBoards)
	mux.HandleFunc("/boards/", h.handleBoardByID)
}

func (h *Handler) handleBoards(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		h.listBoards(w, r)
	case http.MethodPost:
		h.createBoard(w, r)
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func (h *Handler) handleBoardByID(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/boards/")
	parts := strings.Split(path, "/")
	if len(parts) == 0 || parts[0] == "" {
		http.NotFound(w, r)
		return
	}
	boardID := parts[0]

	if len(parts) > 1 {
		switch parts[1] {
		case "events":
			if r.Method != http.MethodGet {
				http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
				return
			}
			h.streamBoardEvents(w, r, boardID)
			return
		case "cursor":
			if r.Method != http.MethodPost {
				http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
				return
			}
			h.cursorUpdate(w, r, boardID)
			return
		}
	}

	switch r.Method {
	case http.MethodGet:
		h.getBoard(w, r, boardID)
	case http.MethodPut:
		h.updateBoard(w, r, boardID)
	case http.MethodDelete:
		h.deleteBoard(w, r, boardID)
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func (h *Handler) listBoards(w http.ResponseWriter, r *http.Request) {
	respondJSON(w, http.StatusOK, h.store.ListBoards())
}

func (h *Handler) createBoard(w http.ResponseWriter, r *http.Request) {
	var incoming models.Board
	if err := json.NewDecoder(r.Body).Decode(&incoming); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}
	if incoming.Name == "" {
		incoming.Name = "Untitled Board"
	}

	created := h.store.CreateBoard(incoming)
	h.broadcastBoardEvent(created.ID, "board.created", created)
	respondJSON(w, http.StatusCreated, created)
}

func (h *Handler) getBoard(w http.ResponseWriter, r *http.Request, id string) {
	board, ok := h.store.GetBoard(id)
	if !ok {
		http.NotFound(w, r)
		return
	}
	respondJSON(w, http.StatusOK, board)
}

func (h *Handler) updateBoard(w http.ResponseWriter, r *http.Request, id string) {
	var updated models.Board
	if err := json.NewDecoder(r.Body).Decode(&updated); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}
	updated.ID = id
	board, ok := h.store.UpdateBoard(updated)
	if !ok {
		http.NotFound(w, r)
		return
	}
	h.broadcastBoardEvent(id, "board.updated", board)
	respondJSON(w, http.StatusOK, board)
}

func (h *Handler) deleteBoard(w http.ResponseWriter, r *http.Request, id string) {
	if ok := h.store.DeleteBoard(id); !ok {
		http.NotFound(w, r)
		return
	}
	h.broadcastBoardEvent(id, "board.deleted", map[string]string{"id": id})
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) cursorUpdate(w http.ResponseWriter, r *http.Request, boardID string) {
	if _, ok := h.store.GetBoard(boardID); !ok {
		http.NotFound(w, r)
		return
	}

	var cursor models.Cursor
	if err := json.NewDecoder(r.Body).Decode(&cursor); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	if cursor.ID == "" {
		http.Error(w, "cursor id required", http.StatusBadRequest)
		return
	}

	h.broadcastBoardEvent(boardID, "cursor.moved", cursor)
	w.WriteHeader(http.StatusAccepted)
}

func (h *Handler) streamBoardEvents(w http.ResponseWriter, r *http.Request, boardID string) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming unsupported", http.StatusInternalServerError)
		return
	}

	messages, cancel := h.events.Subscribe(boardID)
	defer cancel()

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")

	// Send a comment to keep the connection alive immediately.
	if _, err := w.Write([]byte(": connected\n\n")); err != nil {
		return
	}
	flusher.Flush()

	for {
		select {
		case <-r.Context().Done():
			return
		case msg, ok := <-messages:
			if !ok {
				return
			}
			if _, err := w.Write([]byte("data: ")); err != nil {
				return
			}
			if _, err := w.Write(msg); err != nil {
				return
			}
			if _, err := w.Write([]byte("\n\n")); err != nil {
				return
			}
			flusher.Flush()
		}
	}
}

func (h *Handler) broadcastBoardEvent(boardID, eventType string, payload interface{}) {
	evt := models.BoardEvent{Type: eventType, BoardID: boardID, Data: payload}
	data, err := json.Marshal(evt)
	if err != nil {
		if h.logger != nil {
			h.logger.Printf("failed to marshal event: %v", err)
		}
		return
	}
	h.events.Broadcast(boardID, data)
}

func respondJSON(w http.ResponseWriter, status int, payload interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}
