import { clamp } from './utils.js';

export function startSelection(state, hit, world, handle, helpers) {
        const items = hit ? [{ hit, initial: captureInitial(hit, helpers) }] : [];
        state.selection = {
                items,
                handle,
                mode: handle ? 'resize' : 'move',
                origin: world,
                initialUnion: items.length ? helpers.getBounds(hit) : null,
                dragging: true,
                dirty: false,
        };
}

export function startSelectionFromHits(state, hits, world, helpers) {
        const items = hits.map((hit) => ({ hit, initial: captureInitial(hit, helpers) }));
        state.selection = {
                items,
                handle: null,
                mode: 'move',
                origin: world,
                initialUnion: unionBounds(items.map((item) => item.initial.bounds)),
                dragging: true,
                dirty: false,
        };
}

export function clearSelection(state) {
        state.selection = null;
}

export function updateSelection(state, world, helpers) {
        const sel = state.selection;
        if (!sel || !sel.dragging) return;
        if (!sel.items.length) return;
        const canResize = sel.items.every((item) => helpers.isResizable(item.hit.type));
        if (sel.mode === 'resize' && sel.handle && canResize) {
                        applyResize(sel, world, helpers);
        } else if (sel.mode === 'move') {
                        applyMove(sel, world);
        }
}

function applyMove(sel, world) {
        const dx = world.x - sel.origin.x;
        const dy = world.y - sel.origin.y;
        sel.items.forEach(({ hit, initial }) => {
                switch (hit.type) {
                case 'shape':
                        hit.item.points = initial.points.map((pt) => ({ x: pt.x + dx, y: pt.y + dy }));
                        sel.dirty = true;
                        break;
                case 'note':
                        hit.item.position = { x: initial.bounds.x + dx, y: initial.bounds.y + dy };
                        sel.dirty = true;
                        break;
                case 'text':
                        if (initial.position) {
                                hit.item.position = { x: initial.position.x + dx, y: initial.position.y + dy };
                                sel.dirty = true;
                        }
                        break;
                case 'causal-node':
                        if (initial.bounds) {
                                hit.item.position = { x: initial.bounds.x + dx + initial.bounds.width / 2, y: initial.bounds.y + dy + initial.bounds.height / 2 };
                                sel.dirty = true;
                        }
                        break;
                default:
                        break;
                }
        });
}

function applyResize(sel, world, helpers) {
        const initialUnion = sel.initialUnion || unionBounds(sel.items.map((item) => item.initial.bounds));
        const bounds = { ...initialUnion };
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

        const scaleX = bounds.width / (initialUnion.width || 1);
        const scaleY = bounds.height / (initialUnion.height || 1);

        sel.items.forEach(({ hit, initial }) => {
                const relX = initial.bounds.x - initialUnion.x;
                const relY = initial.bounds.y - initialUnion.y;
                switch (hit.type) {
                case 'shape':
                        hit.item.points = initial.points.map((pt) => ({
                                x: bounds.x + (pt.x - initialUnion.x) * scaleX,
                                y: bounds.y + (pt.y - initialUnion.y) * scaleY,
                        }));
                        sel.dirty = true;
                        break;
                case 'note':
                        hit.item.position = {
                                x: bounds.x + relX * scaleX,
                                y: bounds.y + relY * scaleY,
                        };
                        hit.item.width = clamp(initial.bounds.width * scaleX, minSize, Infinity);
                        hit.item.height = clamp(initial.bounds.height * scaleY, minSize, Infinity);
                        sel.dirty = true;
                        break;
                case 'text':
                        hit.item.position = {
                                x: bounds.x + (initial.position.x - initialUnion.x) * scaleX,
                                y: bounds.y + (initial.position.y - initialUnion.y) * scaleY,
                        };
                        sel.dirty = true;
                        break;
                default:
                        break;
                }
        });
}

function captureInitial(hit, helpers) {
        return {
                bounds: helpers.getBounds(hit),
                points: hit.type === 'shape' ? hit.item.points.map((p) => ({ ...p })) : null,
                position: hit.item.position ? { ...hit.item.position } : null,
        };
}

function unionBounds(list) {
        return list.filter(Boolean).reduce((acc, b) => {
                if (!acc) return { ...b };
                return {
                        x: Math.min(acc.x, b.x),
                        y: Math.min(acc.y, b.y),
                        width: Math.max(acc.x + acc.width, b.x + b.width) - Math.min(acc.x, b.x),
                        height: Math.max(acc.y + acc.height, b.y + b.height) - Math.min(acc.y, b.y),
                };
        }, null);
}
