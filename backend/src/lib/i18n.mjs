/**
 * Backend i18n — text resources for server-generated content.
 * Currently Japanese only. Add other locales (en.mjs etc.) and
 * switch by environment variable to support multiple languages.
 */

const ja = {
  // S3 result report
  'report.title': '{title} — 結果レポート',
  'report.defaultTitle': 'クイズ結果',
  'report.section.finalStandings': '■ 最終成績',
  'report.section.perQuestion': '■ 問題別結果',
  'report.header.rank': '順位',
  'report.header.name': '名前',
  'report.header.score': '得点',
  'report.header.correctCount': '正解数',
  'report.header.answer': '回答',
  'report.header.timeDiff': '差分',
  'report.header.result': '結果',
  'report.header.points': '得点',
  'report.rankSuffix': '位',
  'report.ptSuffix': 'pt',
  'report.correct': '○',
  'report.incorrect': '×',
  'report.questionLabel': 'Q{num}: {text} ({type}, {pts}pt)',
  'report.typeChoice': '選択',
  'report.typeText': 'テキスト',
  'report.modelAnswer': '模範解答: {answer}',
  'report.acceptableAnswers': '許容解答: {answers}',
  'report.correctRate': '正解率: {correct}/{total} ({rate}%)',
};

const locales = { ja };
const currentLocale = process.env.REPORT_LOCALE || 'ja';

/**
 * Get a localized string with placeholder substitution.
 * Placeholders: {key} replaced by params[key].
 */
export function rt(key, params = {}) {
  const dict = locales[currentLocale] || locales.ja;
  let text = dict[key] || key;
  for (const [k, v] of Object.entries(params)) {
    text = text.replace(`{${k}}`, v);
  }
  return text;
}
