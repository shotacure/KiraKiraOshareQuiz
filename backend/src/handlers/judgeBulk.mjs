import {
  getConnection,
  getQuiz,
  getAnswersForQuiz,
  updateAnswerJudgment,
  getPlayer,
  putPlayer,
  getAllPlayers,
} from '../lib/db.mjs';
import { broadcastToRole, broadcastToAll } from '../lib/broadcast.mjs';
import { sendToConnection } from '../lib/broadcast.mjs';

export async function handleJudgeBulk(connectionId, body) {
  const conn = await getConnection(connectionId);
  if (!conn || conn.role !== 'admin') {
    return { statusCode: 403, body: 'Admin only' };
  }

  const { quizId, judgments } = body;
  // judgments: [{ playerId, isCorrect }, ...]

  if (!quizId || !Array.isArray(judgments)) {
    return { statusCode: 400, body: 'Missing fields' };
  }

  const quiz = await getQuiz(quizId);
  if (!quiz) return { statusCode: 404, body: 'Quiz not found' };

  const points = quiz.points || 10;

  for (const j of judgments) {
    const { playerId, isCorrect } = j;
    const pointsAwarded = isCorrect ? points : 0;

    await updateAnswerJudgment(quizId, playerId, isCorrect, pointsAwarded);

    if (isCorrect) {
      const player = await getPlayer(playerId);
      if (player) {
        player.totalScore = (player.totalScore || 0) + pointsAwarded;
        player.correctCount = (player.correctCount || 0) + 1;
        await putPlayer(player);

        // Notify the player
        if (player.connectionId) {
          await sendToConnection(player.connectionId, {
            event: 'judgment_result',
            quizId,
            isCorrect: true,
            pointsAwarded,
            totalScore: player.totalScore,
          });
        }
      }
    } else {
      const player = await getPlayer(playerId);
      if (player && player.connectionId) {
        await sendToConnection(player.connectionId, {
          event: 'judgment_result',
          quizId,
          isCorrect: false,
          pointsAwarded: 0,
          totalScore: player.totalScore,
        });
      }
    }
  }

  // Send updated scores to admin
  const allPlayers = await getAllPlayers();
  await broadcastToRole('admin', {
    event: 'scores_update',
    rankings: allPlayers.map((p, i) => ({
      rank: i + 1,
      playerId: p.playerId,
      name: p.name,
      totalScore: p.totalScore,
      correctCount: p.correctCount,
    })),
  });

  return { statusCode: 200, body: 'Bulk judged' };
}
