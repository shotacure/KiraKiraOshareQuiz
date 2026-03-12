import { putConnection, putPlayer, getPlayer, getPlayerByName, getGameState, getAllPlayers, getAnswer } from '../lib/db.mjs';
import { sendToConnection, broadcastToRoles } from '../lib/broadcast.mjs';
import { randomUUID } from 'crypto';

export async function handleRegister(connectionId, body) {
  const { name, playerId: existingPlayerId } = body;

  if (!name || name.trim().length === 0) {
    await sendToConnection(connectionId, {
      event: 'error',
      code: 'name_required',
      message: 'name_required',
    });
    return { statusCode: 400, body: 'Name required' };
  }

  const gameState = await getGameState();
  const trimmedName = name.trim();
  let playerId = existingPlayerId;
  let player = null;

  // Reconnection: try to find existing player by saved ID
  if (playerId) {
    player = await getPlayer(playerId);
  }

  if (player) {
    // Existing player reconnecting — always allowed regardless of game state
    player.connectionId = connectionId;
    if (trimmedName !== player.name) {
      const existing = await getPlayerByName(trimmedName);
      if (existing && existing.playerId !== playerId) {
        await sendToConnection(connectionId, {
          event: 'error',
          code: 'name_taken',
          name: trimmedName,
          message: 'name_taken',
        });
        return { statusCode: 400, body: 'Name taken' };
      }
      player.name = trimmedName;
    }
    await putPlayer(player);
  } else {
    // New player — only allowed during 'accepting' state
    if (gameState.status !== 'accepting') {
      await sendToConnection(connectionId, {
        event: 'registration_rejected',
        reason: gameState.status === 'init' ? 'not_accepting' : 'closed',
        message: gameState.status === 'init' ? 'not_accepting' : 'registration_closed',
      });
      return { statusCode: 400, body: 'Not accepting registrations' };
    }

    // Check for duplicate name
    const existing = await getPlayerByName(trimmedName);
    if (existing) {
      await sendToConnection(connectionId, {
        event: 'error',
        code: 'name_taken',
        name: trimmedName,
        message: 'name_taken',
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

  await putConnection(connectionId, {
    role: 'player',
    playerId,
    connectedAt: new Date().toISOString(),
  });

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

  const allPlayers = await getAllPlayers();
  await broadcastToRoles(['admin', 'display'], {
    event: 'player_joined',
    playerId,
    name: player.name,
    playerCount: allPlayers.length,
  });

  return { statusCode: 200, body: 'Registered' };
}
