import { uid } from './utils.js';

export const templates = [
        {
                id: 'two-step-flow',
                name: 'Two step flow',
                description: 'Pair of rectangles with labels and a connecting arrow.',
                shapes: [
                        {
                                key: 'left',
                                kind: 'rectangle',
                                points: [
                                        { x: -140, y: -60 },
                                        { x: -20, y: 40 },
                                ],
                                color: '#22d3ee',
                                strokeWidth: 2,
                        },
                        {
                                key: 'right',
                                kind: 'rectangle',
                                points: [
                                        { x: 40, y: -40 },
                                        { x: 160, y: 60 },
                                ],
                                color: '#a78bfa',
                                strokeWidth: 2,
                        },
                ],
                texts: [
                        { key: 'left-label', content: 'Idea', position: { x: -110, y: -10 }, color: '#e5e7eb', fontSize: 16 },
                        { key: 'right-label', content: 'Result', position: { x: 70, y: 10 }, color: '#e5e7eb', fontSize: 16 },
                ],
                connectors: [
                        {
                                from: { shapeKey: 'left', side: 'right' },
                                to: { shapeKey: 'right', side: 'left' },
                                color: '#fbbf24',
                                width: 2,
                                label: 'next',
                        },
                ],
        },
        {
                id: 'sticky-cluster',
                name: 'Sticky cluster',
                description: 'A trio of sticky notes with a heading.',
                notes: [
                        {
                                key: 'note-a',
                                position: { x: -120, y: -40 },
                                width: 120,
                                height: 90,
                                content: 'Research',
                                color: '#fbbf24',
                        },
                        {
                                key: 'note-b',
                                position: { x: 10, y: -40 },
                                width: 120,
                                height: 90,
                                content: 'Ideas',
                                color: '#34d399',
                        },
                        {
                                key: 'note-c',
                                position: { x: -55, y: 70 },
                                width: 120,
                                height: 90,
                                content: 'Next steps',
                                color: '#60a5fa',
                        },
                ],
                texts: [
                        { key: 'title', content: 'Brainstorm', position: { x: -90, y: -70 }, color: '#f9fafb', fontSize: 18 },
                ],
        },
        {
                id: 'comment-hub',
                name: 'Feedback hub',
                description: 'A central note with two connected callouts.',
                notes: [
                        {
                                key: 'main',
                                position: { x: -70, y: -40 },
                                width: 160,
                                height: 120,
                                content: 'Feature sketch',
                                color: '#fcd34d',
                        },
                        {
                                key: 'callout-left',
                                position: { x: -240, y: -20 },
                                width: 140,
                                height: 80,
                                content: 'Edge cases',
                                color: '#f59e0b',
                        },
                        {
                                key: 'callout-right',
                                position: { x: 150, y: -10 },
                                width: 140,
                                height: 80,
                                content: 'Open questions',
                                color: '#fbbf24',
                        },
                ],
                connectors: [
                        { from: { x: 10, y: 20 }, to: { x: -100, y: 20 }, color: '#60a5fa', width: 2 },
                        { from: { x: 10, y: 20 }, to: { x: 220, y: 30 }, color: '#60a5fa', width: 2 },
                ],
                comments: [
                        { position: { x: -40, y: -60 }, content: '💡 Consider mobile', type: 'reaction', author: 'UI' },
                        { position: { x: 100, y: 60 }, content: 'Need metric', type: 'comment', author: 'PM' },
                ],
        },
];

export function instantiateTemplate(template, at = { x: 0, y: 0 }) {
        const source = typeof template === 'string' ? templates.find((t) => t.id === template) : template;
        if (!source) return null;

        const offset = at;
        const shapeIds = new Map();

        const shapes = (source.shapes || []).map((shape) => {
                const id = uid();
                shapeIds.set(shape.key || id, id);
                return {
                        id,
                        kind: shape.kind,
                        points: translatePoints(shape.points, offset),
                        color: shape.color || '#22d3ee',
                        strokeWidth: shape.strokeWidth || 2,
                };
        });

        const notes = (source.notes || []).map((note) => ({
                id: uid(),
                content: note.content || '',
                position: translatePoint(note.position, offset),
                color: note.color || '#fcd34d',
                width: note.width || 140,
                height: note.height || 100,
        }));

        const texts = (source.texts || []).map((text) => ({
                id: uid(),
                content: text.content || '',
                position: translatePoint(text.position, offset),
                color: text.color || '#e5e7eb',
                fontSize: text.fontSize || 16,
        }));

        const connectors = (source.connectors || []).map((conn) => ({
                id: uid(),
                from: resolveAnchor(conn.from, shapeIds, offset),
                to: resolveAnchor(conn.to, shapeIds, offset),
                color: conn.color || '#fbbf24',
                width: conn.width || 2,
                label: conn.label || '',
        }));

        const comments = (source.comments || []).map((comment) => ({
                id: uid(),
                position: translatePoint(comment.position, offset),
                author: comment.author || '',
                content: comment.content || '',
                type: comment.type || 'comment',
        }));

        return { shapes, notes, texts, connectors, comments, name: source.name };
}

function translatePoints(points = [], offset) {
        return points.map((p) => translatePoint(p, offset));
}

function translatePoint(point, offset) {
        const x = (point?.x || 0) + offset.x;
        const y = (point?.y || 0) + offset.y;
        return { x, y };
}

function resolveAnchor(anchor, shapeIds, offset) {
        if (!anchor) return { point: translatePoint({ x: 0, y: 0 }, offset) };
        const resolved = {};
        if (anchor.shapeKey && shapeIds.has(anchor.shapeKey)) {
                resolved.shapeId = shapeIds.get(anchor.shapeKey);
        }
        if (anchor.side) {
                resolved.side = anchor.side;
        }
        if (typeof anchor.x === 'number' && typeof anchor.y === 'number') {
                resolved.point = translatePoint({ x: anchor.x, y: anchor.y }, offset);
        }
        if (anchor.point) {
                resolved.point = translatePoint(anchor.point, offset);
        }
        return Object.keys(resolved).length ? resolved : { point: translatePoint({ x: 0, y: 0 }, offset) };
}
