package status

import (
	"testing"

	"test1/models"
)

func TestPropagateDerivesDownstreamStatus(t *testing.T) {
	board := models.Board{
		CausalNodes: []models.CausalNode{
			{ID: "a", Label: "Input", Status: "positive", Confidence: 0.9},
			{ID: "b", Label: "Output"},
		},
		CausalLinks: []models.CausalLink{
			{ID: "l1", From: "a", To: "b", Polarity: "positive", Weight: 1},
		},
	}

	result := Propagate(board)

	if len(result.CausalNodes) != 2 {
		t.Fatalf("expected two nodes, got %d", len(result.CausalNodes))
	}
	downstream := findNode(result.CausalNodes, "b")
	if downstream.Status != "positive" {
		t.Fatalf("expected downstream status to be positive, got %s", downstream.Status)
	}
	if downstream.Confidence == 0 {
		t.Fatalf("expected confidence to be set")
	}
	if downstream.StatusUpdatedAt.IsZero() {
		t.Fatalf("expected status timestamp to be set")
	}
	if len(downstream.Evidence) != 1 || downstream.Evidence[0].SourceID != "a" {
		t.Fatalf("expected evidence to include upstream node")
	}
}

func TestPropagateHandlesNegativePolarity(t *testing.T) {
	board := models.Board{
		CausalNodes: []models.CausalNode{{ID: "a", Status: "positive"}, {ID: "b"}},
		CausalLinks: []models.CausalLink{{ID: "l1", From: "a", To: "b", Polarity: "negative", Weight: 2}},
	}

	result := Propagate(board)
	downstream := findNode(result.CausalNodes, "b")
	if downstream.Status != "negative" {
		t.Fatalf("expected negative downstream status, got %s", downstream.Status)
	}
}

func findNode(nodes []models.CausalNode, id string) models.CausalNode {
	for _, n := range nodes {
		if n.ID == id {
			return n
		}
	}
	return models.CausalNode{}
}
