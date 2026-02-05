const CACHE_NAME = 'nomutore-v0.0.5';
const APP_SHELL = [
    './',
    './index.html',
    './style.css',
    './main.js',
    './ui/index.js',
    './ui/dom.js',
    './ui/modal.js',
    './ui/logList.js',
    './ui/beerTank.js',
    './ui/liverRank.js',
    './ui/checkStatus.js',
    './ui/weekly.js',
    './ui/chart.js',
    './ui/beerStats.js',
    './ui/archiveManager.js',
    './ui/timer.js',
    './ui/share.js',
    './ui/beerForm.js',
    './ui/state.js',
    './store.js',
    './service.js',
    './logic.js',
    './constants.js',
    './cloudManager.js',
    './ui/onboarding.js',
    './manifest.json',
    './icon-192_2.png',
    './icon-512_2.png',
    './logo-header.png'
];

// インストール時: 基本ファイルをキャッシュ
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((names) => {
            return Promise.all(
                names.map((name) => {
                    if (name !== CACHE_NAME) return caches.delete(name);
                })
            );
        }).then(() => self.clients.claim())
    );
});

// フェッチ処理 (Safe Clone Version)
self.addEventListener('fetch', (event) => {
    // 1. http/https 以外のリクエストは無視
    if (!event.request.url.startsWith('http')) return;

    // 2. GETメソッド以外は無視
    if (event.request.method !== 'GET') return;

    // 3. 外部ドメイン(CDN)はSWで扱わず、ブラウザ標準の通信に任せる
    const url = new URL(event.request.url);
    if (url.origin !== location.origin) {
        return;
    }

    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            // A. キャッシュがある場合: 即座にキャッシュを返し、裏で更新(SWR)
            if (cachedResponse) {
                event.waitUntil(
                    fetch(event.request).then((networkResponse) => {
                        if (networkResponse && networkResponse.ok) {
                            const responseToCache = networkResponse.clone(); // 先にクローン
                            caches.open(CACHE_NAME).then((cache) => {
                                cache.put(event.request, responseToCache);
                            });
                        }
                    }).catch(() => {})
                );
                return cachedResponse;
            }

            // B. キャッシュがない場合: ネットワークへ
            return fetch(event.request).then((networkResponse) => {
                // レスポンスが不正ならそのまま返す
                if (!networkResponse || !networkResponse.ok) {
                    return networkResponse;
                }

                // キャッシュ用にクローンを作成
                const responseToCache = networkResponse.clone();

                caches.open(CACHE_NAME).then((cache) => {
                    cache.put(event.request, responseToCache);
                });

                return networkResponse;
            });
        })
    );

});


// 新しいSWが待機状態のとき、クライアントから "SKIP_WAITING" メッセージを受け取ったら即座にアクティブにする
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});











