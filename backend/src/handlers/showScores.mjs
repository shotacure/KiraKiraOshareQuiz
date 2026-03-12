import { getConnection, updateGameState, getAllPlayers } from '../lib/db.mjs';
import { broadcastToAll } from '../lib/broadcast.mjs';

export async function handleShowScores(connectionId) {
  const conn = await getConnection(connectionId);
  if (!conn || conn.role !== 'admin') {
    return { statusCode: 403, body: 'Admin only' };
  }

  await updateGameState({ status: 'showing_scores' });

  const players = await getAllPlayers();
  // Players from GSI1 are already sorted by score (descending via padded key)
  const rankings = players.map((p, i) => ({
    rank: i + 1,
    playerId: p.playerId,
    name: p.name,
    totalScore: p.totalScore,
    correctCount: p.correctCount,
    answerCount: p.answerCount,
  }));

  await broadcastToAll({
    event: 'scores_revealed',
    rankings,
  });

  return { statusCode: 200, body: 'Scores shown' };
}
