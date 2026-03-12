import { deleteConnection, getConnection, getPlayer, putPlayer } from '../lib/db.mjs';

export async function handleDisconnect(event) {
  const connectionId = event.requestContext.connectionId;
  console.log(`Disconnected: ${connectionId}`);

  // Clear connectionId from player record if applicable
  const conn = await getConnection(connectionId);
  if (conn && conn.playerId) {
    const player = await getPlayer(conn.playerId);
    if (player && player.connectionId === connectionId) {
      player.connectionId = null;
      await putPlayer(player);
    }
  }

  await deleteConnection(connectionId);
  return { statusCode: 200, body: 'Disconnected' };
}
