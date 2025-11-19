(() => {
        const canvas = document.getElementById('board-canvas');
        const ctx = canvas.getContext('2d');
        const toolbar = document.getElementById('toolbar');
        const status = document.getElementById('status');
        const meta = document.getElementById('board-meta');
        let activeEditor = null;

        const state = {
                boardId: window.initialBoardID,
                board: null,
                tool: 'pan',
                scale: 1,
                offset: { x: 0, y: 0 },
                pan: { active: false, origin: null, startOffset: null, button: null },
                drawing: null,
                selection: null,
                eventSource: null,
                myCursor: {
                        id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(16).slice(2),
                        label: 'You',
                        color: pickColor(),
                        position: { x: 0, y: 0 },
                },
                cursors: new Map(),
                lastCursorSent: 0,
                strokeSettings: { width: 3, smoothing: 0.45 },
        };

        function pickColor() {
                const palette = ['#22d3ee', '#a78bfa', '#34d399', '#f472b6', '#fbbf24'];
                return palette[Math.floor(Math.random() * palette.length)];
        }

        function resizeCanvas() {
                const rect = canvas.getBoundingClientRect();
                canvas.width = rect.width * window.devicePixelRatio;
                canvas.height = rect.height * window.devicePixelRatio;
                ctx.setTransform(1, 0, 0, 1, 0, 0);
                if (state.offset.x === 0 && state.offset.y === 0) {
                        state.offset = { x: rect.width / 2, y: rect.height / 2 };
                }
                render();
        }

        window.addEventListener('resize', resizeCanvas);

        toolbar.addEventListener('click', (e) => {
                const btn = e.target.closest('button[data-tool]');
                if (!btn) return;
                state.tool = btn.dataset.tool;
                document.querySelectorAll('#toolbar button').forEach((el) => el.classList.toggle('active', el === btn));
                setStatus(`Tool: ${state.tool}`);
        });

        canvas.addEventListener('contextmenu', (e) => {
                e.preventDefault();
        });

        canvas.addEventListener('mousedown', (e) => {
                if (!state.board) return;
                const world = toWorld(e);
                const hit = hitTest(world);
                const rightButton = e.button === 2;
                if (rightButton || state.tool === 'pan') {
                        state.pan = {
                                active: true,
                                button: e.button,
                                origin: { x: e.clientX, y: e.clientY },
                                startOffset: { ...state.offset },
                        };
                        setStatus('Panning');
                        return;
                }
                if (e.button === 0) {
                        const pinned = hitComment(world);
                        if (pinned) {
                                openCommentEditor(pinned.position, pinned);
                                return;
                        }
                }
                if (state.tool === 'comment' && e.button === 0) {
                        handleComment(world);
                        return;
                }
                if (hit) {
                        const handle = detectHandleHit(hit, e);
                        startSelection(hit, world, handle);
                        render();
                        return;
                }
                state.selection = null;
                if (e.button !== 0) return;
                if (state.tool === 'pen') {
                        state.drawing = startStroke(world);
                        render();
                        return;
                }
                state.drawing = { tool: state.tool, start: world, current: world };
        });

        canvas.addEventListener('mousemove', (e) => {
                if (!state.board) return;
                const world = toWorld(e);

                if (state.pan.active) {
                        const requiredButton = state.pan.button === 2 ? 2 : 1;
                        if ((e.buttons & requiredButton) === 0) {
                                state.pan = { active: false, origin: null, startOffset: null, button: null };
                                setStatus('Ready');
                                return;
                        }
                        const dx = e.clientX - state.pan.origin.x;
                        const dy = e.clientY - state.pan.origin.y;
                        state.offset = { x: state.pan.startOffset.x + dx, y: state.pan.startOffset.y + dy };
                        render();
                } else if (state.selection && state.selection.dragging) {
                        updateSelection(world);
                        render();
                } else if (state.drawing) {
                        if (state.drawing.tool === 'pen') {
                                recordStrokePoint(state.drawing, world);
                                render();
                        } else {
                                state.drawing.current = world;
                                render();
                        }
                }

                maybeSendCursor(world);
        });

        canvas.addEventListener('mouseup', (e) => {
                if (!state.board) return;
                const world = toWorld(e);
                if (state.pan.active && (state.pan.button === e.button || e.buttons === 0)) {
                        state.pan = { active: false, origin: null, startOffset: null, button: null };
                        setStatus('Ready');
                        return;
                }
                if (state.selection && state.selection.dragging && (e.button === 0 || e.buttons === 0)) {
                        state.selection.dragging = false;
                        if (state.selection.dirty) {
                                syncBoard();
                        }
                        return;
                }
                if (state.drawing) {
                        if (state.drawing.tool === 'pen') {
                                finalizeStroke(state.drawing);
                        } else {
                                completeDrawing(world, state.drawing);
                        }
                        state.drawing = null;
                }
        });

        canvas.addEventListener('mouseleave', () => {
                if (state.pan.active) {
                        state.pan = { active: false, origin: null, startOffset: null, button: null };
                        setStatus('Ready');
                }
                if (state.selection && state.selection.dragging) {
                        state.selection.dragging = false;
                }
                state.drawing = null;
        });

        canvas.addEventListener('dblclick', (e) => {
                if (!state.board) return;
                const world = toWorld(e);
                const note = hitNote(world);
                if (note) {
                        openNoteEditor(note.position, note.content, note, true, () => {
                                syncBoard();
                                render();
                        });
                        return;
                }

                const text = hitText(world);
                if (text) {
                        openTextEditor(text.position, text.content, text, true, () => {
                                syncBoard();
                                render();
                        });
                }
        });

        canvas.addEventListener('wheel', (e) => {
                e.preventDefault();
                const rect = canvas.getBoundingClientRect();
                const screen = { x: e.clientX - rect.left, y: e.clientY - rect.top };
                const worldBefore = screenToWorld(screen);
                const nextScale = clamp(state.scale * (e.deltaY > 0 ? 0.9 : 1.1), 0.25, 4);
                state.scale = nextScale;
                state.offset = {
                        x: screen.x - worldBefore.x * state.scale,
                        y: screen.y - worldBefore.y * state.scale,
                };
                render();
        }, { passive: false });

        async function loadBoard() {
                try {
                        const res = await fetch(`/boards/${state.boardId}`);
                        if (!res.ok) {
                                throw new Error('Failed to load board');
                        }
                        const board = normalizeBoard(await res.json());
                        state.board = board;
                        renderMeta();
                        render();
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
                        connectors: board.connectors || [],
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
                        renderMeta();
                        render();
                        break;
                case 'cursor.moved': {
                        const c = event.data;
                        if (c && c.id !== state.myCursor.id) {
                                state.cursors.set(c.id, { ...c, lastSeen: Date.now() });
                                render();
                        }
                        break;
                }
                default:
                        break;
                }
        }

        function renderMeta() {
                if (!state.board) return;
                const updated = new Date(state.board.updatedAt).toLocaleTimeString();
                meta.innerHTML = `ID: ${state.board.id}<br/>Name: ${state.board.name}<br/>Shapes: ${state.board.shapes.length}<br/>Notes: ${state.board.notes.length}<br/>Texts: ${state.board.texts.length}<br/>Connectors: ${state.board.connectors.length}<br/>Comments: ${state.board.comments.length}<br/>Updated: ${updated}`;
        }

        function render() {
                const rect = canvas.getBoundingClientRect();
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.save();
                ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
                drawGrid(rect.width, rect.height);
                if (!state.board) {
                        ctx.restore();
                        return;
                }

                state.board.connectors.forEach(drawConnector);
                state.board.shapes.forEach(drawShape);
                state.board.strokes.forEach(drawStroke);
                state.board.notes.forEach(drawNote);
                state.board.texts.forEach(drawText);
                state.board.comments.forEach(drawCommentPin);
                drawSelection();
                drawCursors();

                if (state.drawing) {
                        drawPreview(state.drawing);
                }
                ctx.restore();
        }

        function drawGrid(width, height) {
                const spacing = 32 * state.scale;
                ctx.save();
                ctx.strokeStyle = 'rgba(255,255,255,0.05)';
                ctx.lineWidth = 1;
                ctx.beginPath();
                for (let x = state.offset.x % spacing; x < width; x += spacing) {
                        ctx.moveTo(x, 0);
                        ctx.lineTo(x, height);
                }
                for (let y = state.offset.y % spacing; y < height; y += spacing) {
                        ctx.moveTo(0, y);
                        ctx.lineTo(width, y);
                }
                ctx.stroke();
                ctx.restore();
        }

        function drawShape(shape) {
                const [a, b] = shape.points;
                const topLeft = toScreenPoint({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y) });
                const bottomRight = toScreenPoint({ x: Math.max(a.x, b.x), y: Math.max(a.y, b.y) });
                const w = bottomRight.x - topLeft.x;
                const h = bottomRight.y - topLeft.y;

                ctx.save();
                ctx.lineWidth = Math.max(1, shape.strokeWidth * state.scale);
                ctx.strokeStyle = shape.color || '#22d3ee';
                ctx.fillStyle = 'rgba(34, 211, 238, 0.12)';

                if (shape.kind === 'ellipse') {
                        ctx.beginPath();
                        ctx.ellipse(topLeft.x + w / 2, topLeft.y + h / 2, Math.abs(w / 2), Math.abs(h / 2), 0, 0, Math.PI * 2);
                        ctx.fill();
                        ctx.stroke();
                } else {
                        ctx.beginPath();
                        ctx.rect(topLeft.x, topLeft.y, w, h);
                        ctx.fill();
                        ctx.stroke();
                }
                ctx.restore();
        }

        function drawStroke(stroke) {
                if (!stroke.points || stroke.points.length < 2) return;
                const color = stroke.color || '#f472b6';
                const width = Math.max(1, (stroke.width || 3) * state.scale);
                const smoothing = isNaN(stroke.smoothing) ? 0.5 : stroke.smoothing;
                const points = stroke.points.map(toScreenPoint);

                ctx.save();
                ctx.strokeStyle = color;
                ctx.lineWidth = width;
                ctx.lineJoin = 'round';
                ctx.lineCap = 'round';

                ctx.beginPath();
                ctx.moveTo(points[0].x, points[0].y);
                for (let i = 1; i < points.length; i++) {
                        const prev = points[i - 1];
                        const curr = points[i];
                        const mid = blend(prev, curr, smoothing);
                        ctx.quadraticCurveTo(prev.x, prev.y, mid.x, mid.y);
                }
                const last = points[points.length - 1];
                ctx.lineTo(last.x, last.y);
                ctx.stroke();
                ctx.restore();
        }

        function drawConnector(conn) {
                const startWorld = resolveAnchor(conn.from) || conn.from;
                const endWorld = resolveAnchor(conn.to) || conn.to;
                const start = toScreenPoint(startWorld);
                const end = toScreenPoint(endWorld);
                ctx.save();
                ctx.strokeStyle = conn.color || '#fbbf24';
                ctx.lineWidth = Math.max(1, (conn.width || 2) * state.scale);
                ctx.beginPath();
                ctx.moveTo(start.x, start.y);
                ctx.lineTo(end.x, end.y);
                ctx.stroke();
                drawArrowhead(start, end, conn.color || '#fbbf24');
                if (conn.label) {
                        const mid = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
                        ctx.fillStyle = 'rgba(0,0,0,0.7)';
                        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
                        ctx.lineWidth = 8;
                        ctx.strokeRect(mid.x - 4, mid.y - 12, ctx.measureText(conn.label).width + 8, 20);
                        ctx.fillStyle = '#f9fafb';
                        ctx.fillText(conn.label, mid.x, mid.y);
                }
                ctx.restore();
        }

        function drawArrowhead(start, end, color) {
                const angle = Math.atan2(end.y - start.y, end.x - start.x);
                const size = 8 + state.scale * 2;
                ctx.save();
                ctx.translate(end.x, end.y);
                ctx.rotate(angle);
                ctx.fillStyle = color;
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.lineTo(-size, size / 2);
                ctx.lineTo(-size, -size / 2);
                ctx.closePath();
                ctx.fill();
                ctx.restore();
        }

        function drawNote(note) {
                const pos = toScreenPoint(note.position);
                const width = note.width * state.scale;
                const height = note.height * state.scale;
                ctx.save();
                ctx.fillStyle = note.color || '#fcd34d';
                ctx.strokeStyle = '#fbbf24';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.rect(pos.x, pos.y, width, height);
                ctx.fill();
                ctx.stroke();
                ctx.fillStyle = '#111827';
                ctx.font = `${14 * state.scale}px "Inter", sans-serif`;
                wrapText(note.content || 'Note', pos.x + 8 * state.scale, pos.y + 20 * state.scale, width - 16 * state.scale, 16 * state.scale);
                ctx.restore();
        }

        function drawText(item) {
                const pos = toScreenPoint(item.position);
                ctx.save();
                ctx.fillStyle = item.color || '#e5e7eb';
                ctx.font = `${(item.fontSize || 16) * state.scale}px "Inter", sans-serif`;
                ctx.fillText(item.content || 'Text', pos.x, pos.y);
                ctx.restore();
        }

        function drawCommentPin(comment) {
                const pos = toScreenPoint(comment.position);
                const radius = 10;
                const icon = comment.type === 'reaction' ? (comment.content || '👍') : '💬';

                ctx.save();
                ctx.fillStyle = comment.type === 'reaction' ? '#f472b6' : '#60a5fa';
                ctx.strokeStyle = '#0b1224';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();

                ctx.fillStyle = '#0b1224';
                ctx.font = '12px "Inter"';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(icon.substring(0, 2), pos.x, pos.y);

                if (comment.author) {
                        ctx.textAlign = 'left';
                        ctx.fillStyle = '#e5e7eb';
                        ctx.fillText(comment.author, pos.x + radius + 6, pos.y + 4);
                }

                ctx.restore();
        }

        function drawCursors() {
                pruneCursors();
                [...state.cursors.values(), { ...state.myCursor, position: state.myCursor.position }].forEach((cursor) => {
                        const pos = toScreenPoint(cursor.position);
                        ctx.save();
                        ctx.fillStyle = cursor.color;
                        ctx.strokeStyle = '#0b1224';
                        ctx.lineWidth = 2;
                        ctx.beginPath();
                        ctx.arc(pos.x, pos.y, 6, 0, Math.PI * 2);
                        ctx.fill();
                        ctx.stroke();
                        ctx.fillStyle = '#0b1224';
                        ctx.font = '12px "Inter"';
                        ctx.fillText(cursor.label || 'Guest', pos.x + 10, pos.y - 10);
                        ctx.restore();
                });
        }

        function drawPreview(drawing) {
                if (drawing.tool === 'pen') {
                        ctx.save();
                        ctx.globalAlpha = 0.7;
                        drawStroke(drawing);
                        ctx.restore();
                        return;
                }
                const start = toScreenPoint(drawing.start);
                const end = toScreenPoint(drawing.current);
                ctx.save();
                ctx.setLineDash([6, 4]);
                ctx.strokeStyle = '#9ca3af';
                ctx.lineWidth = 1;
                if (drawing.tool === 'rectangle' || drawing.tool === 'ellipse' || drawing.tool === 'connector') {
                        ctx.beginPath();
                        ctx.rect(Math.min(start.x, end.x), Math.min(start.y, end.y), Math.abs(end.x - start.x), Math.abs(end.y - start.y));
                        ctx.stroke();
                }
                ctx.restore();
        }

        function toWorld(evt) {
                const rect = canvas.getBoundingClientRect();
                const x = (evt.clientX - rect.left - state.offset.x) / state.scale;
                const y = (evt.clientY - rect.top - state.offset.y) / state.scale;
                return { x, y };
        }

        function screenToWorld(pt) {
                return {
                        x: (pt.x - state.offset.x) / state.scale,
                        y: (pt.y - state.offset.y) / state.scale,
                };
        }

        function toScreenPoint(point) {
                return {
                        x: point.x * state.scale + state.offset.x,
                        y: point.y * state.scale + state.offset.y,
                };
        }

        function getShapeBounds(shape) {
                const [a, b] = shape.points;
                const left = Math.min(a.x, b.x);
                const right = Math.max(a.x, b.x);
                const top = Math.min(a.y, b.y);
                const bottom = Math.max(a.y, b.y);
                return { left, right, top, bottom };
        }

        function getShapeAnchors(shape) {
                const bounds = getShapeBounds(shape);
                const centerY = (bounds.top + bounds.bottom) / 2;
                const centerX = (bounds.left + bounds.right) / 2;
                return {
                        left: { x: bounds.left, y: centerY },
                        right: { x: bounds.right, y: centerY },
                        bottom: { x: centerX, y: bounds.bottom },
                };
        }

        function distance(a, b) {
                const dx = a.x - b.x;
                const dy = a.y - b.y;
                return Math.sqrt(dx * dx + dy * dy);
        }

        function blend(a, b, t) {
                const amount = clamp(isNaN(t) ? 0.5 : t, 0, 1);
                return { x: a.x + (b.x - a.x) * amount, y: a.y + (b.y - a.y) * amount };
        }

        function snapToAnchor(point) {
                const SNAP_DISTANCE = 32;
                if (!state.board || !state.board.shapes.length) {
                        return { point };
                }

                let closest = null;
                state.board.shapes.forEach((shape) => {
                        const anchors = getShapeAnchors(shape);
                        Object.entries(anchors).forEach(([side, anchorPoint]) => {
                                const dist = distance(point, anchorPoint);
                                if (dist <= SNAP_DISTANCE && (!closest || dist < closest.dist)) {
                                        closest = { dist, anchor: { shapeId: shape.id, side, point: anchorPoint } };
                                }
                        });
                });

                if (closest) return closest.anchor;
                return { point };
        }

        function resolveAnchor(anchor) {
                if (!anchor) return null;
                if (anchor.shapeId) {
                        const shape = state.board?.shapes.find((s) => s.id === anchor.shapeId);
                        if (shape) {
                                const anchors = getShapeAnchors(shape);
                                if (anchor.side && anchors[anchor.side]) {
                                        return anchors[anchor.side];
                                }
                        }
                }
                if (anchor.point) return anchor.point;
                return anchor;
        }

        function startStroke(point) {
                return {
                        tool: 'pen',
                        points: [point],
                        color: state.myCursor.color,
                        width: state.strokeSettings.width,
                        smoothing: state.strokeSettings.smoothing,
                };
        }

        function recordStrokePoint(drawing, point) {
                if (!drawing.points || drawing.points.length === 0) return;
                const last = drawing.points[drawing.points.length - 1];
                const smoothing = clamp(isNaN(drawing.smoothing) ? 0.5 : drawing.smoothing, 0, 1);
                const blended = {
                        x: last.x + (point.x - last.x) * (1 - smoothing),
                        y: last.y + (point.y - last.y) * (1 - smoothing),
                };
                if (distance(blended, last) < 0.5) return;
                drawing.points.push(blended);
        }

        function finalizeStroke(drawing) {
                if (!drawing || drawing.points.length < 2) return;
                state.board.strokes.push({
                        id: uid(),
                        points: drawing.points.slice(),
                        color: drawing.color || state.myCursor.color,
                        width: drawing.width || state.strokeSettings.width,
                        smoothing: drawing.smoothing,
                });
                render();
                syncBoard();
        }

        function completeDrawing(world, drawing) {
                const tool = drawing?.tool || state.tool;
                switch (tool) {
                case 'rectangle':
                        state.board.shapes.push(makeShape('rectangle', drawing.start, world));
                        break;
                case 'ellipse':
                        state.board.shapes.push(makeShape('ellipse', drawing.start, world));
                        break;
                case 'connector':
                        state.board.connectors.push(makeConnector(drawing.start, world));
                        break;
                case 'text': {
                        openTextEditor(world, '', null, false, () => {
                                render();
                                syncBoard();
                        });
                        render();
                        return;
                }
                case 'note': {
                        openNoteEditor(world, '', null, false, () => {
                                render();
                                syncBoard();
                        });
                        render();
                        return;
                }
                }
                render();
                syncBoard();
        }

        function handleComment(world) {
                const target = hitComment(world);
                if (target) {
                        openCommentEditor(target.position, target);
                        return;
                }
                openCommentEditor(world, null);
        }

        function makeShape(kind, start, end) {
                return {
                        id: uid(),
                        kind,
                        points: [start, end],
                        color: kind === 'ellipse' ? '#a78bfa' : '#22d3ee',
                        strokeWidth: 2,
                };
        }

        function makeConnector(start, end) {
                return {
                        id: uid(),
                        from: snapToAnchor(start),
                        to: snapToAnchor(end),
                        color: '#fbbf24',
                        width: 2,
                        label: 'flow',
                };
        }

        function makeText(content, position) {
                return {
                        id: uid(),
                        content,
                        position,
                        color: '#e5e7eb',
                        fontSize: 18,
                };
        }

        function makeNote(content, position) {
                return {
                        id: uid(),
                        content,
                        position,
                        color: '#fcd34d',
                        width: 180,
                        height: 120,
                };
        }

        function makeComment(position, content, type) {
                return {
                        id: uid(),
                        position,
                        author: state.myCursor.label || 'You',
                        content,
                        type: type || 'comment',
                };
        }

        function worldToPage(point) {
                const pt = toScreenPoint(point);
                const rect = canvas.getBoundingClientRect();
                return { x: rect.left + pt.x, y: rect.top + pt.y };
        }

        function hideEditor() {
                if (activeEditor) {
                        activeEditor.remove();
                        activeEditor = null;
                }
        }

        function openOverlay(kind, world, initialValue, options, onSave) {
                hideEditor();
                const opts = options || {};
                const el = document.createElement(kind === 'note' ? 'textarea' : 'input');
                el.value = initialValue || '';
                el.placeholder = opts.placeholder || '';
                el.style.position = 'absolute';
                el.style.padding = '8px 10px';
                el.style.border = '1px solid #9ca3af';
                el.style.borderRadius = '8px';
                el.style.boxShadow = '0 10px 30px rgba(0, 0, 0, 0.25)';
                el.style.background = 'rgba(255, 255, 255, 0.96)';
                el.style.color = '#111827';
                el.style.fontFamily = '"Inter", sans-serif';
                el.style.fontSize = `${(opts.fontSize || 16) * state.scale}px`;
                el.style.zIndex = '30';
                el.style.minWidth = `${(opts.width || 200) * state.scale}px`;
                el.style.outline = 'none';
                el.style.resize = kind === 'note' ? 'both' : 'none';
                if (opts.height) {
                        el.style.height = `${opts.height * state.scale}px`;
                }
                const page = worldToPage(world);
                const offsetY = opts.offsetY ? opts.offsetY * state.scale : 0;
                el.style.left = `${page.x}px`;
                el.style.top = `${page.y - offsetY}px`;

                const finalize = (shouldCommit = true) => {
                        if (!activeEditor || el !== activeEditor) return;
                        hideEditor();
                        if (!shouldCommit) return;
                        const value = el.value;
                        if (!opts.allowEmpty && !value.trim()) return;
                        onSave(value);
                };

                el.addEventListener('keydown', (evt) => {
                        if (evt.key === 'Enter' && !(kind === 'note' && evt.shiftKey)) {
                                evt.preventDefault();
                                finalize(true);
                        } else if (evt.key === 'Escape') {
                                evt.preventDefault();
                                finalize(false);
                        }
                });

                el.addEventListener('blur', () => finalize(true));

                document.body.appendChild(el);
                activeEditor = el;
                el.focus();
                el.select();
        }

        function openCommentEditor(position, existing) {
                hideEditor();
                const wrapper = document.createElement('div');
                wrapper.style.position = 'absolute';
                wrapper.style.padding = '10px';
                wrapper.style.background = 'rgba(255, 255, 255, 0.98)';
                wrapper.style.border = '1px solid #9ca3af';
                wrapper.style.borderRadius = '10px';
                wrapper.style.boxShadow = '0 12px 30px rgba(0, 0, 0, 0.25)';
                wrapper.style.width = '260px';
                wrapper.style.zIndex = '35';

                const title = document.createElement('div');
                title.textContent = existing ? 'Edit pin' : 'New pin';
                title.style.fontWeight = '600';
                title.style.marginBottom = '8px';
                wrapper.appendChild(title);

                const typeLabel = document.createElement('label');
                typeLabel.textContent = 'Type';
                typeLabel.style.display = 'block';
                typeLabel.style.fontSize = '12px';
                typeLabel.style.marginBottom = '4px';
                wrapper.appendChild(typeLabel);

                const select = document.createElement('select');
                ['comment', 'reaction'].forEach((kind) => {
                        const opt = document.createElement('option');
                        opt.value = kind;
                        opt.textContent = kind.charAt(0).toUpperCase() + kind.slice(1);
                        select.appendChild(opt);
                });
                select.value = existing?.type || 'comment';
                select.style.marginBottom = '8px';
                select.style.width = '100%';
                select.style.padding = '6px';
                wrapper.appendChild(select);

                const textarea = document.createElement('textarea');
                textarea.placeholder = 'Add comment or emoji…';
                textarea.value = existing?.content || '';
                textarea.style.width = '100%';
                textarea.style.height = '80px';
                textarea.style.boxSizing = 'border-box';
                textarea.style.padding = '8px';
                textarea.style.marginBottom = '8px';
                textarea.style.fontFamily = '"Inter", sans-serif';
                wrapper.appendChild(textarea);

                const actions = document.createElement('div');
                actions.style.display = 'flex';
                actions.style.justifyContent = 'space-between';
                actions.style.gap = '8px';

                const save = document.createElement('button');
                save.textContent = existing ? 'Save' : 'Add';
                save.style.flex = '1';

                const cancel = document.createElement('button');
                cancel.textContent = 'Cancel';
                cancel.type = 'button';
                cancel.style.flex = '1';

                const remove = document.createElement('button');
                remove.textContent = 'Delete';
                remove.style.flex = '1';
                remove.style.background = '#ef4444';
                remove.style.color = '#fff';
                remove.style.display = existing ? 'block' : 'none';

                actions.appendChild(cancel);
                actions.appendChild(save);
                actions.appendChild(remove);
                wrapper.appendChild(actions);

                const commit = () => {
                        const content = textarea.value.trim();
                        if (!content) {
                                hideEditor();
                                return;
                        }
                        const type = select.value || 'comment';
                        if (existing) {
                                existing.content = content;
                                existing.type = type;
                                existing.author = existing.author || state.myCursor.label || 'You';
                        } else {
                                state.board.comments.push(makeComment(position, content, type));
                        }
                        hideEditor();
                        render();
                        syncBoard();
                };

                const destroy = () => {
                        if (!existing) return;
                        state.board.comments = state.board.comments.filter((c) => c.id !== existing.id);
                        hideEditor();
                        render();
                        syncBoard();
                };

                save.addEventListener('click', (evt) => {
                        evt.stopPropagation();
                        commit();
                });
                cancel.addEventListener('click', (evt) => {
                        evt.stopPropagation();
                        hideEditor();
                });
                remove.addEventListener('click', (evt) => {
                        evt.stopPropagation();
                        destroy();
                });
                textarea.addEventListener('keydown', (evt) => {
                        if ((evt.metaKey || evt.ctrlKey) && evt.key === 'Enter') {
                                commit();
                        } else if (evt.key === 'Escape') {
                                hideEditor();
                        }
                });
                wrapper.addEventListener('mousedown', (evt) => evt.stopPropagation());

                const page = worldToPage(position);
                wrapper.style.left = `${page.x}px`;
                wrapper.style.top = `${page.y}px`;

                document.body.appendChild(wrapper);
                activeEditor = wrapper;
                textarea.focus();
        }

        function openTextEditor(position, initialContent, existing, allowEmpty, onDone) {
                const fontSize = (existing && existing.fontSize) || 18;
                openOverlay('text', position, initialContent, { fontSize, offsetY: fontSize, allowEmpty }, (value) => {
                        if (existing) {
                                existing.content = value;
                        } else {
                                state.board.texts.push(makeText(value, position));
                        }
                        onDone();
                });
        }

        function openNoteEditor(position, initialContent, existing, allowEmpty, onDone) {
                const width = (existing && existing.width) || 180;
                const height = (existing && existing.height) || 120;
                openOverlay('note', position, initialContent, {
                        fontSize: 14,
                        width,
                        height,
                        allowEmpty,
                }, (value) => {
                        if (existing) {
                                existing.content = value;
                        } else {
                                state.board.notes.push(makeNote(value, position));
                        }
                        onDone();
                });
        }

        async function syncBoard() {
                if (!state.board) return;
                setStatus('Syncing…');
                try {
                        await fetch(`/boards/${state.boardId}`, {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(state.board),
                        });
                        setStatus('Live');
                } catch (err) {
                        console.error(err);
                        setStatus('Sync failed');
                }
        }

        function setStatus(msg) {
                status.textContent = msg;
        }

        function clamp(val, min, max) {
                return Math.max(min, Math.min(max, val));
        }

        function uid() {
                return crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(16).slice(2);
        }

        function wrapText(text, x, y, maxWidth, lineHeight) {
                if (!text) return;
                const words = text.split(' ');
                let line = '';
                for (let n = 0; n < words.length; n++) {
                        const testLine = line + words[n] + ' ';
                        const metrics = ctx.measureText(testLine);
                        if (metrics.width > maxWidth && n > 0) {
                                ctx.fillText(line, x, y);
                                line = words[n] + ' ';
                                y += lineHeight;
                        } else {
                                line = testLine;
                        }
                }
                ctx.fillText(line, x, y);
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

        function pruneCursors() {
                const now = Date.now();
                for (const [id, cursor] of state.cursors.entries()) {
                        if (now - (cursor.lastSeen || now) > 5000) {
                                state.cursors.delete(id);
                        }
                }
        }

        function hitTest(world) {
                const text = hitText(world);
                if (text) return { type: 'text', item: text };
                const note = hitNote(world);
                if (note) return { type: 'note', item: note };
                const shape = hitShape(world);
                if (shape) return { type: 'shape', item: shape };
                return null;
        }

        function hitShape(world) {
                for (let i = state.board.shapes.length - 1; i >= 0; i -= 1) {
                        const shape = state.board.shapes[i];
                        const bounds = getBounds({ type: 'shape', item: shape });
                        if (!bounds) continue;
                        if (world.x >= bounds.x && world.x <= bounds.x + bounds.width && world.y >= bounds.y && world.y <= bounds.y + bounds.height) {
                                return shape;
                        }
                }
                return null;
        }

        function hitNote(world) {
                for (let i = state.board.notes.length - 1; i >= 0; i -= 1) {
                        const note = state.board.notes[i];
                        const bounds = getBounds({ type: 'note', item: note });
                        if (world.x >= bounds.x && world.x <= bounds.x + bounds.width && world.y >= bounds.y && world.y <= bounds.y + bounds.height) {
                                return note;
                        }
                }
                return null;
        }

        function hitText(world) {
                for (let i = state.board.texts.length - 1; i >= 0; i -= 1) {
                        const text = state.board.texts[i];
                        const bounds = getBounds({ type: 'text', item: text });
                        if (!bounds) continue;
                        if (world.x >= bounds.x && world.x <= bounds.x + bounds.width && world.y >= bounds.y - bounds.height && world.y <= bounds.y + 4) {
                                return text;
                        }
                }
                return null;
        }

        function getBounds(hit) {
                if (!hit) return null;
                switch (hit.type) {
                case 'shape': {
                        const [a, b] = hit.item.points;
                        return {
                                x: Math.min(a.x, b.x),
                                y: Math.min(a.y, b.y),
                                width: Math.abs(b.x - a.x),
                                height: Math.abs(b.y - a.y),
                        };
                }
                case 'note':
                        return {
                                x: hit.item.position.x,
                                y: hit.item.position.y,
                                width: hit.item.width,
                                height: hit.item.height,
                        };
                case 'text': {
                        const size = hit.item.fontSize || 16;
                        const width = measureTextWidth(hit.item);
                        return {
                                x: hit.item.position.x,
                                y: hit.item.position.y,
                                width,
                                height: size,
                        };
                }
                default:
                        return null;
                }
        }

        function measureTextWidth(text) {
                ctx.save();
                ctx.font = `${(text.fontSize || 16)}px "Inter", sans-serif`;
                const measurement = ctx.measureText(text.content || 'Text');
                ctx.restore();
                return Math.max(16, measurement.width || 0);
        }

        function startSelection(hit, world, handle) {
                state.selection = {
                        type: hit.type,
                        target: hit.item,
                        handle,
                        mode: handle ? 'resize' : 'move',
                        origin: world,
                        initialBounds: getBounds(hit),
                        initialPoints: hit.type === 'shape' ? hit.item.points.map((p) => ({ ...p })) : null,
                        initialPosition: hit.item.position ? { ...hit.item.position } : null,
                        initialSize: hit.type === 'note' ? { width: hit.item.width, height: hit.item.height } : null,
                        dragging: true,
                        dirty: false,
                };
        }

        function updateSelection(world) {
                const sel = state.selection;
                if (!sel || !sel.dragging) return;
                if (sel.mode === 'resize' && isResizable(sel.type)) {
                        applyResize(sel, world);
                } else if (sel.mode === 'move') {
                        applyMove(sel, world);
                }
        }

        function applyMove(sel, world) {
                const dx = world.x - sel.origin.x;
                const dy = world.y - sel.origin.y;
                switch (sel.type) {
                case 'shape':
                        sel.target.points = sel.initialPoints.map((pt) => ({ x: pt.x + dx, y: pt.y + dy }));
                        sel.dirty = true;
                        break;
                case 'note':
                        sel.target.position = { x: sel.initialBounds.x + dx, y: sel.initialBounds.y + dy };
                        sel.dirty = true;
                        break;
                case 'text':
                        if (sel.initialPosition) {
                                sel.target.position = { x: sel.initialPosition.x + dx, y: sel.initialPosition.y + dy };
                                sel.dirty = true;
                        }
                        break;
                default:
                        break;
                }
        }

        function applyResize(sel, world) {
                const bounds = { ...sel.initialBounds };
                const minSize = 16;
                switch (sel.handle) {
                case 'nw': {
                        const right = bounds.x + bounds.width;
                        const bottom = bounds.y + bounds.height;
                        bounds.x = Math.min(world.x, right - minSize);
                        bounds.y = Math.min(world.y, bottom - minSize);
                        bounds.width = right - bounds.x;
                        bounds.height = bottom - bounds.y;
                        break;
                }
                case 'ne': {
                        const left = bounds.x;
                        const bottom = bounds.y + bounds.height;
                        bounds.y = Math.min(world.y, bottom - minSize);
                        bounds.width = Math.max(minSize, world.x - left);
                        bounds.height = bottom - bounds.y;
                        break;
                }
                case 'sw': {
                        const right = bounds.x + bounds.width;
                        bounds.x = Math.min(world.x, right - minSize);
                        bounds.width = right - bounds.x;
                        bounds.height = Math.max(minSize, world.y - bounds.y);
                        break;
                }
                case 'se':
                default:
                        bounds.width = Math.max(minSize, world.x - bounds.x);
                        bounds.height = Math.max(minSize, world.y - bounds.y);
                        break;
                }

                switch (sel.type) {
                case 'shape':
                        sel.target.points = [
                                { x: bounds.x, y: bounds.y },
                                { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
                        ];
                        sel.dirty = true;
                        break;
                case 'note':
                        sel.target.position = { x: bounds.x, y: bounds.y };
                        sel.target.width = bounds.width;
                        sel.target.height = bounds.height;
                        sel.dirty = true;
                        break;
                default:
                        break;
                }
        }

        function detectHandleHit(hit, evt) {
                if (!isResizable(hit.type)) return null;
                const bounds = getBounds(hit);
                if (!bounds) return null;
                const screen = eventToScreen(evt);
                const handles = handlePositions(bounds);
                const handleSize = 10;
                return handles.find((h) => Math.abs(h.x - screen.x) <= handleSize && Math.abs(h.y - screen.y) <= handleSize)?.name || null;
        }

        function eventToScreen(evt) {
                const rect = canvas.getBoundingClientRect();
                return { x: evt.clientX - rect.left, y: evt.clientY - rect.top };
        }

        function handlePositions(bounds) {
                const tl = toScreenPoint({ x: bounds.x, y: bounds.y });
                const tr = toScreenPoint({ x: bounds.x + bounds.width, y: bounds.y });
                const bl = toScreenPoint({ x: bounds.x, y: bounds.y + bounds.height });
                const br = toScreenPoint({ x: bounds.x + bounds.width, y: bounds.y + bounds.height });
                return [
                        { name: 'nw', x: tl.x, y: tl.y },
                        { name: 'ne', x: tr.x, y: tr.y },
                        { name: 'sw', x: bl.x, y: bl.y },
                        { name: 'se', x: br.x, y: br.y },
                ];
        }

        function isResizable(type) {
                return type === 'shape' || type === 'note';
        }

        function drawSelection() {
                const sel = state.selection;
                if (!sel || !sel.target) return;
                const bounds = getBounds(sel);
                if (!bounds) return;
                const screen = toScreenPoint({ x: bounds.x, y: bounds.y });
                const w = bounds.width * state.scale;
                const h = bounds.height * state.scale;
                ctx.save();
                ctx.strokeStyle = '#60a5fa';
                ctx.setLineDash([4, 2]);
                ctx.strokeRect(screen.x, screen.y, w, h);
                if (isResizable(sel.type)) {
                        ctx.fillStyle = '#60a5fa';
                        handlePositions(bounds).forEach((handle) => {
                                ctx.fillRect(handle.x - 5, handle.y - 5, 10, 10);
                        });
                }
                ctx.restore();
        }

        function hitComment(world) {
                const screenPoint = toScreenPoint(world);
                const radius = 14;
                return state.board.comments.find((comment) => {
                        const pin = toScreenPoint(comment.position);
                        return distance(screenPoint, pin) <= radius;
                });
        }

        resizeCanvas();
        loadBoard();
})();
