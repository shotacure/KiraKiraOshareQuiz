import {
  getConnection,
  getGameState,
  getQuiz,
  getAnswer,
  updateAnswerJudgment,
  getPlayer,
  putPlayer,
} from '../lib/db.mjs';
import { sendToConnection, broadcastToRole } from '../lib/broadcast.mjs';

export async function handleJudge(connectionId, body) {
  const conn = await getConnection(connectionId);
  if (!conn || conn.role !== 'admin') {
    return { statusCode: 403, body: 'Admin only' };
  }

  const { quizId, playerId, isCorrect } = body;
  if (!quizId || !playerId || typeof isCorrect !== 'boolean') {
    return { statusCode: 400, body: 'Missing fields' };
  }

  const quiz = await getQuiz(quizId);
  if (!quiz) return { statusCode: 404, body: 'Quiz not found' };

  const answer = await getAnswer(quizId, playerId);
  if (!answer) return { statusCode: 404, body: 'Answer not found' };

  const pointsAwarded = isCorrect ? (quiz.points || 10) : 0;

  // Update answer record
  await updateAnswerJudgment(quizId, playerId, isCorrect, pointsAwarded);

  // Update player score if correct (and not already judged correct)
  if (isCorrect && answer.isCorrect !== true) {
    const player = await getPlayer(playerId);
    if (player) {
      player.totalScore = (player.totalScore || 0) + pointsAwarded;
      player.correctCount = (player.correctCount || 0) + 1;
      await putPlayer(player);
    }
  }

  // If previously judged correct and now incorrect, revert score
  if (!isCorrect && answer.isCorrect === true) {
    const player = await getPlayer(playerId);
    if (player) {
      player.totalScore = Math.max(0, (player.totalScore || 0) - (answer.pointsAwarded || 0));
      player.correctCount = Math.max(0, (player.correctCount || 0) - 1);
      await putPlayer(player);
    }
  }

  // Notify the player
  const player = await getPlayer(playerId);
  if (player && player.connectionId) {
    await sendToConnection(player.connectionId, {
      event: 'judgment_result',
      quizId,
      isCorrect,
      pointsAwarded,
      totalScore: player.totalScore,
    });
  }

  // Notify admin of the update
  await broadcastToRole('admin', {
    event: 'judgment_updated',
    quizId,
    playerId,
    isCorrect,
    pointsAwarded,
    playerName: player?.name,
    totalScore: player?.totalScore,
  });

  return { statusCode: 200, body: 'Judged' };
}
