import { APP } from '../constants.js';
import confetti from 'https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.2/+esm';

// --- Sound & Haptics Engine ---

export const AudioEngine = {
    ctx: null,
    noiseBuffer: null,

    init: () => {
        // すでに有効な Context があれば何もしない
        if (AudioEngine.ctx && AudioEngine.ctx.state !== 'closed') {
            return;
        }
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (AudioContext) {
                AudioEngine.ctx = new AudioContext();
                AudioEngine.createNoiseBuffer();
            }
        } catch (e) {
            console.warn('AudioContext init failed:', e);
        }
    },

    resume: () => {
        if (AudioEngine.ctx && AudioEngine.ctx.state === 'suspended') {
            AudioEngine.ctx.resume().catch(() => {});
        }
    },

    createNoiseBuffer: () => {
        if (!AudioEngine.ctx) return;
        const bufferSize = AudioEngine.ctx.sampleRate * 2;
        const buffer = AudioEngine.ctx.createBuffer(1, bufferSize, AudioEngine.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        AudioEngine.noiseBuffer = buffer;
    },

    // 汎用トーン再生 (安全ガード付き・設定維持)
    playTone: (freq, type, duration, startTime = 0, vol = 0.1) => {
        if (!AudioEngine.ctx || AudioEngine.ctx.state === 'closed') AudioEngine.init();
        const ctx = AudioEngine.ctx;
        if (!ctx) return;
        if (ctx.state === 'suspended') ctx.resume();

        // --- 修正ポイント1: 数値の安全確保 (non-finite対策) ---
        const f = Number.isFinite(freq) ? freq : 440;
        const d = Number.isFinite(duration) ? duration : 0.1;
        const s = Number.isFinite(startTime) ? startTime : 0;
        const v = Number.isFinite(vol) ? vol : 0.1;

        try {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain(); // 修正ポイント2: try-catch内で作成

            osc.type = type || 'sine';
            osc.frequency.setValueAtTime(f, ctx.currentTime + s);

            gain.gain.setValueAtTime(v, ctx.currentTime + s);
            
            const endTime = ctx.currentTime + s + d;
            // 修正ポイント3: endTimeが有限であることを確認し、目標値を0.0001にする
            if (Number.isFinite(endTime)) {
                gain.gain.exponentialRampToValueAtTime(0.0001, endTime);
            }

            osc.connect(gain);
            gain.connect(ctx.destination);

            osc.start(ctx.currentTime + s);
            osc.stop(Number.isFinite(endTime) ? endTime : ctx.currentTime + s + 0.1);
        } catch (e) {
            console.warn('playTone error:', e);
        }
    },

    // ノイズ再生 (安全ガード付き・設定維持)
    playNoise: (duration, filterFreq = 1000, vol = 0.1, startTime = 0) => {
        if (!AudioEngine.ctx || !AudioEngine.noiseBuffer) AudioEngine.init();
        const ctx = AudioEngine.ctx;
        if (!ctx) return;
        if (ctx.state === 'suspended') ctx.resume();

        const d = Number.isFinite(duration) ? duration : 0.1;
        const s = Number.isFinite(startTime) ? startTime : 0;
        const f = Number.isFinite(filterFreq) ? filterFreq : 1000;
        const v = Number.isFinite(vol) ? vol : 0.1;

        try {
            const src = ctx.createBufferSource();
            src.buffer = AudioEngine.noiseBuffer;
            
            const filter = ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.value = f;

            const gain = ctx.createGain();
            gain.gain.setValueAtTime(v, ctx.currentTime + s);

            const endTime = ctx.currentTime + s + d;
            if (Number.isFinite(endTime)) {
                gain.gain.exponentialRampToValueAtTime(0.0001, endTime);
            }

            src.connect(filter);
            filter.connect(gain);
            gain.connect(ctx.destination);

            src.start(ctx.currentTime + s);
            src.stop(Number.isFinite(endTime) ? endTime : ctx.currentTime + s + 0.1);
        } catch (e) {
            console.warn('playNoise error:', e);
        }
    },

    // ⚙️ 設定保存時の音（短いダブル・クリック）
    playSaveClick: () => {
        const t = AudioEngine.ctx.currentTime;
        // 1つ目の音：カチッ（高め）
        AudioEngine.playTone(800, 'sine', 0.05, 0, 0.08);
        // 2つ目の音：コッ（低め・0.05秒後）
        AudioEngine.playTone(400, 'sine', 0.03, 0.05, 0.1);
    },

    // 🔘 UIクリック音 (Clicky) - 設定維持
    playClick: () => {
        AudioEngine.playTone(800, 'sine', 0.05, 0, 0.05);
        AudioEngine.playNoise(0.03, 3000, 0.02);
    },

    // 🔢 ダイヤル音 (Tick) - 設定維持
    playTick: () => {
        AudioEngine.playTone(400, 'triangle', 0.03, 0, 0.05);
    },

    // ⏱ タイマー秒針 (Soft Tick) - 設定維持
    playSoftTick: () => {
        AudioEngine.playTone(1200, 'sine', 0.02, 0, 0.01);
    },

    // 🔔 完了/成功音 (Success Chord) - 設定維持
    playSuccess: () => {
        const t = 0;
        AudioEngine.playTone(523.25, 'sine', 0.4, t, 0.1);
        AudioEngine.playTone(659.25, 'sine', 0.4, t + 0.1, 0.1);
        AudioEngine.playTone(783.99, 'sine', 0.8, t + 0.2, 0.1);
    },

    // 🗑️ 削除音 (Delete) - 設定維持
    playDelete: () => {
        AudioEngine.playNoise(0.3, 500, 0.15); 
        AudioEngine.playTone(100, 'sawtooth', 0.2, 0, 0.05);
    },

    // 🍺 乾杯＆注ぐ音 (Beer Hybrid) - 設定維持
    playBeer: () => {
        if (!AudioEngine.ctx) AudioEngine.init();
        const ctx = AudioEngine.ctx;
        if (!ctx) return;
        const t = ctx.currentTime;

        const partials = [
            { f: 1400, d: 0.6, v: 0.15 }, { f: 3600, d: 0.2, v: 0.08 },
            { f: 6200, d: 0.08, v: 0.04 }, { f: 1650, d: 0.5, v: 0.12 },
            { f: 4100, d: 0.15, v: 0.06 }, { f: 8000, d: 0.04, v: 0.03 }
        ];

        partials.forEach(p => {
            try {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(p.f, t);
                gain.gain.setValueAtTime(0, t);
                gain.gain.linearRampToValueAtTime(p.v, t + 0.005);
                gain.gain.exponentialRampToValueAtTime(0.001, t + p.d);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(t);
                osc.stop(t + p.d);
            } catch(e) {}
        });

        AudioEngine.playNoise(1.5, 800, 0.1, 0.1); 
    }
};

