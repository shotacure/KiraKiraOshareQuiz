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
import { broadcastToAll, broadcastToRole, sendToConnection } from '../lib/broadcast.mjs';

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

    const diff = correctPts - (a.pointsAwarded || 0);
    if (diff !== 0) {
      await updateAnswerJudgment(quizId, a.playerId, true, correctPts);

      const player = await getPlayer(a.playerId);
      if (player) {
        player.totalScore = (player.totalScore || 0) + diff;
        await putPlayer(player);

        if (player.connectionId) {
          await sendToConnection(player.connectionId, {
            event: 'judgment_result',
            quizId,
            isCorrect: true,
            pointsAwarded: correctPts,
            totalScore: player.totalScore,
          });
        }

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

export async function handleCloseAnswers(connectionId) {
  const conn = await getConnection(connectionId);
  if (!conn || conn.role !== 'admin') {
    return { statusCode: 403, body: 'Admin only' };
  }

  const gameState = await getGameState();
  if (gameState.status !== 'answering') {
    return { statusCode: 400, body: 'Not in answering state' };
  }

  const answers = await getAnswersForQuiz(gameState.currentQuizId);
  const allJudged = answers.length > 0 && answers.every(a => a.isCorrect !== null);

  if (allJudged) {
    // All answers already judged (e.g. choice question with auto-judge)
    // Skip judging phase and go straight to reveal
    await performReveal(gameState);
  } else {
    // Text questions or mixed: enter manual judging phase
    await updateGameState({ status: 'judging' });

    await broadcastToAll({ event: 'answers_closed' });

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
        pointsAwarded: a.pointsAwarded,
        elapsedMs: gameState.questionStartedAt
          ? new Date(a.answeredAt).getTime() - new Date(gameState.questionStartedAt).getTime()
          : null,
      })),
    });
  }

  return { statusCode: 200, body: 'Answers closed' };
}

/**
 * Perform answer reveal: auto-mark unjudged as incorrect,
 * recalculate all correct answer points, then broadcast results.
 */
async function performReveal(gameState) {
  const quiz = await getQuiz(gameState.currentQuizId);
  if (!quiz) return;

  // Auto-mark any remaining unjudged answers as incorrect
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

  // Re-fetch after recalculation
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
}
