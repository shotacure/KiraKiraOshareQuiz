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

  // Delete all answers for each quiz
  const quizzes = await getAllQuizzes();
  const { deleteAllAnswersForQuiz } = await import('../lib/db.mjs');
  for (const q of quizzes) {
    await deleteAllAnswersForQuiz(q.quizId);
  }

  // Delete all players and quizzes
  await deleteAllPlayers();
  await deleteAllQuizzes();

  // Reset game state to init
  await updateGameState({
    status: 'init',
    currentQuizId: null,
    questionStartedAt: null,
    questionHistory: [],
    revealedAnswer: false,
  });

  await broadcastToAll({
    event: 'full_reset',
    status: 'init',
  });

  return { statusCode: 200, body: 'Full reset complete' };
}
