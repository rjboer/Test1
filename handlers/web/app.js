import { createInitialState, setStatus, setTool } from './state.js';
import { createRenderer } from './rendering.js';
import { createBoardApi } from './board.js';
import { createEditors } from './editors.js';
import { startSelection, startSelectionFromHits, updateSelection, clearSelection } from './selection.js';
import { toWorld, screenToWorld, eventToScreen } from './geometry.js';
import { clamp, uid } from './utils.js';

(() => {
        const canvas = document.getElementById('board-canvas');
        const ctx = canvas.getContext('2d');
        const toolbar = document.getElementById('toolbar');
        const status = document.getElementById('status');
        const meta = document.getElementById('board-meta');
        const deleteBtn = document.getElementById('delete-selection');
        const state = createInitialState(window.initialBoardID);

        const renderer = createRenderer(ctx, canvas, state);
        const boardApi = createBoardApi(state, renderer, (msg) => setStatus(status, msg), meta);
        const editors = createEditors(state, renderer, () => boardApi.syncBoard());

        function resizeCanvas() {
                const rect = canvas.getBoundingClientRect();
                canvas.width = rect.width * window.devicePixelRatio;
                canvas.height = rect.height * window.devicePixelRatio;
                ctx.setTransform(1, 0, 0, 1, 0, 0);
                if (state.offset.x === 0 && state.offset.y === 0) {
                        state.offset = { x: rect.width / 2, y: rect.height / 2 };
                }
                renderer.render(meta);
        }

        window.addEventListener('resize', resizeCanvas);

        toolbar.addEventListener('click', (e) => {
                const btn = e.target.closest('button[data-tool]');
                if (!btn) return;
                setTool(state, btn.dataset.tool, toolbar);
                setStatus(status, `Tool: ${state.tool}`);
        });

        deleteBtn.addEventListener('click', () => deleteSelection());

        canvas.addEventListener('contextmenu', (e) => e.preventDefault());

        canvas.addEventListener('mousedown', (e) => {
                if (!state.board) return;
                const world = toWorld(e, canvas, state);
                const screen = eventToScreen(e, canvas);
                const handle = detectExistingHandle(screen, world);
                if (handle) return;

                const hit = renderer.hitTest(world);
                const rightButton = e.button === 2;
                if (rightButton || state.tool === 'pan') {
                        state.pan = {
                                active: true,
                                button: e.button,
                                origin: { x: e.clientX, y: e.clientY },
                                startOffset: { ...state.offset },
                        };
                        setStatus(status, 'Panning');
                        return;
                }

                if (e.button === 0) {
                        const pinned = renderer.hitComment(world);
                        if (pinned) {
                                editors.openCommentEditor(pinned.position, pinned, canvas);
                                return;
                        }
                }

                if (state.tool === 'comment' && e.button === 0) {
                        handleComment(world);
                        return;
                }

                if (state.tool === 'select' && e.button === 0 && !hit) {
                        state.marquee = { start: world, current: world };
                        state.drawing = { tool: 'select', start: world, current: world };
                        renderer.render();
                        return;
                }

                if (hit) {
                        const handleHit = renderer.detectHandleHit(hit, screen);
                        startSelection(state, hit, world, handleHit, renderer);
                        renderer.render();
                        return;
                }

                clearSelection(state);
                if (e.button !== 0) return;
                if (state.tool === 'pen') {
                        state.drawing = startStroke(world);
                        renderer.render();
                        return;
                }
                state.drawing = { tool: state.tool, start: world, current: world };
        });

        canvas.addEventListener('mousemove', (e) => {
                if (!state.board) return;
                const world = toWorld(e, canvas, state);

                if (state.pan.active) {
                        const requiredButton = state.pan.button === 2 ? 2 : 1;
                        if ((e.buttons & requiredButton) === 0) {
                                state.pan = { active: false, origin: null, startOffset: null, button: null };
                                setStatus(status, 'Ready');
                                return;
                        }
                        const dx = e.clientX - state.pan.origin.x;
                        const dy = e.clientY - state.pan.origin.y;
                        state.offset = { x: state.pan.startOffset.x + dx, y: state.pan.startOffset.y + dy };
                        renderer.render();
                } else if (state.selection && state.selection.dragging) {
                        updateSelection(state, world, renderer);
                        renderer.render();
                } else if (state.marquee) {
                        state.marquee.current = world;
                        state.drawing = { tool: 'select', start: state.marquee.start, current: world };
                        renderer.render();
                } else if (state.drawing) {
                        if (state.drawing.tool === 'pen') {
                                recordStrokePoint(state.drawing, world);
                                renderer.render();
                        } else {
                                state.drawing.current = world;
                                renderer.render();
                        }
                }

                boardApi.maybeSendCursor(world);
        });

        canvas.addEventListener('mouseup', (e) => {
                if (!state.board) return;
                const world = toWorld(e, canvas, state);
                if (state.pan.active && (state.pan.button === e.button || e.buttons === 0)) {
                        state.pan = { active: false, origin: null, startOffset: null, button: null };
                        setStatus(status, 'Ready');
                        return;
                }
                if (state.selection && state.selection.dragging && (e.button === 0 || e.buttons === 0)) {
                        state.selection.dragging = false;
                        if (state.selection.dirty) {
                                boardApi.syncBoard();
                        }
                        return;
                }
                if (state.marquee && state.drawing?.tool === 'select') {
                        finalizeMarqueeSelection(world);
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
                        setStatus(status, 'Ready');
                }
                if (state.selection && state.selection.dragging) {
                        state.selection.dragging = false;
                }
                state.drawing = null;
                state.marquee = null;
        });

        canvas.addEventListener('dblclick', (e) => {
                if (!state.board) return;
                const world = toWorld(e, canvas, state);
                const note = renderer.hitTest(world)?.item;
                if (note?.content !== undefined && note.width !== undefined) {
                        editors.openNoteEditor(note.position, note.content, note, true, () => {
                                boardApi.syncBoard();
                                renderer.render();
                        }, canvas);
                        return;
                }

                const textHit = renderer.hitTest(world);
                if (textHit?.type === 'text') {
                        editors.openTextEditor(textHit.item.position, textHit.item.content, textHit.item, true, () => {
                                boardApi.syncBoard();
                                renderer.render();
                        }, canvas);
                }
        });

        canvas.addEventListener('wheel', (e) => {
                e.preventDefault();
                const rect = canvas.getBoundingClientRect();
                const screen = { x: e.clientX - rect.left, y: e.clientY - rect.top };
                const worldBefore = screenToWorld(screen, state);
                const nextScale = clamp(state.scale * (e.deltaY > 0 ? 0.9 : 1.1), 0.25, 4);
                state.scale = nextScale;
                state.offset = {
                        x: screen.x - worldBefore.x * state.scale,
                        y: screen.y - worldBefore.y * state.scale,
                };
                renderer.render();
        }, { passive: false });

        window.addEventListener('keydown', (evt) => {
                if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
                if ((evt.key === 'Delete' || evt.key === 'Backspace') && state.selection?.items?.length) {
                        evt.preventDefault();
                        deleteSelection();
                }
        });

        async function finalizeMarqueeSelection(world) {
                if (!state.marquee) return;
                state.marquee.current = world;
                const hits = collectHitsInMarquee();
                state.marquee = null;
                state.drawing = null;
                if (hits.length) {
                        startSelectionFromHits(state, hits, world, renderer);
                } else {
                        clearSelection(state);
                }
                renderer.render();
        }

        function collectHitsInMarquee() {
                const start = state.marquee.start;
                const end = state.marquee.current;
                const rect = {
                        x1: Math.min(start.x, end.x),
                        y1: Math.min(start.y, end.y),
                        x2: Math.max(start.x, end.x),
                        y2: Math.max(start.y, end.y),
                };
                const hits = [];
                state.board.shapes.forEach((shape) => {
                        const bounds = renderer.getBounds({ type: 'shape', item: shape });
                        if (bounds && intersects(bounds, rect)) hits.push({ type: 'shape', item: shape });
                });
                state.board.notes.forEach((note) => {
                        const bounds = renderer.getBounds({ type: 'note', item: note });
                        if (bounds && intersects(bounds, rect)) hits.push({ type: 'note', item: note });
                });
                state.board.texts.forEach((text) => {
                        const bounds = renderer.getBounds({ type: 'text', item: text });
                        if (bounds && intersects(bounds, rect)) hits.push({ type: 'text', item: text });
                });
                return hits;
        }

        function intersects(bounds, rect) {
                return bounds.x <= rect.x2 && bounds.x + bounds.width >= rect.x1 && bounds.y <= rect.y2 && bounds.y + bounds.height >= rect.y1;
        }

        function detectExistingHandle(screen, world) {
                if (!state.selection || !state.selection.items?.length) return false;
                const bounds = renderer.getSelectionBounds(state.selection);
                if (!bounds) return false;
                const handles = renderer.handlePositions(bounds);
                const hitHandle = handles.find((h) => Math.abs(h.x - screen.x) <= 10 && Math.abs(h.y - screen.y) <= 10);
                if (hitHandle) {
                        startSelectionFromHits(state, state.selection.items.map((i) => i.hit), world, renderer);
                        state.selection.handle = hitHandle.name;
                        state.selection.mode = 'resize';
                        state.selection.dragging = true;
                        renderer.render();
                        return true;
                }
                if (world.x >= bounds.x && world.x <= bounds.x + bounds.width && world.y >= bounds.y && world.y <= bounds.y + bounds.height) {
                        startSelectionFromHits(state, state.selection.items.map((i) => i.hit), world, renderer);
                        state.selection.mode = 'move';
                        state.selection.dragging = true;
                        renderer.render();
                        return true;
                }
                return false;
        }

        function handleComment(world) {
                const target = renderer.hitComment(world);
                if (target) {
                        editors.openCommentEditor(target.position, target, canvas);
                        return;
                }
                editors.openCommentEditor(world, null, canvas);
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
                renderer.render();
                boardApi.syncBoard();
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
                        editors.openTextEditor(world, '', null, false, () => {
                                renderer.render();
                                boardApi.syncBoard();
                        }, canvas);
                        renderer.render();
                        return;
                }
                case 'note': {
                        editors.openNoteEditor(world, '', null, false, () => {
                                renderer.render();
                                boardApi.syncBoard();
                        }, canvas);
                        renderer.render();
                        return;
                }
                case 'select':
                        return;
                }
                renderer.render();
                boardApi.syncBoard();
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
                const connector = {
                        id: uid(),
                        from: renderer.snapToAnchor(start),
                        to: renderer.snapToAnchor(end),
                        color: '#fbbf24',
                        width: 2,
                        label: 'flow',
                };
                return connector;
        }

        function deleteSelection() {
                if (!state.selection?.items?.length) return;
                const ids = new Set(state.selection.items.map((item) => item.hit.item.id));
                state.board.shapes = state.board.shapes.filter((shape) => !ids.has(shape.id));
                state.board.notes = state.board.notes.filter((note) => !ids.has(note.id));
                state.board.texts = state.board.texts.filter((text) => !ids.has(text.id));
                clearSelection(state);
                renderer.render();
                boardApi.syncBoard();
        }

        resizeCanvas();
        boardApi.loadBoard();
})();
