import { putConnection, putPlayer, getPlayer, getPlayerByName, getGameState, getAllPlayers, getAnswer } from '../lib/db.mjs';
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

  // Reject registration when game is in init state (before quiz data loaded)
  const gameState = await getGameState();
  if (gameState.status === 'init') {
    await sendToConnection(connectionId, {
      event: 'registration_rejected',
      reason: 'not_accepting',
      message: 'まだ参加を受け付けていません',
    });
    return { statusCode: 400, body: 'Not accepting registrations yet' };
  }

  const trimmedName = name.trim();
  let playerId = existingPlayerId;
  let player = null;

  // Reconnection: try to find existing player
  if (playerId) {
    player = await getPlayer(playerId);
  }

  if (player) {
    // Reconnecting - update connectionId
    player.connectionId = connectionId;
    // Allow name change only if not taken by someone else
    if (trimmedName !== player.name) {
      const existing = await getPlayerByName(trimmedName);
      if (existing && existing.playerId !== playerId) {
        await sendToConnection(connectionId, {
          event: 'error',
          message: `"${trimmedName}" は既に使われています。別の名前を入力してください`,
        });
        return { statusCode: 400, body: 'Name taken' };
      }
      player.name = trimmedName;
    }
    await putPlayer(player);
  } else {
    // New player - check for duplicate name
    const existing = await getPlayerByName(trimmedName);
    if (existing) {
      await sendToConnection(connectionId, {
        event: 'error',
        message: `"${trimmedName}" は既に使われています。別の名前を入力してください`,
      });
      return { statusCode: 400, body: 'Name taken' };
    }

    playerId = randomUUID();
    player = {
      playerId,
      name: trimmedName,
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

  // Build response including current answer state for reconnecting players
  const response = {
    event: 'registered',
    playerId,
    name: player.name,
    totalScore: player.totalScore,
    gameState: {
      status: gameState.status,
      currentQuizId: gameState.currentQuizId,
    },
    myAnswer: null,
  };

  if (gameState.currentQuizId) {
    const existingAnswer = await getAnswer(gameState.currentQuizId, playerId);
    if (existingAnswer) {
      response.myAnswer = {
        answerText: existingAnswer.answerText,
        answeredAt: existingAnswer.answeredAt,
        isCorrect: existingAnswer.isCorrect,
        pointsAwarded: existingAnswer.pointsAwarded,
      };
    }
  }

  await sendToConnection(connectionId, response);

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
