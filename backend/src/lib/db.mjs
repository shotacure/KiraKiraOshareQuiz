import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
  QueryCommand,
  BatchWriteCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

const TABLE = process.env.TABLE_NAME;
const CONN_TABLE = process.env.CONNECTIONS_TABLE_NAME;

// ============================================================
// Generic helpers
// ============================================================
export async function getItem(pk, sk) {
  const res = await docClient.send(new GetCommand({
    TableName: TABLE,
    Key: { PK: pk, SK: sk },
  }));
  return res.Item || null;
}

export async function putItem(item) {
  await docClient.send(new PutCommand({ TableName: TABLE, Item: item }));
}

export async function updateItem(pk, sk, updateExpr, exprAttrValues, exprAttrNames) {
  const params = {
    TableName: TABLE,
    Key: { PK: pk, SK: sk },
    UpdateExpression: updateExpr,
    ExpressionAttributeValues: exprAttrValues,
    ReturnValues: 'ALL_NEW',
  };
  if (exprAttrNames) params.ExpressionAttributeNames = exprAttrNames;
  const res = await docClient.send(new UpdateCommand(params));
  return res.Attributes;
}

export async function queryItems(pk, skPrefix) {
  const params = {
    TableName: TABLE,
    KeyConditionExpression: 'PK = :pk' + (skPrefix ? ' AND begins_with(SK, :sk)' : ''),
    ExpressionAttributeValues: { ':pk': pk },
  };
  if (skPrefix) params.ExpressionAttributeValues[':sk'] = skPrefix;
  const res = await docClient.send(new QueryCommand(params));
  return res.Items || [];
}

export async function queryGSI1(gsi1pk, gsi1skPrefix) {
  const params = {
    TableName: TABLE,
    IndexName: 'GSI1',
    KeyConditionExpression: 'GSI1PK = :pk' + (gsi1skPrefix ? ' AND begins_with(GSI1SK, :sk)' : ''),
    ExpressionAttributeValues: { ':pk': gsi1pk },
  };
  if (gsi1skPrefix) params.ExpressionAttributeValues[':sk'] = gsi1skPrefix;
  const res = await docClient.send(new QueryCommand(params));
  return res.Items || [];
}

// ============================================================
// Connection management
// ============================================================
export async function putConnection(connectionId, data) {
  const ttl = Math.floor(Date.now() / 1000) + 24 * 60 * 60; // 24h TTL
  await docClient.send(new PutCommand({
    TableName: CONN_TABLE,
    Item: { connectionId, ttl, ...data },
  }));
}

export async function getConnection(connectionId) {
  const res = await docClient.send(new GetCommand({
    TableName: CONN_TABLE,
    Key: { connectionId },
  }));
  return res.Item || null;
}

export async function deleteConnection(connectionId) {
  await docClient.send(new DeleteCommand({
    TableName: CONN_TABLE,
    Key: { connectionId },
  }));
}

export async function getConnectionsByRole(role) {
  const res = await docClient.send(new QueryCommand({
    TableName: CONN_TABLE,
    IndexName: 'RoleIndex',
    KeyConditionExpression: '#r = :role',
    ExpressionAttributeNames: { '#r': 'role' },
    ExpressionAttributeValues: { ':role': role },
  }));
  return res.Items || [];
}

export async function getAllConnections() {
  const res = await docClient.send(new ScanCommand({ TableName: CONN_TABLE }));
  return res.Items || [];
}

// ============================================================
// Game State helpers
// ============================================================
export async function getGameState() {
  const state = await getItem('GAME', 'STATE');
  if (!state) {
    // Initialize default game state
    const defaultState = {
      PK: 'GAME',
      SK: 'STATE',
      status: 'waiting',
      currentQuizId: null,
      questionStartedAt: null,
      questionHistory: [],
      revealedAnswer: false,
    };
    await putItem(defaultState);
    return defaultState;
  }
  return state;
}

export async function updateGameState(updates) {
  const keys = Object.keys(updates);
  const updateExpr = 'SET ' + keys.map((k, i) => `#k${i} = :v${i}`).join(', ');
  const exprAttrValues = {};
  const exprAttrNames = {};
  keys.forEach((k, i) => {
    exprAttrValues[`:v${i}`] = updates[k];
    exprAttrNames[`#k${i}`] = k;
  });
  return await updateItem('GAME', 'STATE', updateExpr, exprAttrValues, exprAttrNames);
}

// ============================================================
// Quiz helpers
// ============================================================
export async function getAllQuizzes() {
  return await queryGSI1('QUIZZES', 'ORDER#');
}

export async function getQuiz(quizId) {
  return await getItem(`QUIZ#${quizId}`, 'META');
}

export async function putQuizBatch(quizzes) {
  // Batch write in chunks of 25
  for (let i = 0; i < quizzes.length; i += 25) {
    const batch = quizzes.slice(i, i + 25);
    await docClient.send(new BatchWriteCommand({
      RequestItems: {
        [TABLE]: batch.map((q) => ({
          PutRequest: {
            Item: {
              PK: `QUIZ#${q.quizId}`,
              SK: 'META',
              GSI1PK: 'QUIZZES',
              GSI1SK: `ORDER#${String(q.order).padStart(4, '0')}`,
              ...q,
            },
          },
        })),
      },
    }));
  }
}

// ============================================================
// Player helpers
// ============================================================
export async function getPlayer(playerId) {
  return await getItem(`PLAYER#${playerId}`, 'META');
}

export async function putPlayer(player) {
  await putItem({
    PK: `PLAYER#${player.playerId}`,
    SK: 'META',
    GSI1PK: 'PLAYERS',
    GSI1SK: `SCORE#${String(999999 - (player.totalScore || 0)).padStart(6, '0')}#${player.playerId}`,
    ...player,
  });
}

export async function getAllPlayers() {
  return await queryGSI1('PLAYERS', 'SCORE#');
}

export async function updatePlayerScore(playerId, pointsToAdd) {
  return await updateItem(
    `PLAYER#${playerId}`,
    'META',
    'SET totalScore = totalScore + :pts, correctCount = correctCount + :one',
    { ':pts': pointsToAdd, ':one': 1 }
  );
}

// ============================================================
// Answer helpers
// ============================================================
export async function putAnswer(answer) {
  await putItem({
    PK: `QUIZ#${answer.quizId}`,
    SK: `ANSWER#${answer.playerId}`,
    GSI1PK: `ANSWERS#${answer.quizId}`,
    GSI1SK: `TIME#${answer.answeredAt}`,
    ...answer,
  });
}

export async function getAnswer(quizId, playerId) {
  return await getItem(`QUIZ#${quizId}`, `ANSWER#${playerId}`);
}

export async function getAnswersForQuiz(quizId) {
  return await queryGSI1(`ANSWERS#${quizId}`, 'TIME#');
}

export async function updateAnswerJudgment(quizId, playerId, isCorrect, pointsAwarded) {
  return await updateItem(
    `QUIZ#${quizId}`,
    `ANSWER#${playerId}`,
    'SET isCorrect = :correct, pointsAwarded = :pts',
    { ':correct': isCorrect, ':pts': pointsAwarded }
  );
}
