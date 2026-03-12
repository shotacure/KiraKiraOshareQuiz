import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
} from '@aws-sdk/client-apigatewaymanagementapi';
import { getConnectionsByRole, getAllConnections, deleteConnection } from './db.mjs';

let apiClient = null;

function getApiClient() {
  if (!apiClient) {
    const endpoint = process.env.WEBSOCKET_ENDPOINT;
    apiClient = new ApiGatewayManagementApiClient({ endpoint });
  }
  return apiClient;
}

/**
 * Send a message to a single connection.
 * Returns false if the connection is stale (gone).
 */
export async function sendToConnection(connectionId, payload) {
  try {
    await getApiClient().send(
      new PostToConnectionCommand({
        ConnectionId: connectionId,
        Data: JSON.stringify(payload),
      })
    );
    return true;
  } catch (err) {
    if (err.statusCode === 410 || err.name === 'GoneException') {
      console.log(`Stale connection removed: ${connectionId}`);
      await deleteConnection(connectionId);
      return false;
    }
    console.error(`Error sending to ${connectionId}:`, err);
    return false;
  }
}

/**
 * Broadcast to all connections with a specific role.
 */
export async function broadcastToRole(role, payload) {
  const connections = await getConnectionsByRole(role);
  await Promise.all(
    connections.map((c) => sendToConnection(c.connectionId, payload))
  );
}

/**
 * Broadcast to all connected clients.
 */
export async function broadcastToAll(payload) {
  const connections = await getAllConnections();
  await Promise.all(
    connections.map((c) => sendToConnection(c.connectionId, payload))
  );
}

/**
 * Broadcast to specific roles (array).
 */
export async function broadcastToRoles(roles, payload) {
  await Promise.all(roles.map((role) => broadcastToRole(role, payload)));
}

/**
 * Broadcast different payloads to different roles.
 * rolePayloads: { admin: {...}, player: {...}, display: {...} }
 */
export async function broadcastByRole(rolePayloads) {
  const promises = Object.entries(rolePayloads).map(([role, payload]) =>
    broadcastToRole(role, payload)
  );
  await Promise.all(promises);
}
