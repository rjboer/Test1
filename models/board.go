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

// Connector represents a link between two points on the board.
type Connector struct {
	ID    string  `json:"id"`
	From  Point   `json:"from"`
	To    Point   `json:"to"`
	Color string  `json:"color"`
	Width float64 `json:"width"`
	Label string  `json:"label"`
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

// Cursor represents a participant's pointer on the board.
type Cursor struct {
	ID       string `json:"id"`
	Label    string `json:"label"`
	Color    string `json:"color"`
	Position Point  `json:"position"`
}

// Board is the aggregate of all collaborative items.
type Board struct {
	ID         string       `json:"id"`
	Name       string       `json:"name"`
	Shapes     []Shape      `json:"shapes"`
	Texts      []TextItem   `json:"texts"`
	Notes      []StickyNote `json:"notes"`
	Connectors []Connector  `json:"connectors"`
	UpdatedAt  time.Time    `json:"updatedAt"`
}

// BoardEvent represents a message sent to subscribers about a board.
type BoardEvent struct {
	Type    string      `json:"type"`
	BoardID string      `json:"boardId"`
	Data    interface{} `json:"data"`
}
