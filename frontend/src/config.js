// WebSocket endpoint — set via environment variable at build time
// In .env.local:  VITE_WS_URL=wss://xxxxxxxx.execute-api.ap-northeast-1.amazonaws.com/prod
export const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:3001';

// Cookie/localStorage key for player ID persistence
export const PLAYER_ID_KEY = 'quiz_player_id';
export const PLAYER_NAME_KEY = 'quiz_player_name';

// Game statuses
export const STATUS = {
  WAITING: 'waiting',
  ANSWERING: 'answering',
  JUDGING: 'judging',
  SHOWING_ANSWER: 'showing_answer',
  SHOWING_SCORES: 'showing_scores',
};
