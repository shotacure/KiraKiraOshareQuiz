import { putConnection, getGameState, getAllPlayers, getAllQuizzes } from '../lib/db.mjs';
import { sendToConnection } from '../lib/broadcast.mjs';

export async function handleConnectRole(connectionId, body) {
  const { role, secret } = body;

  if (!['admin', 'display'].includes(role)) {
    await sendToConnection(connectionId, {
      event: 'error',
      message: '無効なロールです',
    });
    return { statusCode: 400, body: 'Invalid role' };
  }

  // Verify admin secret
  const adminSecret = process.env.ADMIN_SECRET;
  if (secret !== adminSecret) {
    await sendToConnection(connectionId, {
      event: 'error',
      message: 'パスワードが正しくありません',
    });
    return { statusCode: 403, body: 'Unauthorized' };
  }

  // Update connection role
  await putConnection(connectionId, {
    role,
    connectedAt: new Date().toISOString(),
  });

  // Send full state to the newly connected admin/display
  const gameState = await getGameState();
  const players = await getAllPlayers();
  const quizzes = await getAllQuizzes();

  await sendToConnection(connectionId, {
    event: 'full_state',
    gameState,
    players: players.map((p) => ({
      playerId: p.playerId,
      name: p.name,
      totalScore: p.totalScore,
      correctCount: p.correctCount,
      answerCount: p.answerCount,
    })),
    quizzes: quizzes.map((q) => ({
      quizId: q.quizId,
      cornerNumber: q.cornerNumber,
      cornerTitle: q.cornerTitle,
      questionNumber: q.questionNumber,
      questionText: q.questionText,
      questionType: q.questionType,
      points: q.points,
      order: q.order,
      // Admin gets full quiz data including answers
      ...(role === 'admin'
        ? {
            modelAnswer: q.modelAnswer,
            acceptableAnswers: q.acceptableAnswers,
            choices: q.choices,
            correctChoiceIndex: q.correctChoiceIndex,
          }
        : {}),
    })),
  });

  return { statusCode: 200, body: `Connected as ${role}` };
}
