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
} from '../lib/db.mjs';
import { sendToConnection, broadcastToRole } from '../lib/broadcast.mjs';

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

  const allAnswers = await getAnswersForQuiz(quizId);
  const allPlayers = await getAllPlayers();
  await broadcastToRole('display', {
    event: 'answer_count_update',
    count: allAnswers.length,
    total: allPlayers.length,
  });

  return { statusCode: 200, body: 'Answer submitted' };
}
