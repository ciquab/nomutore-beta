/**
 * ui/actionRouter.js
 * Phase 2対応: 循環依存を解消
 */

/**
 * ActionRouter - Complete Implementation
 * HTML属性ベースのイベントハンドリングシステム
 * UIモジュールに依存せず、純粋なイベントルーターとして動作
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
            
            // エラー時はカスタムイベントを発火（UI層で処理）
            document.dispatchEvent(new CustomEvent('action-error', {
                detail: { action, error: error.message }
            }));
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
            
            // 引数の取得（複数の方法をサポート）
            let args;
            
            // 1. data-args 属性 (JSON形式)
            if (target.dataset.args) {
                try {
                    args = JSON.parse(target.dataset.args);
                } catch (err) {
                    console.error(`[ActionRouter] Failed to parse args:`, target.dataset.args);
                    args = target.dataset.args; // フォールバック
                }
            }
            // 2. data-payload 属性 (repeat アクション用)
            else if (target.dataset.payload) {
                try {
                    args = JSON.parse(target.dataset.payload);
                } catch (err) {
                    console.error(`[ActionRouter] Failed to parse payload:`, target.dataset.payload);
                    args = target.dataset.payload;
                }
            }
            // 3. その他の data-* 属性をすべて渡す
            else if (Object.keys(target.dataset).length > 1) {
                args = { ...target.dataset };
                delete args.action; // action自体は除外
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
    console.log('[ActionRouter] ✅ Initialized and ready');
};