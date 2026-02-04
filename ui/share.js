import { toPng } from 'https://cdn.jsdelivr.net/npm/html-to-image@1.11.11/+esm';
import { APP } from '../constants.js';
import { Store } from '../store.js';
import { Calc } from '../logic.js';
import { showMessage, Feedback, escapeHtml, toggleModal } from './dom.js';
import dayjs from 'https://cdn.jsdelivr.net/npm/dayjs@1.11.10/+esm';

/* =========================================
   Share Engine (Photo Composer)
   ========================================= */

// 画像編集用の状態管理
let editState = {
    scale: 1.0,
    x: 0,
    y: 0,
    isDragging: false,
    startX: 0,
    startY: 0,
    aspectRatio: '1 / 1',
    fontClass: 'font-sans'
};

export const Share = {
    generateAndShare: async (mode = 'status', data = null) => {
        if (mode === 'beer') {
            startBeerPhotoFlow(data);
        } else {
            generateGraphicCard(mode, data);
        }
    }
};

/* --- 1. Photo Flow (Beer) --- */

const startBeerPhotoFlow = (logData) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.style.display = 'none';
    document.body.appendChild(input);

    input.onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (readerEvent) => {
                // 状態リセット
                editState = { 
                    scale: 1.0, 
                    x: 0, 
                    y: 0, 
                    isDragging: false, 
                    startX: 0, 
                    startY: 0, 
                    aspectRatio: '1 / 1', 
                    fontClass: 'font-sans' 
                };
                openPhotoComposer(readerEvent.target.result, logData);
            };
            reader.readAsDataURL(file);
        } else {
            if(confirm('写真なしでシェア用カードを作成しますか？')) {
                generateGraphicCard('beer', logData);
            }
        }
        input.remove();
    };
    input.click();
};

