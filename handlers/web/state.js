import { pickColor } from './utils.js';

export function createInitialState(boardId) {
        return {
                boardId,
                board: null,
                tool: 'pan',
                scale: 1,
                offset: { x: 0, y: 0 },
                pan: { active: false, origin: null, startOffset: null, button: null },
                drawing: null,
                selection: null,
                marquee: null,
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
                pendingTemplate: null,
                grouping: { causalGroups: [] },
                layout: { causalPositions: null },
                statusRollup: new Map(),
        };
}

export function setStatus(element, msg) {
        element.textContent = msg;
}

export function setTool(state, tool, toolbarEl) {
        state.tool = tool;
        if (toolbarEl) {
                toolbarEl.querySelectorAll('button').forEach((el) => el.classList.toggle('active', el.dataset.tool === tool));
        }
}

export function refreshGroupingMetadata(state) {
        const groups = Array.from(
                new Set((state.board?.causalNodes || []).map((node) => node.group).filter(Boolean)),
        ).sort();
        state.grouping.causalGroups = groups;
}

export function recomputeStatusViews(state) {
        const rollup = new Map();
        if (!state.board) {
                state.statusRollup = rollup;
                return;
        }

        const incoming = new Map();
        (state.board.causalLinks || []).forEach((link) => {
                const arr = incoming.get(link.to) || [];
                arr.push(link);
                incoming.set(link.to, arr);
        });

        const index = new Map((state.board.causalNodes || []).map((node) => [node.id, node]));

        (state.board.causalNodes || []).forEach((node) => {
                const links = incoming.get(node.id) || [];
                const evidence = links
                        .map((link) => {
                                const src = index.get(link.from);
                                if (!src) return null;
                                return {
                                        sourceId: src.id,
                                        sourceLabel: src.label || 'Unknown',
                                        status: src.status || 'unknown',
                                        confidence: src.confidence || 0,
                                        polarity: link.polarity || 'positive',
                                        weight: typeof link.weight === 'number' ? link.weight : 1,
                                };
                        })
                        .filter(Boolean);

                const summary = evidence.reduce(
                        (acc, ev) => {
                                if (ev.status === 'positive') acc.positive += 1;
                                else if (ev.status === 'negative') acc.negative += 1;
                                else acc.neutral += 1;
                                return acc;
                        },
                        { positive: 0, negative: 0, neutral: 0 },
                );

                rollup.set(node.id, { evidence, summary, status: node.status, confidence: node.confidence });
        });

        state.statusRollup = rollup;
}
