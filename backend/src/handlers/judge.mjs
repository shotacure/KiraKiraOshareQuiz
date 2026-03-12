import {
  getConnection,
  getGameState,
  getQuiz,
  getAnswer,
  updateAnswerJudgment,
  getPlayer,
  putPlayer,
  getAnswersForQuiz,
} from '../lib/db.mjs';
import { sendToConnection, broadcastToRole } from '../lib/broadcast.mjs';

/**
 * Calculate logarithmic points based on correct-answer rank.
 * Rank 1 (fastest) gets full basePoints.
 * Lower ranks get progressively fewer points using ln decay.
 *
 * Formula: points = max(1, round(basePoints * ln(2) / ln(rank + 1)))
 *   Rank 1 => basePoints * 1.0
 *   Rank 2 => basePoints * 0.63
 *   Rank 3 => basePoints * 0.50
 *   Rank 5 => basePoints * 0.39
 *   Rank 10 => basePoints * 0.29
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

  const gameState = await getGameState();
  const basePoints = quiz.points || 10;

  if (isCorrect) {
    // First, mark as correct temporarily to include in ranking
    await updateAnswerJudgment(quizId, playerId, true, 0);

    // Calculate rank by answeredAt among ALL correct answers (including this one)
    const allAnswers = await getAnswersForQuiz(quizId);
    const correctAnswers = allAnswers
      .filter((a) => a.isCorrect === true)
      .sort((a, b) => new Date(a.answeredAt) - new Date(b.answeredAt));
    const rank = correctAnswers.findIndex((a) => a.playerId === playerId) + 1;
    const pointsAwarded = calcPoints(basePoints, rank);

    // Revert previous judgment if was already correct with different points
    if (answer.isCorrect === true && answer.pointsAwarded > 0) {
      const player = await getPlayer(playerId);
      if (player) {
        player.totalScore = Math.max(0, (player.totalScore || 0) - (answer.pointsAwarded || 0));
        player.correctCount = Math.max(0, (player.correctCount || 0) - 1);
        await putPlayer(player);
      }
    }

    await updateAnswerJudgment(quizId, playerId, true, pointsAwarded);

    // Add points to player
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

    // Broadcast updated correct player list to display (real-time during answering/judging)
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

    // Notify admin
    await broadcastToRole('admin', {
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
    // Revert points if was previously correct
    if (answer.isCorrect === true && answer.pointsAwarded > 0) {
      const player = await getPlayer(playerId);
      if (player) {
        player.totalScore = Math.max(0, (player.totalScore || 0) - (answer.pointsAwarded || 0));
        player.correctCount = Math.max(0, (player.correctCount || 0) - 1);
        await putPlayer(player);
      }
    }

    await updateAnswerJudgment(quizId, playerId, false, 0);

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

    // Update display correct list (may have shrunk)
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

    await broadcastToRole('admin', {
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
