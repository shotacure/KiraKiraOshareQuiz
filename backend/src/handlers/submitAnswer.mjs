import {
  getConnection,
  getGameState,
  getPlayer,
  getAnswer,
  putAnswer,
  getQuiz,
  getAnswersForQuiz,
  getAllPlayers,
  putPlayer,
  updateAnswerJudgment,
} from '../lib/db.mjs';
import { sendToConnection, broadcastToRole, broadcastToAll } from '../lib/broadcast.mjs';

/**
 * Logarithmic point calculation based on answer-speed rank.
 */
function calcPoints(basePoints, rank) {
  if (rank <= 0) return basePoints;
  if (rank === 1) return basePoints;
  const pts = Math.round(basePoints * Math.log(2) / Math.log(rank + 1));
  return Math.max(1, pts);
}

export async function handleSubmitAnswer(connectionId, body) {
  const { quizId, answerText, choiceIndex } = body;

  const conn = await getConnection(connectionId);
  if (!conn || conn.role !== 'player' || !conn.playerId) {
    await sendToConnection(connectionId, {
      event: 'error',
      code: 'not_a_player',
      message: 'not_a_player',
    });
    return { statusCode: 403, body: 'Not a player' };
  }

  const gameState = await getGameState();
  if (gameState.status !== 'answering') {
    await sendToConnection(connectionId, {
      event: 'error',
      code: 'not_accepting_answers',
      message: 'not_accepting_answers',
    });
    return { statusCode: 400, body: 'Not accepting answers' };
  }

  if (gameState.currentQuizId !== quizId) {
    await sendToConnection(connectionId, {
      event: 'error',
      code: 'quiz_id_mismatch',
      message: 'quiz_id_mismatch',
    });
    return { statusCode: 400, body: 'Quiz ID mismatch' };
  }

  const existingAnswer = await getAnswer(quizId, conn.playerId);
  if (existingAnswer) {
    await sendToConnection(connectionId, {
      event: 'error',
      code: 'already_answered',
      message: 'already_answered',
    });
    return { statusCode: 400, body: 'Already answered' };
  }

  const player = await getPlayer(conn.playerId);
  const quiz = await getQuiz(quizId);
  if (!player || !quiz) {
    return { statusCode: 400, body: 'Invalid player or quiz' };
  }

  const now = new Date().toISOString();
  const elapsedMs = gameState.questionStartedAt
    ? new Date(now).getTime() - new Date(gameState.questionStartedAt).getTime()
    : null;

  const answer = {
    quizId,
    playerId: conn.playerId,
    playerName: player.name,
    answeredAt: now,
    isCorrect: null,
    pointsAwarded: 0,
  };

  if (quiz.questionType === 'choice') {
    answer.choiceIndex = choiceIndex;
    answer.answerText = quiz.choices?.[choiceIndex] || `Choice ${choiceIndex}`;
  } else {
    answer.answerText = (answerText || '').trim();
  }

  await putAnswer(answer);

  player.answerCount = (player.answerCount || 0) + 1;
  await putPlayer(player);

  // Auto-judge choice questions: calculate rank and points immediately.
  // Uses count-before-mark approach: count existing correct answers BEFORE marking
  // this one, avoiding GSI eventual consistency issues.
  // Final safety net: recalculateCorrectPoints at reveal time.
  let autoJudged = false;
  if (quiz.questionType === 'choice' && quiz.correctChoiceIndex != null) {
    const isCorrect = choiceIndex === quiz.correctChoiceIndex;
    autoJudged = true;
    const basePoints = quiz.points || 10;

    if (isCorrect) {
      // Count already-correct answers BEFORE marking this one (safe from race conditions)
      const allAnswers = await getAnswersForQuiz(quizId);
      const alreadyCorrectCount = allAnswers.filter(
        (a) => a.isCorrect === true && a.playerId !== conn.playerId
      ).length;
      const rank = alreadyCorrectCount + 1;
      const pointsAwarded = calcPoints(basePoints, rank);

      await updateAnswerJudgment(quizId, conn.playerId, true, pointsAwarded);

      player.totalScore = (player.totalScore || 0) + pointsAwarded;
      player.correctCount = (player.correctCount || 0) + 1;
      await putPlayer(player);

      await sendToConnection(connectionId, {
        event: 'answer_submitted',
        answerText: answer.answerText,
        answeredAt: now,
      });
      await sendToConnection(connectionId, {
        event: 'judgment_result',
        quizId,
        isCorrect: true,
        pointsAwarded,
        totalScore: player.totalScore,
      });

      await broadcastToRole('admin', {
        event: 'new_answer',
        playerId: conn.playerId,
        playerName: player.name,
        answerText: answer.answerText,
        choiceIndex: answer.choiceIndex,
        answeredAt: now,
        elapsedMs,
        isCorrect: true,
        pointsAwarded,
      });

      await broadcastToAll({
        event: 'judgment_updated',
        quizId,
        playerId: conn.playerId,
        isCorrect: true,
        pointsAwarded,
        playerName: player.name,
        totalScore: player.totalScore,
      });

      // Update display correct players
      const updatedAnswers = await getAnswersForQuiz(quizId);
      const correctPlayers = updatedAnswers
        .filter((a) => a.isCorrect === true)
        .sort((a, b) => new Date(a.answeredAt) - new Date(b.answeredAt))
        .map((a, i) => ({
          rank: i + 1,
          playerId: a.playerId,
          playerName: a.playerName,
          pointsAwarded: a.pointsAwarded,
          elapsedMs: gameState.questionStartedAt
            ? new Date(a.answeredAt).getTime() - new Date(gameState.questionStartedAt).getTime()
            : null,
        }));
      await broadcastToRole('display', {
        event: 'live_correct_update',
        quizId,
        correctPlayers,
      });
    } else {
      // Incorrect choice — 0 points
      await updateAnswerJudgment(quizId, conn.playerId, false, 0);

      await sendToConnection(connectionId, {
        event: 'answer_submitted',
        answerText: answer.answerText,
        answeredAt: now,
      });
      await sendToConnection(connectionId, {
        event: 'judgment_result',
        quizId,
        isCorrect: false,
        pointsAwarded: 0,
        totalScore: player.totalScore,
      });

      await broadcastToRole('admin', {
        event: 'new_answer',
        playerId: conn.playerId,
        playerName: player.name,
        answerText: answer.answerText,
        choiceIndex: answer.choiceIndex,
        answeredAt: now,
        elapsedMs,
        isCorrect: false,
        pointsAwarded: 0,
      });

      await broadcastToAll({
        event: 'judgment_updated',
        quizId,
        playerId: conn.playerId,
        isCorrect: false,
        pointsAwarded: 0,
        playerName: player.name,
        totalScore: player.totalScore,
      });
    }
  }

  if (!autoJudged) {
    // Text question: no auto-judging, manual ○× by admin
    await sendToConnection(connectionId, {
      event: 'answer_submitted',
      answerText: answer.answerText,
      answeredAt: now,
    });

    await broadcastToRole('admin', {
      event: 'new_answer',
      playerId: conn.playerId,
      playerName: player.name,
      answerText: answer.answerText,
      choiceIndex: answer.choiceIndex,
      answeredAt: now,
      elapsedMs,
      isCorrect: null,
    });
  }

  // Update display answer count
  const allAnswers = await getAnswersForQuiz(quizId);
  const allPlayers = await getAllPlayers();
  await broadcastToRole('display', {
    event: 'answer_count_update',
    count: allAnswers.length,
    total: allPlayers.length,
  });

  return { statusCode: 200, body: 'Answer submitted' };
}