const openPhotoComposer = (imgSrc, log) => {
    const existing = document.getElementById('share-composer-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'share-composer-modal';
    modal.className = "fixed inset-0 z-[9999] bg-base-950 flex flex-col animate-fade-in";

    const brand = log.brand || log.name;
    const brewery = log.brewery || '';
    const kcal = Math.abs(Math.round(log.kcal));
    const date = dayjs(log.timestamp).format('YYYY.MM.DD');
    const logoSrc = "./logo-header.png";

    // アスペクト比定義
    const ratios = [
        { label: '1:1', value: '1 / 1', icon: 'ph-square' },
        { label: '3:4', value: '3 / 4', icon: 'ph-rectangle', class: 'rotate-90' }, 
        { label: '9:16', value: '9 / 16', icon: 'ph-device-mobile' },
        { label: '4:3', value: '4 / 3', icon: 'ph-rectangle', class: 'rotate-0' },  
        { label: '16:9', value: '16 / 9', icon: 'ph-monitor' }
    ];

    // ボタン生成（コンパクト化: p-1.5, gap-0.5）
    const ratioButtonsHtml = ratios.map(r => `
        <button class="ratio-btn flex flex-col items-center gap-0.5 p-1.5 rounded-lg transition shrink-0 ${editState.aspectRatio === r.value ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}" 
                data-value="${r.value}">
            <i class="ph-bold ${r.icon} text-lg inline-block ${r.class || ''}"></i>
            <span class="text-[9px] font-bold scale-90 origin-top">${r.label}</span>
        </button>
    `).join('');

       // ▼ 追加: フォント定義リスト
    const fonts = [
        { label: 'Sans', value: 'font-sans', family: 'Noto Sans JP' },
        { label: 'Mincho', value: 'font-mincho', family: 'Shippori Mincho B1' },
        { label: 'Gothic', value: 'font-heavy', family: 'Dela Gothic One' },
        { label: 'Brush', value: 'font-brush', family: 'Yuji Syuku' },
        { label: 'Pixel', value: 'font-dot', family: 'DotGothic16' }
    ];
 
    // フォントボタン生成（コンパクト化: py-1, text-[10px]）
    const fontButtonsHtml = fonts.map(f => `
        <button class="font-btn px-3 py-1 rounded-lg border border-gray-700 transition shrink-0 text-[10px] font-bold ${editState.fontClass === f.value ? 'bg-indigo-600 text-white border-indigo-500' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}" 
                data-value="${f.value}" style="font-family: '${f.family}';">
            ${f.label}
        </button>
    `).join('');

    modal.innerHTML = `
        <style>
            @import url('https://fonts.googleapis.com/css2?family=Dela+Gothic+One&family=DotGothic16&family=Noto+Sans+JP:wght@500;700;900&family=Shippori+Mincho+B1:wght@700&family=Yuji+Syuku&display=swap');
            .font-sans { font-family: 'Noto Sans JP', sans-serif; }
            .font-mincho { font-family: 'Shippori Mincho B1', serif; }
            .font-heavy { font-family: 'Dela Gothic One', sans-serif; letter-spacing: 0.05em; }
            .font-brush { font-family: 'Yuji Syuku', serif; }
            .font-dot { font-family: 'DotGothic16', sans-serif; }
        </style>

        <div class="px-4 py-2 flex justify-between items-center bg-base-900 text-white z-20 border-b border-white/10 shrink-0">
            <button id="btn-cancel-composer" class="text-xs font-bold text-gray-300 hover:text-white py-2">Cancel</button>
            <h3 class="font-black text-xs tracking-widest">EDIT PHOTO</h3>
            <button id="btn-generate-share" class="text-xs font-bold text-indigo-400 hover:text-indigo-300 py-2">Next</button>
        </div>

        <div id="composer-touch-area" class="flex-1 min-h-0 flex items-center justify-center bg-black overflow-hidden relative cursor-move touch-none p-1">
            
            <div id="composer-canvas" class="relative bg-gray-900 shadow-2xl overflow-hidden pointer-events-none transition-all duration-300 ease-out w-full h-auto max-w-md max-h-full ${editState.fontClass}" 
                 style="aspect-ratio: ${editState.aspectRatio};">
                
                <img id="composer-img" src="${imgSrc}" class="absolute inset-0 w-full h-full object-cover origin-center transition-transform duration-75 ease-linear will-change-transform">

                <div class="absolute top-0 left-0 w-full h-[25%] bg-gradient-to-b from-black/70 to-transparent pointer-events-none z-10"></div>
                <div class="absolute bottom-0 left-0 w-full h-[35%] bg-gradient-to-t from-black/90 to-transparent pointer-events-none z-10"></div>

                <div class="absolute top-5 left-5 z-20 drop-shadow-md">
                    <p class="text-[10px] font-bold text-gray-200 tracking-widest opacity-90 leading-none" style="font-family: 'Noto Sans JP', sans-serif;">
                        ${date} | NOMUTORE
                    </p>
                </div>

                <div id="composer-stats" class="absolute top-4 right-5 z-20 drop-shadow-md text-right transition-opacity duration-300">
                    <div class="flex flex-col items-end">
                        <span class="text-3xl font-black text-white leading-none tracking-tighter">-${kcal}</span>
                        <span class="text-[9px] font-bold text-red-400 uppercase tracking-wider mt-0.5">DEBT CREATED (kcal)</span>
                    </div>
                </div>

                <div class="absolute bottom-5 left-5 right-5 z-20 flex items-end gap-3">
                    <div class="w-12 h-12 bg-white/10 backdrop-blur-md rounded-xl border border-white/20 flex items-center justify-center shadow-lg overflow-hidden p-1 shrink-0">
                         <img src="${logoSrc}" class="w-full h-full object-contain opacity-90 drop-shadow-sm" crossorigin="anonymous">
                    </div>
                    <div class="flex flex-col justify-center pb-0.5 drop-shadow-md flex-1 min-w-0">
                        <span class="text-xl font-bold text-white leading-tight line-clamp-2 break-words">${escapeHtml(brand)}</span>
                        ${brewery ? `<span class="text-xs font-bold text-gray-300 mt-0.5 truncate">${escapeHtml(brewery)}</span>` : ""}
                    </div>
                </div>
            </div>
            
            <div id="grid-overlay" class="absolute pointer-events-none opacity-20 flex items-center justify-center border border-white/50 border-dashed transition-all duration-300 ease-out w-full h-auto max-w-md max-h-full"
                 style="aspect-ratio: ${editState.aspectRatio};">
            </div>
        </div>

        <div class="bg-base-900 border-t border-gray-800 z-20 flex flex-col pb-safe shrink-0">
            
            <div class="flex gap-2 px-4 py-1 overflow-x-auto border-b border-gray-800 scrollbar-hide justify-center">
                ${ratioButtonsHtml}
            </div>

            <div class="flex gap-2 px-4 py-1 overflow-x-auto border-b border-gray-800 scrollbar-hide justify-start bg-base-950/50">
                <span class="text-[9px] font-bold text-gray-500 self-center mr-1">FONT</span>
                ${fontButtonsHtml}
            </div>

            <div class="px-4 py-2 flex flex-col gap-2">
                <div class="flex items-center gap-3">
                    <i class="ph-bold ph-minus text-gray-500 text-xs"></i>
                    <input type="range" id="zoom-slider" min="0.5" max="3.0" step="0.01" value="1.0" class="flex-1 accent-indigo-500 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer">
                    <i class="ph-bold ph-plus text-gray-500 text-xs"></i>
                </div>

                <div class="flex items-center justify-between">
                    <label class="flex items-center gap-2 cursor-pointer bg-gray-800/50 px-2 py-1 rounded-lg active:bg-gray-800 transition">
                        <div class="relative inline-flex items-center">
                            <input type="checkbox" id="toggle-kcal" class="sr-only peer" checked>
                            <div class="w-6 h-3.5 bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-2.5 after:w-2.5 after:transition-all peer-checked:bg-indigo-500"></div>
                        </div>
                        <span class="text-[9px] font-bold text-gray-400">Calories</span>
                    </label>
                    
                    <span class="text-[9px] text-gray-600 font-bold flex items-center gap-1">
                        <i class="ph-bold ph-hand-pointing"></i> Drag & Pinch
                    </span>
                </div>
            </div>
            </div>
    `;

    document.body.appendChild(modal);

    // --- Logic ---
    const canvas = modal.querySelector('#composer-canvas');
    const grid = modal.querySelector('#grid-overlay');
    const imgEl = modal.querySelector('#composer-img');
    const zoomSlider = modal.querySelector('#zoom-slider');
    const touchArea = modal.querySelector('#composer-touch-area');
    const toggleKcal = modal.querySelector('#toggle-kcal');
    const statsEl = modal.querySelector('#composer-stats'); 
    
    const btnCancel = modal.querySelector('#btn-cancel-composer');
    const btnGenerate = modal.querySelector('#btn-generate-share');

    // Ratio Switch
    const ratioBtns = modal.querySelectorAll('.ratio-btn');
    ratioBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            editState.aspectRatio = btn.dataset.value;
            editState.scale = 1.0; editState.x = 0; editState.y = 0;
            updateTransform();
            
            canvas.style.aspectRatio = editState.aspectRatio;
            grid.style.aspectRatio = editState.aspectRatio;

            ratioBtns.forEach(b => {
                const isActive = b === btn;
                b.classList.toggle('bg-indigo-600', isActive);
                b.classList.toggle('text-white', isActive);
                b.classList.toggle('bg-gray-800', !isActive);
                b.classList.toggle('text-gray-400', !isActive);
            });
            Feedback.tap();
        });
    });

    // Font Switch
    const fontBtns = modal.querySelectorAll('.font-btn');
    fontBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            if (editState.fontClass) canvas.classList.remove(editState.fontClass);
            editState.fontClass = btn.dataset.value;
            canvas.classList.add(editState.fontClass);

            fontBtns.forEach(b => {
                const isActive = b === btn;
                b.classList.toggle('bg-indigo-600', isActive);
                b.classList.toggle('text-white', isActive);
                b.classList.toggle('border-indigo-500', isActive);
                b.classList.toggle('bg-gray-800', !isActive);
                b.classList.toggle('text-gray-400', !isActive);
            });
            Feedback.tap();
        });
    });

    // Pan & Zoom logic
    const updateTransform = () => {
        imgEl.style.transform = `translate(${editState.x}px, ${editState.y}px) scale(${editState.scale})`;
        zoomSlider.value = editState.scale;
    };

    if(zoomSlider) {
        zoomSlider.oninput = (e) => {
            editState.scale = parseFloat(e.target.value);
            updateTransform();
        };
    }

    const handleStart = (clientX, clientY) => {
        editState.isDragging = true;
        editState.startX = clientX - editState.x;
        editState.startY = clientY - editState.y;
    };

    const handleMove = (clientX, clientY) => {
        if (!editState.isDragging) return;
        editState.x = clientX - editState.startX;
        editState.y = clientY - editState.startY;
        updateTransform();
    };

    const handleEnd = () => { editState.isDragging = false; };

    // Multi-touch (Pinch) variables
    let initialPinchDist = 0;
    let startScale = 1.0;

    const getDistance = (touch1, touch2) => {
        return Math.hypot(touch1.clientX - touch2.clientX, touch1.clientY - touch2.clientY);
    };

    if(touchArea) {
        touchArea.addEventListener('mousedown', (e) => handleStart(e.clientX, e.clientY));
        window.addEventListener('mousemove', (e) => handleMove(e.clientX, e.clientY));
        window.addEventListener('mouseup', handleEnd);

        touchArea.addEventListener('touchstart', (e) => {
            if (e.touches.length === 1) {
                handleStart(e.touches[0].clientX, e.touches[0].clientY);
            } else if (e.touches.length === 2) {
                editState.isDragging = false;
                initialPinchDist = getDistance(e.touches[0], e.touches[1]);
                startScale = editState.scale;
            }
        }, { passive: false });

        touchArea.addEventListener('touchmove', (e) => {
            e.preventDefault();
            if (e.touches.length === 1) {
                handleMove(e.touches[0].clientX, e.touches[0].clientY);
            } else if (e.touches.length === 2) {
                const dist = getDistance(e.touches[0], e.touches[1]);
                if (initialPinchDist > 0) {
                    const ratio = dist / initialPinchDist;
                    const newScale = Math.min(Math.max(startScale * ratio, 0.5), 3.0);
                    editState.scale = newScale;
                    updateTransform();
                }
            }
        }, { passive: false });

        touchArea.addEventListener('touchend', (e) => {
            handleEnd();
            if (e.touches.length < 2) {
                initialPinchDist = 0;
            }
        });
    }

    if(toggleKcal) {
        toggleKcal.onchange = (e) => {
            if(statsEl) statsEl.classList.toggle('opacity-0', !e.target.checked);
            Feedback.tap();
        };
    }

    if(btnCancel) btnCancel.onclick = () => modal.remove();

    if(btnGenerate) {
        btnGenerate.onclick = async () => {
            const loadingId = showLoadingOverlay('画像を生成中...');
            btnGenerate.disabled = true;
            try {
                const dataUrl = await toPng(canvas, {
                    quality: 0.95, pixelRatio: 2, cacheBust: true,
                    style: { transform: 'scale(1)', transformOrigin: 'top left' }
                });
                const blob = await (await fetch(dataUrl)).blob();
                const file = new File([blob], `nomutore_beer_${dayjs().format('YYYYMMDD')}.png`, { type: 'image/png' });
                
                hideLoadingOverlay(loadingId);
                modal.remove();
                showPreviewModal(dataUrl, file);
            } catch (e) {
                console.error(e);
                hideLoadingOverlay(loadingId);
                showMessage('画像生成に失敗しました', 'error');
                btnGenerate.disabled = false;
            }
        };
    }
};

