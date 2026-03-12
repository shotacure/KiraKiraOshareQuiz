import {
  getConnection,
  updateGameState,
  getGameState,
  getQuiz,
  getAnswersForQuiz,
  updateAnswerJudgment,
  getPlayer,
} from '../lib/db.mjs';
import { broadcastToAll, sendToConnection } from '../lib/broadcast.mjs';

export async function handleRevealAnswer(connectionId) {
  const conn = await getConnection(connectionId);
  if (!conn || conn.role !== 'admin') {
    return { statusCode: 403, body: 'Admin only' };
  }

  const gameState = await getGameState();
  if (!gameState.currentQuizId) {
    return { statusCode: 400, body: 'No active question' };
  }

  const quiz = await getQuiz(gameState.currentQuizId);
  if (!quiz) return { statusCode: 404, body: 'Quiz not found' };

  // Auto-mark any unjudged answers as incorrect
  const answers = await getAnswersForQuiz(gameState.currentQuizId);
  for (const a of answers) {
    if (a.isCorrect === null) {
      await updateAnswerJudgment(gameState.currentQuizId, a.playerId, false, 0);
      // Notify the player they were incorrect
      const player = await getPlayer(a.playerId);
      if (player?.connectionId) {
        await sendToConnection(player.connectionId, {
          event: 'judgment_result',
          quizId: gameState.currentQuizId,
          isCorrect: false,
          pointsAwarded: 0,
          totalScore: player.totalScore,
        });
      }
    }
  }

  await updateGameState({
    status: 'showing_answer',
    revealedAnswer: true,
  });

  // Re-fetch answers after auto-marking
  const finalAnswers = await getAnswersForQuiz(gameState.currentQuizId);
  const correctPlayers = finalAnswers
    .filter((a) => a.isCorrect === true)
    .sort((a, b) => new Date(a.answeredAt) - new Date(b.answeredAt))
    .map((a, i) => ({
      rank: i + 1,
      playerId: a.playerId,
      playerName: a.playerName,
      pointsAwarded: a.pointsAwarded,
      answeredAt: a.answeredAt,
      elapsedMs: gameState.questionStartedAt
        ? new Date(a.answeredAt).getTime() - new Date(gameState.questionStartedAt).getTime()
        : null,
    }));

  const correctAnswer =
    quiz.questionType === 'choice'
      ? quiz.choices[quiz.correctChoiceIndex]
      : quiz.modelAnswer;

  const totalAnswers = finalAnswers.length;
  const correctCount = correctPlayers.length;

  await broadcastToAll({
    event: 'answer_revealed',
    quizId: quiz.quizId,
    correctAnswer,
    questionText: quiz.questionText,
    points: quiz.points,
    correctPlayers,
    totalAnswers,
    correctCount,
    incorrectCount: totalAnswers - correctCount,
  });

  return { statusCode: 200, body: 'Answer revealed' };
}
