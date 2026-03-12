import { useState, useEffect, useRef } from 'react';
import { useGame, useMessageHandler } from '../../contexts/GameContext';
import { useWebSocket } from '../../hooks/useWebSocket';
import { PLAYER_ID_KEY, PLAYER_NAME_KEY } from '../../config';
import { t } from '../../i18n';

export default function PlayerApp() {
  const { state, dispatch } = useGame();
  const handleMessage = useMessageHandler();
  const { send, connected } = useWebSocket(handleMessage);
  const [recovering, setRecovering] = useState(() => !!localStorage.getItem(PLAYER_ID_KEY));
  const recoveryAttempted = useRef(false);

  useEffect(() => { dispatch({ type: 'SET_CONNECTED', payload: connected }); }, [connected, dispatch]);

  // Auto-recover on connect
  useEffect(() => {
    if (!connected) return;
    const savedId = localStorage.getItem(PLAYER_ID_KEY);
    const savedName = localStorage.getItem(PLAYER_NAME_KEY);

    if (savedId && savedName && !recoveryAttempted.current) {
      recoveryAttempted.current = true;
      send({ action: 'register', name: savedName, playerId: savedId });
      setTimeout(() => send({ action: 'get_state' }), 300);
    } else if (state.playerId && state.playerName) {
      send({ action: 'register', name: state.playerName, playerId: state.playerId });
      setTimeout(() => send({ action: 'get_state' }), 300);
    }
  }, [connected]);

  // Once registered, stop showing recovery spinner
  useEffect(() => {
    if (state.playerId) {
      setRecovering(false);
      localStorage.setItem(PLAYER_ID_KEY, state.playerId);
      if (state.playerName) localStorage.setItem(PLAYER_NAME_KEY, state.playerName);
    }
  }, [state.playerId]);

  // If recovery fails (server doesn't know us), show login
  useEffect(() => {
    if (recovering && connected) {
      const timeout = setTimeout(() => setRecovering(false), 3000);
      return () => clearTimeout(timeout);
    }
  }, [recovering, connected]);

  // Server rejected registration (game was reset, status is 'init')
  // Clear stale localStorage and show login immediately
  useEffect(() => {
    if (state.registrationRejected) {
      localStorage.removeItem(PLAYER_ID_KEY);
      localStorage.removeItem(PLAYER_NAME_KEY);
      recoveryAttempted.current = false;
      setRecovering(false);
    }
  }, [state.registrationRejected]);

  // Full reset clears player identity
  const prevStatus = useRef(state.status);
  useEffect(() => {
    if (state.status === 'init' && !state.playerId && prevStatus.current !== 'init') {
      localStorage.removeItem(PLAYER_ID_KEY);
      localStorage.removeItem(PLAYER_NAME_KEY);
      recoveryAttempted.current = false;
      setRecovering(false);
    }
    prevStatus.current = state.status;
  }, [state.status, state.playerId]);

  // Show pink spinner during recovery
  if (recovering && !state.playerId) {
    return (
      <Shell>
        <div className="flex-1 flex flex-col items-center justify-center">
          <div className="text-5xl animate-pulse mb-4">✨</div>
          <p className="text-pink-400 font-bold text-lg">{t('app.recovering')}</p>
        </div>
      </Shell>
    );
  }

  if (!state.playerId) return <LoginScreen send={send} connected={connected} />;

  const { status } = state;
  const playerCount = state.players?.length || 0;
  const myRank = state.players
    ? [...state.players].sort((a, b) => (b.totalScore || 0) - (a.totalScore || 0))
        .findIndex(p => p.playerId === state.playerId) + 1
    : 0;

  return (
    <Shell>
      <ConnDot connected={connected} />
      <PlayerHeader name={state.playerName} score={state.totalScore} rank={myRank} total={playerCount} />

      {(status === 'init' || status === 'accepting' || status === 'waiting') && <WaitingScreen status={status} />}
      {status === 'answering' && !state.myAnswer && <AnswerScreen quiz={state.currentQuiz} send={send} />}
      {status === 'answering' && state.myAnswer && <SubmittedScreen answer={state.myAnswer} />}
      {status === 'judging' && <JudgingScreen answer={state.myAnswer} />}
      {status === 'showing_answer' && (
        <ResultScreen myAnswer={state.myAnswer} judgment={state.myJudgment} revealData={state.revealData} score={state.totalScore} />
      )}
      {status === 'showing_scores' && <ScoresScreen rankings={state.rankings} playerId={state.playerId} />}
    </Shell>
  );
}