// --- Haptics Engine --- (維持)
const HapticEngine = {
    isSupported: () => 'vibrate' in navigator,
    selection: () => { if (HapticEngine.isSupported()) navigator.vibrate(5); },
    light: () => { if (HapticEngine.isSupported()) navigator.vibrate(10); },
    medium: () => { if (HapticEngine.isSupported()) navigator.vibrate(20); },
    heavy: () => { if (HapticEngine.isSupported()) navigator.vibrate([40, 20, 40]); },
    heartbeat: () => { if (HapticEngine.isSupported()) navigator.vibrate(15); },
    success: () => { if (HapticEngine.isSupported()) navigator.vibrate([20, 50, 20]); }
};

// --- Feedback Interface (API) --- (設定維持)
export const Feedback = {
    audio: AudioEngine,
    haptic: HapticEngine, 
    initAudio: () => AudioEngine.init(),

    uiSwitch: () => {
        AudioEngine.init();
        AudioEngine.resume();
        AudioEngine.playTone(600, 'square', 0.05, 0, 0.1);
        if (Feedback.haptic) Feedback.haptic.selection();
    },

    uiDial: () => {
        AudioEngine.init();
        AudioEngine.resume();
        AudioEngine.playTone(1200, 'sine', 0.03, 0, 0.1);
        if (Feedback.haptic) Feedback.haptic.selection(); 
    },

    tap: () => {
        AudioEngine.init();
        AudioEngine.resume();
        AudioEngine.playTone(1800, 'sine', 0.02, 0, 0.05);
        if (Feedback.haptic) Feedback.haptic.light();
    },

    beer: () => { AudioEngine.playBeer(); HapticEngine.medium(); },
    delete: () => { AudioEngine.resume(); AudioEngine.playDelete(); HapticEngine.heavy(); },
    success: () => { AudioEngine.playSuccess(); HapticEngine.success(); },
    error: () => { AudioEngine.playTone(150, 'sawtooth', 0.3); HapticEngine.heavy(); },
    timerTick: () => { AudioEngine.playSoftTick(); },
    timerBeat: () => { AudioEngine.playTone(200, 'sine', 0.1); HapticEngine.heartbeat(); },
    save: () => {
        AudioEngine.playSaveClick();
        if (Feedback.haptic) Feedback.haptic.light(); // 軽い振動もセット
    }
};

