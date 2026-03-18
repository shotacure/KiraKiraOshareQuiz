import {
  getConnection,
  updateGameState,
  getGameState,
  getQuiz,
  getAnswersForQuiz,
  updateAnswerJudgment,
  getPlayer,
  putPlayer,
  getAllPlayers,
} from '../lib/db.mjs';
import { broadcastToAll, broadcastToRole, sendToConnection } from '../lib/broadcast.mjs';

function calcPoints(basePoints, rank) {
  if (rank <= 0) return basePoints;
  if (rank === 1) return basePoints;
  const pts = Math.round(basePoints * Math.log(2) / Math.log(rank + 1));
  return Math.max(1, pts);
}

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
            streak: player.correctStreak || 0,
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
    // All auto-judged (choice questions) — skip judging, go to reveal
    await performReveal(gameState);
  } else {
    // Text questions: enter manual judging phase
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

async function performReveal(gameState) {
  const quiz = await getQuiz(gameState.currentQuizId);
  if (!quiz) return;

  // Auto-mark unjudged as incorrect and reset streak
  const answers = await getAnswersForQuiz(gameState.currentQuizId);
  for (const a of answers) {
    if (a.isCorrect === null) {
      await updateAnswerJudgment(gameState.currentQuizId, a.playerId, false, 0);
      const player = await getPlayer(a.playerId);
      if (player) {
        player.correctStreak = 0;
        await putPlayer(player);
        if (player.connectionId) {
          await sendToConnection(player.connectionId, {
            event: 'judgment_result',
            quizId: gameState.currentQuizId,
            isCorrect: false,
            pointsAwarded: 0,
            totalScore: player.totalScore,
            streak: 0,
          });
        }
      }
    }
  }

  // Reset streak for non-answerers
  const allPlayers = await getAllPlayers();
  const answeredPlayerIds = new Set(answers.map(a => a.playerId));
  for (const p of allPlayers) {
    if (!answeredPlayerIds.has(p.playerId) && (p.correctStreak || 0) > 0) {
      p.correctStreak = 0;
      await putPlayer(p);
    }
  }

  // Recalculate correct answer points (safety net)
  await recalculateCorrectPoints(gameState.currentQuizId, quiz.points || 10);

  await updateGameState({
    status: 'showing_answer',
    revealedAnswer: true,
  });

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
  const correctRate = totalAnswers > 0 ? Math.round((correctCount / totalAnswers) * 100) : 0;

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
    correctRate,
  });
}
