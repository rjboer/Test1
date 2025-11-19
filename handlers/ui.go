package handlers

import (
	"embed"
	"html/template"
	"io/fs"
	"net/http"

	"test1/models"
)

var (
	//go:embed web/index.html web/app.js web/styles.css
	webContent embed.FS
	staticFS   fs.FS
	indexTmpl  *template.Template
)

func init() {
	sub, err := fs.Sub(webContent, "web")
	if err != nil {
		panic(err)
	}
	staticFS = sub
	indexTmpl = template.Must(template.ParseFS(webContent, "web/index.html"))
}

func (h *Handler) serveIndex(w http.ResponseWriter, r *http.Request) {
	boards := h.store.ListBoards()
	var board models.Board
	if len(boards) == 0 {
		board = h.store.CreateBoard(models.Board{Name: "Miro-style board"})
		h.broadcastBoardEvent(board.ID, "board.created", board)
	} else {
		board = boards[0]
	}

	data := struct {
		BoardID string
	}{BoardID: board.ID}

	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	if err := indexTmpl.Execute(w, data); err != nil {
		http.Error(w, "failed to render page", http.StatusInternalServerError)
	}
}
