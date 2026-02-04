/**
 * @typedef {Object} Profile
 * @property {number} weight - 体重 (kg)
 * @property {number} height - 身長 (cm)
 * @property {number} age - 年齢
 * @property {string} gender - 'male' | 'female'
 */

/**
 * @typedef {Object} Log
 * @property {number} [id] - Dexieの自動採番ID
 * @property {number} timestamp - 記録日時 (ms)
 * @property {'beer' | 'exercise'} type - 記録タイプ
 * @property {string} name - 表示名 (例: "Yona Yona Ale", "Walking")
 * @property {number} kcal - カロリー収支 (飲酒はマイナス、運動はプラス)
 * @property {string} [style] - ビールのスタイル (beerのみ)
 * @property {number} [count] - 本数 (beerのみ)
 * @property {number} [minutes] - 運動時間 (exerciseのみ)
 * @property {number} [rawMinutes] - 元の運動時間 (exerciseのみ)
 * @property {string} [memo] - メモ
 * @property {number} [rating] - 評価 1-5 (beerのみ)
 */

/**
 * @typedef {Object} Check
 * @property {number} [id]
 * @property {number} timestamp
 * @property {boolean} isDryDay - 休肝日フラグ
 * @property {number|null} [weight] - その日の体重
 * @property {boolean} [waistEase] - 腹周りの余裕
 * @property {boolean} [footLightness] - 足取りの軽さ
 * @property {boolean} [waterOk] - チェイサー摂取
 */

// JSファイルとして空のエクスポートをしておく（モジュールとして認識させるため）
export {};