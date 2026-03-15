import { getConnection, putQuizBatch, getAllQuizzes, updateGameState, getGameState } from '../lib/db.mjs';
import { sendToConnection, broadcastToAll } from '../lib/broadcast.mjs';
import { randomUUID } from 'crypto';

export async function handleLoadQuizzes(connectionId, body) {
  const conn = await getConnection(connectionId);
  if (!conn || conn.role !== 'admin') {
    return { statusCode: 403, body: 'Admin only' };
  }

  const gameState = await getGameState();
  if (gameState.status !== 'init') {
    await sendToConnection(connectionId, {
      event: 'error',
      code: 'not_init_state',
      message: 'not_init_state',
    });
    return { statusCode: 400, body: 'Can only load in init state' };
  }

  const { quizzes } = body;
  if (!Array.isArray(quizzes) || quizzes.length === 0) {
    await sendToConnection(connectionId, {
      event: 'error',
      code: 'empty_quizzes',
      message: 'empty_quizzes',
    });
    return { statusCode: 400, body: 'No quizzes provided' };
  }

  const validated = [];
  for (let i = 0; i < quizzes.length; i++) {
    const q = quizzes[i];
    if (!q.questionText || !q.questionType) {
      await sendToConnection(connectionId, {
        event: 'error',
        code: 'invalid_quiz',
        row: i + 1,
        message: 'invalid_quiz',
      });
      return { statusCode: 400, body: `Invalid quiz at index ${i}` };
    }

    const questionNumber = q.questionNumber || i + 1;
    validated.push({
      quizId: q.quizId || `q${String(questionNumber).padStart(3, '0')}`,
      questionNumber,
      questionText: q.questionText,
      questionType: q.questionType,
      modelAnswer: q.modelAnswer || null,
      acceptableAnswers: q.acceptableAnswers || [],
      choices: q.choices || [],
      correctChoiceIndex: q.correctChoiceIndex ?? null,
      points: q.points || 10,
      order: q.order || questionNumber,
    });
  }

  await putQuizBatch(validated);

  // Generate a unique session ID for this quiz session
  const sessionId = randomUUID();

  await updateGameState({
    status: 'accepting',
    questionHistory: [],
    sessionId,
  });

  const allQuizzes = await getAllQuizzes();

  await sendToConnection(connectionId, {
    event: 'quizzes_loaded',
    count: validated.length,
    quizzes: allQuizzes,
    sessionId,
  });

  // Broadcast with sessionId so player clients can store it
  await broadcastToAll({
    event: 'game_state_update',
    status: 'accepting',
    totalQuizCount: allQuizzes.length,
    sessionId,
  });

  return { statusCode: 200, body: `${validated.length} quizzes loaded` };
}
