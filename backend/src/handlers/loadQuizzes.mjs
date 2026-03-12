import { getConnection, putQuizBatch, getAllQuizzes } from '../lib/db.mjs';
import { sendToConnection } from '../lib/broadcast.mjs';

export async function handleLoadQuizzes(connectionId, body) {
  const conn = await getConnection(connectionId);
  if (!conn || conn.role !== 'admin') {
    return { statusCode: 403, body: 'Admin only' };
  }

  const { quizzes } = body;
  if (!Array.isArray(quizzes) || quizzes.length === 0) {
    await sendToConnection(connectionId, {
      event: 'error',
      message: 'クイズデータが空です',
    });
    return { statusCode: 400, body: 'No quizzes provided' };
  }

  // Validate and normalize quiz data
  const validated = [];
  for (let i = 0; i < quizzes.length; i++) {
    const q = quizzes[i];
    if (!q.quizId || !q.questionText || !q.questionType) {
      await sendToConnection(connectionId, {
        event: 'error',
        message: `問題 ${i + 1} にquizId, questionText, questionTypeが必要です`,
      });
      return { statusCode: 400, body: `Invalid quiz at index ${i}` };
    }

    validated.push({
      quizId: q.quizId,
      cornerNumber: q.cornerNumber || 1,
      cornerTitle: q.cornerTitle || '',
      questionNumber: q.questionNumber || i + 1,
      questionText: q.questionText,
      questionType: q.questionType, // "text" or "choice"
      modelAnswer: q.modelAnswer || null,
      acceptableAnswers: q.acceptableAnswers || [],
      choices: q.choices || [],
      correctChoiceIndex: q.correctChoiceIndex ?? null,
      points: q.points || 10,
      order: q.order || i + 1,
    });
  }

  await putQuizBatch(validated);

  // Send back the full quiz list
  const allQuizzes = await getAllQuizzes();
  await sendToConnection(connectionId, {
    event: 'quizzes_loaded',
    count: validated.length,
    quizzes: allQuizzes,
  });

  return { statusCode: 200, body: `${validated.length} quizzes loaded` };
}