// --- Toast Animation Helper (Cheers Effect) ---
export const showToastAnimation = () => {
    // 既存のアニメーションがあれば削除
    const existing = document.getElementById('toast-animation-layer');
    if (existing) existing.remove();

    // オーバーレイ作成
    const overlay = document.createElement('div');
    overlay.id = 'toast-animation-layer';
    overlay.className = "fixed inset-0 pointer-events-none flex items-center justify-center z-[10001] overflow-hidden";
    
    // アイコン定義 (OS絵文字 🍺 ではなく、発光するSVGアイコンを使用)
    // text-9xl (約128px) で大きく表示し、ドロップシャドウでネオン感を出す
    const iconHtml = '<i class="ph-duotone ph-beer-stein text-amber-400 text-9xl drop-shadow-[0_0_25px_rgba(251,191,36,0.6)]"></i>';

    // 左右のグラスとテキスト
    // animate-clink-left / right はCSSで定義済みのものをそのまま利用
    overlay.innerHTML = `
        <div class="absolute animate-clink-left translate-x-[-100vw] flex items-center justify-center">
            ${iconHtml}
        </div>
        <div class="absolute animate-clink-right translate-x-[100vw] scale-x-[-1] flex items-center justify-center">
            ${iconHtml}
        </div>
        <div class="absolute text-5xl font-black text-amber-400 
                    drop-shadow-[0_4px_12px_rgba(0,0,0,0.8)] 
                    [text-shadow:_2px_2px_0_rgb(0_0_0_/_40%)]
                    animate-toast-text opacity-0 font-['Outfit'] italic tracking-widest" 
             style="animation-delay: 0.5s">
            Cheers!
        </div>
    `;

    document.body.appendChild(overlay);

    // Audio Effect (もし実装されていれば)
    if (window.AudioEngine && window.AudioEngine.ctx) {
        // ここに音再生ロジックがあれば残す
    }

    // アニメーション終了後に削除 (少し余裕を持って2.5秒後)
    setTimeout(() => {
        if (overlay) overlay.remove();
    }, 2500);
};

// --- DOM Logic ---

const shareContent = async (text) => {
    if (navigator.share) {
        try {
            await navigator.share({
                title: 'Nomutore Log',
                text: text,
            });
        } catch (err) {
            console.log('Share canceled or failed', err);
        }
    } else {
        navigator.clipboard.writeText(text).then(() => {
            alert('クリップボードにコピーしました！SNSに貼り付けてください。');
        });
    }
};

export const DOM = {
    isInitialized: false,
    elements: {},
    
    /**
     * View Transitions APIの安全なラッパー
     * 非対応ブラウザでは即時実行し、対応ブラウザではアニメーションさせる
     */
    withTransition: (callback) => {
        // ユーザーが「視差効果を減らす」設定にしている場合はアニメーションしない
        const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        if (!document.startViewTransition || prefersReducedMotion) {
            callback();
            return;
        }
        document.startViewTransition(callback);
    },

    /**
     * アイコン定義（クラス名または絵文字）を受け取り、HTML文字列を返す
     * @param {string} iconDef - "ph-beer-bottle" or "🍺"
     * @param {string} extraClasses - 追加のTailwindクラス
     */
    renderIcon: (iconDef, extraClasses = "") => {
        if (!iconDef) return "";
        
        // Phosphor Icon (ph-) かどうか判定
        if (iconDef.includes('ph-')) {
            return `<i class="${iconDef} ${extraClasses}"></i>`;
        } else {
            // 絵文字の場合はそのままspanで囲む（後方互換性）
            return `<span class="${extraClasses} font-emoji">${iconDef}</span>`;
        }
    },

    init: () => {
        if (DOM.isInitialized) return;
        
        const ids = [
            'message-box', 'drinking-section', 
            'beer-date', 'beer-select', 'beer-size', 'beer-count',
            'beer-input-preset', 'beer-input-custom',
            'custom-abv', 'custom-amount', 
            'tab-beer-preset', 'tab-beer-custom',
            'check-date', 'check-weight', 
            'manual-exercise-name', 'manual-date', 
            'weight-input', 'height-input', 'age-input', 'gender-input',
            'setting-mode-1', 'setting-mode-2', 'setting-base-exercise', 'theme-input','setting-default-record-exercise',
            'home-mode-select', 
            
            'tank-liquid', 'tank-liquid-back',
            'tank-empty-icon', 'tank-cans', 'tank-minutes', 'tank-message',

            'log-list', 'history-base-label',

            'liver-rank-card', 'rank-title', 'dry-count', 'rank-progress', 'rank-next-msg',
            'check-status', 
            
            'streak-count', 'streak-badge',
            'heatmap-grid', 'heatmap-period-label', 'heatmap-prev', 'heatmap-next',
            'balanceChart', 'chart-filters',

            'beer-modal', 'check-modal', 'exercise-modal', 'settings-modal', 'help-modal',
            'global-error-overlay', 'error-details', 'swipe-coach-mark',
            'check-library-modal',
            'action-menu-modal',
            'day-detail-modal'
        ];

        ids.forEach(id => {
            const el = document.getElementById(id);
            if (el) DOM.elements[id] = el;
            if (id === 'tank-liquid' && !el) {
                DOM.elements['tank-liquid'] = document.getElementById('orb-liquid-front');
            }
        });

        const enableAudio = () => {
            Feedback.initAudio();
            document.removeEventListener('click', enableAudio);
            document.removeEventListener('touchstart', enableAudio);
        };
        document.addEventListener('click', enableAudio, { once: true });
        document.addEventListener('touchstart', enableAudio, { once: true });

        DOM.isInitialized = true;
    }
};

