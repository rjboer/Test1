import { uid } from './utils.js';
import { toScreenPoint } from './geometry.js';

export function createEditors(state, renderer, onCommit) {
        let activeEditor = null;

        function hideEditor() {
                if (activeEditor) {
                        activeEditor.remove();
                        activeEditor = null;
                }
        }

        function worldToPage(point, canvas) {
                const pt = toScreenPoint(point, state);
                const rect = canvas.getBoundingClientRect();
                return { x: rect.left + pt.x, y: rect.top + pt.y };
        }

        function openOverlay(kind, world, initialValue, options, onSave, canvas) {
                hideEditor();
                const opts = options || {};
                const el = document.createElement(kind === 'note' ? 'textarea' : 'input');
                el.value = initialValue || '';
                el.placeholder = opts.placeholder || '';
                el.style.position = 'absolute';
                el.style.padding = '8px 10px';
                el.style.border = '1px solid #9ca3af';
                el.style.borderRadius = '8px';
                el.style.boxShadow = '0 10px 30px rgba(0, 0, 0, 0.25)';
                el.style.background = 'rgba(255, 255, 255, 0.96)';
                el.style.color = '#111827';
                el.style.fontFamily = '"Inter", sans-serif';
                el.style.fontSize = `${(opts.fontSize || 16) * state.scale}px`;
                el.style.zIndex = '30';
                el.style.minWidth = `${(opts.width || 200) * state.scale}px`;
                el.style.outline = 'none';
                el.style.resize = kind === 'note' ? 'both' : 'none';
                if (opts.height) {
                        el.style.height = `${opts.height * state.scale}px`;
                }
                const page = worldToPage(world, canvas);
                const offsetY = opts.offsetY ? opts.offsetY * state.scale : 0;
                el.style.left = `${page.x}px`;
                el.style.top = `${page.y - offsetY}px`;

                const finalize = (shouldCommit = true) => {
                        if (!activeEditor || el !== activeEditor) return;
                        hideEditor();
                        if (!shouldCommit) return;
                        const value = el.value;
                        if (!opts.allowEmpty && !value.trim()) return;
                        onSave(value);
                };

                el.addEventListener('keydown', (evt) => {
                        if (evt.key === 'Enter' && !(kind === 'note' && evt.shiftKey)) {
                                evt.preventDefault();
                                finalize(true);
                        } else if (evt.key === 'Escape') {
                                evt.preventDefault();
                                finalize(false);
                        }
                });

                el.addEventListener('blur', () => finalize(true));

                document.body.appendChild(el);
                activeEditor = el;
                el.focus();
                el.select();
        }

        function openTextEditor(position, initialContent, existing, allowEmpty, onDone, canvas) {
                const offset = existing ? 12 : 0;
                openOverlay('text', position, initialContent, { offsetY: offset }, (value) => {
                        const content = value || 'Text';
                        if (existing) {
                                existing.content = content;
                        } else {
                                state.board.texts.push(makeText(content, position));
                        }
                        onDone();
                        onCommit();
                }, canvas);
        }

        function openNoteEditor(position, initialContent, existing, allowEmpty, onDone, canvas) {
                const width = (existing && existing.width) || 180;
                const height = (existing && existing.height) || 120;
                openOverlay('note', position, initialContent, {
                        fontSize: 14,
                        width,
                        height,
                        allowEmpty,
                }, (value) => {
                        if (existing) {
                                existing.content = value;
                        } else {
                                state.board.notes.push(makeNote(value, position));
                        }
                        onDone();
                        onCommit();
                }, canvas);
        }

        function openCommentEditor(position, existing, canvas) {
                hideEditor();
                const wrapper = document.createElement('div');
                wrapper.style.position = 'absolute';
                wrapper.style.padding = '10px';
                wrapper.style.background = 'rgba(255, 255, 255, 0.98)';
                wrapper.style.border = '1px solid #9ca3af';
                wrapper.style.borderRadius = '10px';
                wrapper.style.boxShadow = '0 12px 30px rgba(0, 0, 0, 0.25)';
                wrapper.style.width = '260px';
                wrapper.style.zIndex = '35';

                const title = document.createElement('div');
                title.textContent = existing ? 'Edit pin' : 'New pin';
                title.style.fontWeight = '600';
                title.style.marginBottom = '8px';
                wrapper.appendChild(title);

                const typeLabel = document.createElement('label');
                typeLabel.textContent = 'Type';
                typeLabel.style.display = 'block';
                typeLabel.style.fontSize = '12px';
                typeLabel.style.marginBottom = '4px';
                wrapper.appendChild(typeLabel);

                const select = document.createElement('select');
                ['comment', 'reaction'].forEach((kind) => {
                        const opt = document.createElement('option');
                        opt.value = kind;
                        opt.textContent = kind.charAt(0).toUpperCase() + kind.slice(1);
                        select.appendChild(opt);
                });
                select.value = existing?.type || 'comment';
                select.style.marginBottom = '8px';
                select.style.width = '100%';
                select.style.padding = '6px';
                wrapper.appendChild(select);

                const textarea = document.createElement('textarea');
                textarea.placeholder = 'Add comment or emoji…';
                textarea.value = existing?.content || '';
                textarea.style.width = '100%';
                textarea.style.height = '80px';
                textarea.style.boxSizing = 'border-box';
                textarea.style.padding = '8px';
                textarea.style.marginBottom = '8px';
                textarea.style.fontFamily = '"Inter", sans-serif';
                wrapper.appendChild(textarea);

                const actions = document.createElement('div');
                actions.style.display = 'flex';
                actions.style.justifyContent = 'space-between';
                actions.style.gap = '8px';

                const save = document.createElement('button');
                save.textContent = existing ? 'Save' : 'Add';
                save.style.flex = '1';

                const cancel = document.createElement('button');
                cancel.textContent = 'Cancel';
                cancel.type = 'button';
                cancel.style.flex = '1';

                const remove = document.createElement('button');
                remove.textContent = 'Delete';
                remove.style.flex = '1';
                remove.style.background = '#ef4444';
                remove.style.color = '#fff';
                remove.style.display = existing ? 'block' : 'none';

                actions.appendChild(cancel);
                actions.appendChild(save);
                actions.appendChild(remove);
                wrapper.appendChild(actions);

                const commit = () => {
                        const content = textarea.value.trim();
                        if (!content) {
                                hideEditor();
                                return;
                        }
                        const type = select.value || 'comment';
                        if (existing) {
                                existing.content = content;
                                existing.type = type;
                                existing.author = existing.author || state.myCursor.label || 'You';
                        } else {
                                state.board.comments.push(makeComment(position, content, type));
                        }
                        hideEditor();
                        onCommit();
                        renderer.render();
                };

                save.addEventListener('click', commit);
                cancel.addEventListener('click', () => hideEditor());
                remove.addEventListener('click', () => {
                        if (!existing) return;
                        const idx = state.board.comments.findIndex((c) => c.id === existing.id);
                        if (idx >= 0) state.board.comments.splice(idx, 1);
                        hideEditor();
                        onCommit();
                        renderer.render();
                });

                const page = worldToPage(position, canvas);
                wrapper.style.left = `${page.x}px`;
                wrapper.style.top = `${page.y}px`;

                document.body.appendChild(wrapper);
                activeEditor = wrapper;
        }

        function makeText(content, position) {
                return {
                        id: uid(),
                        content,
                        position,
                        color: '#e5e7eb',
                        fontSize: 18,
                };
        }

        function makeNote(content, position) {
                return {
                        id: uid(),
                        content,
                        position,
                        color: '#fcd34d',
                        width: 180,
                        height: 120,
                };
        }

        function makeComment(position, content, type) {
                return {
                        id: uid(),
                        position,
                        author: state.myCursor.label || 'You',
                        content,
                        type: type || 'comment',
                };
        }

        return { openTextEditor, openNoteEditor, openCommentEditor, hideEditor };
}
