import { putConnection, getGameState, getAllPlayers, getAllQuizzes, getAnswersForQuiz } from '../lib/db.mjs';
import { sendToConnection } from '../lib/broadcast.mjs';

export async function handleConnectRole(connectionId, body) {
  const { role, secret } = body;

  if (!['admin', 'display'].includes(role)) {
    await sendToConnection(connectionId, {
      event: 'error',
      code: 'invalid_role',
      message: 'invalid_role',
    });
    return { statusCode: 400, body: 'Invalid role' };
  }

  const adminSecret = process.env.ADMIN_SECRET;
  if (secret !== adminSecret) {
    await sendToConnection(connectionId, {
      event: 'error',
      code: 'wrong_password',
      message: 'wrong_password',
    });
    return { statusCode: 403, body: 'Unauthorized' };
  }

  await putConnection(connectionId, {
    role,
    connectedAt: new Date().toISOString(),
  });

  const gameState = await getGameState();
  const players = await getAllPlayers();
  const quizzes = await getAllQuizzes();

  const fullState = {
    event: 'full_state',
    gameState: {
      ...gameState,
      totalQuizCount: quizzes.length,
    },
    players: players.map((p) => ({
      playerId: p.playerId,
      name: p.name,
      totalScore: p.totalScore,
      correctCount: p.correctCount,
      answerCount: p.answerCount,
    })),
    quizzes: quizzes.map((q) => ({
      quizId: q.quizId,
      questionNumber: q.questionNumber,
      questionText: q.questionText,
      questionType: q.questionType,
      points: q.points,
      order: q.order,
      ...(role === 'admin'
        ? {
            modelAnswer: q.modelAnswer,
            acceptableAnswers: q.acceptableAnswers,
            choices: q.choices,
            correctChoiceIndex: q.correctChoiceIndex,
          }
        : {}),
    })),
  };

  if (role === 'admin' && gameState.currentQuizId) {
    const answers = await getAnswersForQuiz(gameState.currentQuizId);
    fullState.currentAnswers = answers.map((a) => ({
      playerId: a.playerId,
      playerName: a.playerName,
      answerText: a.answerText,
      choiceIndex: a.choiceIndex,
      answeredAt: a.answeredAt,
      isCorrect: a.isCorrect,
      elapsedMs: gameState.questionStartedAt
        ? new Date(a.answeredAt).getTime() - new Date(gameState.questionStartedAt).getTime()
        : null,
    }));
  }

  await sendToConnection(connectionId, fullState);

  return { statusCode: 200, body: `Connected as ${role}` };
}
