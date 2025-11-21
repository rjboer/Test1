import {
        applySettings,
        createInitialState,
        defaultSettings,
        recomputeStatusViews,
        refreshGroupingMetadata,
        resetSettings,
        setStatus,
} from './state.js';
import { createRenderer } from './rendering.js';
import { createBoardApi } from './board.js';
import { createEditors } from './editors.js';
import { createSharedContext } from './controllers/sharedContext.js';
import { createMiroController } from './controllers/miroController.js';
import { createFlyingLogicController } from './controllers/flyingLogicController.js';

(() => {
        const canvas = document.getElementById('board-canvas');
        const ctx = canvas.getContext('2d');
        const status = document.getElementById('status');
        const meta = document.getElementById('board-meta');
        const deleteBtn = document.getElementById('delete-selection');

        const templateSelect = document.getElementById('template-select');
        const templateInsertBtn = document.getElementById('template-insert');
        const templateDescription = document.getElementById('template-description');
        const paletteEl = document.getElementById('ribbon-palette-groups');

        const autoLayoutBtn = document.getElementById('auto-layout');
        const applyGroupBtn = document.getElementById('apply-group');
        const groupInput = document.getElementById('group-name');
        const groupSuggestions = document.getElementById('group-suggestions');

        const settingsModal = document.getElementById('settings-modal');
        const settingsForm = document.getElementById('settings-form');
        const openSettingsBtn = document.getElementById('open-settings');
        const closeSettingsBtn = document.getElementById('close-settings');
        const closeSettingsFooterBtn = document.getElementById('close-settings-footer');
        const resetSettingsBtn = document.getElementById('reset-settings');
        const settingsDismiss = document.getElementById('settings-dismiss');
        const settingsSummary = document.getElementById('settings-summary');

        const modeButtons = document.querySelectorAll('[data-mode]');
        const miroToolbar = document.getElementById('miro-toolbar');
        const causalToolbar = document.getElementById('causal-toolbar');

        const initialBoardId = document.body?.dataset.boardId;
        if (!initialBoardId) {
                throw new Error('Initial board id missing');
        }
        const state = createInitialState(initialBoardId);

        const renderer = createRenderer(ctx, canvas, state);
        const boardApi = createBoardApi(state, renderer, (msg) => setStatus(status, msg), meta, handleBoardChange);
        const editors = createEditors(state, renderer, () => boardApi.syncBoard());

        const sharedContext = createSharedContext({
                canvas,
                statusEl: status,
                metaEl: meta,
                toolbar: miroToolbar,
                state,
                renderer,
                boardApi,
                editors,
        });

        const controllers = {
                miro: createMiroController(sharedContext, {
                        toolbar: miroToolbar,
                        deleteBtn,
                        templateSelect,
                        templateInsertBtn,
                        templateDescription,
                }),
                causal: createFlyingLogicController(sharedContext, {
                        toolbar: causalToolbar,
                        deleteBtn,
                        autoLayoutBtn,
                        applyGroupBtn,
                        groupInput,
                        groupSuggestions,
                        paletteEl,
                }),
        };

        let activeController = null;

        setupModeToggle();
        setupSettingsPanel();
        resizeCanvas();
        boardApi.loadBoard();
        activateController('miro');

        window.addEventListener('resize', resizeCanvas);

        function setupModeToggle() {
                modeButtons.forEach((btn) => {
                        btn.addEventListener('click', () => {
                                const mode = btn.dataset.mode;
                                activateController(mode);
                        });
                });
        }

        function activateController(mode) {
                if (activeController?.deactivate) {
                        activeController.deactivate();
                }
                activeController = controllers[mode];
                modeButtons.forEach((btn) => btn.classList.toggle('active', btn.dataset.mode === mode));
                miroToolbar?.setAttribute('hidden', mode !== 'miro');
                causalToolbar?.setAttribute('hidden', mode !== 'causal');
                activeController?.activate?.();
        }

        function handleBoardChange() {
                refreshGroupingMetadata(state);
                recomputeStatusViews(state);
                controllers.causal.updateGroupSuggestions?.();
                renderer.render(meta);
        }

        function resizeCanvas() {
                const rect = canvas.getBoundingClientRect();
                canvas.width = rect.width * window.devicePixelRatio;
                canvas.height = rect.height * window.devicePixelRatio;
                ctx.setTransform(1, 0, 0, 1, 0, 0);
                if (state.offset.x === 0 && state.offset.y === 0) {
                        state.offset = { x: rect.width / 2, y: rect.height / 2 };
                }
                renderer.render(meta);
        }

        function setupSettingsPanel() {
                if (!settingsModal || !settingsForm || !openSettingsBtn) return;

                const closeButtons = [closeSettingsBtn, closeSettingsFooterBtn, settingsDismiss];
                closeButtons.filter(Boolean).forEach((btn) => btn.addEventListener('click', () => hideSettingsModal()));

                openSettingsBtn.addEventListener('click', () => {
                        populateSettingsForm();
                        refreshSettingsSummary();
                        settingsModal.classList.add('visible');
                        settingsModal.setAttribute('aria-hidden', 'false');
                });

                settingsForm.addEventListener('input', () => applySettingsFromForm());

                resetSettingsBtn?.addEventListener('click', () => {
                        resetSettings(state);
                        populateSettingsForm();
                        renderer.render();
                        state.lastCursorSent = 0;
                        boardApi.maybeSendCursor(state.myCursor.position);
                        refreshSettingsSummary();
                });

                populateSettingsForm();
                refreshSettingsSummary();
        }

        function hideSettingsModal() {
                if (!settingsModal) return;
                settingsModal.classList.remove('visible');
                settingsModal.setAttribute('aria-hidden', 'true');
        }

        function populateSettingsForm() {
                if (!settingsForm) return;
                const settings = state.settings || defaultSettings;
                settingsForm.cursorLabel.value = settings.cursorLabel || '';
                settingsForm.cursorColor.value = settings.cursorColor || defaultSettings.cursorColor;
                settingsForm.strokeWidth.value = state.strokeSettings?.width || settings.strokeWidth;
                settingsForm.strokeSmoothing.value = state.strokeSettings?.smoothing ?? settings.strokeSmoothing;
                settingsForm.connectorColor.value = settings.connectorColor || defaultSettings.connectorColor;
                settingsForm.connectorWidth.value = state.connectorDefaults?.width || settings.connectorWidth;
                settingsForm.connectorLabel.value = settings.connectorLabel || '';
                settingsForm.snapToAnchors.checked = state.snapSettings?.enabled !== false;
                settingsForm.snapTolerance.value = state.snapSettings?.tolerance ?? settings.snapTolerance;
                settingsForm.causalWeightScientificCutoff.value =
                        state.settings?.causalWeightScientificCutoff ?? settings.causalWeightScientificCutoff;
        }

        function applySettingsFromForm() {
                if (!settingsForm) return;
                const updates = {
                        cursorLabel: settingsForm.cursorLabel.value || defaultSettings.cursorLabel,
                        cursorColor: settingsForm.cursorColor.value || defaultSettings.cursorColor,
                        strokeWidth: Number(settingsForm.strokeWidth.value) || defaultSettings.strokeWidth,
                        strokeSmoothing: Number(settingsForm.strokeSmoothing.value),
                        connectorColor: settingsForm.connectorColor.value || defaultSettings.connectorColor,
                        connectorWidth: Number(settingsForm.connectorWidth.value) || defaultSettings.connectorWidth,
                        connectorLabel: settingsForm.connectorLabel.value,
                        snapToAnchors: settingsForm.snapToAnchors.checked,
                        snapTolerance: Number(settingsForm.snapTolerance.value),
                        causalWeightScientificCutoff:
                                Number(settingsForm.causalWeightScientificCutoff.value) ||
                                defaultSettings.causalWeightScientificCutoff,
                };
                applySettings(state, updates);
                renderer.render(meta);
                state.lastCursorSent = 0;
                boardApi.maybeSendCursor(state.myCursor.position);
                refreshSettingsSummary();
        }

        function refreshSettingsSummary() {
                if (!settingsSummary) return;
                const snap = state.snapSettings?.enabled !== false;
                const connectorLabel = state.connectorDefaults?.label
                        ? `, label "${state.connectorDefaults.label}"`
                        : '';
                settingsSummary.textContent = `Cursor: ${state.myCursor.label} (${state.myCursor.color}) · Pen: ${state.strokeSettings.width}px, smoothing ${state.strokeSettings.smoothing.toFixed(2)} · Connector: ${state.connectorDefaults.width}px ${state.connectorDefaults.color}${connectorLabel} · Snap: ${snap ? 'on' : 'off'} @ ${state.snapSettings.tolerance}px · Weight cutoff: ${state.settings?.causalWeightScientificCutoff}`;
        }
})();
