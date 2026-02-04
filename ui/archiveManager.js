import { db } from '../store.js';
import dayjs from 'https://cdn.jsdelivr.net/npm/dayjs@1.11.10/+esm';

export async function renderArchives() {
    const container = document.getElementById('view-cellar-archives');
    if (!container) return;

    // DBからアーカイブ取得 (新しい順)
    const archives = await db.period_archives.reverse().toArray();

    if (archives.length === 0) {
        container.innerHTML = `
            <div class="flex flex-col items-center justify-center h-64 text-gray-400">
                <i class="ph-duotone ph-archive text-4xl mb-2"></i>
                <p class="text-sm font-bold">No archives yet.</p>
                <p class="text-xs opacity-60">Complete a period to see it here.</p>
            </div>
        `;
        return;
    }

    const html = archives.map(arch => {
        const start = dayjs(arch.startDate).format('YYYY/MM/DD');
        const end = dayjs(arch.endDate).format('MM/DD');
        const balance = arch.totalBalance || 0;
        const isPositive = balance >= 0;
        
        const statusColor = isPositive ? 'text-emerald-500 bg-emerald-50 dark:bg-emerald-900/20' : 'text-red-500 bg-red-50 dark:bg-red-900/20';
        const sign = isPositive ? '+' : '';

        return `
            <div class="glass-panel p-4 rounded-2xl mb-3 flex items-center justify-between group active:scale-95 transition cursor-pointer">
                <div>
                    <div class="flex items-center gap-2 mb-1">
                        <span class="text-[10px] font-bold uppercase text-gray-400 px-1.5 py-0.5 border border-gray-200 dark:border-gray-700 rounded">${arch.mode || 'Weekly'}</span>
                        <span class="text-xs font-bold text-gray-600 dark:text-gray-300">${start} - ${end}</span>
                    </div>
                    <div class="text-[10px] text-gray-400">ID: #${arch.id}</div>
                </div>
                <div class="flex flex-col items-end">
                    <span class="text-lg font-black ${isPositive ? 'text-emerald-500' : 'text-red-500'}">
                        ${sign}${Math.round(balance)} <span class="text-xs font-bold text-gray-400">kcal</span>
                    </span>
                    <span class="text-[10px] font-bold px-2 py-0.5 rounded-full ${statusColor}">
                        ${isPositive ? 'Success' : 'Debt'}
                    </span>
                </div>
            </div>
        `;
    }).join('');

    container.innerHTML = `<div class="pb-20">${html}</div>`;
}