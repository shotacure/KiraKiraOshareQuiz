import { getConnection, updateGameState, getQuiz, getGameState } from '../lib/db.mjs';
import { sendToConnection, broadcastToAll } from '../lib/broadcast.mjs';

export async function handleStartQuestion(connectionId, body) {
  // Verify admin
  const conn = await getConnection(connectionId);
  if (!conn || conn.role !== 'admin') {
    return { statusCode: 403, body: 'Admin only' };
  }

  const { quizId } = body;
  if (!quizId) {
    await sendToConnection(connectionId, {
      event: 'error',
      message: '問題IDが指定されていません',
    });
    return { statusCode: 400, body: 'quizId required' };
  }

  const quiz = await getQuiz(quizId);
  if (!quiz) {
    await sendToConnection(connectionId, {
      event: 'error',
      message: '問題が見つかりません',
    });
    return { statusCode: 404, body: 'Quiz not found' };
  }

  const now = new Date().toISOString();
  const gameState = await getGameState();
  const history = gameState.questionHistory || [];
  if (!history.includes(quizId)) {
    history.push(quizId);
  }

  // Update game state to answering
  await updateGameState({
    status: 'answering',
    currentQuizId: quizId,
    questionStartedAt: now,
    revealedAnswer: false,
    questionHistory: history,
  });

  // Build question payload for players (no answer info)
  const playerPayload = {
    event: 'question_started',
    quizId: quiz.quizId,
    cornerNumber: quiz.cornerNumber,
    cornerTitle: quiz.cornerTitle,
    questionNumber: quiz.questionNumber,
    questionText: quiz.questionText,
    questionType: quiz.questionType,
    points: quiz.points,
  };

  if (quiz.questionType === 'choice') {
    playerPayload.choices = quiz.choices;
  }

  // Broadcast to all (admin/display get same structure, admin already has full quiz data)
  await broadcastToAll(playerPayload);

  return { statusCode: 200, body: 'Question started' };
}
