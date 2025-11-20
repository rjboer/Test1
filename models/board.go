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

// Stroke represents a freehand path drawn with the pen tool.
type Stroke struct {
	ID        string  `json:"id"`
	Points    []Point `json:"points"`
	Color     string  `json:"color"`
	Width     float64 `json:"width"`
	Smoothing float64 `json:"smoothing"`
}

// Anchor represents a point that may be tied to another shape or a free point.
type Anchor struct {
	ShapeID string  `json:"shapeId,omitempty"`
	Side    string  `json:"side,omitempty"`
	Point   *Point  `json:"point,omitempty"`
	X       float64 `json:"x,omitempty"`
	Y       float64 `json:"y,omitempty"`
}

// Connector represents a link between two points on the board.
type Connector struct {
	ID    string  `json:"id"`
	From  Anchor  `json:"from"`
	To    Anchor  `json:"to"`
	Color string  `json:"color"`
	Width float64 `json:"width"`
	Label string  `json:"label"`
}

// CausalNode represents a factor or effect in a causal diagram.
type CausalNode struct {
	ID              string         `json:"id"`
	Kind            string         `json:"kind"`
	Label           string         `json:"label"`
	Position        Point          `json:"position"`
	Color           string         `json:"color"`
	Status          string         `json:"status,omitempty"`
	Confidence      float64        `json:"confidence,omitempty"`
	StatusUpdatedAt time.Time      `json:"statusUpdatedAt,omitempty"`
	Evidence        []NodeEvidence `json:"evidence,omitempty"`
}

// NodeEvidence captures how an upstream node contributes to the current node's state.
type NodeEvidence struct {
	SourceID     string  `json:"sourceId"`
	SourceLabel  string  `json:"sourceLabel,omitempty"`
	Status       string  `json:"status,omitempty"`
	Confidence   float64 `json:"confidence,omitempty"`
	Polarity     string  `json:"polarity,omitempty"`
	Weight       float64 `json:"weight,omitempty"`
	Contribution float64 `json:"contribution,omitempty"`
}

// CausalLink connects two causal nodes with a signed, weighted relationship.
type CausalLink struct {
	ID       string  `json:"id"`
	From     string  `json:"from"`
	To       string  `json:"to"`
	Polarity string  `json:"polarity"`
	Weight   float64 `json:"weight"`
	Label    string  `json:"label"`
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

// Comment represents a pin containing a comment or reaction.
type Comment struct {
	ID       string `json:"id"`
	Position Point  `json:"position"`
	Author   string `json:"author"`
	Content  string `json:"content"`
	Type     string `json:"type"`
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
	ID          string       `json:"id"`
	Name        string       `json:"name"`
	Shapes      []Shape      `json:"shapes"`
	Strokes     []Stroke     `json:"strokes"`
	Texts       []TextItem   `json:"texts"`
	Notes       []StickyNote `json:"notes"`
	Connectors  []Connector  `json:"connectors"`
	CausalNodes []CausalNode `json:"causalNodes"`
	CausalLinks []CausalLink `json:"causalLinks"`
	Comments    []Comment    `json:"comments"`
	UpdatedAt   time.Time    `json:"updatedAt"`
}

// BoardEvent represents a message sent to subscribers about a board.
type BoardEvent struct {
	Type    string      `json:"type"`
	BoardID string      `json:"boardId"`
	Data    interface{} `json:"data"`
}
