import { putConnection, putPlayer, getPlayer, getGameState, getAllPlayers } from '../lib/db.mjs';
import { sendToConnection, broadcastToRoles } from '../lib/broadcast.mjs';
import { randomUUID } from 'crypto';

export async function handleRegister(connectionId, body) {
  const { name, playerId: existingPlayerId } = body;

  if (!name || name.trim().length === 0) {
    await sendToConnection(connectionId, {
      event: 'error',
      message: '名前を入力してください',
    });
    return { statusCode: 400, body: 'Name required' };
  }

  let playerId = existingPlayerId;
  let player = null;

  // Reconnection: try to find existing player
  if (playerId) {
    player = await getPlayer(playerId);
  }

  if (player) {
    // Reconnecting — update connectionId
    player.connectionId = connectionId;
    player.name = name.trim(); // Allow name update on reconnect
    await putPlayer(player);
  } else {
    // New player
    playerId = randomUUID();
    player = {
      playerId,
      name: name.trim(),
      registeredAt: new Date().toISOString(),
      connectionId,
      totalScore: 0,
      correctCount: 0,
      answerCount: 0,
    };
    await putPlayer(player);
  }

  // Update connection record
  await putConnection(connectionId, {
    role: 'player',
    playerId,
    connectedAt: new Date().toISOString(),
  });

  // Send registration confirmation with current game state
  const gameState = await getGameState();
  await sendToConnection(connectionId, {
    event: 'registered',
    playerId,
    name: player.name,
    totalScore: player.totalScore,
    gameState: {
      status: gameState.status,
      currentQuizId: gameState.currentQuizId,
    },
  });

  // Notify admin/display about new player
  const allPlayers = await getAllPlayers();
  await broadcastToRoles(['admin', 'display'], {
    event: 'player_joined',
    playerId,
    name: player.name,
    playerCount: allPlayers.length,
  });

  return { statusCode: 200, body: 'Registered' };
}