/* ── Kawaii shell wrapper ── */
function Shell({ children }) {
  return (
    <div className="min-h-dvh flex flex-col relative overflow-hidden" style={{
      fontFamily: "'Zen Maru Gothic', 'Quicksand', sans-serif",
      background: 'linear-gradient(135deg, #fff0f5 0%, #ffe4ec 50%, #fce4ff 100%)',
    }}>
      {Array.from({ length: 12 }, (_, i) => (
        <div key={i} className="absolute animate-pulse pointer-events-none" style={{
          left: `${Math.random() * 100}%`, top: `${Math.random() * 100}%`,
          animationDelay: `${Math.random() * 4}s`, animationDuration: `${2 + Math.random() * 3}s`,
          fontSize: 8 + Math.random() * 12, opacity: 0.2, color: '#ff6b9d',
        }}>✦</div>
      ))}
      {children}
    </div>
  );
}

function ConnDot({ connected }) {
  return (
    <div className="fixed top-2 left-2 z-50 flex items-center gap-1.5 px-2 py-1 rounded-full bg-white/60 backdrop-blur-sm text-xs">
      <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-400' : 'bg-red-400 animate-pulse'}`} />
      <span className="text-pink-400">{connected ? t('app.connecting') : t('app.reconnecting')}</span>
    </div>
  );
}

function PlayerHeader({ name, score, rank, total }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 bg-white/50 backdrop-blur-sm border-b border-pink-100">
      <span className="font-bold text-pink-600 truncate" style={{ maxWidth: '35%' }}>{name}</span>
      <div className="text-center">
        <span className="font-black text-yellow-500 text-lg">{t('player.header.pt', { score })}</span>
      </div>
      <span className="text-pink-400 text-sm font-bold">
        {rank > 0 ? t('player.header.rank', { rank, total }) : ''}
      </span>
    </div>
  );
}

/* ── Login ── */
function LoginScreen({ send, connected }) {
  const { dispatch, state } = useGame();
  const [name, setName] = useState(() => localStorage.getItem(PLAYER_NAME_KEY) || '');
  const [submitting, setSubmitting] = useState(false);
  const [nameError, setNameError] = useState(null);

  const handleSubmit = () => {
    if (!name.trim() || !connected) return;
    setSubmitting(true);
    setNameError(null);
    send({ action: 'register', name: name.trim(), playerId: localStorage.getItem(PLAYER_ID_KEY) });
    localStorage.setItem(PLAYER_NAME_KEY, name.trim());
  };

  useEffect(() => {
    if (state.lastError?.includes('既に使われています')) {
      setNameError(state.lastError);
      setSubmitting(false);
      dispatch({ type: 'CLEAR_ERROR' });
    }
  }, [state.lastError]);

  useEffect(() => {
    if (state.playerId) { localStorage.setItem(PLAYER_ID_KEY, state.playerId); setSubmitting(false); }
  }, [state.playerId]);

  return (
    <Shell>
      <ConnDot connected={connected} />
      <div className="flex-1 flex flex-col items-center justify-center px-6">
        <div className="animate-fade-in text-center mb-10">
          <p className="text-5xl mb-3">🎀✨</p>
          <h1 className="font-black text-3xl text-pink-500" style={{ textShadow: '1px 1px 8px rgba(255,107,157,0.3)' }}>
            {t('app.title')}
          </h1>
          <p className="text-pink-300 mt-2 text-sm">{t('player.login.subtitle')}</p>
        </div>
        <div className="w-full max-w-sm bg-white/70 backdrop-blur-sm rounded-3xl border-2 border-pink-200 p-5 shadow-xl shadow-pink-100 animate-slide-up">
          {nameError && (
            <div className="mb-3 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-500 text-sm">{nameError}</div>
          )}
          <input type="text" value={name}
            onChange={(e) => { setName(e.target.value); setNameError(null); }}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            placeholder={t('player.login.placeholder')} maxLength={20}
            className="w-full bg-pink-50 border-2 border-pink-200 rounded-xl px-4 py-3 text-lg text-gray-700 placeholder:text-pink-300 focus:outline-none focus:border-pink-400"
            autoFocus />
          <button onClick={handleSubmit} disabled={!name.trim() || !connected || submitting}
            className="w-full mt-4 px-6 py-3 bg-gradient-to-r from-pink-400 to-rose-400 text-white font-bold rounded-xl disabled:opacity-40 shadow-lg shadow-pink-200 active:scale-95">
            {submitting ? t('player.login.submitting') : t('player.login.submit')}
          </button>
        </div>
      </div>
    </Shell>
  );
}

