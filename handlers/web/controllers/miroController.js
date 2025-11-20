import { instantiateTemplate, templates } from '../templates.js';
import { clamp, uid } from '../utils.js';

export function createMiroController(context, elements) {
        const {
                canvas,
                state,
                renderer,
                editors,
                boardApi,
                setTool,
                setStatus,
                toWorld,
                eventToScreen,
                startSelection,
                startSelectionFromHits,
                updateSelection,
                clearSelection,
                render,
                syncBoard,
        } = context;
        const { toolbar, deleteBtn, templateSelect, templateInsertBtn, templateDescription } = elements;

        let cleanup = [];
        let armedTemplate = null;

        function addListener(target, event, handler, options) {
                target.addEventListener(event, handler, options);
                cleanup.push(() => target.removeEventListener(event, handler, options));
        }

        function activate() {
                if (!toolbar) return;
                toolbar.removeAttribute('hidden');
                setTool('pan', toolbar);
                setupToolbar();
                setupTemplatePicker();
                if (deleteBtn) addListener(deleteBtn, 'click', deleteSelection);
                addPointerHandlers();
        }

        function deactivate() {
                cleanup.forEach((fn) => fn());
                cleanup = [];
                if (toolbar) toolbar.setAttribute('hidden', 'true');
                armedTemplate = null;
                clearSelection();
                render();
                state.drawing = null;
                state.marquee = null;
                state.pan = { active: false, origin: null, startOffset: null, button: null };
        }

        function setupToolbar() {
                addListener(toolbar, 'click', (e) => {
                        const btn = e.target.closest('button[data-tool]');
                        if (!btn) return;
                        setTool(btn.dataset.tool, toolbar);
                });
        }

        function setupTemplatePicker() {
                if (!templateSelect || !templateInsertBtn || !templateDescription) return;
                if (!templateSelect.options.length) {
                        templates.forEach((t) => {
                                const option = document.createElement('option');
                                option.value = t.id;
                                option.textContent = t.name;
                                templateSelect.appendChild(option);
                        });
                        if (templates.length) {
                                templateSelect.value = templates[0].id;
                                updateTemplateDescription(templates[0].id);
                        }
                }

                addListener(templateSelect, 'change', (evt) => updateTemplateDescription(evt.target.value));
                addListener(templateInsertBtn, 'click', () => {
                        const template = templates.find((t) => t.id === templateSelect.value);
                        if (!template) return;
                        armedTemplate = template;
                        setStatus(`Placement armed: ${template.name}. Click the board to drop it.`);
                });
        }

        function addPointerHandlers() {
                addListener(canvas, 'contextmenu', (e) => e.preventDefault());

                addListener(canvas, 'mousedown', (e) => {
                        if (!state.board) return;
                        const world = toWorld(e);
                        const screen = eventToScreen(e);
                        const handle = detectExistingHandle(screen, world);
                        if (armedTemplate && e.button === 0) {
                                placeTemplate(world);
                                return;
                        }
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
                                setStatus('Panning');
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
                                render();
                                return;
                        }

                        if (hit) {
                                const handleHit = renderer.detectHandleHit(hit, screen);
                                startSelection(hit, world, handleHit);
                                render();
                                return;
                        }

                        clearSelection();
                        if (e.button !== 0) return;
                        if (state.tool === 'pen') {
                                state.drawing = startStroke(world);
                                render();
                                return;
                        }
                        state.drawing = { tool: state.tool, start: world, current: world };
                });

                addListener(canvas, 'mousemove', (e) => {
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
                        } else if (state.marquee) {
                                state.marquee.current = world;
                                state.drawing = { tool: 'select', start: state.marquee.start, current: world };
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

                        boardApi.maybeSendCursor(world);
                });

                addListener(canvas, 'mouseup', (e) => {
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

                addListener(canvas, 'mouseleave', () => {
                        if (state.pan.active) {
                                state.pan = { active: false, origin: null, startOffset: null, button: null };
                                setStatus('Ready');
                        }
                        if (state.selection && state.selection.dragging) {
                                state.selection.dragging = false;
                        }
                        state.drawing = null;
                        state.marquee = null;
                });

                addListener(canvas, 'dblclick', (e) => {
                        if (!state.board) return;
                        const world = toWorld(e);
                        const note = renderer.hitTest(world)?.item;
                        if (note?.content !== undefined && note.width !== undefined) {
                                editors.openNoteEditor(note.position, note.content, note, true, () => {
                                        syncBoard();
                                        render();
                                }, canvas);
                                return;
                        }

                        const textHit = renderer.hitTest(world);
                        if (textHit?.type === 'text') {
                                editors.openTextEditor(textHit.item.position, textHit.item.content, textHit.item, true, () => {
                                        syncBoard();
                                        render();
                                }, canvas);
                        }
                });

                addListener(canvas, 'wheel', (e) => {
                        e.preventDefault();
                        const rect = canvas.getBoundingClientRect();
                        const screen = { x: e.clientX - rect.left, y: e.clientY - rect.top };
                        const worldBefore = context.screenToWorld(screen);
                        const nextScale = clamp(state.scale * (e.deltaY > 0 ? 0.9 : 1.1), 0.25, 4);
                        state.scale = nextScale;
                        state.offset = {
                                x: screen.x - worldBefore.x * state.scale,
                                y: screen.y - worldBefore.y * state.scale,
                        };
                        render();
                }, { passive: false });

                addListener(window, 'keydown', (evt) => {
                        if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
                        if ((evt.key === 'Delete' || evt.key === 'Backspace') && state.selection?.items?.length) {
                                evt.preventDefault();
                                deleteSelection();
                        }
                        if (evt.key === 'Escape' && armedTemplate) {
                                armedTemplate = null;
                                setStatus('Template placement cancelled');
                        }
                });
        }

        function finalizeMarqueeSelection(world) {
                if (!state.marquee) return;
                state.marquee.current = world;
                const hits = collectHitsInMarquee();
                state.marquee = null;
                state.drawing = null;
                if (hits.length) {
                        startSelectionFromHits(hits, world);
                } else {
                        clearSelection();
                }
                render();
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
                return (
                        bounds.x <= rect.x2 &&
                        bounds.x + bounds.width >= rect.x1 &&
                        bounds.y <= rect.y2 &&
                        bounds.y + bounds.height >= rect.y1
                );
        }

        function detectExistingHandle(screen, world) {
                if (!state.selection || !state.selection.items?.length) return false;
                const bounds = renderer.getSelectionBounds(state.selection);
                if (!bounds) return false;
                const handles = renderer.handlePositions(bounds);
                const hitHandle = handles.find((h) => Math.abs(h.x - screen.x) <= 10 && Math.abs(h.y - screen.y) <= 10);
                if (hitHandle) {
                        startSelectionFromHits(state.selection.items.map((i) => i.hit), world);
                        state.selection.handle = hitHandle.name;
                        state.selection.mode = 'resize';
                        state.selection.dragging = true;
                        render();
                        return true;
                }
                if (
                        world.x >= bounds.x &&
                        world.x <= bounds.x + bounds.width &&
                        world.y >= bounds.y &&
                        world.y <= bounds.y + bounds.height
                ) {
                        startSelectionFromHits(state.selection.items.map((i) => i.hit), world);
                        state.selection.mode = 'move';
                        state.selection.dragging = true;
                        render();
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
                        editors.openTextEditor(world, '', null, false, () => {
                                render();
                                syncBoard();
                        }, canvas);
                        render();
                        return;
                }
                case 'note': {
                        editors.openNoteEditor(world, '', null, false, () => {
                                render();
                                syncBoard();
                        }, canvas);
                        render();
                        return;
                }
                case 'select':
                        return;
                default:
                        break;
                }
                render();
                syncBoard();
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
                        from: renderer.snapToAnchor(start),
                        to: renderer.snapToAnchor(end),
                        color: state.connectorDefaults?.color || '#fbbf24',
                        width: state.connectorDefaults?.width || 2,
                        label: state.connectorDefaults?.label || 'flow',
                };
        }

        function deleteSelection() {
                if (!state.selection?.items?.length) return;
                const ids = new Set(state.selection.items.map((item) => item.hit.item.id));
                const removedShapeIds = new Set();
                state.board.shapes = state.board.shapes.filter((shape) => {
                        const keep = !ids.has(shape.id);
                        if (!keep) removedShapeIds.add(shape.id);
                        return keep;
                });
                state.board.notes = state.board.notes.filter((note) => !ids.has(note.id));
                state.board.texts = state.board.texts.filter((text) => !ids.has(text.id));
                state.board.connectors = state.board.connectors.filter(
                        (conn) =>
                                !ids.has(conn.id) &&
                                !removedShapeIds.has(conn.from?.shapeId) &&
                                !removedShapeIds.has(conn.to?.shapeId),
                );
                clearSelection();
                render();
                syncBoard();
        }

        function updateTemplateDescription(templateId) {
                const template = templates.find((t) => t.id === templateId);
                if (!template) return;
                templateDescription.textContent = template.description;
        }

        function placeTemplate(world) {
                if (!state.board || !armedTemplate) return;
                const result = instantiateTemplate(armedTemplate, world);
                armedTemplate = null;
                if (!result) {
                        setStatus('Could not create template');
                        return;
                }
                state.board.shapes.push(...result.shapes);
                state.board.notes.push(...result.notes);
                state.board.texts.push(...result.texts);
                state.board.connectors.push(...result.connectors);
                state.board.comments.push(...result.comments);
                render();
                syncBoard();
                setStatus(`${result.name} added`);
        }

        return { activate, deactivate, toolbar };
}
