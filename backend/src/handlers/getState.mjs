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
    sessionId: gameState.sessionId || null,
    quizTitle: gameState.quizTitle || null,
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
        payload.question.acceptableAnswers = quiz.acceptableAnswers || [];
      }

      // Admin gets answers and model answer info
      if (conn.role === 'admin') {
        payload.question.modelAnswer = quiz.modelAnswer;
        payload.question.acceptableAnswers = quiz.acceptableAnswers || [];
        payload.question.correctChoiceIndex = quiz.correctChoiceIndex;

        const answers = await getAnswersForQuiz(gameState.currentQuizId);
        payload.answers = answers.map((a) => ({
          playerId: a.playerId,
          playerName: a.playerName,
          answerText: a.answerText,
          choiceIndex: a.choiceIndex,
          answeredAt: a.answeredAt,
          isCorrect: a.isCorrect,
          pointsAwarded: a.pointsAwarded,
          elapsedMs: gameState.questionStartedAt
            ? new Date(a.answeredAt).getTime() - new Date(gameState.questionStartedAt).getTime()
            : null,
        }));
      }
    }

    // Player: include answer and judgment for reload recovery
    if (conn.role === 'player' && conn.playerId) {
      const answer = await getAnswer(gameState.currentQuizId, conn.playerId);
      if (answer) {
        payload.myAnswer = {
          answerText: answer.answerText,
          answeredAt: answer.answeredAt,
        };
        if (answer.isCorrect !== null) {
          payload.myJudgment = {
            isCorrect: answer.isCorrect,
            pointsAwarded: answer.pointsAwarded,
          };
        }
      }
    }

    // Include reveal data for showing_answer reload
    if (gameState.status === 'showing_answer' && gameState.revealedAnswer) {
      const quiz = await getQuiz(gameState.currentQuizId);
      const allAnswers = await getAnswersForQuiz(gameState.currentQuizId);
      const correctPlayers = allAnswers
        .filter((a) => a.isCorrect === true)
        .sort((a, b) => new Date(a.answeredAt) - new Date(b.answeredAt))
        .map((a, i) => ({
          rank: i + 1,
          playerId: a.playerId,
          playerName: a.playerName,
          pointsAwarded: a.pointsAwarded,
          elapsedMs: gameState.questionStartedAt
            ? new Date(a.answeredAt).getTime() - new Date(gameState.questionStartedAt).getTime()
            : null,
        }));
      const correctAnswer = quiz.questionType === 'choice'
        ? quiz.choices[quiz.correctChoiceIndex]
        : quiz.modelAnswer;
      payload.revealData = {
        correctAnswer,
        acceptableAnswers: quiz.acceptableAnswers || [],
        correctPlayers,
        correctCount: correctPlayers.length,
        incorrectCount: allAnswers.length - correctPlayers.length,
        totalAnswers: allAnswers.length,
        correctRate: allAnswers.length > 0
          ? Math.round((correctPlayers.length / allAnswers.length) * 100) : 0,
        points: quiz.points,
      };
    }
  }

  // Player list for all roles
  {
    const players = await getAllPlayers();
    payload.players = players.map((p) => ({
      playerId: p.playerId,
      name: p.name,
      totalScore: p.totalScore,
      correctCount: p.correctCount,
    }));
  }

  if (gameState.status === 'showing_scores') {
    const players = await getAllPlayers();
    payload.rankings = players.map((p) => ({
      playerId: p.playerId,
      name: p.name,
      totalScore: p.totalScore,
    }));
  }

  await sendToConnection(connectionId, payload);
  return { statusCode: 200, body: 'State sent' };
}