export const escapeHtml = (str) => {
    if(typeof str !== 'string') return str;
    return str.replace(/[&<>"']/g, function(m) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m];
    });
};

export const toggleModal = (modalId, show = true) => {
    const el = DOM.elements[modalId] || document.getElementById(modalId);
    if (!el) return;
    
    if (show) Feedback.uiSwitch();

    // モーダル内にある「アニメーション対象のコンテナ」を取得
    const content = el.querySelector('div[class*="transform"]');

    if (show) {
        // 1. まずコンテナを表示状態にする (flex)
        el.classList.remove('hidden');
        el.classList.add('flex');
        
        // 2. わずかに遅らせてアニメーションクラスを適用 (CSS transitionを発火させるため)
        setTimeout(() => {
            if (content) {
                // 共通: 透明度とスケールを元に戻す
                content.classList.remove('scale-95', 'opacity-0');
                content.classList.add('scale-100', 'opacity-100');

                // ★追加: ボトムシート用の位置ズレ(translate-y-full)を除去して画面内に入れる
                content.classList.remove('translate-y-full', 'sm:translate-y-10');
            }
        }, 10);
    } else {
        // 閉じる処理
        if (content) {
            content.classList.remove('scale-100', 'opacity-100');
            content.classList.add('scale-95', 'opacity-0');

            // ★追加: 特定のモーダルの場合、スライドダウンのアニメーションも適用
            if (modalId === 'day-detail-modal' || modalId === 'action-menu-modal' || modalId === 'day-add-selector') {
                content.classList.add('translate-y-full', 'sm:translate-y-10');
            }
        }
        
        // アニメーション完了後に非表示 (hidden) にする
        setTimeout(() => {
            el.classList.add('hidden');
            el.classList.remove('flex');
        }, 200); // duration-200 と合わせる
    }
};

export const showConfetti = () => {
    confetti({
        particleCount: 100, spread: 70, origin: { y: 0.6 },
        colors: ['#FBBF24', '#F59E0B', '#FFFFFF']
    });
};

/* ui/dom.js */

// ... (importsやAudioEngineなどはそのまま) ...

// ★ shareContent はこのファイル内に定義されている前提
// const shareContent = async (text) => { ... }

