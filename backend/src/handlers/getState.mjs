import {
  getConnection,
  getGameState,
  getQuiz,
  getAnswer,
  getAllPlayers,
} from '../lib/db.mjs';
import { sendToConnection } from '../lib/broadcast.mjs';

export async function handleGetState(connectionId) {
  const conn = await getConnection(connectionId);
  if (!conn) {
    return { statusCode: 400, body: 'Unknown connection' };
  }

  const gameState = await getGameState();

  const payload = {
    event: 'state_sync',
    status: gameState.status,
    currentQuizId: gameState.currentQuizId,
  };

  // If there's an active question, include question info
  if (gameState.currentQuizId) {
    const quiz = await getQuiz(gameState.currentQuizId);
    if (quiz) {
      payload.question = {
        quizId: quiz.quizId,
        cornerNumber: quiz.cornerNumber,
        cornerTitle: quiz.cornerTitle,
        questionNumber: quiz.questionNumber,
        questionText: quiz.questionText,
        questionType: quiz.questionType,
        points: quiz.points,
        choices: quiz.questionType === 'choice' ? quiz.choices : undefined,
      };

      // If answer is revealed, include correct answer
      if (gameState.revealedAnswer) {
        payload.question.correctAnswer =
          quiz.questionType === 'choice'
            ? quiz.choices[quiz.correctChoiceIndex]
            : quiz.modelAnswer;
      }
    }

    // If player, include their answer status
    if (conn.role === 'player' && conn.playerId) {
      const answer = await getAnswer(gameState.currentQuizId, conn.playerId);
      if (answer) {
        payload.myAnswer = {
          answerText: answer.answerText,
          answeredAt: answer.answeredAt,
          isCorrect: answer.isCorrect,
          pointsAwarded: answer.pointsAwarded,
        };
      }
    }
  }

  // If showing scores, include rankings
  if (gameState.status === 'showing_scores') {
    const players = await getAllPlayers();
    payload.rankings = players.map((p, i) => ({
      rank: i + 1,
      name: p.name,
      totalScore: p.totalScore,
    }));
  }

  await sendToConnection(connectionId, payload);
  return { statusCode: 200, body: 'State sent' };
}
