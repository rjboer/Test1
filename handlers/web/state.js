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
