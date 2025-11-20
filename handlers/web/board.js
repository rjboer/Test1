export function createBoardApi(state, renderer, setStatus, meta) {
        async function loadBoard() {
                try {
                        const res = await fetch(`/boards/${state.boardId}`);
                        if (!res.ok) {
                                throw new Error('Failed to load board');
                        }
                        const board = normalizeBoard(await res.json());
                        state.board = board;
                        renderer.render(meta);
                        renderer.renderMeta(meta);
                        connectEvents();
                } catch (err) {
                        console.error(err);
                        setStatus('Could not load board');
                }
        }

        function normalizeBoard(board) {
                return {
                        ...board,
                        shapes: board.shapes || [],
                        strokes: board.strokes || [],
                        texts: board.texts || [],
                        notes: board.notes || [],
                        connectors: normalizeConnectors(board.connectors || []),
                        comments: board.comments || [],
                };
        }

        function connectEvents() {
                if (state.eventSource) {
                        state.eventSource.close();
                }
                const es = new EventSource(`/boards/${state.boardId}/events`);
                es.onmessage = (evt) => {
                        try {
                                const message = JSON.parse(evt.data);
                                handleEvent(message);
                        } catch (err) {
                                console.error('bad event', err);
                        }
                };
                es.onerror = () => setStatus('Reconnecting events…');
                state.eventSource = es;
        }

        function handleEvent(event) {
                if (!event || event.boardId !== state.boardId) return;
                switch (event.type) {
                case 'board.updated':
                case 'board.created':
                        state.board = normalizeBoard(event.data);
                        renderer.renderMeta(meta);
                        renderer.render();
                        break;
                case 'cursor.moved': {
                        const c = event.data;
                        if (c && c.id !== state.myCursor.id) {
                                state.cursors.set(c.id, { ...c, lastSeen: Date.now() });
                                renderer.render();
                        }
                        break;
                }
                default:
                        break;
                }
        }

        async function syncBoard() {
                if (!state.board) return;
                const normalizedConnectors = normalizeConnectors(state.board.connectors);
                state.board.connectors = normalizedConnectors;
                setStatus('Syncing…');
                try {
                        const payload = { ...state.board, connectors: normalizedConnectors };
                        await fetch(`/boards/${state.boardId}`, {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(payload),
                        });
                        setStatus('Live');
                } catch (err) {
                        console.error(err);
                        setStatus('Sync failed');
                }
        }

        function maybeSendCursor(position) {
                state.myCursor.position = position;
                const now = performance.now();
                if (now - state.lastCursorSent < 120) return;
                state.lastCursorSent = now;
                fetch(`/boards/${state.boardId}/cursor`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(state.myCursor),
                }).catch(() => {});
        }

        return { loadBoard, syncBoard, maybeSendCursor };
}

function normalizeConnector(connector) {
        return {
                ...connector,
                from: connector.from,
                to: connector.to,
        };
}

function normalizeConnectors(connectors) {
        return (connectors || []).map(normalizeConnector);
}
