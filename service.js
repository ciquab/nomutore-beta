import { db, Store } from './store.js';
import { Calc, getVirtualDate } from './logic.js';
import { APP, EXERCISE, STYLE_SPECS } from './constants.js';
import dayjs from 'https://cdn.jsdelivr.net/npm/dayjs@1.11.10/+esm';

// ヘルパー: 月曜始まりの週頭を取得
const getStartOfWeek = (date = undefined) => {
    const d = dayjs(date);
    const day = d.day() || 7; // Sun(0)を7に変換 (Mon=1 ... Sun=7)
    return d.subtract(day - 1, 'day').startOf('day');
};

/**
 * チェックデータの重複を排除し、保存済みデータを優先する内部ヘルパー
 */
const _deduplicateChecks = (rawChecks) => {
    return Object.values(rawChecks.reduce((acc, cur) => {
        const dateStr = dayjs(cur.timestamp).format('YYYY-MM-DD');
        // まだデータがない、または「既存が未保存」で「今回が保存済み」なら採用
        if (!acc[dateStr] || (!acc[dateStr].isSaved && cur.isSaved)) {
            acc[dateStr] = cur;
        }
        return acc;
    }, {}));
};

export const Service = {

    // getAllDataForUI を getAppDataSnapshot にリネームして強化
    getAppDataSnapshot: async () => {
        const mode = localStorage.getItem(APP.STORAGE_KEYS.PERIOD_MODE) || 'weekly';
        const startStr = localStorage.getItem(APP.STORAGE_KEYS.PERIOD_START);
        const start = startStr ? parseInt(startStr) : 0;

        // 1. 全生データを取得
        const allLogs = await db.logs.toArray();
        const rawChecks = await db.checks.toArray();
        
        // 2. [追加] データのクレンジング（重複排除）
        const checks = _deduplicateChecks(rawChecks);

        // 3. 期間内データの抽出
        let periodLogs = allLogs;
        if (mode !== 'permanent') {
            periodLogs = allLogs.filter(l => l.timestamp >= start);
        }

        // 4. [追加] カロリー収支の合計計算
        // UI側でやっていた計算をここに集約
        const balance = periodLogs.reduce((sum, l) => sum + (l.kcal || 0), 0);

        // 5. キャッシュの更新（既存ロジック）
        Store.setCachedData(allLogs, checks, periodLogs);

        // 6. 全て「調理済み」の状態で返す
        return { 
            logs: periodLogs, 
            checks, 
            allLogs, 
            balance, 
            mode 
        };
    },

    getAllDataForUI: async () => {
        const { logs, checks, allLogs } = await Service.getAppDataSnapshot();
        return { logs, checks, allLogs };
    },

    getLogsWithPagination: async (offset, limit) => {
        const mode = localStorage.getItem(APP.STORAGE_KEYS.PERIOD_MODE) || 'weekly';
        let logs, totalCount;

        if (mode === 'permanent') {
            totalCount = await db.logs.count();
            logs = await db.logs.orderBy('timestamp').reverse().offset(offset).limit(limit).toArray();
        } else {
            const periodStart = parseInt(localStorage.getItem(APP.STORAGE_KEYS.PERIOD_START)) || 0;
            totalCount = await db.logs.where('timestamp').aboveOrEqual(periodStart).count();
            logs = await db.logs.where('timestamp').aboveOrEqual(periodStart).reverse().offset(offset).limit(limit).toArray();
        }

        return { logs, totalCount };
    },

    ensureTodayCheckRecord: async () => {
        const todayStr = getVirtualDate(); 
        
        // startOfDay / endOfDay も仮想日付ベースで計算
        const vDate = dayjs(todayStr);
        const startOfDay = vDate.startOf('day').valueOf();
        const endOfDay = vDate.endOf('day').valueOf();

        try {
            const existing = await db.checks.where('timestamp').between(startOfDay, endOfDay).first();
            if (!existing) {
                // レコードがなければ空で作る（チェック忘れ防止のUXのため）
                await db.checks.add({
                    timestamp: dayjs().valueOf(),
                    isDryDay: false,
                    waistEase: false,
                    footLightness: false,
                    waterOk: false,
                    fiberOk: false,
                    weight: null
                });
            }
        } catch (e) {
            console.error('[Service] Failed to ensure today check record:', e);
        }
    },

    /**
     * 履歴の再計算（Race Condition対策済み版）
     * トランザクション内で実行することで、計算中のデータ競合を防ぐ
     */
    recalcImpactedHistory: async (changedTimestamp) => {
        // 'rw' (読み書き) モードでトランザクションを開始
        // logs, checks, period_archives の3つのテーブルをロックします
        return db.transaction('rw', db.logs, db.checks, db.period_archives, async () => {
            
            // 1. 全データを取得（計算用）
            // トランザクション内なので、この時点でデータはロックされています
            const allLogs = await db.logs.toArray();
            const allChecks = await db.checks.toArray();
            const profile = Store.getProfile();

            // --- Optimization: Pre-calculate Maps to avoid O(N^2) ---
            const logMap = new Map();
            const checkMap = new Map();
            let minTs = Number.MAX_SAFE_INTEGER;
            let found = false;

            allLogs.forEach(l => {
                if (l.timestamp < minTs) minTs = l.timestamp;
                found = true;
                const d = getVirtualDate(l.timestamp);
                if (!logMap.has(d)) logMap.set(d, { hasBeer: false, hasExercise: false, balance: 0 });
                
                const entry = logMap.get(d);
                if (l.type === 'beer') entry.hasBeer = true;
                if (l.type === 'exercise') entry.hasExercise = true;
                
                if (l.kcal !== undefined) {
                    entry.balance += l.kcal;
                } else if (l.type === 'exercise') {
                    const mets = EXERCISE[l.exerciseKey] ? EXERCISE[l.exerciseKey].mets : 3.0;
                    const burn = Calc.calculateExerciseBurn(mets, l.minutes, profile);
                    entry.balance += burn;
                } else if (l.type === 'beer') {
                    // ★修正: 固定値 -140 をやめ、データから算出
                    const ml = parseInt(l.size) || 350;
                    const abv = parseFloat(l.abv) || 5.0;
                    const spec = STYLE_SPECS[l.style] || { carb: 3.0 };
                    entry.balance += Calc.calculateBeerDebit(ml, abv, spec.carb, l.count || 1);
                }
            });

            allChecks.forEach(c => {
                if (c.timestamp < minTs) minTs = c.timestamp;
                found = true;
                const d = getVirtualDate(c.timestamp);
                checkMap.set(d, c.isDryDay);
            });

            const firstDate = found ? dayjs(minTs).startOf('day') : dayjs();

            // 運動ログを日付で高速検索するためのMapを作成
            const exerciseLogsByDate = new Map();
            allLogs.forEach(l => {
                if (l.type === 'exercise') {
                    const dStr = getVirtualDate(l.timestamp);
                    if (!exerciseLogsByDate.has(dStr)) {
                        exerciseLogsByDate.set(dStr, []);
                    }
                    exerciseLogsByDate.get(dStr).push(l);
                }
            });

            // ----------------------------------------

            // --- 2. 変更日以降のすべての日付について再計算 ---
// ★物理日付ではなく、仮想日付（深夜4時まで前日）を起点にする
const virtualStartDateStr = getVirtualDate(changedTimestamp);
const startDate = dayjs(virtualStartDateStr).startOf('day');
const today = dayjs().endOf('day'); // 今日まで計算

let currentDate = startDate;
let updateCount = 0;
let safeGuard = 0;

while (currentDate.isBefore(today) || currentDate.isSame(today, 'day')) {
    if (safeGuard++ > 3650) break;

    const dateStr = currentDate.format('YYYY-MM-DD');
    
    // その日のストリークを判定（logMapとcheckMapは既に仮想日付で作成されているため、これでOK）
    const streak = Calc.getStreakFromMap(logMap, checkMap, firstDate, currentDate);
    
    // その日の運動ログを取得
    const daysExerciseLogs = exerciseLogsByDate.get(dateStr) || [];
    
    for (const log of daysExerciseLogs) {
        const mets = EXERCISE[log.exerciseKey]?.mets || 3.0;
        const baseBurn = Calc.calculateExerciseBurn(mets, log.minutes, profile);
        const updatedCredit = Calc.calculateExerciseCredit(baseBurn, streak);
        
        // メモの更新
        let newMemo = log.memo || '';
        newMemo = newMemo.replace(/Streak Bonus x[0-9.]+/g, '').trim();
        if (updatedCredit.bonusMultiplier > 1.0) {
            newMemo = newMemo ? `${newMemo} Streak Bonus x${updatedCredit.bonusMultiplier.toFixed(1)}` : `Streak Bonus x${updatedCredit.bonusMultiplier.toFixed(1)}`;
        }

        // 差分があればDB更新
        if (Math.abs((log.kcal || 0) - updatedCredit.kcal) > 0.1 || log.memo !== newMemo) {
            await db.logs.update(log.id, {
                kcal: updatedCredit.kcal,
                memo: newMemo
            });
            
            // 地図上の残高も更新して、次の日の計算に繋げる
            const entry = logMap.get(dateStr);
            if (entry) entry.balance += (updatedCredit.kcal - (log.kcal || 0));
            
            updateCount++;
        }
    }
    currentDate = currentDate.add(1, 'day');
}

            if (updateCount > 0) {
                console.log(`[Service] Recalculated ${updateCount} exercise logs due to streak change.`);
            }

            // 3. 過去アーカイブ（期間確定済みデータ）の再集計
            try {
                // トランザクション内なので一貫性が保たれます
                const affectedArchives = await db.period_archives.where('endDate').aboveOrEqual(changedTimestamp).toArray();
                
                for (const archive of affectedArchives) {
                    // ★修正: if (archive.startDate <= changedTimestamp) を削除
                    // 理由: ストリーク変更の影響は未来に及ぶため、修正日より後に開始したアーカイブも更新する必要があるからです。
                    
                    // queryでendDateによる絞り込みは済んでいるため、ここは無条件で更新してOKです
                    // もし念を入れるなら if (archive.endDate >= changedTimestamp) ですが、クエリと同じ意味なので省略可
                        const periodLogs = await db.logs.where('timestamp').between(archive.startDate, archive.endDate, true, true).toArray();
                        const totalBalance = periodLogs.reduce((sum, log) => sum + (log.kcal || 0), 0);
                        
                        // ▼▼▼ 修正: logs (中身の配列) も最新状態で上書きする ▼▼▼
                        await db.period_archives.update(archive.id, {
                            totalBalance: totalBalance,
                            logs: periodLogs, // <--- これを追加！ これで「ゾンビログ」が消滅します
                            updatedAt: Date.now()
                        });
                        // ▲▲▲ 修正終了 ▲▲▲
                }
            } catch (e) {
                console.error('[Service] Failed to update archives within transaction:', e);
                throw e; // エラーを投げてトランザクションをロールバックさせる
            }
        });
    },

    /**
    * 期間設定の更新とデータ移行（復元）の実行
    * @param {string} newMode - 'weekly' | 'monthly' | 'permanent' | 'custom'
    * @param {Object} customData - { startDate, endDate, label } (Customモード時のみ)
    * @returns {Promise<Object|null>} 処理結果
    */
    updatePeriodSettings: async (newMode, customData = {}) => {
        const currentMode = localStorage.getItem(APP.STORAGE_KEYS.PERIOD_MODE);
    
        // モード変更の保存
        localStorage.setItem(APP.STORAGE_KEYS.PERIOD_MODE, newMode);

        let restoredCount = 0;

        if (newMode === 'custom') {
            // --- Customモードのロジックを集約 ---
            if (customData.startDate) {
                localStorage.setItem(APP.STORAGE_KEYS.PERIOD_START, dayjs(customData.startDate).startOf('day').valueOf());
            }
            if (customData.endDate) {
                localStorage.setItem(APP.STORAGE_KEYS.PERIOD_END_DATE, dayjs(customData.endDate).endOf('day').valueOf());
            }
            if (customData.label) {
                localStorage.setItem(APP.STORAGE_KEYS.CUSTOM_LABEL, customData.label || 'Project');
            }
        } else if (newMode === 'permanent') {
            // --- Permanentモード（過去ログ復元） ---
            const archives = await db.period_archives.toArray();
            if (archives.length > 0) {
                for (const arch of archives) {
                    if (arch.logs && arch.logs.length > 0) {
                        const logsToRestore = arch.logs.map(({id, ...rest}) => rest);
                        await db.logs.bulkAdd(logsToRestore);
                        restoredCount += logsToRestore.length;
                    }
                }
                await db.period_archives.clear();
                localStorage.setItem(APP.STORAGE_KEYS.PERIOD_START, 0); 
            }
        } else {
            // --- 通常モード (Weekly/Monthly) ---
            const start = Service.calculatePeriodStart(newMode);
            localStorage.setItem(APP.STORAGE_KEYS.PERIOD_START, start);
        }

        return {
            mode: newMode,
            restoredCount: restoredCount
        };
    },

    /**
     * プロフィール情報の保存
     * @param {Object} data - { weight, height, age, gender }
     */
    updateProfile: async (data) => {
        const keys = APP.STORAGE_KEYS;
        if (data.weight) localStorage.setItem(keys.WEIGHT, data.weight);
        if (data.height) localStorage.setItem(keys.HEIGHT, data.height);
        if (data.age)    localStorage.setItem(keys.AGE, data.age);
        if (data.gender) localStorage.setItem(keys.GENDER, data.gender);
        return { success: true };
    },

    /**
     * アプリケーション基本設定の保存
     * @param {Object} data - { mode1, mode2, baseExercise, defaultRecordExercise, theme }
     */
    updateAppSettings: async (data) => {
        const keys = APP.STORAGE_KEYS;
        if (data.mode1) localStorage.setItem(keys.MODE1, data.mode1);
        if (data.mode2) localStorage.setItem(keys.MODE2, data.mode2);
        if (data.baseExercise) localStorage.setItem(keys.BASE_EXERCISE, data.baseExercise);
        if (data.defaultRecordExercise) localStorage.setItem(keys.DEFAULT_RECORD_EXERCISE, data.defaultRecordExercise);
        if (data.theme) localStorage.setItem(keys.THEME, data.theme);
        return { success: true };
    },

    calculatePeriodStart: (mode) => {
        const now = dayjs();
        if (mode === 'weekly') {
            return getStartOfWeek(now).valueOf();
        } else if (mode === 'monthly') {
            return now.startOf('month').valueOf();
        } else if (mode === 'custom') {
            // カスタム期間は「現在」を起点にする
            return now.startOf('day').valueOf();
        }
        return 0;
    },

    // ★修正: 自動リセット処理を抜本的に変更
    checkPeriodRollover: async () => {
        const mode = localStorage.getItem(APP.STORAGE_KEYS.PERIOD_MODE) || APP.DEFAULTS.PERIOD_MODE;
        
        // Permanentモードならリセットしない
        if (mode === 'permanent') return false;

        const storedStart = parseInt(localStorage.getItem(APP.STORAGE_KEYS.PERIOD_START));
        
        // 初回起動時など
        if (!storedStart) {
            const newStart = Service.calculatePeriodStart(mode);
            localStorage.setItem(APP.STORAGE_KEYS.PERIOD_START, newStart);
            return false;
        }

        const now = dayjs();
        let nextStart = null;

        // --- A. Weekly / Monthly (自動更新) ---
        if (mode === 'weekly') {
            const currentWeekStart = getStartOfWeek(now);
            const startDate = dayjs(storedStart);
            if (!currentWeekStart.isSame(startDate, 'day')) {
                // 週が変わっている -> 自動アーカイブ実行
                nextStart = currentWeekStart.valueOf();
                await Service.archiveAndReset(storedStart, nextStart, mode);
                return true; // -> UI側で「Weekly Report」モーダルを表示
            }
        } else if (mode === 'monthly') {
            const currentMonthStart = now.startOf('month');
            const startDate = dayjs(storedStart);
            if (!currentMonthStart.isSame(startDate, 'day')) {
                // 月が変わっている -> 自動アーカイブ実行
                nextStart = currentMonthStart.valueOf();
                await Service.archiveAndReset(storedStart, nextStart, mode);
                return true; // -> UI側で「Monthly Report」モーダルを表示
            }
        } 
        // --- B. Custom (手動更新待機) ---
        else if (mode === 'custom') {
            const endDateTs = parseInt(localStorage.getItem(APP.STORAGE_KEYS.PERIOD_END_DATE));
            
            // 終了日が設定されており、かつ今日がその日を過ぎている場合
            if (endDateTs && now.isAfter(dayjs(endDateTs).endOf('day'))) {
                // ★アーカイブは実行しない
                // UI側に「期間終了」だけを伝え、選択肢を表示させる
                return true; 
            }
        }

        return false;
    },

    // ★追加: アーカイブ作成と期間リセットを行う独立メソッド
    // checkPeriodRollover から切り出しました
    archiveAndReset: async (currentStart, nextStart, mode) => {
        return db.transaction('rw', db.logs, db.period_archives, async () => {
            // 次の期間開始日より前のログを全て取得
            const logsToArchive = await db.logs.where('timestamp').below(nextStart).toArray();
            
            if (logsToArchive.length > 0) {
                // 既に同じ開始日のアーカイブが存在しないかチェック
                const existingArchive = await db.period_archives
                    .where('startDate').equals(currentStart)
                    .first();

                if (!existingArchive) {
                    const totalBalance = logsToArchive.reduce((sum, l) => sum + (l.kcal || 0), 0);
                    
                    await db.period_archives.add({
                        startDate: currentStart,
                        endDate: nextStart - 1,
                        mode: mode,
                        totalBalance: totalBalance,
                        logs: logsToArchive, 
                        createdAt: Date.now()
                    });
                } else {
                    console.warn('[Service] Archive for this period already exists. Skipping creation.');
                }
            }

            // 期間開始日を更新
            localStorage.setItem(APP.STORAGE_KEYS.PERIOD_START, nextStart);
        });
    },

    /**
     * ★追加: よく飲むビールを取得（ランキング集計）
     * Recordタブで使用 (Frequency)
     */
    getFrequentBeers: async (limit = 3) => {
        const logs = await db.logs.where('type').equals('beer').toArray();
        const stats = Calc.getBeerStats(logs);
        const rankedBeers = stats.beerStats || [];
        return rankedBeers.slice(0, limit);
    },

    /**
     * ★修正: 直近のビールログを取得
     * インデックスに頼らず、全ログを「登録順(ID降順)」で取得してJS側でフィルタリングする
     * これにより、確実に「さっき登録したデータ」を取得できます。
     */
    getRecentBeers: async (limit = 2) => {
        // 1. 最新のログ100件をID降順（新しい順）で取得
        const logs = await db.logs.toCollection().reverse().limit(100).toArray();
        
        const uniqueMap = new Map();
        const recents = [];
        
        for (const log of logs) {
            // ビール以外はスキップ
            if (log.type !== 'beer') continue;

            // 銘柄が違えば別物とみなす
            // ブランドがある場合は "Brand_Name"、ない場合は "_Name"
            const key = `${log.brand || ''}_${log.name}`;
            
            if (!uniqueMap.has(key)) {
                uniqueMap.set(key, true);
                recents.push(log);
            }
            if (recents.length >= limit) break;
        }
        return recents;
    },

    /**
     * ★追加: よくやる運動を取得（頻度順）
     * Recordタブで使用 (Frequency)
     */
    getFrequentExercises: async (limit = 5) => {
        // 1. 直近100件取得
        const logs = await db.logs.where('type').equals('exercise').reverse().limit(100).toArray();

        // 2. 集計
        const stats = {};
        logs.forEach(log => {
            const key = `${log.name}_${log.minutes}`;
            if (!stats[key]) {
                stats[key] = { count: 0, data: log, lastSeen: log.timestamp };
            }
            stats[key].count++;
            if (log.timestamp > stats[key].lastSeen) {
                stats[key].lastSeen = log.timestamp;
                stats[key].data = log;
            }
        });

        // 3. ソートして上位N件を返す
        return Object.values(stats)
            .sort((a, b) => {
                if (b.count !== a.count) return b.count - a.count; // 回数優先
                return b.lastSeen - a.lastSeen; // 新しさ優先
            })
            .map(item => item.data)
            .slice(0, limit);
    },

    /**
     * ★修正: 直近の運動ログを取得
     * こちらも同様にID降順で取得するように変更
     */
    getRecentExercises: async (limit = 2) => {
        // 1. 最新のログ100件をID降順（新しい順）で取得
        const logs = await db.logs.toCollection().reverse().limit(100).toArray();
        
        const uniqueMap = new Map();
        const recents = [];
        
        for (const log of logs) {
            // 運動以外はスキップ
            if (log.type !== 'exercise') continue;
            
            if (!log.exerciseKey) continue;

            const key = `${log.exerciseKey}-${log.minutes}`;
            if (!uniqueMap.has(key)) {
                uniqueMap.set(key, true);
                recents.push(log);
            }
            if (recents.length >= limit) break;
        }
        return recents;
    },

    /**
     * ログを複製して今日の日付で登録（リピート機能）
     * UI/index.js から呼ばれる
     */
    repeatLog: async (log) => {
        if (log.type === 'beer') {
            return await Service.saveBeerLog({
                ...log,
                timestamp: Date.now(),
                isCustom: log.isCustom || false,
                useUntappd: false 
            }, null);
        } else {
            return await Service.saveExerciseLog(
                log.exerciseKey,
                log.minutes,
                Date.now(), // 仮想日付ではなく、現在の正確な時刻を刻む
                true, 
                null
            );
        }
    },

    // --- 以下、シェア機能追加のために修正されたメソッド ---

   saveBeerLog: async (data, id = null) => {
    let name, kcal, abv, carb;
    // ★追加: 戻り値で使う変数をあらかじめ初期化しておく
    let dryDayCanceled = false;
    let untappdUrl = null;

    // beerForm で確定済みの値をそのまま信頼する
    const count = data.count ?? 1; 
    abv = data.abv;
    const ml = data.ml;
    carb = data.carb ?? (data.isCustom ? (data.type === 'dry' ? 0.0 : 3.0) : (STYLE_SPECS[data.style]?.carb ?? 3.0));
    kcal = Calc.calculateBeerDebit(ml, abv, carb, count);

    name = data.isCustom
        ? (data.type === 'dry' ? '蒸留酒 (糖質ゼロ)' : '醸造酒/カクテル')
        : `${data.style}${count !== 1 ? ` x${count}` : ''}`;

    const logData = {
        timestamp: data.timestamp,
        type: 'beer',
        name: name,
        kcal: kcal, 
        style: data.isCustom ? 'Custom' : data.style,
        size: data.isCustom ? null : data.size, // UI用
        rawAmount: ml,   
        count,
        abv: abv,
        brewery: data.brewery,
        brand: data.brand,
        rating: data.rating,
        memo: data.memo,
        isCustom: data.isCustom,
        customType: data.isCustom ? data.type : null
    };

        // --- ログ保存（新規 or 更新） ---
            if (id) {
                await db.logs.update(parseInt(id), logData);
            } else {
               await db.logs.add(logData);
            }

        // --- Untappd導線の生成（保存後に実行） ---
            if (data.useUntappd && data.brewery && data.brand) {
            const query = encodeURIComponent(`${data.brewery} ${data.brand}`);
            untappdUrl = `https://untappd.com/search?q=${query}`;
            }

        // --- ★ここを修正：仮想日付（Virtual Date）に基づいてチェックを探す ---
    const vDateStr = getVirtualDate(data.timestamp); // 深夜4時までなら前日の日付を取得
    const vDay = dayjs(vDateStr);
    const start = vDay.startOf('day').valueOf();
    const end = vDay.endOf('day').valueOf();
    
    // 物理的な timestamp ではなく、その「仮想日」の範囲で検索
    const existingChecks = await db.checks.where('timestamp').between(start, end, true, true).toArray();

    if (existingChecks.length > 0) {
        // 最も重要な1件（既存レコード）を「休肝日なし」に更新
        const primaryCheck = existingChecks[0];
        if (primaryCheck.isDryDay) {
            await db.checks.update(primaryCheck.id, { isDryDay: false });
            dryDayCanceled = true;
        }

        // JSONで見られた「重複レコード」があれば、このタイミングで削除して掃除する
        if (existingChecks.length > 1) {
            const redundantIds = existingChecks.slice(1).map(c => c.id);
            await db.checks.bulkDelete(redundantIds);
            console.log(`[Service] Cleaned up ${redundantIds.length} redundant checks for consistency.`);
        }
    }

    // 3. スナップショットから最新バランスを取得してシェア文言作成
    const { balance } = await Service.getAppDataSnapshot();
    const shareText = Calc.generateShareText(logData, balance);
    const shareAction = { 
        type: 'share', 
        text: shareText, 
        shareMode: 'image', 
        imageType: 'beer', 
        imageData: logData 
    };

    // 4. 履歴再計算（これでストリークも最新ログを反映して計算されます）
    await Service.recalcImpactedHistory(data.timestamp);

    return {
        success: true,
        isUpdate: !!id,
        kcal: kcal,
        dryDayCanceled: dryDayCanceled,
        shareAction: shareAction,
        untappdUrl: untappdUrl
    };
},

    saveExerciseLog: async (exerciseKey, minutes, dateVal, applyBonus, id = null) => {
    const profile = Store.getProfile();
    const mets = EXERCISE[exerciseKey] ? EXERCISE[exerciseKey].mets : 3.0;
    
    // 1. 基礎燃焼カロリー計算
    const baseBurnKcal = Calc.calculateExerciseBurn(mets, minutes, profile);
    let finalKcal = baseBurnKcal;
    let memo = '';
    let bonusMultiplier = 1.0;

    let ts;
    if (typeof dateVal === 'number') {
        ts = dateVal;
    } else {
        ts = dayjs(dateVal).startOf('day').add(12, 'hour').valueOf();
    }
    
    // 2. ストリークボーナスの計算
    if (applyBonus) {
        const logs = await db.logs.toArray();
        const checks = await db.checks.toArray();
        const streak = Calc.getCurrentStreak(logs, checks, profile, dayjs(ts));
        
        const creditInfo = Calc.calculateExerciseCredit(baseBurnKcal, streak);
        finalKcal = creditInfo.kcal;
        bonusMultiplier = creditInfo.bonusMultiplier;
        
        if (bonusMultiplier > 1.0) {
            memo = `Streak Bonus x${bonusMultiplier.toFixed(1)}`;
        }
    }

    const label = EXERCISE[exerciseKey] ? EXERCISE[exerciseKey].label : '運動';

    const logData = {
        timestamp: ts,
        type: 'exercise',
        name: label,
        kcal: finalKcal,
        minutes: minutes,
        exerciseKey: exerciseKey,
        rawMinutes: minutes,
        memo: memo
    };
    
    let shareAction = null;

    if (id) {
        // 更新
        await db.logs.update(parseInt(id), logData);
    } else {
        // 新規登録
        await db.logs.add(logData);

        // シェア文言の生成
        const { balance } = await Service.getAppDataSnapshot();
        const shareText = Calc.generateShareText(logData, balance);
        shareAction = { type: 'share', text: shareText };
    }

    // データの整合性維持（これはServiceの仕事）
    await Service.recalcImpactedHistory(ts);

    // ★重要: UI層への「報告書」を返却
    return {
        success: true,
        isUpdate: !!id,
        kcal: finalKcal,
        bonusMultiplier: bonusMultiplier,
        shareAction: shareAction
    };
},

/**
 * ログを1件削除する
 * @returns {Promise<{success: boolean, timestamp: number}>}
 */
deleteLog: async (id) => {
    const logId = parseInt(id);
    const log = await db.logs.get(logId);
    if (!log) throw new Error('削除対象のログが見つかりませんでした');

    const ts = log.timestamp;
    await db.logs.delete(logId);

    // 履歴の再計算（データ整合性の維持はServiceの責務）
    await Service.recalcImpactedHistory(ts);

    // 削除したデータの情報を返却する
    return { success: true, timestamp: ts };
},

/**
 * ログをまとめて削除する
 * @param {Array<number>} ids
 * @returns {Promise<{success: boolean, count: number, oldestTs: number}>}
 */
bulkDeleteLogs: async (ids) => {
    if (!ids || ids.length === 0) return { success: false, count: 0 };

    // 再計算のために最も古い日付を取得
    let oldestTs = Date.now();
    for (const id of ids) {
        const log = await db.logs.get(id);
        if (log && log.timestamp < oldestTs) oldestTs = log.timestamp;
    }

    await db.logs.bulkDelete(ids);
    
    // 履歴の再計算
    await Service.recalcImpactedHistory(oldestTs);

    return { 
        success: true, 
        count: ids.length, 
        oldestTs: oldestTs 
    };
},

    /**
 * デイリーチェックの保存
 * @param {Object} formData
 * @returns {Promise<Object>} 処理結果報告
 */
saveDailyCheck: async (formData) => {
    // 1. 日付の正規化
    const targetDay = dayjs(formData.date);
    const ts = targetDay.startOf('day').add(12, 'hour').valueOf();
    const start = targetDay.startOf('day').valueOf();
    const end = targetDay.endOf('day').valueOf();
    
    // 2. 既存レコードの確認（重複対策ロジックはServiceの責務として維持）
    const existingRecords = await db.checks
        .where('timestamp')
        .between(start, end, true, true)
        .toArray();

    // 3. 保存データの構築
    const data = {
        timestamp: ts,
        isDryDay: formData.isDryDay,
        weight: formData.weight,
        isSaved: true
    };

    // カスタム項目をマージ
    Object.keys(formData).forEach(key => {
        if (key !== 'date') data[key] = formData[key];
    });

    const isUpdate = existingRecords.length > 0;

    if (isUpdate) {
        // 更新 & 重複削除
        const primaryId = existingRecords[0].id;
        await db.checks.update(primaryId, data);

        if (existingRecords.length > 1) {
            const redundantIds = existingRecords.slice(1).map(r => r.id);
            await db.checks.bulkDelete(redundantIds);
            console.log(`[Service] Cleaned up ${redundantIds.length} duplicate records.`);
        }
    } else {
        // 新規登録
        await db.checks.add(data);
    }
    
    // 体重をプロフィール設定に反映（データの同期もServiceの責務）
    if (formData.weight) {
        localStorage.setItem(APP.STORAGE_KEYS.WEIGHT, formData.weight);
    }

    // 4. 履歴の再計算
    await Service.recalcImpactedHistory(ts);

    // 5. UI側での演出に必要なアクションを構築
    let shareAction = null;
    if (formData.isDryDay) {
        const shareText = Calc.generateShareText({ type: 'check', isDryDay: true });
        shareAction = { type: 'share', text: shareText };
    }

    // 「報告書」を返す
    return {
        success: true,
        isUpdate: isUpdate,
        isDryDay: formData.isDryDay,
        shareAction: shareAction
    };
},
};

