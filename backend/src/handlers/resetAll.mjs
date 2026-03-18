import {
  getConnection,
  updateGameState,
  deleteAllPlayers,
  deleteAllQuizzes,
  getAllQuizzes,
} from '../lib/db.mjs';
import { broadcastToAll } from '../lib/broadcast.mjs';

export async function handleResetAll(connectionId) {
  const conn = await getConnection(connectionId);
  if (!conn || conn.role !== 'admin') {
    return { statusCode: 403, body: 'Admin only' };
  }

  const quizzes = await getAllQuizzes();
  const { deleteAllAnswersForQuiz } = await import('../lib/db.mjs');
  for (const q of quizzes) {
    await deleteAllAnswersForQuiz(q.quizId);
  }

  await deleteAllPlayers();
  await deleteAllQuizzes();

  await updateGameState({
    status: 'init',
    currentQuizId: null,
    questionStartedAt: null,
    questionHistory: [],
    revealedAnswer: false,
    sessionId: null,
    quizTitle: null,
  });

  await broadcastToAll({
    event: 'full_reset',
    status: 'init',
    sessionId: null,
  });

  return { statusCode: 200, body: 'Full reset complete' };
}
