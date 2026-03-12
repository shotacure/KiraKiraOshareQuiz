import { getConnection, updateGameState, getGameState, getAnswersForQuiz } from '../lib/db.mjs';
import { broadcastToAll, broadcastToRole } from '../lib/broadcast.mjs';

export async function handleCloseAnswers(connectionId) {
  const conn = await getConnection(connectionId);
  if (!conn || conn.role !== 'admin') {
    return { statusCode: 403, body: 'Admin only' };
  }

  const gameState = await getGameState();
  if (gameState.status !== 'answering') {
    return { statusCode: 400, body: 'Not in answering state' };
  }

  await updateGameState({ status: 'judging' });

  // Notify all clients
  await broadcastToAll({
    event: 'answers_closed',
    message: '回答を締め切りました',
  });

  // Send full answer list to admin for judging
  const answers = await getAnswersForQuiz(gameState.currentQuizId);
  await broadcastToRole('admin', {
    event: 'answers_for_judging',
    quizId: gameState.currentQuizId,
    answers: answers.map((a) => ({
      playerId: a.playerId,
      playerName: a.playerName,
      answerText: a.answerText,
      choiceIndex: a.choiceIndex,
      answeredAt: a.answeredAt,
      isCorrect: a.isCorrect,
    })),
  });

  return { statusCode: 200, body: 'Answers closed' };
}
