/**
 * ui/actionRouter.js
 * Phase 2対応: ナビゲーション制御を追加
 */

import { UI } from './index.js';

const ACTION_MAP = {
    // --- ナビゲーション (Phase 3 Group A用) ---
    'switch-tab': (data) => UI.switchTab(data.tab), // data-tab="home" etc.
    
    // --- モダル制御 ---
    'toggle-modal': (data) => UI.toggleModal(data.target),
    'close-modal': (data) => UI.closeModal(data.target),
    
    // --- 記録フォーム ---
    'open-check': (data) => UI.openCheckModal(data.date),
    'open-beer': (data) => UI.openBeerModal(null, data.date),
    'open-exercise': (data) => UI.openManualInput(data.date),
    
    // --- 詳細・リスト操作 ---
    'open-day-detail': (data) => UI.openDayDetail(data.date),
    'toggle-edit-mode': () => UI.toggleEditMode(),
    'toggle-select-all': () => UI.toggleSelectAll(),
    'delete-selected': () => UI.deleteSelectedLogs(),
    
    // --- その他機能 ---
    'share': () => UI.openShareModal(),
    'open-settings': () => UI.renderSettings(),
    'open-help': () => UI.openHelp(),
    'open-timer': () => UI.openTimer(),
};

const handleGlobalClick = (event) => {
    const target = event.target.closest('[data-action]');
    if (!target) return;

    const actionName = target.dataset.action;
    const handler = ACTION_MAP[actionName];

    if (handler) {
        event.preventDefault();
        handler(target.dataset, event);
        console.debug(`[ActionRouter] Executed: ${actionName}`, target.dataset);
    } else {
        console.warn(`[ActionRouter] Unknown action: ${actionName}`);
    }
};

export const initActionRouter = () => {
    if (document.body.getAttribute('data-router-init') === 'true') return;
    document.body.addEventListener('click', handleGlobalClick);
    document.body.setAttribute('data-router-init', 'true');
    console.log('[ActionRouter] Initialized');
};