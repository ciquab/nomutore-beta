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

/**
 * ActionRouter - Complete Implementation
 * HTML属性ベースのイベントハンドリングシステム（完全版）
 * window汚染を防ぎ、イベントハンドラーを集中管理します
 */

export class ActionRouter {
    constructor() {
        this.handlers = new Map();
        this.initialized = false;
    }

    /**
     * アクションハンドラーを登録
     * @param {string} action - アクション名 (例: "ui:switchTab")
     * @param {Function} handler - ハンドラー関数
     */
    register(action, handler) {
        if (this.handlers.has(action)) {
            console.warn(`[ActionRouter] Action "${action}" is already registered. Overwriting.`);
        }
        this.handlers.set(action, handler);
        console.log(`[ActionRouter] Registered: ${action}`);
    }

    /**
     * 複数のアクションを一括登録
     * @param {Object} actions - { "action:name": handlerFn, ... }
     */
    registerBulk(actions) {
        Object.entries(actions).forEach(([action, handler]) => {
            this.register(action, handler);
        });
    }

    /**
     * アクションを実行
     * @param {string} action - アクション名
     * @param {any} args - 引数（data-args属性からパース）
     * @param {Event} event - 元のDOMイベント
     */
    async handle(action, args, event) {
        const handler = this.handlers.get(action);
        
        if (!handler) {
            console.warn(`[ActionRouter] No handler found for action: "${action}"`);
            return;
        }

        try {
            // 引数が配列の場合はスプレッドして渡す
            if (Array.isArray(args)) {
                await handler(...args, event);
            } else if (args !== undefined) {
                await handler(args, event);
            } else {
                await handler(event);
            }
        } catch (error) {
            console.error(`[ActionRouter] Error in handler for "${action}":`, error);
            
            // ユーザーにエラー通知（UIがある場合）
            if (window.UI && window.UI.showMessage) {
                window.UI.showMessage('操作中にエラーが発生しました', 'error');
            }
        }
    }

    /**
     * イベント委譲の初期化（DOMContentLoaded後に1回だけ実行）
     */
    init() {
        if (this.initialized) {
            console.warn('[ActionRouter] Already initialized.');
            return;
        }

        // クリックイベントの委譲
        document.addEventListener('click', (e) => {
            const target = e.target.closest('[data-action]');
            if (!target) return;

            const action = target.dataset.action;
            const argsStr = target.dataset.args;
            
            let args;
            try {
                // JSON形式の引数をパース
                args = argsStr ? JSON.parse(argsStr) : undefined;
            } catch (err) {
                console.error(`[ActionRouter] Failed to parse args for "${action}":`, argsStr);
                args = argsStr; // フォールバック: 文字列として渡す
            }

            this.handle(action, args, e);
        });

        // change イベントの委譲（select, input用）
        document.addEventListener('change', (e) => {
            const target = e.target.closest('[data-action-change]');
            if (!target) return;

            const action = target.dataset.actionChange;
            const value = target.value;
            
            this.handle(action, value, e);
        });

        this.initialized = true;
        console.log('[ActionRouter] Event delegation initialized.');
    }

    /**
     * 登録されているアクション一覧をデバッグ出力
     */
    debug() {
        console.log('[ActionRouter] Registered actions:');
        console.table(Array.from(this.handlers.keys()));
    }

    /**
     * 特定のアクションの登録を解除
     */
    unregister(action) {
        if (this.handlers.has(action)) {
            this.handlers.delete(action);
            console.log(`[ActionRouter] Unregistered: ${action}`);
            return true;
        }
        return false;
    }

    /**
     * すべてのアクションをクリア
     */
    clear() {
        this.handlers.clear();
        console.log('[ActionRouter] All actions cleared.');
    }
}

// シングルトンインスタンス
export const actionRouter = new ActionRouter();

/**
 * 初期化関数（main.jsから呼び出す用）
 */
export const initActionRouter = () => {
    actionRouter.init();
};