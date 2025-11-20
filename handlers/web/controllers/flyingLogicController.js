import { clamp, uid } from '../utils.js';
import { refreshGroupingMetadata, recomputeStatusViews } from '../state.js';
import { computeCausalLayout } from '../layout.js';
import { domainPalette } from '../domainPalette.js';

export function createFlyingLogicController(context, elements) {
        const {
                canvas,
                state,
                renderer,
                editors,
                boardApi,
                setTool,
                setStatus,
                toWorld,
                screenToWorld,
                eventToScreen,
                startSelection,
                startSelectionFromHits,
                updateSelection,
                clearSelection,
                render,
                syncBoard,
        } = context;

        const { toolbar, deleteBtn, autoLayoutBtn, applyGroupBtn, groupInput, groupSuggestions, paletteEl } = elements;

        let cleanup = [];

        function addListener(target, event, handler, options) {
                target.addEventListener(event, handler, options);
                cleanup.push(() => target.removeEventListener(event, handler, options));
        }

        function activate() {
                if (!toolbar) return;
                toolbar.removeAttribute('hidden');
                setTool('pan', toolbar);
                setupToolbar();
                if (deleteBtn) addListener(deleteBtn, 'click', deleteSelection);
                if (autoLayoutBtn) addListener(autoLayoutBtn, 'click', applyAutoLayout);
                if (applyGroupBtn) addListener(applyGroupBtn, 'click', () => assignGroupTag(groupInput?.value || ''));
                if (groupInput) {
                        addListener(groupInput, 'keydown', (evt) => {
                                if (evt.key === 'Enter') assignGroupTag(groupInput?.value || '');
                        });
                }
                renderPalette();
                addPointerHandlers();
        }

        function deactivate() {
                cleanup.forEach((fn) => fn());
                cleanup = [];
                if (toolbar) toolbar.setAttribute('hidden', 'true');
                clearSelection();
                render();
                state.drawing = null;
                state.marquee = null;
                state.pan = { active: false, origin: null, startOffset: null, button: null };
        }

        function renderPalette() {
                if (!paletteEl) return;
                paletteEl.innerHTML = '';
                domainPalette.forEach((category) => {
                        const section = document.createElement('div');
                        section.className = 'palette-category';

                        const header = document.createElement('div');
                        header.className = 'palette-header';

                        const color = document.createElement('div');
                        color.className = 'palette-color';
                        color.style.background = category.color;

                        const title = document.createElement('div');
                        title.className = 'palette-title';
                        const name = document.createElement('span');
                        name.textContent = `${category.icon} ${category.label}`;
                        const hint = document.createElement('span');
                        hint.textContent = 'Click a block to drop it on the canvas';
                        title.appendChild(name);
                        title.appendChild(hint);

                        header.appendChild(color);
                        header.appendChild(title);

                        const items = document.createElement('div');
                        items.className = 'palette-items';

                        category.blocks.forEach((block) => {
                                const btn = document.createElement('button');
                                btn.type = 'button';
                                btn.className = 'palette-item';

                                const icon = document.createElement('div');
                                icon.className = 'palette-icon';
                                icon.style.background = category.color;
                                icon.textContent = category.icon;

                                const text = document.createElement('div');
                                text.className = 'palette-text';
                                const label = document.createElement('span');
                                label.className = 'label';
                                label.textContent = block.label;
                                const desc = document.createElement('span');
                                desc.className = 'description';
                                desc.textContent = block.description;

                                text.appendChild(label);
                                text.appendChild(desc);

                                btn.appendChild(icon);
                                btn.appendChild(text);
                                addListener(btn, 'click', () => createDomainBlock(block, category));
                                items.appendChild(btn);
                        });

                        section.appendChild(header);
                        section.appendChild(items);
                        paletteEl.appendChild(section);
                });
        }

        function createDomainBlock(block, category) {
                if (!state.board) return;
                const position = getCenteredWorldPoint();
                const label = `${category.icon} ${block.label}`;
                const node = {
                        id: uid(),
                        position,
                        label,
                        kind: block.id,
                        color: block.color || category.color,
                        status: 'unknown',
                        confidence: 0,
                };
                state.board.causalNodes.push(node);
                recomputeStatusViews(state);
                render();
                syncBoard();
                setStatus(`${block.label} added to ${category.label}`);
        }

        function getCenteredWorldPoint() {
                const rect = canvas.getBoundingClientRect();
                const jitter = () => (Math.random() - 0.5) * 80;
                const screenPoint = { x: rect.width / 2 + jitter(), y: rect.height / 2 + jitter() };
                return screenToWorld(screenPoint);
        }

        function setupToolbar() {
                addListener(toolbar, 'click', (e) => {
                        const btn = e.target.closest('button[data-tool]');
                        if (!btn) return;
                        setTool(btn.dataset.tool, toolbar);
                });
        }

        function addPointerHandlers() {
                addListener(canvas, 'contextmenu', (e) => e.preventDefault());

                addListener(canvas, 'mousedown', (e) => {
                        if (!state.board) return;
                        const world = toWorld(e);
                        const screen = eventToScreen(e);
                        const handle = detectExistingHandle(screen, world);
                        if (handle) return;

                        const causalNode = renderer.hitCausalNode(world);
                        const hit = causalNode ? { type: 'causal-node', item: causalNode } : null;
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

                        if (state.tool === 'comment' && e.button === 0) {
                                handleComment(world);
                                return;
                        }

                        if (state.tool === 'causal-node' && e.button === 0) {
                                const node = makeCausalNode(world);
                                state.board.causalNodes.push(node);
                                render();
                                editors.openCausalNodeEditor(node, canvas);
                                syncBoard();
                                return;
                        }

                        if (state.tool === 'causal-link' && e.button === 0) {
                                if (causalNode) {
                                        state.drawing = {
                                                tool: 'causal-link',
                                                start: causalNode.position,
                                                current: world,
                                                startNodeId: causalNode.id,
                                        };
                                }
                                return;
                        }

                        if (state.tool === 'select' && e.button === 0 && !hit) {
                                const linkHit = renderer.hitCausalLink(world);
                                if (linkHit?.link) {
                                        editors.openCausalLinkEditor(linkHit.link, linkHit.midpoint, canvas);
                                        return;
                                }
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
                                state.drawing.current = world;
                                render();
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
                                completeDrawing(world, state.drawing);
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
                        const causalNode = renderer.hitCausalNode(world);
                        const linkHit = renderer.hitCausalLink(world);
                        if (causalNode) {
                                editors.openCausalNodeEditor(causalNode, canvas);
                                return;
                        }
                        if (linkHit?.link) {
                                editors.openCausalLinkEditor(linkHit.link, linkHit.midpoint, canvas);
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
                state.board.causalNodes.forEach((node) => {
                        const bounds = renderer.getBounds({ type: 'causal-node', item: node });
                        if (bounds && intersects(bounds, rect)) hits.push({ type: 'causal-node', item: node });
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

        function makeCausalNode(position) {
                return {
                        id: uid(),
                        position,
                        label: 'Variable',
                        kind: 'variable',
                        color: editors.colorForKind('variable'),
                };
        }

        function completeDrawing(world, drawing) {
                const tool = drawing?.tool || state.tool;
                switch (tool) {
                case 'causal-link': {
                        const endNode = renderer.hitCausalNode(world);
                        if (drawing.startNodeId && endNode?.id && drawing.startNodeId !== endNode.id) {
                                const link = makeCausalLink(drawing.startNodeId, endNode.id);
                                state.board.causalLinks.push(link);
                                render();
                                editors.openCausalLinkEditor(link, renderer.getCausalLinkMidpoint(link), canvas);
                                syncBoard();
                        }
                        return;
                }
                default:
                        break;
                }
                render();
        }

        function makeCausalLink(from, to) {
                return {
                        id: uid(),
                        from,
                        to,
                        polarity: 'positive',
                        weight: 1,
                        label: 'influences',
                };
        }

        function deleteSelection() {
                if (!state.selection?.items?.length) return;
                const ids = new Set(state.selection.items.map((item) => item.hit.item.id));
                const removedNodeIds = new Set();
                state.board.causalNodes = state.board.causalNodes.filter((node) => {
                        const keep = !ids.has(node.id);
                        if (!keep) removedNodeIds.add(node.id);
                        return keep;
                });
                state.board.causalLinks = state.board.causalLinks.filter(
                        (link) =>
                                !ids.has(link.id) &&
                                !removedNodeIds.has(link.from) &&
                                !removedNodeIds.has(link.to),
                );
                clearSelection();
                render();
                syncBoard();
        }

        function assignGroupTag(tag) {
                const trimmed = tag.trim();
                const targets = (state.selection?.items || []).filter((item) => item.hit.type === 'causal-node');
                if (!targets.length) {
                        setStatus('Select one or more causal nodes to group');
                        return;
                }
                targets.forEach((item) => {
                        item.hit.item.group = trimmed || null;
                });
                refreshGroupingMetadata(state);
                updateGroupSuggestions();
                render();
                syncBoard();
                setStatus(trimmed ? `Grouped nodes under "${trimmed}"` : 'Cleared node grouping');
        }

        function updateGroupSuggestions() {
                if (!groupSuggestions) return;
                groupSuggestions.innerHTML = '';
                state.grouping.causalGroups.forEach((group) => {
                        const option = document.createElement('option');
                        option.value = group;
                        groupSuggestions.appendChild(option);
                });
        }

        function applyAutoLayout() {
                if (!state.board?.causalNodes?.length) {
                        setStatus('Add causal nodes to run layout');
                        return;
                }
                const result = computeCausalLayout(state.board.causalNodes, state.board.causalLinks, {
                        groups: state.grouping.causalGroups,
                });
                state.layout.causalPositions = result.positions;
                state.grouping.causalGroups = result.groups;
                state.board.causalNodes.forEach((node) => {
                        const pos = result.positions.get(node.id) || result.positions?.[node.id];
                        if (pos) node.position = { ...pos };
                });
                updateGroupSuggestions();
                render();
                syncBoard();
                setStatus('Auto layout applied');
        }

        return { activate, deactivate, toolbar, updateGroupSuggestions, refreshGrouping: () => refreshGroupingMetadata(state), recomputeStatus: () => recomputeStatusViews(state) };
}
