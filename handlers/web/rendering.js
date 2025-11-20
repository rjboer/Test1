import { blend, clamp, distance } from './utils.js';
import { toScreenPoint } from './geometry.js';

export function createRenderer(ctx, canvas, state) {
        function render(meta) {
                const rect = canvas.getBoundingClientRect();
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.save();
                ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
                drawGrid(rect.width, rect.height);
                applyLayoutPositions();
                if (!state.board) {
                        ctx.restore();
                        return;
                }

                state.board.causalLinks.forEach(drawCausalLink);
                state.board.connectors.forEach(drawConnector);
                state.board.shapes.forEach(drawShape);
                state.board.strokes.forEach(drawStroke);
                state.board.causalNodes.forEach(drawCausalNode);
                state.board.notes.forEach(drawNote);
                state.board.texts.forEach(drawText);
                state.board.comments.forEach(drawCommentPin);
                drawSelection();
                drawCursors();
                drawMarquee();

                if (state.drawing) {
                        drawPreview(state.drawing);
                }
                ctx.restore();
                if (meta) renderMeta(meta);
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

        function applyLayoutPositions() {
                if (!state.board || !state.layout?.causalPositions) return;
                const positions = state.layout.causalPositions;
                state.board.causalNodes?.forEach((node) => {
                        const pos = positions instanceof Map ? positions.get(node.id) : positions?.[node.id];
                        if (pos) {
                                node.position = { ...pos };
                        }
                });
        }

        function drawShape(shape) {
                const [a, b] = shape.points;
                const topLeft = toScreenPoint({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y) }, state);
                const bottomRight = toScreenPoint({ x: Math.max(a.x, b.x), y: Math.max(a.y, b.y) }, state);
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
                const points = stroke.points.map((p) => toScreenPoint(p, state));

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
                const points = connectorPoints(conn);
                if (!points) return;
                const { from: startWorld, to: endWorld } = points;

                const start = toScreenPoint(startWorld, state);
                const end = toScreenPoint(endWorld, state);
                ctx.save();
                ctx.strokeStyle = conn.color || state.connectorDefaults?.color || '#fbbf24';
                ctx.lineWidth = Math.max(1, (conn.width || state.connectorDefaults?.width || 2) * state.scale);
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

        function connectorPoints(conn) {
                const startWorld = anchorToPoint(conn.from) || conn.from;
                const endWorld = anchorToPoint(conn.to) || conn.to;
                if (!startWorld || !endWorld) return null;
                return { from: startWorld, to: endWorld };
        }

        function drawCausalLink(link) {
                const fromNode = findCausalNode(link.from) || { position: link.from };
                const toNode = findCausalNode(link.to) || { position: link.to };
                if (!fromNode?.position || !toNode?.position) return;

                const start = toScreenPoint(fromNode.position, state);
                const end = toScreenPoint(toNode.position, state);
                const width = Math.max(1.5, (link.weight || 1) * state.scale);
                const color = polarityColor(link.polarity);
                ctx.save();
                ctx.strokeStyle = color;
                ctx.lineWidth = width;
                ctx.beginPath();
                ctx.moveTo(start.x, start.y);
                ctx.lineTo(end.x, end.y);
                ctx.stroke();
                drawArrowhead(start, end, color);

                const mid = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
                const label = linkLabel(link);
                if (label) {
                        ctx.fillStyle = 'rgba(0,0,0,0.75)';
                        ctx.strokeStyle = 'rgba(0,0,0,0.45)';
                        ctx.lineWidth = 10;
                        const metrics = ctx.measureText(label);
                        ctx.strokeRect(mid.x - 6, mid.y - 14, metrics.width + 12, 24);
                        ctx.fillStyle = '#f9fafb';
                        ctx.textAlign = 'left';
                        ctx.textBaseline = 'middle';
                        ctx.fillText(label, mid.x, mid.y);
                }
                ctx.restore();
        }

        function drawCausalNode(node) {
                const pos = toScreenPoint(node.position, state);
                const radius = 28 * state.scale;
                const color = node.color || polarityColor('neutral');
                const statusInfo = state.statusRollup?.get(node.id);
                const statusColor = nodeStatusColor(statusInfo?.status || node.status);
                ctx.save();
                ctx.fillStyle = color;
                ctx.strokeStyle = '#0b1224';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
                if (statusColor) {
                        ctx.strokeStyle = statusColor;
                        ctx.lineWidth = 4;
                        ctx.beginPath();
                        ctx.arc(pos.x, pos.y, radius + 6, 0, Math.PI * 2);
                        ctx.stroke();
                }
                ctx.fillStyle = '#0b1224';
                ctx.font = `${14 * state.scale}px "Inter", sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(node.label || 'Node', pos.x, pos.y);
                if (statusInfo?.summary) {
                        ctx.fillStyle = '#e5e7eb';
                        ctx.font = `${12 * state.scale}px "Inter", sans-serif`;
                        ctx.fillText(formatEvidenceSummary(statusInfo.summary), pos.x, pos.y + radius + 14);
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
                const pos = toScreenPoint(note.position, state);
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
                const pos = toScreenPoint(item.position, state);
                ctx.save();
                ctx.fillStyle = item.color || '#e5e7eb';
                ctx.font = `${(item.fontSize || 16) * state.scale}px "Inter", sans-serif`;
                ctx.fillText(item.content || 'Text', pos.x, pos.y);
                ctx.restore();
        }

        function drawCommentPin(comment) {
                const pos = toScreenPoint(comment.position, state);
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
                        const pos = toScreenPoint(cursor.position, state);
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

                if (drawing.tool === 'connector') {
                        drawConnectorPreview(drawing);
                        return;
                }

                if (drawing.tool === 'causal-link') {
                        drawCausalLinkPreview(drawing);
                        return;
                }

                const start = toScreenPoint(drawing.start, state);
                const end = toScreenPoint(drawing.current, state);
                ctx.save();
                ctx.setLineDash([6, 4]);
                ctx.strokeStyle = '#9ca3af';
                ctx.lineWidth = 1;
                if (drawing.tool === 'rectangle' || drawing.tool === 'ellipse' || drawing.tool === 'select') {
                        ctx.beginPath();
                        ctx.rect(Math.min(start.x, end.x), Math.min(start.y, end.y), Math.abs(end.x - start.x), Math.abs(end.y - start.y));
                        ctx.stroke();
                }
                ctx.restore();
        }

        function drawConnectorPreview(drawing) {
                const preview = {
                        from: snapToAnchor(drawing.start),
                        to: snapToAnchor(drawing.current),
                        color: state.connectorDefaults?.color || '#fbbf24',
                        width: state.connectorDefaults?.width || 2,
                        label: state.connectorDefaults?.label,
                };

                ctx.save();
                ctx.globalAlpha = 0.7;
                drawConnector(preview);
                ctx.restore();
        }

        function drawCausalLinkPreview(drawing) {
                const preview = {
                        from: drawing.start,
                        to: drawing.current,
                        polarity: 'positive',
                        weight: 1,
                };
                ctx.save();
                ctx.globalAlpha = 0.65;
                drawCausalLink(preview);
                ctx.restore();
        }

        function drawSelection() {
                const sel = state.selection;
                if (!sel || !sel.items?.length) return;
                const bounds = getSelectionBounds(sel);
                if (!bounds) return;
                const screen = toScreenPoint({ x: bounds.x, y: bounds.y }, state);
                const w = bounds.width * state.scale;
                const h = bounds.height * state.scale;
                ctx.save();
                ctx.strokeStyle = '#60a5fa';
                ctx.setLineDash([4, 2]);
                ctx.strokeRect(screen.x, screen.y, w, h);
                if (isSelectionResizable(sel)) {
                        ctx.fillStyle = '#60a5fa';
                        handlePositions(bounds).forEach((handle) => {
                                ctx.fillRect(handle.x - 5, handle.y - 5, 10, 10);
                        });
                }
                ctx.restore();
        }

        function drawMarquee() {
                if (!state.marquee) return;
                const start = toScreenPoint(state.marquee.start, state);
                const end = toScreenPoint(state.marquee.current, state);
                ctx.save();
                ctx.setLineDash([6, 4]);
                ctx.strokeStyle = 'rgba(96,165,250,0.8)';
                ctx.fillStyle = 'rgba(96,165,250,0.15)';
                ctx.beginPath();
                ctx.rect(Math.min(start.x, end.x), Math.min(start.y, end.y), Math.abs(end.x - start.x), Math.abs(end.y - start.y));
                ctx.fill();
                ctx.stroke();
                ctx.restore();
        }

        function renderMeta(metaEl) {
                if (!state.board || !metaEl) return;
                const updated = new Date(state.board.updatedAt).toLocaleTimeString();
                const statusLines = (state.board.causalNodes || [])
                        .map((node) => {
                                const rollup = state.statusRollup?.get(node.id);
                                const badge = node.status ? ` – ${node.status} (${Math.round((node.confidence || 0) * 100)}%)` : '';
                                const evidence = rollup?.summary ? ` [+${rollup.summary.positive}/-${rollup.summary.negative}/~${rollup.summary.neutral}]` : '';
                                return `${node.label || node.id}${badge}${evidence}`;
                        })
                        .join('<br/>');
                metaEl.innerHTML = `ID: ${state.board.id}<br/>Name: ${state.board.name}<br/>Shapes: ${state.board.shapes.length}<br/>Notes: ${state.board.notes.length}<br/>Texts: ${state.board.texts.length}<br/>Connectors: ${state.board.connectors.length}<br/>Causal nodes: ${state.board.causalNodes.length}<br/>Causal links: ${state.board.causalLinks.length}<br/>Comments: ${state.board.comments.length}<br/>Updated: ${updated}<br/><br/><strong>Causal status</strong><br/>${statusLines}`;
        }

        function pruneCursors() {
                const now = Date.now();
                for (const [id, cursor] of state.cursors.entries()) {
                        if (now - (cursor.lastSeen || now) > 5000) {
                                state.cursors.delete(id);
                        }
                }
        }

        function getSelectionBounds(sel) {
                const bounds = sel.items
                        .map((item) => getBounds(item.hit))
                        .filter(Boolean)
                        .reduce((acc, b) => {
                                if (!acc) return { ...b };
                                return {
                                        x: Math.min(acc.x, b.x),
                                        y: Math.min(acc.y, b.y),
                                        width: Math.max(acc.x + acc.width, b.x + b.width) - Math.min(acc.x, b.x),
                                        height: Math.max(acc.y + acc.height, b.y + b.height) - Math.min(acc.y, b.y),
                                };
                        }, null);
                return bounds;
        }

        function getBounds(hit) {
                if (!hit) return null;
                switch (hit.type) {
                case 'shape': {
                        if (!hit.item?.points || hit.item.points.length < 2) return null;
                        const [a, b] = hit.item.points;
                        return {
                                x: Math.min(a.x, b.x),
                                y: Math.min(a.y, b.y),
                                width: Math.abs(b.x - a.x),
                                height: Math.abs(b.y - a.y),
                        };
                }
                case 'note':
                        if (!hit.item?.position) return null;
                        return {
                                x: hit.item.position.x,
                                y: hit.item.position.y,
                                width: hit.item.width,
                                height: hit.item.height,
                        };
                case 'connector': {
                        const padding = 6;
                        const points = connectorPoints(hit.item);
                        if (!points) return null;
                        const left = Math.min(points.from.x, points.to.x) - padding;
                        const top = Math.min(points.from.y, points.to.y) - padding;
                        const width = Math.abs(points.to.x - points.from.x) + padding * 2;
                        const height = Math.abs(points.to.y - points.from.y) + padding * 2;
                        return { x: left, y: top, width, height };
                }
                case 'text': {
                        if (!hit.item?.position) return null;
                        const size = hit.item.fontSize || 16;
                        const width = measureTextWidth(hit.item);
                        return {
                                x: hit.item.position.x,
                                y: hit.item.position.y,
                                width,
                                height: size,
                        };
                }
                case 'causal-node': {
                        if (!hit.item?.position) return null;
                        const radius = 28;
                        return {
                                x: hit.item.position.x - radius,
                                y: hit.item.position.y - radius,
                                width: radius * 2,
                                height: radius * 2,
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

        function hitTest(world) {
                const text = hitText(world);
                if (text) return { type: 'text', item: text };
                const note = hitNote(world);
                if (note) return { type: 'note', item: note };
                const causalNode = hitCausalNode(world);
                if (causalNode) return { type: 'causal-node', item: causalNode };
                const shape = hitShape(world);
                if (shape) return { type: 'shape', item: shape };
                const connector = hitConnector(world);
                if (connector) return connector;
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

        function hitCausalNode(world) {
                for (let i = state.board.causalNodes.length - 1; i >= 0; i -= 1) {
                        const node = state.board.causalNodes[i];
                        const radius = 28;
                        const dist = distance(world, node.position);
                        if (dist <= radius) {
                                return node;
                        }
                }
                return null;
        }

        function hitConnector(world) {
                if (!state.board?.connectors?.length) return null;

                const tolerance = 10;
                for (let i = state.board.connectors.length - 1; i >= 0; i -= 1) {
                        const conn = state.board.connectors[i];
                        const points = connectorPoints(conn);
                        if (!points) continue;
                        const { from, to } = points;
                        const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
                        if (distance(world, from) <= tolerance) return { type: 'connector', item: conn, handle: 'from' };
                        if (distance(world, to) <= tolerance) return { type: 'connector', item: conn, handle: 'to' };
                        if (distance(world, mid) <= tolerance) return { type: 'connector', item: conn, handle: 'midpoint' };
                        const d = pointToSegmentDistance(world, from, to);
                        if (d <= tolerance) {
                                return { type: 'connector', item: conn, handle: null };
                        }
                }
                return null;
        }

        function hitCausalLink(world) {
                const tolerance = 10;
                for (let i = state.board.causalLinks.length - 1; i >= 0; i -= 1) {
                        const link = state.board.causalLinks[i];
                        const points = causalLinkPoints(link);
                        if (!points) continue;
                        const d = pointToSegmentDistance(world, points.from, points.to);
                        if (d <= tolerance) {
                                return { link, midpoint: { x: (points.from.x + points.to.x) / 2, y: (points.from.y + points.to.y) / 2 } };
                        }
                }
                return null;
        }

        function detectHandleHit(hit, evt) {
                if (!isResizable(hit.type)) return null;
                const bounds = getBounds(hit);
                if (!bounds) return null;
                const screen = evt;
                const handles = handlePositions(bounds);
                const handleSize = 10;
                return handles.find((h) => Math.abs(h.x - screen.x) <= handleSize && Math.abs(h.y - screen.y) <= handleSize)?.name || null;
        }

        function handlePositions(bounds) {
                const tl = toScreenPoint({ x: bounds.x, y: bounds.y }, state);
                const tr = toScreenPoint({ x: bounds.x + bounds.width, y: bounds.y }, state);
                const bl = toScreenPoint({ x: bounds.x, y: bounds.y + bounds.height }, state);
                const br = toScreenPoint({ x: bounds.x + bounds.width, y: bounds.y + bounds.height }, state);
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

        function isSelectionResizable(sel) {
                return sel.items.every((item) => isResizable(item.hit.type));
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

        function snapToAnchor(point) {
                const snappingEnabled = state.snapSettings?.enabled !== false;
                const tolerance = clamp(Number(state.snapSettings?.tolerance) || 0, 0, 240);
                if (!snappingEnabled || !state.board || !state.board.shapes.length || tolerance <= 0) {
                        return { point };
                }

                let closest = null;
                state.board.shapes.forEach((shape) => {
                        const anchors = getShapeAnchors(shape);
                        Object.entries(anchors).forEach(([side, anchorPoint]) => {
                                const dist = distance(point, anchorPoint);
                                if (dist <= tolerance && (!closest || dist < closest.dist)) {
                                        closest = { dist, anchor: { shapeId: shape.id, side, point: anchorPoint } };
                                }
                        });
                });

                if (closest) return closest.anchor;
                return { point };
        }

        function anchorToPoint(anchor) {
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
                if (typeof anchor.x === 'number' && typeof anchor.y === 'number') return anchor;
                return null;
        }

        function polarityColor(polarity) {
                switch (polarity) {
                case 'negative':
                        return '#f87171';
                case 'neutral':
                        return '#fbbf24';
                default:
                        return '#34d399';
                }
        }

        function linkLabel(link) {
                const parts = [];
                if (link.label) parts.push(link.label);
                if (link.polarity) parts.push(link.polarity === 'negative' ? '−' : link.polarity === 'neutral' ? '0' : '+');
                if (typeof link.weight === 'number') parts.push(`w=${link.weight}`);
                return parts.join(' ').trim();
        }

        function nodeStatusColor(status) {
                switch (status) {
                case 'positive':
                        return '#34d399';
                case 'negative':
                        return '#f87171';
                case 'neutral':
                        return '#fbbf24';
                default:
                        return null;
                }
        }

        function formatEvidenceSummary(summary) {
                if (!summary) return '';
                return `+${summary.positive}/-${summary.negative}/~${summary.neutral}`;
        }

        function findCausalNode(id) {
                return state.board?.causalNodes.find((node) => node.id === id);
        }

        function causalLinkPoints(link) {
                const fromNode = findCausalNode(link.from) || { position: link.from };
                const toNode = findCausalNode(link.to) || { position: link.to };
                if (!fromNode?.position || !toNode?.position) return null;
                return { from: fromNode.position, to: toNode.position };
        }

        function getCausalLinkMidpoint(link) {
                const pts = causalLinkPoints(link);
                if (!pts) return { x: 0, y: 0 };
                return { x: (pts.from.x + pts.to.x) / 2, y: (pts.from.y + pts.to.y) / 2 };
        }

        function pointToSegmentDistance(p, a, b) {
                const l2 = distance(a, b) ** 2;
                if (l2 === 0) return distance(p, a);
                const t = Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / l2));
                const projection = { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
                return distance(p, projection);
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

        return {
                render,
                drawPreview,
                renderMeta,
                snapToAnchor,
                anchorToPoint,
                getBounds,
                hitTest,
                hitCausalNode,
                hitCausalLink,
                hitComment: (world) => {
                        const screenPoint = toScreenPoint(world, state);
                        const radius = 14;
                        return state.board.comments.find((comment) => {
                                const pin = toScreenPoint(comment.position, state);
                                return distance(screenPoint, pin) <= radius;
                        });
                },
                detectHandleHit,
                isResizable,
                handlePositions,
                getSelectionBounds,
                measureTextWidth,
                getCausalLinkMidpoint,
        };
}
