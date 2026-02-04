import { Calc } from '../logic.js';
import { Store } from '../store.js';
import { DOM } from './dom.js';

export function renderLiverRank(checks, logs) {
    const profile = Store.getProfile();
    const gradeData = Calc.getRecentGrade(checks, logs, profile);

    const cleanLabel = gradeData.label;
    
    const card = DOM.elements['liver-rank-card'] || document.getElementById('liver-rank-card');
    if(!card) return;

    let theme = {
        bg: "", darkBg: "",
        text: "text-gray-800", darkText: "dark:text-white",
        icon: "text-gray-400",
        bar: "bg-gray-500"
    };

    // ▼▼▼ 修正: 判定順序を変更（Rookieを最優先） ▼▼▼
    if (gradeData.isRookie) {
        // Rookie / Beginner 用のテーマ
        if (gradeData.rank.includes('S')) theme.icon = 'ph-star';      // 新星
        else if (gradeData.rank.includes('A')) theme.icon = 'ph-fire'; // 期待の星
        else theme.icon = 'ph-egg';                                    // 駆け出し/たまご
        
        // logic.js で定義された色（オレンジやグレー等）を優先適用
        theme.bg = gradeData.bg || "bg-orange-50"; 
        theme.text = gradeData.color || "text-orange-900";
        theme.bar = "bg-orange-500"; // プログレスバーもオレンジに

    } else if (gradeData.rank.includes('S')) {
        theme = { 
            bg: "bg-purple-50", darkBg: "dark:bg-purple-900/20",
            text: "text-purple-900", darkText: "dark:text-purple-100",
            icon: "ph-crown", bar: "bg-purple-500"
        };
    } else if (gradeData.rank.includes('A')) {
        theme = { 
            bg: "bg-indigo-50", darkBg: "dark:bg-indigo-900/20",
            text: "text-indigo-900", darkText: "dark:text-indigo-100",
            icon: "ph-shield-check", bar: "bg-indigo-500"
        };
    } else if (gradeData.rank.includes('B')) {
        theme = { 
            bg: "bg-emerald-50", darkBg: "dark:bg-emerald-900/20",
            text: "text-emerald-900", darkText: "dark:text-emerald-100",
            icon: "ph-leaf", bar: "bg-emerald-500"
        };
    } else {
        // Cランク または その他
        theme = { 
            bg: "bg-red-50", darkBg: "dark:bg-red-900/20",
            text: "text-red-900", darkText: "dark:text-red-100",
            icon: "ph-warning", bar: "bg-red-500"
        };
    }

    let progressPercent = 0;
    let nextText = "Max Level";
    
    if (gradeData.next) {
        if (gradeData.isRookie) {
            progressPercent = (gradeData.rawRate / gradeData.targetRate) * 100;
            nextText = `Next: +${Math.round((gradeData.targetRate - gradeData.rawRate) * 100)}%`;
        } else {
            progressPercent = Math.min(100, (gradeData.current / gradeData.next) * 100);
            const remaining = gradeData.next - gradeData.current;
            nextText = `Next: ${remaining} days`;
        }
    }

    // 【修正ポイント】構造を checkStatus.js と完全に一致させる
    // min-h-[140px] に固定し、flex-col justify-between で配置
    card.className = `glass-panel p-4 rounded-2xl relative overflow-hidden group cursor-pointer transition hover:border-opacity-50 flex flex-col justify-between h-full min-h-[140px] ${theme.bg} ${theme.darkBg}`;
    
    card.innerHTML = `
        <div class="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition transform group-hover:scale-110 duration-500">
            <i class="ph-fill ph-trophy text-5xl ${theme.icon}"></i>
        </div>
        
        <div class="relative z-10 flex flex-col h-full justify-between">
            <!-- Header Section -->
            <div>
                <div class="flex items-center gap-2 mb-1.5 h-4"> <!-- 高さ固定 -->
                    <span class="text-[10px] font-bold uppercase tracking-widest opacity-60 ${theme.text} ${theme.darkText}">LIVER RANK</span>
                </div>
                
                <div class="flex flex-col items-start min-h-[3.5rem] justify-center"> <!-- 高さ確保 -->
                    <span class="text-3xl font-black ${theme.text} ${theme.darkText} leading-none tracking-tight">${gradeData.rank}</span>
                    <span class="text-xs font-bold opacity-80 ${theme.text} ${theme.darkText} mt-1">${gradeData.label}</span>
                </div>
            </div>

            <!-- Footer Section -->
            <div class="mt-2">
                <div class="flex justify-between items-end mb-1">
                    <span class="text-[10px] font-bold opacity-60 ${theme.text} ${theme.darkText}">Progress</span>
                    <span class="text-[10px] font-bold ${theme.text} ${theme.darkText}">${Math.round(progressPercent)}%</span>
                </div>
                <div class="w-full h-1.5 bg-black/5 dark:bg-white/10 rounded-full overflow-hidden">
                    <div class="h-full ${theme.bar} rounded-full transition-all duration-1000 ease-out" style="width: ${progressPercent}%"></div>
                </div>
                <p class="text-[10px] mt-1 text-right font-medium opacity-70 ${theme.text} ${theme.darkText}">
                    ${nextText}
                </p>
            </div>
        </div>
    `;

}
