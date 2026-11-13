import { createTextStyleService, applyTextStyle } from './text-style-service.js';
import { setProjectSectionCommand } from './command-service.js';

export function createTextStylePanel({ api, content, render, esc }) {
  const service = createTextStyleService({ projectState: api.projectState, getSelected: () => api.selected });
  const run = action => {
    try { action(); api.scheduleSave(); api.renderLayers(); api.syncInspector?.(); render(); }
    catch (error) { api.toast(error.message || 'Text style action failed.'); }
  };
  function renderView() {
    const current = service.list();
    content.innerHTML = `<section class="wb-section"><span class="eyebrow">TEXT STYLES</span><h3>Reusable typography</h3><p>Save the selected text layer’s typography, then apply it to other text layers.</p><button id="ts-save" class="primary-btn">Save selected text as style</button><div class="wb-list">${current.map(item => `<article><div><b>${esc(item.name)}</b><small>${esc([item.style['font-family'], item.style['font-size'], item.style['font-weight']].filter(Boolean).join(' · '))}</small></div><span><button data-text-style-apply="${esc(item.id)}">Apply</button><button data-text-style-delete="${esc(item.id)}" aria-label="Delete text style ${esc(item.name)}">×</button></span></article>`).join('') || '<div class="wb-empty">No text styles yet.</div>'}</div></section>`;
    content.querySelector('#ts-save').onclick = async () => {
      const node = api.selected;
      if (!node) return api.toast('Select a text layer first.');
      const name = await api.ask('Save text style', node.get('name') || 'Body');
      if (!name) return;
      run(() => {
        const item = service.create(name, node);
        api.commands.execute(setProjectSectionCommand(api.projectState, 'textStyles', [...service.list(), item], 'save-text-style'));
        api.toast(`Text style “${item.name}” saved.`);
      });
    };
    content.querySelectorAll('[data-text-style-apply]').forEach(button => button.onclick = () => {
      const node = api.selected;
      run(() => {
        if (!node || node.get('type') !== 'text') throw new Error('Select a text layer first.');
        const entry = service.list().find(item => item.id === button.dataset.textStyleApply);
        if (!entry) throw new Error('That text style no longer exists.');
        api.commands.execute({
          id: 'apply-text-style',
          apply() { return applyTextStyle(node, entry.style); },
          revert(previous) { node.setStyle(previous); },
        });
      });
    });
    content.querySelectorAll('[data-text-style-delete]').forEach(button => button.onclick = () => run(() => {
      const next = service.list().filter(item => item.id !== button.dataset.textStyleDelete);
      api.commands.execute(setProjectSectionCommand(api.projectState, 'textStyles', next, 'delete-text-style'));
    }));
  }
  return { render: renderView };
}
