import { handleConnect } from './handlers/connect.mjs';
import { handleDisconnect } from './handlers/disconnect.mjs';
import { handleRegister } from './handlers/register.mjs';
import { handleConnectRole } from './handlers/connectRole.mjs';
import { handleSubmitAnswer } from './handlers/submitAnswer.mjs';
import { handleStartQuestion } from './handlers/startQuestion.mjs';
import { handleCloseAnswers } from './handlers/closeAnswers.mjs';
import { handleJudge } from './handlers/judge.mjs';
import { handleJudgeBulk } from './handlers/judgeBulk.mjs';
import { handleRevealAnswer } from './handlers/revealAnswer.mjs';
import { handleShowScores } from './handlers/showScores.mjs';
import { handleResetToWaiting } from './handlers/resetToWaiting.mjs';
import { handleLoadQuizzes } from './handlers/loadQuizzes.mjs';
import { handleGetState } from './handlers/getState.mjs';

const ROUTES = {
  register: handleRegister,
  connect_role: handleConnectRole,
  submit_answer: handleSubmitAnswer,
  start_question: handleStartQuestion,
  close_answers: handleCloseAnswers,
  judge: handleJudge,
  judge_bulk: handleJudgeBulk,
  reveal_answer: handleRevealAnswer,
  show_scores: handleShowScores,
  reset_to_waiting: handleResetToWaiting,
  load_quizzes: handleLoadQuizzes,
  get_state: handleGetState,
};

export const handler = async (event) => {
  const { requestContext } = event;
  const routeKey = requestContext.routeKey;
  const connectionId = requestContext.connectionId;

  console.log(`Route: ${routeKey}, ConnectionId: ${connectionId}`);

  try {
    if (routeKey === '$connect') {
      return await handleConnect(event);
    }

    if (routeKey === '$disconnect') {
      return await handleDisconnect(event);
    }

    // $default route — parse body and dispatch by action
    const body = JSON.parse(event.body || '{}');
    const action = body.action;

    if (!action || !ROUTES[action]) {
      // Keepalive ping — respond silently
      if (action === 'ping') {
        return { statusCode: 200, body: 'pong' };
      }
      return {
        statusCode: 400,
        body: JSON.stringify({ error: `Unknown action: ${action}` }),
      };
    }

    return await ROUTES[action](connectionId, body, event);
  } catch (err) {
    console.error('Handler error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Internal server error' }) };
  }
};
