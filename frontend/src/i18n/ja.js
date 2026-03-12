export default {
  // ── App-wide ──
  'app.title': 'キラキラ おしゃれクイズ',
  'app.connecting': '接続中',
  'app.reconnecting': '再接続中...',
  'app.recovering': '復帰中...',

  // ── Player: Login ──
  'player.login.subtitle': '名前を入力して参加してね！',
  'player.login.placeholder': 'あなたの名前',
  'player.login.submit': '✨ 参加する',
  'player.login.submitting': '接続中...',
  'player.login.nameTaken': '「{name}」は既に使われています。別の名前を入力してください',

  // ── Player: Header ──
  'player.header.rank': '{rank}位/{total}人',
  'player.header.pt': '{score} pt ⭐',

  // ── Player: Waiting ──
  'player.waiting.init': '準備中だよ...',
  'player.waiting.accepting': '参加登録できたよ！🎉',
  'player.waiting.default': '次の問題をまってね',
  'player.waiting.hint': '出題されたら自動でかわるよ',

  // ── Player: Answer ──
  'player.answer.corner': '第{corner}コーナー Q{num}',
  'player.answer.points': '+{pts}pt ⭐',
  'player.answer.textPlaceholder': 'こたえを入力...',
  'player.answer.submit': '💖 回答',
  'player.answer.choiceSubmitting': '送信中...',

  // ── Player: Submitted ──
  'player.submitted.title': '送信できたよ！',
  'player.submitted.yourAnswer': 'あなたの回答',
  'player.submitted.waiting': '結果発表をまってね... 💫',

  // ── Player: Judging ──
  'player.judging.title': '採点中...',
  'player.judging.yourAnswer': 'あなたの回答',
  'player.judging.noAnswer': '未回答だよ',

  // ── Player: Result ──
  'player.result.correct': '正解！🎊',
  'player.result.incorrect': '不正解...',
  'player.result.noAnswer': '未回答',
  'player.result.addPoints': '+{pts} pt ⭐',
  'player.result.correctIs': '正解は...',
  'player.result.total': '合計:',

  // ── Player: Scores ──
  'player.scores.title': '👑 最終成績！',
  'player.scores.you': '(あなた)',

  // ── Admin: Login ──
  'admin.login.title': '🔐 管理者ログイン',
  'admin.login.placeholder': '管理者パスワード',
  'admin.login.submit': 'ログイン',
  'admin.login.submitting': '認証中...',

  // ── Admin: Dashboard ──
  'admin.dashboard.title': '🎛️ 管理画面',
  'admin.dashboard.players': '参加者: {count}名',
  'admin.dashboard.progress': '進行: {done}/{total}問',

  // ── Admin: Status ──
  'admin.status.init': '初期状態',
  'admin.status.accepting': '参加受付中',
  'admin.status.answering': '回答受付中',
  'admin.status.judging': '採点中',
  'admin.status.showing_answer': '正解発表中',
  'admin.status.showing_scores': '成績発表中',

  // ── Admin: Control ──
  'admin.control.title': '進行コントロール',
  'admin.control.loadQuiz': '📁 クイズJSON読み込み',
  'admin.control.loading': '読み込み中...',
  'admin.control.nextQuestion': '次の問題:',
  'admin.control.startQuestion': '▶ 出題する',
  'admin.control.closeAnswers': '⏹ 回答締切',
  'admin.control.revealAnswer': '💡 正解発表',
  'admin.control.showScores': '🏆 最終成績発表',
  'admin.control.resetAll': '🔄 全データリセット',
  'admin.control.resetConfirm': '全データを完全にリセットします。よろしいですか？\n(クイズデータ・参加者・回答が全て削除されます)',

  // ── Admin: Question ──
  'admin.question.empty.init': 'クイズデータを読み込んでください',
  'admin.question.empty.accepting': '参加者を待っています。準備ができたら出題してください',
  'admin.question.empty.default': '問題なし',
  'admin.question.modelAnswer': '模範解答:',

  // ── Admin: Answers ──
  'admin.answers.title': '回答一覧 ({count}件)',
  'admin.answers.empty': 'まだ回答がありません',

  // ── Admin: Scores ──
  'admin.scores.title': '成績一覧',
  'admin.scores.empty': '参加者なし',

  // ── Admin: QuizList ──
  'admin.quizList.title': 'クイズ一覧',

  // ── Display: Login ──
  'display.login.title': '📺 表示用画面',
  'display.login.placeholder': 'パスワード',
  'display.login.submit': '✨ 表示開始',
  'display.login.submitting': '接続中...',

  // ── Display: Accepting ──
  'display.accepting.waiting': 'まもなく開始します...',
  'display.accepting.scan': '📱 スマホでアクセスしてね！',
  'display.accepting.url': 'URL',
  'display.accepting.players': '参加者:',
  'display.accepting.unit': '名 🌸',

  // ── Display: Question ──
  'display.question.corner': '第{corner}コーナー',
  'display.question.answer': '回答してね！💖',
  'display.question.points': '+{pts} pt ⭐',
  'display.question.correctTitle': '✨ 正解者 ✨',
  'display.question.noCorrectYet': 'まだいないよ...',

  // ── Display: Judging ──
  'display.judging.title': '採点中...',
  'display.judging.hint': 'ちょっと待っててね！',

  // ── Display: Reveal ──
  'display.reveal.correct': '✨ 正解 ✨',
  'display.reveal.correctCount': '正解 🎉',
  'display.reveal.incorrectCount': '不正解 😢',
  'display.reveal.correctPlayersTitle': '正解者（はやい順）🏃‍♀️',
  'display.reveal.noCorrect': '正解者なし... 😭',

  // ── Display: Scores ──
  'display.scores.title': '最終成績発表！',
};
