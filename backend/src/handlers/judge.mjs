import {
  getConnection,
  getQuiz,
  getAnswer,
  getPlayer,
  putPlayer,
  getAnswersForQuiz,
  updateAnswerJudgment,
  getGameState,
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

  // Guard: already judged — prevent double scoring
  if (answer.isCorrect !== null) {
    return { statusCode: 200, body: 'Already judged' };
  }

  const gameState = await getGameState();
  const basePoints = quiz.points || 10;

  if (isCorrect) {
    // Count-before-mark: count existing correct answers before marking this one
    const allAnswers = await getAnswersForQuiz(quizId);
    const alreadyCorrectCount = allAnswers.filter(
      (a) => a.isCorrect === true && a.playerId !== playerId
    ).length;
    const rank = alreadyCorrectCount + 1;
    const pointsAwarded = calcPoints(basePoints, rank);

    await updateAnswerJudgment(quizId, playerId, true, pointsAwarded);

    const player = await getPlayer(playerId);
    if (player) {
      player.totalScore = (player.totalScore || 0) + pointsAwarded;
      player.correctCount = (player.correctCount || 0) + 1;
      player.correctStreak = (player.correctStreak || 0) + 1;
      await putPlayer(player);

      if (player.connectionId) {
        await sendToConnection(player.connectionId, {
          event: 'judgment_result',
          quizId,
          isCorrect: true,
          pointsAwarded,
          totalScore: player.totalScore,
          streak: player.correctStreak,
        });
      }
    }

    // Broadcast live correct list to display
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

    // Notify all clients for scoreboard update
    await broadcastToAll({
      event: 'judgment_updated',
      quizId,
      playerId,
      isCorrect: true,
      pointsAwarded,
      playerName: player?.name,
      totalScore: player?.totalScore,
    });
  } else {
    // Marking as incorrect
    await updateAnswerJudgment(quizId, playerId, false, 0);

    const player = await getPlayer(playerId);
    if (player) {
      // Reset correct streak on incorrect
      player.correctStreak = 0;
      await putPlayer(player);

      if (player.connectionId) {
        await sendToConnection(player.connectionId, {
          event: 'judgment_result',
          quizId,
          isCorrect: false,
          pointsAwarded: 0,
          totalScore: player.totalScore,
          streak: 0,
        });
      }
    }

    await broadcastToAll({
      event: 'judgment_updated',
      quizId,
      playerId,
      isCorrect: false,
      pointsAwarded: 0,
      playerName: player?.name,
      totalScore: player?.totalScore,
    });
  }

  return { statusCode: 200, body: 'Judged' };
}
