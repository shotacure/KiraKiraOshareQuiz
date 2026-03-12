import {
  getConnection,
  getGameState,
  getQuiz,
  getAnswer,
  getAllPlayers,
  getAllQuizzes,
  getAnswersForQuiz,
} from '../lib/db.mjs';
import { sendToConnection } from '../lib/broadcast.mjs';

export async function handleGetState(connectionId) {
  const conn = await getConnection(connectionId);
  if (!conn) {
    return { statusCode: 400, body: 'Unknown connection' };
  }

  const gameState = await getGameState();
  const allQuizzes = await getAllQuizzes();

  const payload = {
    event: 'state_sync',
    status: gameState.status,
    currentQuizId: gameState.currentQuizId,
    questionHistory: gameState.questionHistory || [],
    totalQuizCount: allQuizzes.length,
  };

  if (gameState.currentQuizId) {
    const quiz = await getQuiz(gameState.currentQuizId);
    if (quiz) {
      payload.question = {
        quizId: quiz.quizId,
        questionNumber: quiz.questionNumber,
        questionText: quiz.questionText,
        questionType: quiz.questionType,
        points: quiz.points,
        choices: quiz.questionType === 'choice' ? quiz.choices : undefined,
      };

      if (gameState.revealedAnswer) {
        payload.question.correctAnswer =
          quiz.questionType === 'choice'
            ? quiz.choices[quiz.correctChoiceIndex]
            : quiz.modelAnswer;
      }

      if (conn.role === 'admin') {
        const answers = await getAnswersForQuiz(gameState.currentQuizId);
        payload.answers = answers.map((a) => ({
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
    }

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

  if (conn.role === 'display' || conn.role === 'admin') {
    const players = await getAllPlayers();
    payload.players = players.map((p, i) => ({
      rank: i + 1,
      playerId: p.playerId,
      name: p.name,
      totalScore: p.totalScore,
      correctCount: p.correctCount,
    }));
  }

  if (gameState.status === 'showing_scores') {
    const players = await getAllPlayers();
    payload.rankings = players.map((p, i) => ({
      rank: i + 1,
      playerId: p.playerId,
      name: p.name,
      totalScore: p.totalScore,
    }));
  }

  await sendToConnection(connectionId, payload);
  return { statusCode: 200, body: 'State sent' };
}
