import {
  getConnection,
  updateGameState,
  getAllPlayers,
  getGameState,
  getAllQuizzes,
  getAnswersForQuiz,
} from '../lib/db.mjs';
import { sendToConnection, broadcastToAll } from '../lib/broadcast.mjs';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const s3 = new S3Client({});
const RESULTS_BUCKET = process.env.RESULTS_BUCKET;

function formatMs(ms) {
  if (ms == null) return '-';
  return (ms / 1000).toFixed(1) + 's';
}

/**
 * Generate a human-readable text report of quiz results.
 */
async function generateReport(gameState, players, quizzes) {
  const title = gameState.quizTitle || 'クイズ結果';
  const now = new Date();
  const jstStr = new Date(now.getTime() + 9 * 60 * 60 * 1000)
    .toISOString().replace('T', ' ').replace(/\.\d+Z$/, '') + ' (JST)';

  const lines = [];
  lines.push('='.repeat(60));
  lines.push(`${title} — 結果レポート`);
  lines.push(jstStr);
  lines.push('='.repeat(60));
  lines.push('');

  // Final standings
  lines.push('■ 最終成績');
  lines.push('─'.repeat(50));
  lines.push(` ${'順位'.padEnd(6)} ${'名前'.padEnd(16)} ${'得点'.padEnd(8)} 正解数`);
  lines.push('─'.repeat(50));
  const sorted = [...players].sort((a, b) => (b.totalScore || 0) - (a.totalScore || 0));
  sorted.forEach((p, i) => {
    const rank = `${i + 1}位`;
    const name = (p.name || '').padEnd(14);
    const score = `${p.totalScore || 0}pt`.padEnd(6);
    const correct = `${p.correctCount || 0}/${quizzes.length}`;
    lines.push(` ${rank.padEnd(6)} ${name} ${score} ${correct}`);
  });
  lines.push('─'.repeat(50));
  lines.push('');

  // Per-question results
  lines.push('■ 問題別結果');
  lines.push('');

  for (const quiz of quizzes) {
    const typeLabel = quiz.questionType === 'choice' ? '選択' : 'テキスト';
    lines.push(`Q${quiz.questionNumber}: ${quiz.questionText} (${typeLabel}, ${quiz.points}pt)`);

    if (quiz.modelAnswer) {
      lines.push(`  模範解答: ${quiz.modelAnswer}`);
    }
    if (quiz.acceptableAnswers && quiz.acceptableAnswers.length > 0) {
      lines.push(`  許容解答: ${quiz.acceptableAnswers.join(', ')}`);
    }

    const answers = await getAnswersForQuiz(quiz.quizId);
    const correctCount = answers.filter(a => a.isCorrect === true).length;
    const rate = answers.length > 0 ? Math.round((correctCount / answers.length) * 100) : 0;
    lines.push(`  正解率: ${correctCount}/${answers.length} (${rate}%)`);

    if (answers.length > 0) {
      lines.push(`  ${'─'.repeat(46)}`);
      lines.push(`   ${'順位'.padEnd(6)} ${'名前'.padEnd(14)} ${'回答'.padEnd(14)} ${'時間'.padEnd(8)} ${'結果'.padEnd(4)} 得点`);
      lines.push(`  ${'─'.repeat(46)}`);

      const sortedAnswers = [...answers].sort((a, b) =>
        new Date(a.answeredAt) - new Date(b.answeredAt)
      );

      let correctRank = 0;
      sortedAnswers.forEach(a => {
        const isCorrect = a.isCorrect === true;
        if (isCorrect) correctRank++;
        const rank = isCorrect ? `${correctRank}` : '-';
        const name = (a.playerName || '').padEnd(12);
        const ans = (a.answerText || '').substring(0, 12).padEnd(12);
        const elapsed = formatMs(
          a.answeredAt && gameState.questionStartedAt
            ? new Date(a.answeredAt).getTime() - new Date(gameState.questionStartedAt).getTime()
            : null
        ).padEnd(6);
        const result = isCorrect ? '○' : '×';
        const pts = isCorrect ? `+${a.pointsAwarded || 0}` : '0';
        lines.push(`   ${rank.padEnd(6)} ${name} ${ans} ${elapsed} ${result.padEnd(4)} ${pts}`);
      });
      lines.push(`  ${'─'.repeat(46)}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

export async function handleShowScores(connectionId) {
  const conn = await getConnection(connectionId);
  if (!conn || conn.role !== 'admin') {
    return { statusCode: 403, body: 'Admin only' };
  }

  const gameState = await getGameState();
  if (gameState.status !== 'showing_answer') {
    await sendToConnection(connectionId, {
      event: 'error',
      code: 'invalid_state',
      message: 'invalid_state',
    });
    return { statusCode: 400, body: 'Invalid state' };
  }

  const allQuizzes = await getAllQuizzes();
  const history = gameState.questionHistory || [];
  if (history.length < allQuizzes.length) {
    await sendToConnection(connectionId, {
      event: 'error',
      code: 'not_all_questions',
      message: 'not_all_questions',
    });
    return { statusCode: 400, body: 'Not all questions asked' };
  }

  await updateGameState({ status: 'showing_scores' });

  const players = await getAllPlayers();
  const rankings = players.map((p, i) => ({
    rank: i + 1,
    playerId: p.playerId,
    name: p.name,
    totalScore: p.totalScore,
    correctCount: p.correctCount,
    answerCount: p.answerCount,
  }));

  await broadcastToAll({
    event: 'scores_revealed',
    rankings,
  });

  // Export results to S3
  if (RESULTS_BUCKET) {
    try {
      const report = await generateReport(gameState, players, allQuizzes);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const sessionTag = (gameState.sessionId || 'unknown').substring(0, 8);
      const key = `results/${sessionTag}_${timestamp}.txt`;

      await s3.send(new PutObjectCommand({
        Bucket: RESULTS_BUCKET,
        Key: key,
        Body: report,
        ContentType: 'text/plain; charset=utf-8',
      }));
      console.log(`[S3] Report exported: s3://${RESULTS_BUCKET}/${key}`);
    } catch (err) {
      console.error('[S3] Failed to export report:', err);
      // Non-fatal: don't fail the entire operation
    }
  }

  return { statusCode: 200, body: 'Scores shown' };
}
