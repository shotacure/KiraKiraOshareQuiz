import { getConnection, updateGameState } from '../lib/db.mjs';
import { broadcastToAll } from '../lib/broadcast.mjs';

export async function handleResetToWaiting(connectionId) {
  const conn = await getConnection(connectionId);
  if (!conn || conn.role !== 'admin') {
    return { statusCode: 403, body: 'Admin only' };
  }

  await updateGameState({
    status: 'waiting',
    currentQuizId: null,
    questionStartedAt: null,
    revealedAnswer: false,
  });

  await broadcastToAll({
    event: 'game_state_update',
    status: 'waiting',
    currentQuizId: null,
  });

  return { statusCode: 200, body: 'Reset to waiting' };
}
