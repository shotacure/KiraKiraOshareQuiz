import { createContext, useContext, useReducer, useCallback } from 'react';

const GameContext = createContext(null);

const initialState = {
  // Connection & Auth
  connected: false,
  role: null, // 'player' | 'admin' | 'display'
  authed: false,
  authError: null,
  lastError: null,

  // Player
  playerId: null,
  playerName: null,
  totalScore: 0,

  // Game
  status: 'waiting',
  currentQuiz: null,
  myAnswer: null,
  myJudgment: null,

  // Admin
  players: [],
  quizzes: [],
  answers: [],
  answerCount: 0,
  answerTotal: 0,

  // Scores
  rankings: [],

  // Display
  correctPlayers: [],
  correctAnswer: null,
  revealData: null,
};

function reducer(state, action) {
  switch (action.type) {
    case 'SET_CONNECTED':
      return { ...state, connected: action.payload };

    case 'SET_ROLE':
      return { ...state, role: action.payload };

    case 'REGISTERED':
      return {
        ...state,
        playerId: action.payload.playerId,
        playerName: action.payload.name,
        totalScore: action.payload.totalScore || 0,
        status: action.payload.gameState?.status || 'waiting',
      };

    case 'FULL_STATE':
      return {
        ...state,
        authed: true,
        authError: null,
        status: action.payload.gameState?.status || 'waiting',
        players: action.payload.players || [],
        quizzes: action.payload.quizzes || [],
      };

    case 'AUTH_ERROR':
      return { ...state, authed: false, authError: action.payload };

    case 'SET_ERROR':
      return { ...state, lastError: action.payload };

    case 'CLEAR_ERROR':
      return { ...state, lastError: null, authError: null };

    case 'QUESTION_STARTED':
      return {
        ...state,
        status: 'answering',
        currentQuiz: action.payload,
        myAnswer: null,
        myJudgment: null,
        answers: [],
        answerCount: 0,
        correctPlayers: [],
        correctAnswer: null,
        revealData: null,
      };

    case 'ANSWER_SUBMITTED':
      return {
        ...state,
        myAnswer: {
          answerText: action.payload.answerText,
          answeredAt: action.payload.answeredAt,
        },
      };

    case 'NEW_ANSWER':
      return {
        ...state,
        answers: [...state.answers, action.payload],
      };

    case 'ANSWER_COUNT_UPDATE':
      return {
        ...state,
        answerCount: action.payload.count,
        answerTotal: action.payload.total,
      };

    case 'ANSWERS_CLOSED':
      return { ...state, status: 'judging' };

    case 'ANSWERS_FOR_JUDGING':
      return { ...state, answers: action.payload.answers || [] };

    case 'JUDGMENT_RESULT':
      return {
        ...state,
        myJudgment: {
          isCorrect: action.payload.isCorrect,
          pointsAwarded: action.payload.pointsAwarded,
        },
        totalScore: action.payload.totalScore,
      };

    case 'JUDGMENT_UPDATED': {
      const updated = state.answers.map((a) =>
        a.playerId === action.payload.playerId
          ? { ...a, isCorrect: action.payload.isCorrect }
          : a
      );
      const updatedPlayers = state.players.map((p) =>
        p.playerId === action.payload.playerId
          ? { ...p, totalScore: action.payload.totalScore }
          : p
      );
      return { ...state, answers: updated, players: updatedPlayers };
    }

    case 'ANSWER_REVEALED':
      return {
        ...state,
        status: 'showing_answer',
        correctAnswer: action.payload.correctAnswer,
        correctPlayers: action.payload.correctPlayers || [],
        revealData: action.payload,
      };

    case 'SCORES_REVEALED':
      return {
        ...state,
        status: 'showing_scores',
        rankings: action.payload.rankings || [],
      };

    case 'SCORES_UPDATE':
      return {
        ...state,
        rankings: action.payload.rankings || [],
      };

    case 'PLAYER_JOINED': {
      const exists = state.players.find((p) => p.playerId === action.payload.playerId);
      if (exists) return state;
      return {
        ...state,
        players: [
          ...state.players,
          {
            playerId: action.payload.playerId,
            name: action.payload.name,
            totalScore: 0,
            correctCount: 0,
          },
        ],
      };
    }

    case 'QUIZZES_LOADED':
      return {
        ...state,
        quizzes: action.payload.quizzes || [],
      };

    case 'GAME_STATE_UPDATE':
      return {
        ...state,
        status: action.payload.status,
        currentQuiz: action.payload.status === 'waiting' ? null : state.currentQuiz,
      };

    case 'STATE_SYNC': {
      const newState = { ...state, status: action.payload.status };
      if (action.payload.question) {
        newState.currentQuiz = action.payload.question;
      }
      if (action.payload.myAnswer) {
        newState.myAnswer = action.payload.myAnswer;
      }
      if (action.payload.rankings) {
        newState.rankings = action.payload.rankings;
      }
      return newState;
    }

    case 'RESET':
      return { ...initialState };

    default:
      return state;
  }
}

export function GameProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  return (
    <GameContext.Provider value={{ state, dispatch }}>
      {children}
    </GameContext.Provider>
  );
}

export function useGame() {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame must be inside GameProvider');
  return ctx;
}

/**
 * Maps incoming WebSocket event names to dispatch actions.
 */
export function useMessageHandler() {
  const { dispatch } = useGame();

  return useCallback(
    (msg) => {
      const map = {
        registered: 'REGISTERED',
        full_state: 'FULL_STATE',
        question_started: 'QUESTION_STARTED',
        answer_submitted: 'ANSWER_SUBMITTED',
        new_answer: 'NEW_ANSWER',
        answer_count_update: 'ANSWER_COUNT_UPDATE',
        answers_closed: 'ANSWERS_CLOSED',
        answers_for_judging: 'ANSWERS_FOR_JUDGING',
        judgment_result: 'JUDGMENT_RESULT',
        judgment_updated: 'JUDGMENT_UPDATED',
        answer_revealed: 'ANSWER_REVEALED',
        scores_revealed: 'SCORES_REVEALED',
        scores_update: 'SCORES_UPDATE',
        player_joined: 'PLAYER_JOINED',
        quizzes_loaded: 'QUIZZES_LOADED',
        game_state_update: 'GAME_STATE_UPDATE',
        state_sync: 'STATE_SYNC',
      };

      const type = map[msg.event];
      if (type) {
        dispatch({ type, payload: msg });
      } else if (msg.event === 'error') {
        console.error('[Server Error]', msg.message);
        // Auth-related errors (password mismatch, invalid role)
        if (
          msg.message?.includes('パスワード') ||
          msg.message?.includes('ロール')
        ) {
          dispatch({ type: 'AUTH_ERROR', payload: msg.message });
        } else {
          dispatch({ type: 'SET_ERROR', payload: msg.message });
        }
      } else {
        console.log('[WS] Unhandled event:', msg.event, msg);
      }
    },
    [dispatch]
  );
}
