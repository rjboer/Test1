export function pickColor() {
        const palette = ['#22d3ee', '#a78bfa', '#34d399', '#f472b6', '#fbbf24'];
        return palette[Math.floor(Math.random() * palette.length)];
}

export function clamp(val, min, max) {
        return Math.max(min, Math.min(max, val));
}

export function uid() {
        return crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(16).slice(2);
}

export function distance(a, b) {
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        return Math.sqrt(dx * dx + dy * dy);
}

export function blend(a, b, t) {
        const amount = clamp(isNaN(t) ? 0.5 : t, 0, 1);
        return { x: a.x + (b.x - a.x) * amount, y: a.y + (b.y - a.y) * amount };
}
