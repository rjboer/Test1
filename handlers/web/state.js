import { clamp, pickColor } from './utils.js';

export const defaultSettings = {
        cursorLabel: 'You',
        cursorColor: pickColor(),
        strokeWidth: 3,
        strokeSmoothing: 0.45,
        connectorColor: '#fbbf24',
        connectorWidth: 2,
        connectorLabel: 'flow',
        snapToAnchors: true,
        snapTolerance: 32,
};

const SETTINGS_KEY = 'boards-settings';

function loadStoredSettings() {
        if (typeof localStorage === 'undefined') return null;
        try {
                const raw = localStorage.getItem(SETTINGS_KEY);
                return raw ? JSON.parse(raw) : null;
        } catch (err) {
                console.warn('Could not read settings', err);
                return null;
        }
}

function persistSettings(settings) {
        if (typeof localStorage === 'undefined') return;
        try {
                localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
        } catch (err) {
                console.warn('Could not store settings', err);
        }
}

export function createInitialState(boardId) {
        const settings = { ...defaultSettings, ...(loadStoredSettings() || {}) };
        const state = {
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
                        label: settings.cursorLabel,
                        color: settings.cursorColor,
                        position: { x: 0, y: 0 },
                },
                cursors: new Map(),
                lastCursorSent: 0,
                strokeSettings: { width: settings.strokeWidth, smoothing: settings.strokeSmoothing },
                connectorDefaults: {
                        color: settings.connectorColor,
                        width: settings.connectorWidth,
                        label: settings.connectorLabel,
                },
                snapSettings: { enabled: settings.snapToAnchors, tolerance: settings.snapTolerance },
                settings,
                pendingTemplate: null,
                grouping: { causalGroups: [] },
                layout: { causalPositions: null },
                statusRollup: new Map(),
        };

        applySettings(state, settings);

        return state;
}

export function applySettings(state, settings) {
        const merged = {
                ...defaultSettings,
                ...(state.settings || {}),
                ...settings,
        };
        state.settings = merged;
        state.myCursor.label = merged.cursorLabel || defaultSettings.cursorLabel;
        state.myCursor.color = merged.cursorColor || defaultSettings.cursorColor;
        state.strokeSettings = {
                width: Math.max(1, Number(merged.strokeWidth) || defaultSettings.strokeWidth),
                smoothing: clamp(isNaN(merged.strokeSmoothing) ? defaultSettings.strokeSmoothing : merged.strokeSmoothing, 0, 1),
        };
        state.connectorDefaults = {
                color: merged.connectorColor || defaultSettings.connectorColor,
                width: Math.max(1, Number(merged.connectorWidth) || defaultSettings.connectorWidth),
                label: merged.connectorLabel ?? defaultSettings.connectorLabel,
        };
        state.snapSettings = {
                enabled: merged.snapToAnchors !== false,
                tolerance: Math.max(0, Number(merged.snapTolerance) || defaultSettings.snapTolerance),
        };
        persistSettings(merged);
}

export function resetSettings(state) {
        applySettings(state, defaultSettings);
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
