import { putConnection } from '../lib/db.mjs';

export async function handleConnect(event) {
  const connectionId = event.requestContext.connectionId;
  console.log(`New connection: ${connectionId}`);

  // Store connection with initial "unknown" role; will be set by register or connect_role
  await putConnection(connectionId, {
    role: 'unknown',
    connectedAt: new Date().toISOString(),
  });

  return { statusCode: 200, body: 'Connected' };
}
