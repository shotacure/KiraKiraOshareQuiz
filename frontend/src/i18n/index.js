import ja from './ja';

const locale = ja;

/**
 * Translate a key with optional parameter interpolation.
 * Usage: t('player.header.rank', { rank: 1, total: 10 }) => '1位/10人'
 */
export function t(key, params = {}) {
  let str = locale[key];
  if (!str) {
    console.warn(`[i18n] Missing key: ${key}`);
    return key;
  }
  Object.entries(params).forEach(([k, v]) => {
    str = str.replaceAll(`{${k}}`, String(v));
  });
  return str;
}
