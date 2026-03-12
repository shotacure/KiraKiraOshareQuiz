import { useState, useEffect, useRef } from 'react';
import { useGame, useMessageHandler } from '../../contexts/GameContext';
import { useWebSocket } from '../../hooks/useWebSocket';
import { PLAYER_ID_KEY, PLAYER_NAME_KEY } from '../../config';
import { t } from '../../i18n';

export default function PlayerApp() {
  const { state, dispatch } = useGame();
  const handleMessage = useMessageHandler();
  const { send, connected } = useWebSocket(handleMessage);

  const hasSavedSession = useRef(!!localStorage.getItem(PLAYER_ID_KEY));
  const [phase, setPhase] = useState(hasSavedSession.current ? 'loading' : 'ready');
  const recoveryDone = useRef(false);
  const serverResponded = useRef(false);

  useEffect(() => { dispatch({ type: 'SET_CONNECTED', payload: connected }); }, [connected, dispatch]);

  // Phase 1: get_state on connect
  useEffect(() => {
    if (!connected) return;
    serverResponded.current = false;
    send({ action: 'get_state' });
  }, [connected]);

  // Detect actual server response (status change beyond initial default)
  const statusChangeCount = useRef(0);
  useEffect(() => {
    statusChangeCount.current += 1;
    if (statusChangeCount.current <= 1) return;
    serverResponded.current = true;
  }, [state.status]);

  useEffect(() => { if (state.registrationRejected) serverResponded.current = true; }, [state.registrationRejected]);
  useEffect(() => { if (state.playerId) serverResponded.current = true; }, [state.playerId]);

  // Phase 2: once server responded, decide recovery
  useEffect(() => {
    if (phase !== 'loading') return;
    if (!serverResponded.current) return;

    if (state.status === 'init') { setPhase('ready'); return; }

    if (connected && !recoveryDone.current) {
      const savedId = localStorage.getItem(PLAYER_ID_KEY);
      const savedName = localStorage.getItem(PLAYER_NAME_KEY);
      if (savedId && savedName) {
        recoveryDone.current = true;
        setPhase('recovering');
        send({ action: 'register', name: savedName, playerId: savedId });
      } else {
        setPhase('ready');
      }
    }
  }, [state.status, connected, phase]);

  // Phase 3: registration succeeded
  useEffect(() => {
    if (state.playerId) {
      localStorage.setItem(PLAYER_ID_KEY, state.playerId);
      if (state.playerName) localStorage.setItem(PLAYER_NAME_KEY, state.playerName);
      if (phase !== 'ready') setPhase('ready');
    }
  }, [state.playerId]);

  // Registration rejected
  useEffect(() => {
    if (state.registrationRejected) {
      localStorage.removeItem(PLAYER_ID_KEY);
      localStorage.removeItem(PLAYER_NAME_KEY);
      recoveryDone.current = false;
      setPhase('ready');
    }
  }, [state.registrationRejected]);

  // Timeout
  useEffect(() => {
    if (phase === 'loading' || phase === 'recovering') {
      const timer = setTimeout(() => setPhase('ready'), 5000);
      return () => clearTimeout(timer);
    }
  }, [phase]);

  // Full reset
  const prevStatus = useRef(state.status);
  useEffect(() => {
    if (state.status === 'init' && !state.playerId && prevStatus.current !== 'init' && serverResponded.current) {
      localStorage.removeItem(PLAYER_ID_KEY);
      localStorage.removeItem(PLAYER_NAME_KEY);
      recoveryDone.current = false;
      setPhase('ready');
    }
    prevStatus.current = state.status;
  }, [state.status, state.playerId]);

  // WS reconnect (not F5)
  useEffect(() => {
    if (connected && state.playerId && state.playerName && phase === 'ready') {
      send({ action: 'register', name: state.playerName, playerId: state.playerId });
      setTimeout(() => send({ action: 'get_state' }), 300);
    }
  }, [connected]);

  // ── Render ──

  if (phase === 'loading' || phase === 'recovering') {
    return (
      <Shell>
        <div className="flex-1 flex flex-col items-center justify-center">
          <div className="text-5xl animate-pulse mb-4">✨</div>
          <p className="text-pink-400 font-bold text-lg">{t('app.recovering')}</p>
        </div>
      </Shell>
    );
  }

  // Init: show preparing screen
  if (state.status === 'init' && !state.playerId) {
    return (
      <Shell>
        <div className="flex-1 flex flex-col items-center justify-center px-6 animate-fade-in">
          <p className="text-5xl mb-3">🎀✨</p>
          <h1 className="font-black text-3xl text-pink-500 mb-4" style={{ textShadow: '1px 1px 8px rgba(255,107,157,0.3)' }}>
            {t('app.title')}
          </h1>
          <div className="text-6xl mb-4 animate-pulse">⏳</div>
          <p className="font-bold text-xl text-pink-500">{t('player.waiting.init')}</p>
          <p className="text-pink-300 text-sm mt-2">{t('player.waiting.hint')}</p>
        </div>
      </Shell>
    );
  }

  // Not registered and registration is closed (past accepting)
  if (!state.playerId && state.status !== 'accepting') {
    return (
      <Shell>
        <div className="flex-1 flex flex-col items-center justify-center px-6 animate-fade-in">
          <p className="text-5xl mb-3">🎀✨</p>
          <h1 className="font-black text-3xl text-pink-500 mb-4" style={{ textShadow: '1px 1px 8px rgba(255,107,157,0.3)' }}>
            {t('app.title')}
          </h1>
          <div className="text-5xl mb-4">🚫</div>
          <p className="font-bold text-xl text-pink-500">{t('player.waiting.closed')}</p>
          <p className="text-pink-300 text-sm mt-2">{t('player.waiting.closedHint')}</p>
        </div>
      </Shell>
    );
  }

  // Not registered, accepting: show login
  if (!state.playerId) return <LoginScreen send={send} connected={connected} />;

  // Registered: show game UI
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
    <div className="fixed top-2 right-2 z-50 flex items-center gap-1.5 px-2 py-1 rounded-full bg-white/60 backdrop-blur-sm text-xs">
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

function LoginScreen({ send, connected }) {
  const { dispatch, state } = useGame();
  const [name, setName] = useState(() => localStorage.getItem(PLAYER_NAME_KEY) || '');
  const [submitting, setSubmitting] = useState(false);
  const [nameError, setNameError] = useState(null);

  const handleSubmit = () => {
    if (!name.trim() || !connected) return;
    setSubmitting(true); setNameError(null);
    send({ action: 'register', name: name.trim(), playerId: localStorage.getItem(PLAYER_ID_KEY) });
    localStorage.setItem(PLAYER_NAME_KEY, name.trim());
  };

  useEffect(() => {
    if (state.lastError?.code === 'name_taken') {
      setNameError(state.lastError.message);
      setSubmitting(false);
      dispatch({ type: 'CLEAR_ERROR' });
    } else if (state.lastError) {
      setNameError(state.lastError.message || state.lastError);
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
          <h1 className="font-black text-3xl text-pink-500" style={{ textShadow: '1px 1px 8px rgba(255,107,157,0.3)' }}>{t('app.title')}</h1>
          <p className="text-pink-300 mt-2 text-sm">{t('player.login.subtitle')}</p>
        </div>
        <div className="w-full max-w-sm bg-white/70 backdrop-blur-sm rounded-3xl border-2 border-pink-200 p-5 shadow-xl shadow-pink-100 animate-slide-up">
          {nameError && <div className="mb-3 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-500 text-sm">{nameError}</div>}
          <input type="text" value={name}
            onChange={(e) => { setName(e.target.value); setNameError(null); }}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            placeholder={t('player.login.placeholder')} maxLength={20}
            className="w-full bg-pink-50 border-2 border-pink-200 rounded-xl px-4 py-3 text-lg text-gray-700 placeholder:text-pink-300 focus:outline-none focus:border-pink-400" autoFocus />
          <button onClick={handleSubmit} disabled={!name.trim() || !connected || submitting}
            className="w-full mt-4 px-6 py-3 bg-gradient-to-r from-pink-400 to-rose-400 text-white font-bold rounded-xl disabled:opacity-40 shadow-lg shadow-pink-200 active:scale-95">
            {submitting ? t('player.login.submitting') : t('player.login.submit')}
          </button>
        </div>
      </div>
    </Shell>
  );
}

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

function AnswerScreen({ quiz, send }) {
  const [textAnswer, setTextAnswer] = useState('');
  if (!quiz) return null;

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
          {t('player.answer.question', { num: quiz.questionNumber })}
        </span>
      </div>
      <div className="bg-white/70 backdrop-blur-sm rounded-2xl border-2 border-pink-100 p-5 mb-6 shadow-sm">
        <p className="text-lg leading-relaxed text-gray-700 font-bold">{quiz.questionText}</p>
        <p className="text-right text-yellow-500 text-sm font-bold mt-2">{t('player.answer.points', { pts: quiz.points })}</p>
      </div>
      <div className="flex-1">
        {quiz.questionType === 'text' ? (
          <div>
            <input type="text" value={textAnswer}
              onChange={(e) => setTextAnswer(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleTextSubmit()}
              placeholder={t('player.answer.textPlaceholder')}
              className="w-full bg-white/70 border-2 border-pink-200 rounded-xl px-4 py-4 text-xl text-gray-700 placeholder:text-pink-300 focus:outline-none focus:border-pink-400" autoFocus />
            <button onClick={handleTextSubmit} disabled={!textAnswer.trim()}
              className="w-full mt-3 px-6 py-4 bg-gradient-to-r from-pink-400 to-rose-400 text-white text-lg font-bold rounded-xl disabled:opacity-40 shadow-lg shadow-pink-200 active:scale-95">
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
        <p className="font-black text-2xl text-yellow-500 animate-count-up">{t('player.result.addPoints', { pts: judgment.pointsAwarded })}</p>
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

function ScoresScreen({ rankings, playerId }) {
  const sorted = [...rankings].sort((a, b) => (b.totalScore || 0) - (a.totalScore || 0)).map((r, i) => ({ ...r, rank: i + 1 }));
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
              <span className="font-black text-pink-400 w-8 text-center">{i < 3 ? ['🥇','🥈','🥉'][i] : r.rank}</span>
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
