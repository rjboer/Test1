package storage

import (
	"crypto/rand"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"sync"
	"time"
)

// Board represents a collaborative canvas that holds widgets.
type Board struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	WidgetIDs []string  `json:"widgetIds"`
	UpdatedAt time.Time `json:"updatedAt"`
}

// Widget holds visual elements that live on a board.
type Widget struct {
	ID        string    `json:"id"`
	BoardID   string    `json:"boardId"`
	Kind      string    `json:"kind"`
	Content   string    `json:"content"`
	UpdatedAt time.Time `json:"updatedAt"`
}

// UserSession links a user to a board and tracks their activity.
type UserSession struct {
	ID        string    `json:"id"`
	User      string    `json:"user"`
	BoardID   string    `json:"boardId"`
	UpdatedAt time.Time `json:"updatedAt"`
}

// Mutation describes a change that should be broadcast to clients.
type Mutation struct {
	Type    string       `json:"type"`
	Board   *Board       `json:"board,omitempty"`
	Widget  *Widget      `json:"widget,omitempty"`
	Session *UserSession `json:"session,omitempty"`
}

// PersistentData captures the collections that are stored on disk.
type PersistentData struct {
	Boards   map[string]Board       `json:"boards"`
	Widgets  map[string]Widget      `json:"widgets"`
	Sessions map[string]UserSession `json:"sessions"`
}

// InMemoryStore wraps the collections with concurrency control and optional file persistence.
type InMemoryStore struct {
	mu   sync.RWMutex
	path string
	data PersistentData
}

// NewInMemoryStore creates a store and loads persisted state if available.
func NewInMemoryStore(path string) (*InMemoryStore, error) {
	s := &InMemoryStore{
		path: path,
		data: PersistentData{
			Boards:   make(map[string]Board),
			Widgets:  make(map[string]Widget),
			Sessions: make(map[string]UserSession),
		},
	}

	if path == "" {
		return s, nil
	}

	if _, err := os.Stat(path); errors.Is(err, os.ErrNotExist) {
		return s, nil
	}

	file, err := os.Open(path)
	if err != nil {
		return nil, fmt.Errorf("open storage file: %w", err)
	}
	defer file.Close()

	content, err := io.ReadAll(file)
	if err != nil {
		return nil, fmt.Errorf("read storage file: %w", err)
	}

	if len(content) == 0 {
		return s, nil
	}

	if err := json.Unmarshal(content, &s.data); err != nil {
		return nil, fmt.Errorf("decode storage file: %w", err)
	}

	return s, nil
}

// WithTransaction locks the store for the duration of fn to provide atomic updates.
func (s *InMemoryStore) WithTransaction(fn func(data *PersistentData) error) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if err := fn(&s.data); err != nil {
		return err
	}

	return s.persistLocked()
}

// GetSnapshot returns a copy of the in-memory data for safe reads without external locking.
func (s *InMemoryStore) GetSnapshot() PersistentData {
	s.mu.RLock()
	defer s.mu.RUnlock()

	boards := make(map[string]Board, len(s.data.Boards))
	for k, v := range s.data.Boards {
		boards[k] = v
	}

	widgets := make(map[string]Widget, len(s.data.Widgets))
	for k, v := range s.data.Widgets {
		widgets[k] = v
	}

	sessions := make(map[string]UserSession, len(s.data.Sessions))
	for k, v := range s.data.Sessions {
		sessions[k] = v
	}

	return PersistentData{
		Boards:   boards,
		Widgets:  widgets,
		Sessions: sessions,
	}
}

// CreateBoard adds a new board and returns the mutation describing the change.
func (s *InMemoryStore) CreateBoard(name string) (Board, Mutation, error) {
	now := time.Now().UTC()
	board := Board{
		ID:        newID(),
		Name:      name,
		WidgetIDs: []string{},
		UpdatedAt: now,
	}

	err := s.WithTransaction(func(data *PersistentData) error {
		data.Boards[board.ID] = board
		return nil
	})

	if err != nil {
		return Board{}, Mutation{}, err
	}

	return board, Mutation{Type: "board_created", Board: &board}, nil
}

// AddWidget creates a widget on a board and returns the corresponding mutation.
func (s *InMemoryStore) AddWidget(boardID, kind, content string) (Widget, Mutation, error) {
	now := time.Now().UTC()
	widget := Widget{
		ID:        newID(),
		BoardID:   boardID,
		Kind:      kind,
		Content:   content,
		UpdatedAt: now,
	}

	err := s.WithTransaction(func(data *PersistentData) error {
		board, ok := data.Boards[boardID]
		if !ok {
			return fmt.Errorf("board %s not found", boardID)
		}

		board.WidgetIDs = append(board.WidgetIDs, widget.ID)
		board.UpdatedAt = now
		data.Boards[boardID] = board
		data.Widgets[widget.ID] = widget
		return nil
	})

	if err != nil {
		return Widget{}, Mutation{}, err
	}

	return widget, Mutation{Type: "widget_created", Board: nil, Widget: &widget}, nil
}

// UpdateWidget updates an existing widget and returns the mutation to broadcast.
func (s *InMemoryStore) UpdateWidget(widgetID, newContent string) (Widget, Mutation, error) {
	now := time.Now().UTC()
	var updated Widget

	err := s.WithTransaction(func(data *PersistentData) error {
		widget, ok := data.Widgets[widgetID]
		if !ok {
			return fmt.Errorf("widget %s not found", widgetID)
		}

		widget.Content = newContent
		widget.UpdatedAt = now
		data.Widgets[widgetID] = widget
		updated = widget

		if board, ok := data.Boards[widget.BoardID]; ok {
			board.UpdatedAt = now
			data.Boards[widget.BoardID] = board
		}
		return nil
	})

	if err != nil {
		return Widget{}, Mutation{}, err
	}

	return updated, Mutation{Type: "widget_updated", Widget: &updated}, nil
}

// UpsertSession records a user session for a board and returns the mutation describing the change.
func (s *InMemoryStore) UpsertSession(user, boardID string) (UserSession, Mutation, error) {
	now := time.Now().UTC()
	session := UserSession{
		ID:        newID(),
		User:      user,
		BoardID:   boardID,
		UpdatedAt: now,
	}

	err := s.WithTransaction(func(data *PersistentData) error {
		for id, existing := range data.Sessions {
			if existing.User == user && existing.BoardID == boardID {
				session.ID = id
				break
			}
		}
		data.Sessions[session.ID] = session
		return nil
	})

	if err != nil {
		return UserSession{}, Mutation{}, err
	}

	return session, Mutation{Type: "session_upserted", Session: &session}, nil
}

func (s *InMemoryStore) persistLocked() error {
	if s.path == "" {
		return nil
	}

	encoded, err := json.MarshalIndent(s.data, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal storage: %w", err)
	}

	if err := os.WriteFile(s.path, encoded, 0o644); err != nil {
		return fmt.Errorf("write storage: %w", err)
	}

	return nil
}

func newID() string {
	b := make([]byte, 12)
	if _, err := rand.Read(b); err != nil {
		return fmt.Sprintf("id_%d", time.Now().UnixNano())
	}
	return fmt.Sprintf("%x", b)
}
