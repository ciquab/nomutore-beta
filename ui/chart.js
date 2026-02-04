import { Calc } from '../logic.js';
import { Store } from '../store.js';
import { StateManager } from './state.js';
import { DOM } from './dom.js';
import dayjs from 'https://cdn.jsdelivr.net/npm/dayjs@1.11.10/+esm';

export function renderChart(logs, checks) {
    // まず古いCanvasを取得（IDで検索）
    const oldCanvas = document.getElementById('balanceChart');
    if (!oldCanvas || typeof Chart === 'undefined') return;

    // フィルタボタンの更新
    const filters = DOM.elements['chart-filters'] || document.getElementById('chart-filters');
    if(filters) {
        filters.querySelectorAll('button').forEach(btn => {
            const isActive = btn.dataset.range === StateManager.chartRange;
            btn.className = `px-2 py-1 text-[10px] font-bold rounded-md transition-all ${
                isActive ? "active-filter bg-white dark:bg-gray-600 text-indigo-600 dark:text-indigo-300 shadow-sm" 
                         : "text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
            }`;
        });
    }

    try {
        // 1. 既存のチャートインスタンスがあれば破棄
        const existingChart = Chart.getChart(oldCanvas);
        if (existingChart) {
            existingChart.destroy();
        }

        // ▼▼▼ 追加: Canvas要素自体を再生成してメモリリークを防止 (Memory Leak Fix) ▼▼▼
        const parent = oldCanvas.parentNode;
        const newCanvas = document.createElement('canvas');
        
        // IDとクラス名を引き継ぐ
        newCanvas.id = 'balanceChart';
        newCanvas.className = oldCanvas.className; 
        
        // 古いCanvasを新しいCanvasに置換（これで古いリスナーも消滅）
        parent.replaceChild(newCanvas, oldCanvas);

        // 以降は新しいCanvasに対して描画を行う
        const ctxCanvas = newCanvas;
        // ▲▲▲ 追加終了 ▲▲▲

        const now = dayjs();
        let cutoffDate = StateManager.chartRange === '1w' ? now.subtract(7, 'day').valueOf() :
                         StateManager.chartRange === '1m' ? now.subtract(1, 'month').valueOf() :
                         now.subtract(3, 'month').valueOf();

        const profile = Store.getProfile();
        const baseEx = profile.baseExercise || 'walking';

        // --- データセット準備 ---
        const dateMap = new Map();
        
        let current = dayjs(cutoffDate);
        const end = dayjs();
        while(current.isBefore(end) || current.isSame(end, 'day')) {
            const dStr = current.format('MM/DD');
            // ★修正1: earned(稼ぎ)とconsumed(消費)を別々に集計するための箱を用意
            dateMap.set(dStr, { date: dStr, earned: 0, consumed: 0, weight: null, hasWeight: false });
            current = current.add(1, 'day');
        }

        logs.forEach(l => {
            if (l.timestamp >= cutoffDate) {
                const dStr = dayjs(l.timestamp).format('MM/DD');
                if (dateMap.has(dStr)) {
                    const val = l.kcal !== undefined ? l.kcal : (l.minutes * Calc.burnRate(6.0, profile));
                    
                    // ★修正2: プラスならEarned、マイナスならConsumedに加算（相殺させない）
                    if (val > 0) {
                        dateMap.get(dStr).earned += val;
                    } else {
                        dateMap.get(dStr).consumed += val; // 負の値として加算
                    }
                }
            }
        });

        checks.forEach(c => {
            if (c.timestamp >= cutoffDate && c.weight) {
                const dStr = dayjs(c.timestamp).format('MM/DD');
                if (dateMap.has(dStr)) {
                    dateMap.get(dStr).weight = parseFloat(c.weight);
                    dateMap.get(dStr).hasWeight = true;
                }
            }
        });

        const dataArray = Array.from(dateMap.values());

        const weights = dataArray.filter(d => d.hasWeight).map(d => d.weight);
        let weightMin = 40, weightMax = 100;
        if (weights.length > 0) {
            weightMin = Math.min(...weights) - 2.0;
            weightMax = Math.max(...weights) + 2.0;
        }

        const isDark = document.documentElement.classList.contains('dark');
        const textColor = isDark ? '#9CA3AF' : '#6B7280';
        const gridColor = isDark ? 'rgba(75, 85, 99, 0.2)' : 'rgba(229, 231, 235, 0.5)';

        const newChart = new Chart(ctxCanvas, {
            type: 'bar',
            data: {
                labels: dataArray.map(d => d.date),
                datasets: [
                    { 
                        label: 'Earned', 
                        // ★修正3: 純粋な稼ぎ分を表示
                        data: dataArray.map(d => Math.round(Calc.convertKcalToMinutes(d.earned, baseEx, profile))), 
                        backgroundColor: '#10B981', 
                        borderRadius: 4,
                        stack: '0', 
                        order: 2,
                        yAxisID: 'y'
                    },
                    { 
                        label: 'Consumed', 
                        // ★修正4: 純粋な消費（飲酒）分を表示。負の値なのでグラフは下向きに伸びます
                        data: dataArray.map(d => Math.round(Calc.convertKcalToMinutes(d.consumed, baseEx, profile))), 
                        backgroundColor: '#EF4444', 
                        borderRadius: 4,
                        stack: '0', 
                        order: 3,
                        yAxisID: 'y'
                    },
                    {
                        type: 'line',
                        label: 'Weight',
                        data: dataArray.map(d => d.weight),
                        borderColor: '#6366F1',
                        backgroundColor: '#6366F1',
                        borderWidth: 2,
                        pointRadius: 3,
                        tension: 0.3,
                        yAxisID: 'y1',
                        order: 1,
                        spanGaps: true
                    }
                ] 
            },
            options: { 
                responsive: true, 
                maintainAspectRatio: false, 
                scales: { 
                    x: { 
                        stacked: true,
                        ticks: { color: textColor, font: { size: 10 } },
                        grid: { display: false }
                    }, 
                    y: { 
                        beginAtZero: true, // 0を基準に上下に伸びる
                        position: 'left',
                        title: { display: false },
                        ticks: { color: textColor, font: { size: 10 } },
                        grid: { color: gridColor }
                    },
                    y1: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        min: weightMin,
                        max: weightMax,
                        grid: { drawOnChartArea: false },
                        ticks: { color: '#6366F1', font: { size: 10, weight: 'bold' } }
                    }
                }, 
                plugins: { 
                    legend: { 
                        display: true, 
                        position: 'bottom', 
                        labels: { color: textColor, boxWidth: 10, font: { size: 10 } } 
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false
                    }
                } 
            }
        });
        
        if (StateManager.setChart) {
            StateManager.setChart(newChart);
        }

    } catch(e) { console.error('Chart Error', e); }
}