export const showMessage = (text, type = 'info', action = null) => {
    const box = DOM.elements['message-box'] || document.getElementById('message-box');
    if (!box) return;

    // 1. 表示用テキストの整形: 先頭のOS絵文字（✅, 🚨, ✨）を除去
    const cleanText = text.replace(/^[✅🚨✨]\s*/, '');

    // 2. デザイン設定 (Glassmorphism + Phosphor Icons)
    const config = {
        success: {
            icon: '<i class="ph-fill ph-check-circle text-emerald-500 text-xl"></i>',
            bg: 'bg-white/95 dark:bg-base-900/95',
            border: 'border-emerald-500/30',
            text: 'text-emerald-800 dark:text-emerald-100'
        },
        error: {
            icon: '<i class="ph-fill ph-warning-circle text-red-500 text-xl"></i>',
            bg: 'bg-white/95 dark:bg-base-900/95',
            border: 'border-red-500/30',
            text: 'text-red-800 dark:text-red-100'
        },
        info: {
            icon: '<i class="ph-fill ph-info text-indigo-500 text-xl"></i>',
            bg: 'bg-white/95 dark:bg-base-900/95',
            border: 'border-indigo-500/30',
            text: 'text-gray-800 dark:text-gray-100'
        }
    };

    const style = config[type] || config.info;

    // 3. コンテナのクラス設定 (角丸、影、アニメーション)
    box.className = `fixed top-6 left-1/2 transform -translate-x-1/2 z-[9999] transition-all duration-300
                     pl-4 pr-4 py-3 rounded-2xl shadow-xl shadow-black/5 backdrop-blur-md border
                     flex items-center gap-3 min-w-[280px] max-w-[90vw]
                     ${style.bg} ${style.border}`;

    // 4. HTMLコンテンツ生成
    let content = `
        <div class="shrink-0 flex items-center justify-center">${style.icon}</div>
        <span class="text-sm font-bold ${style.text} truncate flex-1">${cleanText}</span>
    `;

    // 5. シェアボタンの追加 (Action Logic)
    let btnId = null;
    if (action && action.type === 'share') {
        btnId = `msg-btn-share-${Date.now()}`;
        // ボタンデザインもGlassmorphismに統一
        content += `
            <button id="${btnId}" class="shrink-0 ml-2 bg-indigo-50 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-300 px-3 py-1.5 rounded-lg text-xs font-bold transition active:scale-95 flex items-center gap-1 border border-indigo-100 dark:border-indigo-500/30 hover:bg-indigo-100 dark:hover:bg-indigo-500/30">
                <i class="ph-bold ph-share-network"></i> Share
            </button>
        `;
    }

    box.innerHTML = content;

    // 6. イベントハンドラの登録 (DOM生成後)
    if (btnId) {
        setTimeout(() => {
            const btn = document.getElementById(btnId);
            if (btn) {
                btn.onclick = () => {
                    // Haptic Feedback
                    if (window.Feedback && window.Feedback.haptic) window.Feedback.haptic.light();
                    
                    // ★ 画像シェアモードの分岐 (UI.shareを使用)
                    if (action.shareMode === 'image' && window.UI && window.UI.share) {
                        window.UI.share(action.imageType, action.imageData);
                    } else {
                        // ★ テキストシェア (既存のshareContentを使用)
                        // ここでは cleanText ではなく、絵文字付きの元の text (または action.text) を送る
                        const shareText = action.text || text; 
                        shareContent(shareText);
                    }
                };
            }
        }, 0);
    }

    // 7. アニメーション表示と自動非表示
    if (DOM.messageTimeout) clearTimeout(DOM.messageTimeout);

    // Slide In
    requestAnimationFrame(() => {
        box.style.transform = 'translate(-50%, 0)';
        box.style.opacity = '1';
    });

    // Auto Hide (シェアボタンがある場合は長めに表示)
    const duration = action ? 6000 : 3000;
    DOM.messageTimeout = setTimeout(() => {
        box.style.transform = 'translate(-50%, -150%)';
        box.style.opacity = '0';
    }, duration);

    // 成功・エラー時のHaptic
    if (type === 'success' && window.Feedback) window.Feedback.success();
    if (type === 'error' && window.Feedback) window.Feedback.error();
};

export const toggleDryDay = (isDry) => {

    // ★追加: スイッチ切り替えの感触
    // 既存のFeedbackオブジェクトが定義された後であれば Feedback.haptic.medium() が呼べます
    // もし関数の定義位置が Feedback より前にある場合は、直接 HapticEngine.medium() を呼んでも構いません
    if (typeof Feedback !== 'undefined' && Feedback.haptic) {
        Feedback.haptic.medium();
    } else if (typeof HapticEngine !== 'undefined') {
        HapticEngine.medium();
    }

    const section = document.getElementById('drinking-section');
    if (!section) return;

    const label = section.querySelector('span');
    const hint = section.querySelector('p');

    section.classList.remove('bg-orange-50', 'border-orange-100', 'bg-emerald-50', 'border-emerald-100');
    if (label) label.classList.remove('text-orange-800', 'text-emerald-800');
    if (hint) hint.classList.remove('text-orange-600/70', 'text-emerald-600/70');

    if (isDry) {
        section.classList.add('bg-emerald-50', 'border-emerald-100');
        if (label) label.classList.add('text-emerald-800');
        if (hint) {
            hint.classList.add('text-emerald-600/70');
            hint.innerHTML = '素晴らしい！肝臓が回復しています <i class="ph-fill ph-sparkle text-yellow-400 inline-block align-middle mb-1"></i>';
        }
    } else {
        section.classList.add('bg-orange-50', 'border-orange-100');
        if (label) label.classList.add('text-orange-800');
        if (hint) {
            hint.classList.add('text-orange-600/70');
            hint.textContent = "一滴も飲まなかった日はスイッチON";
        }
    }
};

