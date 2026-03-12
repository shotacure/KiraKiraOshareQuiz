import { getConnection, updateGameState, getAllPlayers, getGameState, getAllQuizzes } from '../lib/db.mjs';
import { sendToConnection, broadcastToAll } from '../lib/broadcast.mjs';

export async function handleShowScores(connectionId) {
  const conn = await getConnection(connectionId);
  if (!conn || conn.role !== 'admin') {
    return { statusCode: 403, body: 'Admin only' };
  }

  const gameState = await getGameState();

  // Only allow from showing_answer when all questions are done
  if (gameState.status !== 'showing_answer') {
    await sendToConnection(connectionId, {
      event: 'error',
      message: '正解発表後にのみ成績発表できます',
    });
    return { statusCode: 400, body: 'Invalid state' };
  }

  const allQuizzes = await getAllQuizzes();
  const history = gameState.questionHistory || [];
  if (history.length < allQuizzes.length) {
    await sendToConnection(connectionId, {
      event: 'error',
      message: `まだ全問出題されていません (${history.length}/${allQuizzes.length})`,
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

  return { statusCode: 200, body: 'Scores shown' };
}
