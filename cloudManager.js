import { dataManager } from './dataManager.js';

/* ==========================================================================
   Google Drive Manager (MVP)
   ========================================================================== */

// ★ここにStep0で取得したクライアントIDを入れてください
const CLIENT_ID = '22830650941-7qs9gvs0m0seac005nbb2f10edq9osaa.apps.googleusercontent.com';

// アプリが作成したファイルのみアクセス権を持つスコープ（安全）
const SCOPES = 'https://www.googleapis.com/auth/drive.file';

// バックアップファイル名（固定）
const BACKUP_FILE_NAME = 'nomutore_backup.json';

export const CloudManager = {
    tokenClient: null,
    accessToken: null,
    isInitialized: false,

    /**
     * ライブラリの初期化 (index.js等から呼ぶ)
     */
    init: async () => {
        return new Promise((resolve, reject) => {
            // 1. Google Identity Services (GIS) の初期化
            if (window.google) {
                CloudManager.tokenClient = google.accounts.oauth2.initTokenClient({
                    client_id: CLIENT_ID,
                    scope: SCOPES,
                    callback: (tokenResponse) => {
                        if (tokenResponse.error) {
                            console.error('Auth Error:', tokenResponse);
                            reject(tokenResponse);
                        }
                        CloudManager.accessToken = tokenResponse.access_token;
                        console.log('GIS Auth Success');
                    },
                });
            }

            // 2. gapi (API Client) の初期化
            if (window.gapi) {
                gapi.load('client', async () => {
                    try {
                        await gapi.client.init({
                            // API Keyは不要 (GCPの設定次第ですが、今回はTokenのみで通します)
                            discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'],
                        });
                        CloudManager.isInitialized = true;
                        console.log('GAPI Initialized');
                        resolve();
                    } catch (err) {
                        console.error('GAPI Init Error:', err);
                        reject(err);
                    }
                });
            } else {
                reject('Google Libraries not loaded');
            }
        });
    },

    /**
     * ログイン処理（ポップアップを表示）
     */
    login: () => {
        return new Promise((resolve, reject) => {
            if (!CloudManager.tokenClient) return reject('Not initialized');
            
            // 既存のトークンがあればスキップ（簡易実装）
            if (CloudManager.accessToken) return resolve(CloudManager.accessToken);

            // コールバックを一時的にオーバーライドしてPromise化
            CloudManager.tokenClient.callback = (resp) => {
                if (resp.error) reject(resp);
                CloudManager.accessToken = resp.access_token;
                resolve(resp.access_token);
            };
            
            // ログイン画面表示
            // prompt: '' -> 同意済みならスキップ, 'consent' -> 毎回同意画面
            CloudManager.tokenClient.requestAccessToken({ prompt: '' });
        });
    },

    /**
     * バックアップ実行 (Upload/Overwrite)
     * @param {Object} jsonData - 保存するデータオブジェクト
     */
    uploadBackup: async (jsonData) => {
        if (!CloudManager.accessToken) await CloudManager.login();

        const fileContent = JSON.stringify(jsonData, null, 2);
        const fileMetadata = {
            name: BACKUP_FILE_NAME,
            mimeType: 'application/json',
        };

        try {
            // 1. 既存のバックアップファイルを探す
            const existingFileId = await CloudManager.findBackupFileId();

            const boundary = '-------314159265358979323846';
            const delimiter = "\r\n--" + boundary + "\r\n";
            const close_delim = "\r\n--" + boundary + "--";

            const contentType = 'application/json';
            const multipartRequestBody =
                delimiter +
                'Content-Type: application/json\r\n\r\n' +
                JSON.stringify(fileMetadata) +
                delimiter +
                'Content-Type: ' + contentType + '\r\n\r\n' +
                fileContent +
                close_delim;

            const requestHeaders = {
                'Authorization': 'Bearer ' + CloudManager.accessToken,
                'Content-Type': 'multipart/related; boundary="' + boundary + '"'
            };

            let response;
            if (existingFileId) {
                // 更新 (PATCH)
                console.log('Updating existing backup...', existingFileId);
                response = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=multipart`, {
                    method: 'PATCH',
                    headers: requestHeaders,
                    body: multipartRequestBody
                });
            } else {
                // 新規作成 (POST)
                console.log('Creating new backup...');
                response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
                    method: 'POST',
                    headers: requestHeaders,
                    body: multipartRequestBody
                });
            }

            if (!response.ok) throw new Error(await response.text());
            return await response.json();

        } catch (err) {
            console.error('Upload Failed:', err);
            throw err;
        }
    },

    /**
     * 復元実行 (Download)
     */
    downloadBackup: async () => {
        if (!CloudManager.accessToken) await CloudManager.login();

        try {
            const fileId = await CloudManager.findBackupFileId();
            if (!fileId) return null; // ファイルなし

            const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
                headers: { 'Authorization': 'Bearer ' + CloudManager.accessToken }
            });

            if (!response.ok) throw new Error(await response.text());
            return await response.json();

        } catch (err) {
            console.error('Download Failed:', err);
            throw err;
        }
    },

    /**
     * onboarding.js から呼ばれる復元コマンド
     */
    restore: async () => {
        try {
            // 1. Google Driveからダウンロード (既存の downloadBackup を使用)
            const data = await CloudManager.downloadBackup();
            if (!data) return false;

            // 2. DataManager の復元ロジックへ渡す
            // ※ confirm() ダイアログは DataManager.restoreFromObject 内で出ます
            const success = await DataManager.restoreFromObject(data);
            return success;
        } catch (err) {
            console.error('Cloud Restore Bridge Error:', err);
            throw err;
        }
    },
  
    /**
     * ヘルパー: バックアップファイルのIDを探す
     */
    findBackupFileId: async () => {
        // gapi.client.drive.files.list を使うのが楽
        const response = await gapi.client.drive.files.list({
            q: `name = '${BACKUP_FILE_NAME}' and trashed = false`,
            fields: 'files(id, name)',
            spaces: 'drive'
        });

        const files = response.result.files;
        if (files && files.length > 0) {
            return files[0].id;
        }
        return null;
    }
};