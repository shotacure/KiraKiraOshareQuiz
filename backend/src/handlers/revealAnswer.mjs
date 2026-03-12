import {
  getConnection,
  updateGameState,
  getGameState,
  getQuiz,
  getAnswersForQuiz,
  getAllPlayers,
} from '../lib/db.mjs';
import { broadcastToAll } from '../lib/broadcast.mjs';

export async function handleRevealAnswer(connectionId) {
  const conn = await getConnection(connectionId);
  if (!conn || conn.role !== 'admin') {
    return { statusCode: 403, body: 'Admin only' };
  }

  const gameState = await getGameState();
  if (!gameState.currentQuizId) {
    return { statusCode: 400, body: 'No active question' };
  }

  const quiz = await getQuiz(gameState.currentQuizId);
  if (!quiz) return { statusCode: 404, body: 'Quiz not found' };

  await updateGameState({
    status: 'showing_answer',
    revealedAnswer: true,
  });

  // Get answers and build correct players list (sorted by answer time)
  const answers = await getAnswersForQuiz(gameState.currentQuizId);
  const correctPlayers = answers
    .filter((a) => a.isCorrect === true)
    .sort((a, b) => new Date(a.answeredAt) - new Date(b.answeredAt))
    .map((a, i) => ({
      rank: i + 1,
      playerId: a.playerId,
      playerName: a.playerName,
      answeredAt: a.answeredAt,
      elapsedMs: gameState.questionStartedAt
        ? new Date(a.answeredAt).getTime() - new Date(gameState.questionStartedAt).getTime()
        : null,
    }));

  const correctAnswer =
    quiz.questionType === 'choice'
      ? quiz.choices[quiz.correctChoiceIndex]
      : quiz.modelAnswer;

  const totalAnswers = answers.length;
  const correctCount = correctPlayers.length;

  await broadcastToAll({
    event: 'answer_revealed',
    quizId: quiz.quizId,
    correctAnswer,
    questionText: quiz.questionText,
    points: quiz.points,
    correctPlayers,
    totalAnswers,
    correctCount,
    incorrectCount: totalAnswers - correctCount,
  });

  return { statusCode: 200, body: 'Answer revealed' };
}
