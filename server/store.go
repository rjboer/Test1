package server

import (
	"crypto/rand"
	"encoding/hex"
	"sync"
	"time"

	"test1/models"
)

// Store maintains boards in memory and is safe for concurrent use.
type Store struct {
	mu     sync.RWMutex
	boards map[string]models.Board
}

func NewStore() *Store {
	return &Store{boards: make(map[string]models.Board)}
}

// ListBoards returns copies of all boards.
func (s *Store) ListBoards() []models.Board {
	s.mu.RLock()
	defer s.mu.RUnlock()

	boards := make([]models.Board, 0, len(s.boards))
	for _, b := range s.boards {
		boards = append(boards, copyBoard(b))
	}
	return boards
}

// CreateBoard adds a new board with a generated ID.
func (s *Store) CreateBoard(board models.Board) models.Board {
	s.mu.Lock()
	defer s.mu.Unlock()

	board.ID = newID()
	board.UpdatedAt = time.Now().UTC()
	s.boards[board.ID] = copyBoard(board)
	return copyBoard(board)
}

// GetBoard returns a board by ID.
func (s *Store) GetBoard(id string) (models.Board, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	board, ok := s.boards[id]
	if !ok {
		return models.Board{}, false
	}
	return copyBoard(board), true
}

// UpdateBoard replaces the stored board when it exists.
func (s *Store) UpdateBoard(board models.Board) (models.Board, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if _, ok := s.boards[board.ID]; !ok {
		return models.Board{}, false
	}
	board.UpdatedAt = time.Now().UTC()
	s.boards[board.ID] = copyBoard(board)
	return copyBoard(board), true
}

// DeleteBoard removes a board by ID.
func (s *Store) DeleteBoard(id string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()

	if _, ok := s.boards[id]; !ok {
		return false
	}
	delete(s.boards, id)
	return true
}

func copyBoard(src models.Board) models.Board {
	dst := src
	dst.Shapes = append([]models.Shape(nil), src.Shapes...)
	dst.Texts = append([]models.TextItem(nil), src.Texts...)
	dst.Notes = append([]models.StickyNote(nil), src.Notes...)
	dst.Connectors = append([]models.Connector(nil), src.Connectors...)
	dst.Comments = append([]models.Comment(nil), src.Comments...)
	return dst
}

func newID() string {
	b := make([]byte, 12)
	if _, err := rand.Read(b); err != nil {
		return hex.EncodeToString([]byte(time.Now().Format("20060102150405")))
	}
	return hex.EncodeToString(b)
}
