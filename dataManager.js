import { APP } from './constants.js';
import { db, Store } from './store.js';
import { Calc } from './logic.js';
import { UI, updateBeerSelectOptions, refreshUI } from './ui/index.js';
import { CloudManager } from './cloudManager.js';

export const DataManager = {

// --- 共通ロジック (Internal) ---

    /**
     * バックアップ用の全データオブジェクトを生成する
     */
    getBackupObject: async () => {
        const logs = await db.logs.toArray();
        const checks = await db.checks.toArray();
        // v4で追加されたarchivesテーブルもあれば取得
        let archives = [];
        if (db.period_archives) {
            archives = await db.period_archives.toArray();
        }

        const settings = {};
        Object.values(APP.STORAGE_KEYS).forEach(key => {
            const val = localStorage.getItem(key);
            if (val !== null) settings[key] = val;
        });

        return {
            version: 4.0,
            exportedAt: Date.now(),
            data: { logs, checks, archives },
            settings: settings,
            device: navigator.userAgent
        };
    },

    /**
     * オブジェクトデータからDBを復元する
     */
    restoreFromObject: async (d) => {
        // バージョン判定
        const isV4 = d.version && d.version >= 4.0;
        const logs = isV4 ? d.data.logs : (d.logs || []);
        const checks = isV4 ? d.data.checks : (d.checks || []);
        const archives = isV4 ? (d.data.archives || []) : [];

        // 確認
        if (!confirm(`ログ ${logs.length}件、チェック ${checks.length}件を復元しますか？\n(既存データと重複するものはスキップされます)`)) {
            return false;
        }

        try {
            // Logs
            if (logs.length > 0) {
                const existingLogs = await db.logs.toArray();
                // 重複排除キー: timestampとtypeの組み合わせ
                const existingLogKeys = new Set(existingLogs.map(l => `${l.timestamp}_${l.type}`));
                
                const uniqueLogs = logs
                    .filter(l => !existingLogKeys.has(`${l.timestamp}_${l.type}`))
                    .map(l => {
                        const { id, ...rest } = l; // IDを除外して新規採番
                        return rest;
                    });
                    
                if (uniqueLogs.length > 0) {
                    await db.logs.bulkAdd(uniqueLogs);
                }
            }

            // Checks
            if (checks.length > 0) {
                const existingChecks = await db.checks.toArray();
                const existingCheckTimestamps = new Set(existingChecks.map(c => c.timestamp));
                
                const uniqueChecks = checks
                    .filter(c => !existingCheckTimestamps.has(c.timestamp))
                    .map(c => {
                        const { id, ...rest } = c;
                        return rest;
                    });
                if (uniqueChecks.length > 0) {
                    await db.checks.bulkAdd(uniqueChecks);
                }
            }
            
            // Archives (v4)
            if (archives.length > 0 && db.period_archives) {
                const existingArch = await db.period_archives.toArray();
                const existingArchKeys = new Set(existingArch.map(a => `${a.startDate}_${a.endDate}`));
                
                const uniqueArch = archives
                    .filter(a => !existingArchKeys.has(`${a.startDate}_${a.endDate}`))
                    .map(a => { const { id, ...rest } = a; return rest; });
                
                if (uniqueArch.length > 0) await db.period_archives.bulkAdd(uniqueArch);
            }

            // Settings
            if (isV4 && d.settings) {
                Object.entries(d.settings).forEach(([key, val]) => {
                    localStorage.setItem(key, val);
                });
            }

            // UI更新
            UI.updateModeSelector();
            updateBeerSelectOptions(); 
            UI.applyTheme(localStorage.getItem(APP.STORAGE_KEYS.THEME) || 'system');

            // ★追加: 設定画面の入力欄を最新のデータで上書き表示する
            if (UI.renderSettings) {
                UI.renderSettings();
               }

            await refreshUI(); 
            
            return true;
        } catch(err) {
            console.error(err);
            throw new Error('データの復元中にエラーが発生しました');
        }
    },

    // --- クラウド連携 (Google Drive) ---

    backupToCloud: async () => {
        const statusEl = document.getElementById('cloud-status');
        try {
            if(statusEl) statusEl.textContent = 'Preparing backup...';
            
            // 1. データ生成
            const backupData = await DataManager.getBackupObject();
            
            // 2. アップロード
            if(statusEl) statusEl.textContent = 'Uploading to Google Drive...';
            await CloudManager.uploadBackup(backupData);
            
            UI.showMessage('☁️ Googleドライブに保存しました', 'success');
            if(statusEl) statusEl.textContent = `Last Backup: ${new Date().toLocaleString()}`;
            
        } catch (err) {
            console.error(err);
            UI.showMessage('バックアップ失敗: コンソールを確認してください', 'error');
            if(statusEl) statusEl.textContent = 'Error: Backup failed';
        }
    },

    restoreFromCloud: async () => {
        const statusEl = document.getElementById('cloud-status');
        try {
            if(statusEl) statusEl.textContent = 'Connecting to Google Drive...';
            
            // 1. ダウンロード
            const data = await CloudManager.downloadBackup();
            if (!data) {
                UI.showMessage('ドライブ上にバックアップが見つかりません', 'error');
                if(statusEl) statusEl.textContent = 'File not found';
                return;
            }

            // 2. 復元処理
            if(statusEl) statusEl.textContent = 'Restoring data...';
            const success = await DataManager.restoreFromObject(data);
            
            if (success) {
                UI.showMessage('☁️ ドライブから復元しました', 'success');
                if(statusEl) statusEl.textContent = 'Restore Complete';

                // メッセージを読ませてからリロード
                setTimeout(() => window.location.reload(), 2000);
            } else {
                if(statusEl) statusEl.textContent = 'Restore Cancelled';
            }

        } catch (err) {
            console.error(err);
            UI.showMessage('復元失敗: コンソールを確認してください', 'error');
            if(statusEl) statusEl.textContent = 'Error: Restore failed';
        }
    },

    // --- 既存機能 (File/CSV) ---

    /**
     * CSVエクスポート
     * @param {string} type - 'logs' | 'checks'
     */
    exportCSV: async (type) => { 
        let data = [], content = "", filename = ""; 
        const escapeCSV = (s) => `"${String(s).replace(/"/g,'""')}"`; 
        
        if(type === 'logs'){ 
            data = await db.logs.toArray();
            data.sort((a,b) => a.timestamp - b.timestamp);
            
            const profile = Store.getProfile();

            content = "日時,内容,カロリー(kcal),換算分(ステッパー),実運動時間(分),ブルワリー,銘柄,評価,メモ\n" + 
                data.map(r => {
                    const rawMin = r.rawMinutes !== undefined ? r.rawMinutes : '-';
                    // kcalがない場合は補完
                    const kcal = r.kcal !== undefined ? Math.round(r.kcal) : Math.round(r.minutes * Calc.burnRate(6.0, profile));
                    return `${new Date(r.timestamp).toLocaleString()},${escapeCSV(r.name)},${kcal},${r.minutes},${rawMin},${escapeCSV(r.brewery||'')},${escapeCSV(r.brand||'')},${r.rating||''},${escapeCSV(r.memo||'')}`;
                }).join("\n");
            filename = `nomutore_logs_${new Date().toISOString().slice(0,10)}.csv`;
        } else if (type === 'checks') {
            data = await db.checks.toArray();
            data.sort((a,b) => a.timestamp - b.timestamp);
            content = "日時,休肝日,腹囲,足軽,水分,食物繊維,体重\n" + 
                data.map(r => `${new Date(r.timestamp).toLocaleString()},${r.isDryDay},${r.waistEase},${r.footLightness},${r.waterOk},${r.fiberOk},${r.weight||''}`).join("\n");
            filename = `nomutore_checks_${new Date().toISOString().slice(0,10)}.csv`;
        }
        
        DataManager.download(content, filename, 'text/csv');
    },

    /**
     * 【改修】JSONバックアップ (Full Dump)
     * v4対応: logs, checks, period_archives, settings を全て出力
     */
    exportJSON: async () => {
        const backupData = await DataManager.getBackupObject();
        const jsonStr = JSON.stringify(backupData, null, 2);
        const filename = `nomutore_backup_v4_${new Date().toISOString().slice(0,10)}.json`;
        DataManager.download(jsonStr, filename, 'application/json');
    },

    /**
     * JSONインポート (v4対応)
     * onboarding.js から await できるように Promise 化
     */
    importJSON: (inputElement) => { 
        return new Promise((resolve, reject) => {
            if (!inputElement.files.length) return resolve(false); 
            
            const f = inputElement.files[0]; 
            const r = new FileReader(); 
            
            r.onload = async (e) => { 
                try { 
                    const rawContent = e.target.result;
                    const jsonString = rawContent.charCodeAt(0) === 0xFEFF 
                        ? rawContent.slice(1) 
                        : rawContent;

                    const d = JSON.parse(jsonString); 
                    
                    // 1. 復元処理を実行（確認ダイアログが出ます）
                    const success = await DataManager.restoreFromObject(d);
                    
                    // 2. ★メッセージ表示を残す
                    if (success) {
                        UI.showMessage('✅ バックアップから復元しました', 'success');

                        // メッセージを読ませてからリロード
                        setTimeout(() => window.location.reload(), 2000);
                    }

                    // 3. 呼び出し元（onboarding.js等）に結果を返す
                    resolve(success);
                } catch(err) { 
                    console.error(err);
                    UI.showMessage('読込失敗: データ形式が不正です', 'error'); 
                    reject(err); 
                } 
                inputElement.value = ''; 
            }; 
            r.onerror = () => reject(new Error('File reading failed'));
            r.readAsText(f); 
        });
    },

    download: (data, filename, type) => { 
        const blob = new Blob([new Uint8Array([0xEF,0xBB,0xBF]), data], {type: type});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); 
        a.href = url; 
        a.download = filename; 
        a.click();
        setTimeout(() => { URL.revokeObjectURL(url); }, 100); 
    }
};