export const applyTheme = (themeName) => {
    const root = document.documentElement;
    let isDark = themeName === 'dark';

    if (themeName === 'system') {
        isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    }

    if (isDark) {
        root.classList.add('dark');
        root.classList.remove('light');
    } else {
        root.classList.remove('dark');
        root.classList.add('light');
    }

    const icon = document.getElementById('theme-icon');
    if (icon) {
        if (isDark) {
            icon.className = 'ph-fill ph-moon-stars text-lg text-yellow-400 transition-colors';
        } else {
            icon.className = 'ph-fill ph-sun text-lg text-orange-500 transition-colors';
        }
    }

// ▼▼▼ ★修正: Androidのチカチカ対策 (強力版) ▼▼▼
    
    // Tailwindの slate-50 (#f8fafc) と slate-900 (#0f172a)
    // ※もし背景色が黒(#000000)に近い場合は #0f172a をその色に変えてください
    const targetColor = isDark ? '#0f172a' : '#f8fafc';
    
    // 1. 存在するすべての theme-color メタタグを取得
    const metaTags = document.querySelectorAll('meta[name="theme-color"]');

    if (metaTags.length > 0) {
        metaTags.forEach(tag => {
            // contentを更新
            tag.setAttribute('content', targetColor);
            // 重要: media属性がついているとOS設定が優先されてしまうため、削除してJSの設定を強制する
            tag.removeAttribute('media');
        });
    } else {
        // 万が一タグがない場合は作成
        const meta = document.createElement('meta');
        meta.name = 'theme-color';
        meta.content = targetColor;
        document.head.appendChild(meta);
    }
};

// ★追加: 監視と初期化を行う関数
export const initTheme = () => {
    // 1. システム(OS)側のダークモード切り替えを監視する
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        const currentSetting = localStorage.getItem(APP.STORAGE_KEYS.THEME);
        
        // 設定が「system」または「未設定」の時だけ、再適用する
        if (!currentSetting || currentSetting === 'system') {
            applyTheme('system'); // 再評価させる
        }
    });

    // 2. アプリ起動時の適用
    const stored = localStorage.getItem(APP.STORAGE_KEYS.THEME);
    applyTheme(stored || 'system');
};

/**
 * アプリ更新通知を表示する (新規追加)
 * @param {ServiceWorker} waitingWorker - 待機中の新しいService Worker
 */
export const showUpdateNotification = (waitingWorker) => {
    // 既に表示されていたら何もしない
    if (document.getElementById('update-toast')) return;

    // トーストのDOM生成
    const toast = document.createElement('div');
    toast.id = 'update-toast';
    toast.className = "fixed bottom-24 left-4 right-4 z-50 animate-bounce-in"; 
    
    toast.innerHTML = `
        <div class="bg-slate-800 dark:bg-slate-700 text-white px-4 py-3 rounded-xl shadow-2xl flex items-center justify-between border border-slate-600">
            <div class="flex items-center gap-3">
                <div class="w-8 h-8 bg-indigo-500 rounded-full flex items-center justify-center shrink-0 animate-pulse">
                    <i class="ph-bold ph-download-simple text-white"></i>
                </div>
                <div>
                    <p class="text-sm font-bold">Update Available</p>
                    <p class="text-[10px] text-gray-300">新しいバージョンが利用可能です</p>
                </div>
            </div>
            <button id="btn-sw-update" class="bg-white text-indigo-600 px-4 py-1.5 rounded-lg text-xs font-black hover:bg-gray-100 active:scale-95 transition">
                UPDATE
            </button>
        </div>
    `;

    document.body.appendChild(toast);

    // 更新ボタンの動作
    const btn = document.getElementById('btn-sw-update');
    btn.onclick = () => {

        localStorage.setItem('nomutore_just_updated', 'true');

        // 1. 待機中のSWに「スキップ」を命令
        waitingWorker.postMessage({ type: 'SKIP_WAITING' });
        
        // 2. ボタンをローディング状態に
        btn.textContent = '...';
        btn.disabled = true;
    };
};



