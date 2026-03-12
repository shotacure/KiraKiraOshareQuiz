import { getConnection, updateGameState, getQuiz, getGameState, getAllQuizzes } from '../lib/db.mjs';
import { sendToConnection, broadcastToAll } from '../lib/broadcast.mjs';

export async function handleStartQuestion(connectionId, body) {
  const conn = await getConnection(connectionId);
  if (!conn || conn.role !== 'admin') {
    return { statusCode: 403, body: 'Admin only' };
  }

  const gameState = await getGameState();

  if (gameState.status !== 'accepting' && gameState.status !== 'showing_answer') {
    await sendToConnection(connectionId, {
      event: 'error',
      code: 'invalid_state',
      message: 'invalid_state',
    });
    return { statusCode: 400, body: 'Invalid state for starting question' };
  }

  const { quizId } = body;
  if (!quizId) {
    await sendToConnection(connectionId, {
      event: 'error',
      code: 'quiz_id_required',
      message: 'quiz_id_required',
    });
    return { statusCode: 400, body: 'quizId required' };
  }

  const quiz = await getQuiz(quizId);
  if (!quiz) {
    await sendToConnection(connectionId, {
      event: 'error',
      code: 'quiz_not_found',
      message: 'quiz_not_found',
    });
    return { statusCode: 404, body: 'Quiz not found' };
  }

  const now = new Date().toISOString();
  const history = gameState.questionHistory || [];
  if (!history.includes(quizId)) {
    history.push(quizId);
  }

  const allQuizzes = await getAllQuizzes();

  await updateGameState({
    status: 'answering',
    currentQuizId: quizId,
    questionStartedAt: now,
    revealedAnswer: false,
    questionHistory: history,
  });

  const playerPayload = {
    event: 'question_started',
    quizId: quiz.quizId,
    questionNumber: quiz.questionNumber,
    questionText: quiz.questionText,
    questionType: quiz.questionType,
    points: quiz.points,
    questionIndex: history.length,
    totalQuizCount: allQuizzes.length,
  };

  if (quiz.questionType === 'choice') {
    playerPayload.choices = quiz.choices;
  }

  await broadcastToAll(playerPayload);

  return { statusCode: 200, body: 'Question started' };
}
