export function toWorld(evt, canvas, state) {
        const rect = canvas.getBoundingClientRect();
        const x = (evt.clientX - rect.left - state.offset.x) / state.scale;
        const y = (evt.clientY - rect.top - state.offset.y) / state.scale;
        return { x, y };
}

export function screenToWorld(pt, state) {
        return {
                        x: (pt.x - state.offset.x) / state.scale,
                        y: (pt.y - state.offset.y) / state.scale,
        };
}

export function toScreenPoint(point, state) {
        return {
                        x: point.x * state.scale + state.offset.x,
                        y: point.y * state.scale + state.offset.y,
        };
}

export function eventToScreen(evt, canvas) {
        const rect = canvas.getBoundingClientRect();
        return { x: evt.clientX - rect.left, y: evt.clientY - rect.top };
}
