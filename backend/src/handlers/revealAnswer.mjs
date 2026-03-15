import {
  getConnection,
  updateGameState,
  getGameState,
  getQuiz,
  getAnswersForQuiz,
  updateAnswerJudgment,
  getPlayer,
  putPlayer,
} from '../lib/db.mjs';
import { broadcastToAll, sendToConnection } from '../lib/broadcast.mjs';

/**
 * Logarithmic point calculation based on answer-speed rank.
 */
function calcPoints(basePoints, rank) {
  if (rank <= 0) return basePoints;
  if (rank === 1) return basePoints;
  const pts = Math.round(basePoints * Math.log(2) / Math.log(rank + 1));
  return Math.max(1, pts);
}

/**
 * Recalculate points for all correct answers based on definitive answeredAt order.
 * Fixes any race-condition-induced point miscalculation from submit-time auto-judging.
 */
async function recalculateCorrectPoints(quizId, basePoints) {
  const allAnswers = await getAnswersForQuiz(quizId);
  const correctAnswers = allAnswers
    .filter((a) => a.isCorrect === true)
    .sort((a, b) => new Date(a.answeredAt) - new Date(b.answeredAt));

  for (let i = 0; i < correctAnswers.length; i++) {
    const a = correctAnswers[i];
    const correctRank = i + 1;
    const correctPts = calcPoints(basePoints, correctRank);

    // Always update if points differ (fixes race conditions from auto-judge)
    const diff = correctPts - (a.pointsAwarded || 0);
    if (diff !== 0) {
      await updateAnswerJudgment(quizId, a.playerId, true, correctPts);

      const player = await getPlayer(a.playerId);
      if (player) {
        player.totalScore = (player.totalScore || 0) + diff;
        await putPlayer(player);

        // Notify the player of finalized points
        if (player.connectionId) {
          await sendToConnection(player.connectionId, {
            event: 'judgment_result',
            quizId,
            isCorrect: true,
            pointsAwarded: correctPts,
            totalScore: player.totalScore,
          });
        }

        // Update all clients' player lists for rank display
        await broadcastToAll({
          event: 'judgment_updated',
          quizId,
          playerId: a.playerId,
          isCorrect: true,
          pointsAwarded: correctPts,
          playerName: player.name,
          totalScore: player.totalScore,
        });
      }
    }
  }
}

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

  // Recalculate all correct answer points to fix any race-condition discrepancies
  await recalculateCorrectPoints(gameState.currentQuizId, quiz.points || 10);

  await updateGameState({
    status: 'showing_answer',
    revealedAnswer: true,
  });

  // Re-fetch answers after recalculation
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
    acceptableAnswers: quiz.acceptableAnswers || [],
    questionText: quiz.questionText,
    points: quiz.points,
    correctPlayers,
    totalAnswers,
    correctCount,
    incorrectCount: totalAnswers - correctCount,
  });

  return { statusCode: 200, body: 'Answer revealed' };
}
