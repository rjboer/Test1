package status

import (
	"math"
	"strings"
	"time"

	"test1/models"
)

// Propagate recalculates downstream causal node statuses based on incoming links and upstream states.
func Propagate(board models.Board) models.Board {
	nodes := make(map[string]*models.CausalNode, len(board.CausalNodes))
	for i := range board.CausalNodes {
		nodes[board.CausalNodes[i].ID] = &board.CausalNodes[i]
	}

	incoming := make(map[string][]models.CausalLink)
	for _, link := range board.CausalLinks {
		incoming[link.To] = append(incoming[link.To], link)
	}

	now := time.Now().UTC()
	for i := range board.CausalNodes {
		node := &board.CausalNodes[i]
		evidence := gatherEvidence(incoming[node.ID], nodes)
		if len(evidence) == 0 {
			continue
		}

		scoreSum := 0.0
		weightSum := 0.0
		for _, ev := range evidence {
			scoreSum += ev.Contribution
			weightSum += math.Abs(ev.Weight)
		}
		if weightSum == 0 {
			continue
		}

		avg := scoreSum / weightSum
		status := deriveStatus(avg)
		conf := clamp(math.Abs(avg), 0, 1)
		if status != "" && (status != node.Status || almostDiff(conf, node.Confidence)) {
			node.Status = status
			node.Confidence = conf
			node.StatusUpdatedAt = now
		}
		node.Evidence = evidence
	}

	return board
}

func gatherEvidence(links []models.CausalLink, nodes map[string]*models.CausalNode) []models.NodeEvidence {
	evidence := make([]models.NodeEvidence, 0, len(links))
	for _, link := range links {
		src := nodes[link.From]
		if src == nil {
			continue
		}
		contribution := statusValue(src.Status) * linkWeight(link)
		evidence = append(evidence, models.NodeEvidence{
			SourceID:     src.ID,
			SourceLabel:  src.Label,
			Status:       src.Status,
			Confidence:   src.Confidence,
			Polarity:     link.Polarity,
			Weight:       link.Weight,
			Contribution: contribution,
		})
	}
	return evidence
}

func deriveStatus(score float64) string {
	switch {
	case score > 0.2:
		return "positive"
	case score < -0.2:
		return "negative"
	case math.Abs(score) <= 0.2:
		return "neutral"
	default:
		return "unknown"
	}
}

func statusValue(status string) float64 {
	switch strings.ToLower(status) {
	case "positive", "up", "good", "ok":
		return 1
	case "negative", "down", "bad":
		return -1
	case "neutral":
		return 0
	default:
		return 0
	}
}

func linkWeight(link models.CausalLink) float64 {
	weight := link.Weight
	if weight == 0 {
		weight = 1
	}
	if strings.ToLower(link.Polarity) == "negative" {
		weight = -weight
	}
	return weight
}

func clamp(v, min, max float64) float64 {
	if v < min {
		return min
	}
	if v > max {
		return max
	}
	return v
}

func almostDiff(a, b float64) bool {
	const epsilon = 0.0001
	return math.Abs(a-b) > epsilon
}
