import {
  getConnection,
  getGameState,
  getPlayer,
  getAnswer,
  putAnswer,
  getQuiz,
  getAnswersForQuiz,
  getAllPlayers,
  updateAnswerJudgment,
  putPlayer,
} from '../lib/db.mjs';
import { sendToConnection, broadcastToRole } from '../lib/broadcast.mjs';

export async function handleSubmitAnswer(connectionId, body) {
  const { quizId, answerText, choiceIndex } = body;

  const conn = await getConnection(connectionId);
  if (!conn || conn.role !== 'player' || !conn.playerId) {
    await sendToConnection(connectionId, {
      event: 'error',
      message: 'プレイヤーとして登録されていません',
    });
    return { statusCode: 403, body: 'Not a player' };
  }

  // Verify game is in answering state
  const gameState = await getGameState();
  if (gameState.status !== 'answering') {
    await sendToConnection(connectionId, {
      event: 'error',
      message: '現在回答を受け付けていません',
    });
    return { statusCode: 400, body: 'Not accepting answers' };
  }

  // Verify quiz matches current question
  if (gameState.currentQuizId !== quizId) {
    await sendToConnection(connectionId, {
      event: 'error',
      message: '問題IDが一致しません',
    });
    return { statusCode: 400, body: 'Quiz ID mismatch' };
  }

  // Check for duplicate answer
  const existingAnswer = await getAnswer(quizId, conn.playerId);
  if (existingAnswer) {
    await sendToConnection(connectionId, {
      event: 'error',
      message: 'すでに回答済みです',
    });
    return { statusCode: 400, body: 'Already answered' };
  }

  // Get player info and quiz info
  const player = await getPlayer(conn.playerId);
  const quiz = await getQuiz(quizId);

  if (!player || !quiz) {
    return { statusCode: 400, body: 'Invalid player or quiz' };
  }

  const now = new Date().toISOString();
  const elapsedMs = gameState.questionStartedAt
    ? new Date(now).getTime() - new Date(gameState.questionStartedAt).getTime()
    : null;

  // Build answer record
  const answer = {
    quizId,
    playerId: conn.playerId,
    playerName: player.name,
    answeredAt: now,
    isCorrect: null,
    pointsAwarded: 0,
  };

  if (quiz.questionType === 'choice') {
    answer.choiceIndex = choiceIndex;
    answer.answerText = quiz.choices?.[choiceIndex] || `選択肢${choiceIndex}`;
  } else {
    answer.answerText = (answerText || '').trim();
  }

  // Auto-judge on submission
  let autoCorrect = null;
  if (quiz.questionType === 'choice') {
    autoCorrect = choiceIndex === quiz.correctChoiceIndex;
  } else if (quiz.acceptableAnswers?.length > 0) {
    const normalized = answer.answerText.toLowerCase();
    autoCorrect = quiz.acceptableAnswers.some(
      (acc) => acc.toLowerCase() === normalized
    );
  } else if (quiz.modelAnswer) {
    autoCorrect = answer.answerText.toLowerCase() === quiz.modelAnswer.toLowerCase();
  }

  if (autoCorrect !== null) {
    answer.isCorrect = autoCorrect;
    answer.pointsAwarded = autoCorrect ? (quiz.points || 10) : 0;
  }

  await putAnswer(answer);

  // Update player score immediately if auto-judged correct
  if (autoCorrect === true) {
    player.totalScore = (player.totalScore || 0) + answer.pointsAwarded;
    player.correctCount = (player.correctCount || 0) + 1;
    player.answerCount = (player.answerCount || 0) + 1;
    await putPlayer(player);
  } else {
    player.answerCount = (player.answerCount || 0) + 1;
    await putPlayer(player);
  }

  // Confirm to player
  await sendToConnection(connectionId, {
    event: 'answer_submitted',
    answerText: answer.answerText,
    answeredAt: now,
  });

  // Notify admin with full answer details
  await broadcastToRole('admin', {
    event: 'new_answer',
    playerId: conn.playerId,
    playerName: player.name,
    answerText: answer.answerText,
    choiceIndex: answer.choiceIndex,
    answeredAt: now,
    elapsedMs,
    isCorrect: answer.isCorrect,
  });

  // Notify display with answer count + correct players
  const allAnswers = await getAnswersForQuiz(quizId);
  const allPlayers = await getAllPlayers();
  const correctPlayers = allAnswers
    .filter((a) => a.isCorrect === true)
    .sort((a, b) => new Date(a.answeredAt) - new Date(b.answeredAt))
    .map((a, i) => ({
      rank: i + 1,
      playerId: a.playerId,
      playerName: a.playerName,
      elapsedMs: gameState.questionStartedAt
        ? new Date(a.answeredAt).getTime() - new Date(gameState.questionStartedAt).getTime()
        : null,
    }));

  await broadcastToRole('display', {
    event: 'answer_count_update',
    count: allAnswers.length,
    total: allPlayers.length,
    correctPlayers,
  });

  return { statusCode: 200, body: 'Answer submitted' };
}