/* ── Header ── */
function WaitingScreen({ status }) {
  const msg = status === 'init' ? t('player.waiting.init')
    : status === 'accepting' ? t('player.waiting.accepting')
    : t('player.waiting.default');
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 animate-fade-in">
      <div className="text-6xl mb-4 animate-pulse">🌸</div>
      <p className="font-bold text-xl text-pink-500">{msg}</p>
      <p className="text-pink-300 text-sm mt-2">{t('player.waiting.hint')}</p>
    </div>
  );
}

/* ── Answer ── */
function AnswerScreen({ quiz, send }) {
  const [textAnswer, setTextAnswer] = useState('');

  if (!quiz) return null;

  // Choice: submit immediately on click
  const handleChoice = (i) => {
    send({ action: 'submit_answer', quizId: quiz.quizId, choiceIndex: i });
  };

  const handleTextSubmit = () => {
    if (!textAnswer.trim()) return;
    send({ action: 'submit_answer', quizId: quiz.quizId, answerText: textAnswer.trim() });
  };

  return (
    <div className="flex-1 flex flex-col px-4 py-6 animate-slide-up">
      <div className="text-center mb-4">
        <span className="inline-block px-3 py-1 rounded-full bg-pink-100 text-pink-500 text-xs font-bold border border-pink-200">
          {t('player.answer.corner', { corner: quiz.cornerNumber, num: quiz.questionNumber })}
        </span>
        {quiz.cornerTitle && <p className="text-pink-300 text-xs mt-1">{quiz.cornerTitle}</p>}
      </div>

      <div className="bg-white/70 backdrop-blur-sm rounded-2xl border-2 border-pink-100 p-5 mb-6 shadow-sm">
        <p className="text-lg leading-relaxed text-gray-700 font-bold">{quiz.questionText}</p>
        <p className="text-right text-yellow-500 text-sm font-bold mt-2">{t('player.answer.points', { pts: quiz.points })}</p>
      </div>

      <div className="flex-1">
        {quiz.questionType === 'text' ? (
          <div className="flex gap-2">
            <input type="text" value={textAnswer}
              onChange={(e) => setTextAnswer(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleTextSubmit()}
              placeholder={t('player.answer.textPlaceholder')}
              className="flex-1 bg-white/70 border-2 border-pink-200 rounded-xl px-4 py-4 text-xl text-gray-700 placeholder:text-pink-300 focus:outline-none focus:border-pink-400"
              autoFocus />
            <button onClick={handleTextSubmit} disabled={!textAnswer.trim()}
              className="px-5 bg-gradient-to-r from-pink-400 to-rose-400 text-white font-bold rounded-xl disabled:opacity-40 shadow-lg shadow-pink-200 active:scale-95 shrink-0">
              {t('player.answer.submit')}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {quiz.choices?.map((choice, i) => (
              <button key={i} onClick={() => handleChoice(i)}
                className="w-full text-left px-5 py-4 rounded-xl border-2 border-pink-100 bg-white/70 text-gray-600 hover:border-pink-300 hover:bg-pink-50 transition-all font-bold text-base active:scale-95">
                <span className="font-black mr-3 text-sm text-pink-300">{String.fromCharCode(65 + i)}</span>{choice}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Submitted ── */
function SubmittedScreen({ answer }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 animate-pop">
      <div className="text-5xl mb-4">✅</div>
      <p className="font-bold text-xl text-pink-500 mb-2">{t('player.submitted.title')}</p>
      <div className="bg-white/70 rounded-2xl border-2 border-pink-100 p-5 text-center mt-4">
        <p className="text-pink-300 text-sm">{t('player.submitted.yourAnswer')}</p>
        <p className="font-black text-2xl text-pink-600 mt-1">{answer.answerText}</p>
      </div>
      <p className="text-pink-300 text-sm mt-6">{t('player.submitted.waiting')}</p>
    </div>
  );
}

/* ── Judging ── */
function JudgingScreen({ answer }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 animate-fade-in">
      <div className="text-5xl mb-4 animate-pulse">🔍</div>
      <p className="font-bold text-xl text-pink-500">{t('player.judging.title')}</p>
      {answer ? (
        <div className="bg-white/70 rounded-2xl border-2 border-pink-100 p-5 text-center mt-4">
          <p className="text-pink-300 text-sm">{t('player.judging.yourAnswer')}</p>
          <p className="font-bold text-xl text-pink-600 mt-1">{answer.answerText}</p>
        </div>
      ) : <p className="text-pink-300 text-sm mt-4">{t('player.judging.noAnswer')}</p>}
    </div>
  );
}

function ResultScreen({ myAnswer, judgment, revealData, score }) {
  // If player answered but no judgment received, treat as incorrect (no ○ pressed)
  const isCorrect = judgment?.isCorrect === true;
  const answered = !!myAnswer;

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 animate-pop">
      {isCorrect && <PinkConfetti />}
      <div className="text-6xl mb-4">{isCorrect ? '🎉' : answered ? '😢' : '🤔'}</div>
      <p className="font-black text-3xl mb-2">
        {isCorrect ? <span className="text-green-500">{t('player.result.correct')}</span> :
         answered ? <span className="text-red-400">{t('player.result.incorrect')}</span> :
         <span className="text-pink-300">{t('player.result.noAnswer')}</span>}
      </p>
      {isCorrect && judgment.pointsAwarded > 0 && (
        <p className="font-black text-2xl text-yellow-500 animate-count-up">
          {t('player.result.addPoints', { pts: judgment.pointsAwarded })}
        </p>
      )}
      {revealData && (
        <div className="bg-white/70 rounded-2xl border-2 border-pink-200 p-5 text-center mt-6 w-full max-w-sm">
          <p className="text-pink-300 text-sm">{t('player.result.correctIs')}</p>
          <p className="font-black text-2xl text-pink-600 mt-1">{revealData.correctAnswer}</p>
        </div>
      )}
      <div className="mt-6 px-4 py-2 rounded-xl bg-white/50 border border-pink-100">
        <span className="text-pink-400 text-sm">{t('player.result.total')} </span>
        <span className="font-black text-yellow-500 text-lg">{score} pt</span>
      </div>
    </div>
  );
}

/* ── Scores ── */
function ScoresScreen({ rankings, playerId }) {
  const sorted = [...rankings].sort((a, b) => (b.totalScore || 0) - (a.totalScore || 0))
    .map((r, i) => ({ ...r, rank: i + 1 }));
  return (
    <div className="flex-1 flex flex-col px-4 py-6 animate-fade-in">
      <h2 className="font-black text-2xl text-center text-pink-500 mb-6">{t('player.scores.title')}</h2>
      <div className="space-y-2">
        {sorted.map((r, i) => {
          const isMe = r.playerId === playerId;
          return (
            <div key={r.playerId || i} className={`flex items-center gap-3 px-4 py-3 rounded-xl ${
              isMe ? 'bg-pink-100 border-2 border-pink-300' : 'bg-white/50 border border-pink-100'
            }`}>
              <span className="font-black text-pink-400 w-8 text-center">
                {i < 3 ? ['🥇','🥈','🥉'][i] : r.rank}
              </span>
              <span className={`flex-1 font-bold truncate ${isMe ? 'text-pink-600' : 'text-gray-600'}`}>
                {r.name} {isMe && t('player.scores.you')}
              </span>
              <span className="font-black text-yellow-500">{r.totalScore} pt</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Pink Confetti ── */
function PinkConfetti() {
  const colors = ['#ff6b9d', '#ffd700', '#ff9ecd', '#ffb6c1', '#f0a0ff', '#87ceeb'];
  return (
    <div className="fixed inset-0 pointer-events-none z-50">
      {Array.from({ length: 30 }, (_, i) => (
        <div key={i} className="confetti-particle" style={{
          left: `${Math.random() * 100}%`, backgroundColor: colors[i % colors.length],
          animationDelay: `${Math.random() * 2}s`,
          width: `${6 + Math.random() * 6}px`, height: `${6 + Math.random() * 6}px`,
          borderRadius: Math.random() > 0.5 ? '50%' : '2px',
        }} />
      ))}
    </div>
  );
}