/* --- 2. Graphic Flow (Fallback) --- */

const generateGraphicCard = async (mode, data) => {
    const loadingId = showLoadingOverlay('画像を生成しています...');
    try {
        const container = document.createElement('div');
        container.style.position = 'fixed';
        container.style.top = '-9999px';
        container.style.left = '-9999px';
        container.style.width = '600px'; 
        container.style.zIndex = '-1';
        document.body.appendChild(container);

        renderStatusCard(container, data); 

        await new Promise(r => setTimeout(r, 800));

        const targetElement = container.firstElementChild;
        if (!targetElement) throw new Error('Render failed');

        const dataUrl = await toPng(targetElement, { quality: 0.95, pixelRatio: 2, cacheBust: true });
        document.body.removeChild(container);
        hideLoadingOverlay(loadingId);

        const blob = await (await fetch(dataUrl)).blob();
        const file = new File([blob], `nomutore_share.png`, { type: 'image/png' });

        showPreviewModal(dataUrl, file);

    } catch (error) {
        console.error('Share generation failed:', error);
        if (document.getElementById(loadingId)) hideLoadingOverlay(loadingId);
        showMessage('画像の生成に失敗しました', 'error');
    }
};

/* --- 3. Share Trigger Modal --- */

const showPreviewModal = (dataUrl, file) => {
    const existing = document.getElementById('share-preview-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'share-preview-modal';
    modal.className = "fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in";
    const canShare = navigator.canShare && navigator.canShare({ files: [file] });

    modal.innerHTML = `
        <div class="bg-base-50 dark:bg-base-900 w-full max-w-md rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            <div class="p-4 border-b border-base-200 dark:border-base-800 flex justify-between items-center bg-white dark:bg-base-900">
                <h3 class="font-black text-lg text-base-900 dark:text-white">Ready to Share</h3>
                <button id="btn-close-preview" class="w-8 h-8 rounded-full bg-base-200 dark:bg-base-800 flex items-center justify-center text-gray-500">✕</button>
            </div>
            
            <div class="p-4 bg-gray-100 dark:bg-black/50 flex-1 overflow-auto flex items-center justify-center min-h-[300px]">
                <img src="${dataUrl}" class="w-full h-auto max-h-[60vh] object-contain rounded-xl shadow-lg border border-white/10" alt="Share Image">
            </div>

            <div class="p-4 bg-white dark:bg-base-900 border-t border-base-200 dark:border-base-800 flex gap-3">
                <button id="btn-download-img" class="flex-1 py-3 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 font-bold rounded-xl text-xs flex items-center justify-center gap-2 hover:bg-gray-200 dark:hover:bg-gray-700 transition">
                    <i class="ph-bold ph-download-simple text-lg"></i> Save
                </button>
                ${canShare ? `
                <button id="btn-share-native" class="flex-[2] py-3 bg-indigo-600 text-white font-bold rounded-xl text-sm flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/30 hover:bg-indigo-700 transition active:scale-95">
                    <i class="ph-bold ph-share-network text-lg"></i> Share Now
                </button>
                ` : ''}
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    const btnClose = modal.querySelector('#btn-close-preview');
    if(btnClose) btnClose.onclick = () => modal.remove();
    
    const btnDownload = modal.querySelector('#btn-download-img');
    if(btnDownload) {
        btnDownload.onclick = () => {
            const a = document.createElement('a'); a.href = dataUrl; a.download = file.name; a.click();
            Feedback.success(); 
            showMessage('画像を保存しました', 'success'); 
            modal.remove();
            toggleModal('action-menu-modal', false);
        };
    }

    const shareBtn = modal.querySelector('#btn-share-native');
    if (shareBtn) {
        shareBtn.onclick = async () => {
            try { 
                await navigator.share({ files: [file], title: 'NOMUTORE Log', text: APP.HASHTAGS }); 
                Feedback.success(); 
                modal.remove(); 
                toggleModal('action-menu-modal', false);
            } catch (err) {
                console.log('Share canceled');
            }
        };
    }
};

/* --- Internal Renderers (For Status Card) --- */
const renderStatusCard = (container) => {
    const profile = Store.getProfile();
    const { logs, checks, periodLogs } = Store.getCachedData(); 
    const balanceVal = Calc.calculateBalance(periodLogs);
    const isDebt = balanceVal < 0;
    const absBalance = Math.round(Math.abs(balanceVal));
    const gradeData = Calc.getRecentGrade(checks, logs, profile);
    const bgClass = isDebt ? 'bg-gradient-to-br from-slate-900 to-slate-800' : 'bg-gradient-to-br from-indigo-900 to-slate-900';
    const accentColor = isDebt ? 'text-red-400' : 'text-emerald-400';
    const statusText = isDebt ? 'DEBT (借金)' : 'SAVINGS (貯金)';
    const appUrl = window.location.href; 
    const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(appUrl)}&bgcolor=ffffff&color=000000&margin=0`;

    container.innerHTML = `
        <div class="${bgClass} w-[600px] h-[400px] p-8 flex flex-col justify-between relative overflow-hidden font-sans text-white">
            <div class="absolute top-[-50px] right-[-50px] w-64 h-64 bg-indigo-500 rounded-full mix-blend-overlay filter blur-[60px] opacity-30"></div>
            <div class="absolute bottom-[-50px] left-[-50px] w-64 h-64 bg-amber-500 rounded-full mix-blend-overlay filter blur-[60px] opacity-20"></div>
            <div class="flex justify-between items-center z-10">
                <div class="flex items-center gap-3">
                    <div class="w-12 h-12 bg-white/10 backdrop-blur-md rounded-xl flex items-center justify-center border border-white/20 overflow-hidden">
                        <img src="./icon-192_2.png" class="w-full h-full object-cover opacity-90" crossorigin="anonymous">
                    </div>
                    <div><h1 class="text-xl font-black tracking-widest leading-none">NOMUTORE</h1><p class="text-[10px] text-gray-400 font-bold tracking-[0.3em] uppercase mt-1">BEER & BURN</p></div>
                </div>
                <div class="text-right"><p class="text-xs text-gray-400 font-bold tracking-wider">${dayjs().format('YYYY.MM.DD')}</p></div>
            </div>
            <div class="flex-1 flex flex-col justify-center items-center z-10 mt-2">
                <p class="text-sm font-bold text-gray-400 tracking-widest mb-2 border-b border-gray-600 pb-1 whitespace-nowrap">${statusText}</p>
                <div class="text-8xl font-black ${accentColor} drop-shadow-2xl flex items-baseline gap-2 leading-none">
                    ${absBalance} <span class="text-2xl text-gray-400 font-bold">kcal</span>
                </div>
                <div class="mt-8 flex items-center gap-4 bg-white/5 px-6 py-3 rounded-full border border-white/10 backdrop-blur-sm">
                    <span class="text-xs text-gray-400 font-bold uppercase whitespace-nowrap">Current Rank</span>
                    <span class="text-2xl font-black text-amber-400 whitespace-nowrap">${gradeData.rank}</span>
                </div>
            </div>
            <div class="flex justify-between items-end z-10 pt-4">
                <div class="flex items-center gap-3">
                    <div class="w-14 h-14 bg-white p-1 rounded-lg shadow-lg">
                        <img src="${qrApiUrl}" class="w-full h-full" crossorigin="anonymous" alt="QR">
                    </div>
                    <div class="text-[10px] text-gray-400 leading-tight font-bold opacity-80">Scan to join<br>the healthy drinkers.</div>
                </div>
                <div class="text-right"><p class="text-sm font-black italic opacity-30">#NOMUTORE</p></div>
            </div>
        </div>
    `;
};

/* --- UI Helpers --- */
const showLoadingOverlay = (text) => {
    const id = `loading-${Date.now()}`;
    const el = document.createElement('div');
    el.id = id;
    el.className = "fixed inset-0 z-[10000] bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center transition-opacity duration-300";
    el.innerHTML = `<div class="mb-4 animate-bounce">
        <i class="ph-duotone ph-camera text-5xl text-white"></i>
    </div><p class="text-white font-bold text-lg animate-pulse">${text}</p><div role="status" aria-live="polite" class="sr-only">${text}</div>`;
    document.body.appendChild(el);
    return id;
};

const hideLoadingOverlay = (id) => {
    const el = document.getElementById(id);
    if (el) { el.classList.add('opacity-0'); setTimeout(() => el.remove(), 300); }

};
