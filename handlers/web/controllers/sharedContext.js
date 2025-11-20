import { setStatus, setTool } from '../state.js';
import { clearSelection, startSelection, startSelectionFromHits, updateSelection } from '../selection.js';
import { eventToScreen, screenToWorld, toWorld } from '../geometry.js';

export function createSharedContext({
        canvas,
        statusEl,
        metaEl,
        toolbar,
        state,
        renderer,
        boardApi,
        editors,
}) {
        return {
                canvas,
                statusEl,
                metaEl,
                toolbar,
                state,
                renderer,
                boardApi,
                editors,
                toWorld: (evt) => toWorld(evt, canvas, state),
                eventToScreen: (evt) => eventToScreen(evt, canvas),
                screenToWorld: (screen) => screenToWorld(screen, state),
                render: () => renderer.render(metaEl),
                syncBoard: () => boardApi.syncBoard(),
                setTool: (tool, scope = toolbar) => {
                        setTool(state, tool, scope);
                        setStatus(statusEl, `Tool: ${state.tool}`);
                },
                setStatus: (msg) => setStatus(statusEl, msg),
                startSelection: (hit, world, handle) => startSelection(state, hit, world, handle, renderer),
                startSelectionFromHits: (hits, world) => startSelectionFromHits(state, hits, world, renderer),
                updateSelection: (world) => updateSelection(state, world, renderer),
                clearSelection: () => clearSelection(state),
        };
}
