import {
  getConnection,
  getGameState,
  getPlayer,
  getAnswer,
  putAnswer,
  getQuiz,
  getAnswersForQuiz,
  getAllPlayers,
} from '../lib/db.mjs';
import { sendToConnection, broadcastToRole } from '../lib/broadcast.mjs';

export async function handleSubmitAnswer(connectionId, body) {
  const { quizId, answerText, choiceIndex } = body;

  // Verify connection is a player
  const conn = await getConnection(connectionId);
  if (!conn || conn.role !== 'player' || !conn.playerId) {
    await sendToConnection(connectionId, {
      event: 'error',
      message: 'プレイヤーとして登録されていません',
    });
    return { statusCode: 403, body: 'Not a player' };
  }

  // Verify game is in answering state
  const gameState = await getGameState();
  if (gameState.status !== 'answering') {
    await sendToConnection(connectionId, {
      event: 'error',
      message: '現在回答を受け付けていません',
    });
    return { statusCode: 400, body: 'Not accepting answers' };
  }

  // Verify quiz matches current question
  if (gameState.currentQuizId !== quizId) {
    await sendToConnection(connectionId, {
      event: 'error',
      message: '問題IDが一致しません',
    });
    return { statusCode: 400, body: 'Quiz ID mismatch' };
  }

  // Check for duplicate answer
  const existingAnswer = await getAnswer(quizId, conn.playerId);
  if (existingAnswer) {
    await sendToConnection(connectionId, {
      event: 'error',
      message: 'すでに回答済みです',
    });
    return { statusCode: 400, body: 'Already answered' };
  }

  // Get player info and quiz info
  const player = await getPlayer(conn.playerId);
  const quiz = await getQuiz(quizId);

  if (!player || !quiz) {
    return { statusCode: 400, body: 'Invalid player or quiz' };
  }

  const now = new Date().toISOString();

  // Build answer record
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
    answer.answerText = quiz.choices?.[choiceIndex] || `選択肢${choiceIndex}`;
  } else {
    answer.answerText = (answerText || '').trim();
  }

  await putAnswer(answer);

  // Confirm to player
  await sendToConnection(connectionId, {
    event: 'answer_submitted',
    answerText: answer.answerText,
    answeredAt: now,
  });

  // Notify admin with full answer details
  await broadcastToRole('admin', {
    event: 'new_answer',
    playerId: conn.playerId,
    playerName: player.name,
    answerText: answer.answerText,
    choiceIndex: answer.choiceIndex,
    answeredAt: now,
    elapsedMs: gameState.questionStartedAt
      ? new Date(now).getTime() - new Date(gameState.questionStartedAt).getTime()
      : null,
  });

  // Notify display with answer count
  const allAnswers = await getAnswersForQuiz(quizId);
  const allPlayers = await getAllPlayers();
  await broadcastToRole('display', {
    event: 'answer_count_update',
    count: allAnswers.length,
    total: allPlayers.length,
  });

  return { statusCode: 200, body: 'Answer submitted' };
}
