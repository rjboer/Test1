package models

import "time"

// Point represents a coordinate on a board.
type Point struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}

// Shape represents a drawable object (line, rectangle, etc.).
type Shape struct {
	ID          string  `json:"id"`
	Kind        string  `json:"kind"`
	Points      []Point `json:"points"`
	Color       string  `json:"color"`
	StrokeWidth float64 `json:"strokeWidth"`
}

// TextItem represents a text element on the board.
type TextItem struct {
	ID       string `json:"id"`
	Content  string `json:"content"`
	Position Point  `json:"position"`
	Color    string `json:"color"`
	FontSize int    `json:"fontSize"`
}

// StickyNote represents a movable note on the board.
type StickyNote struct {
	ID       string  `json:"id"`
	Content  string  `json:"content"`
	Position Point   `json:"position"`
	Color    string  `json:"color"`
	Width    float64 `json:"width"`
	Height   float64 `json:"height"`
}

// Board is the aggregate of all collaborative items.
type Board struct {
	ID        string       `json:"id"`
	Name      string       `json:"name"`
	Shapes    []Shape      `json:"shapes"`
	Texts     []TextItem   `json:"texts"`
	Notes     []StickyNote `json:"notes"`
	UpdatedAt time.Time    `json:"updatedAt"`
}

// BoardEvent represents a message sent to subscribers about a board.
type BoardEvent struct {
	Type    string      `json:"type"`
	BoardID string      `json:"boardId"`
	Data    interface{} `json:"data"`
}
