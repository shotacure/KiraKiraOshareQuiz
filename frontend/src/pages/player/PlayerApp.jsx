import { useState, useEffect, useRef } from 'react';
import { useGame, useMessageHandler } from '../../contexts/GameContext';
import { useWebSocket } from '../../hooks/useWebSocket';
import { PLAYER_ID_KEY, PLAYER_NAME_KEY } from '../../config';

export default function PlayerApp() {
  const { state, dispatch } = useGame();
  const handleMessage = useMessageHandler();
  const { send, connected } = useWebSocket(handleMessage);
  const [recovering, setRecovering] = useState(() => !!localStorage.getItem(PLAYER_ID_KEY));
  const recoveryAttempted = useRef(false);

  useEffect(() => {
    dispatch({ type: 'SET_CONNECTED', payload: connected });
  }, [connected, dispatch]);

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

  // Full reset: clear everything and force re-login
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
      <KawaiiShell>
        <div className="flex-1 flex flex-col items-center justify-center">
          <div className="text-5xl animate-pulse mb-4">✨</div>
          <p style={{ fontFamily: "'Zen Maru Gothic', sans-serif" }} className="text-pink-400 font-bold text-lg">
            復帰中...
          </p>
        </div>
      </KawaiiShell>
    );
  }

  if (!state.playerId) {
    return <LoginScreen send={send} connected={connected} />;
  }

  const { status } = state;

  return (
    <KawaiiShell>
      <ConnDot connected={connected} />
      <PlayerHeader name={state.playerName} score={state.totalScore} />

      {(status === 'init' || status === 'accepting' || status === 'waiting') && <WaitingScreen status={status} />}
      {status === 'answering' && !state.myAnswer && <AnswerScreen quiz={state.currentQuiz} send={send} />}
      {status === 'answering' && state.myAnswer && <SubmittedScreen answer={state.myAnswer} />}
      {status === 'judging' && <JudgingScreen answer={state.myAnswer} />}
      {status === 'showing_answer' && (
        <ResultScreen judgment={state.myJudgment} revealData={state.revealData} score={state.totalScore} />
      )}
      {status === 'showing_scores' && <ScoresScreen rankings={state.rankings} playerId={state.playerId} />}
    </KawaiiShell>
  );
}

/* ── Kawaii shell wrapper ── */
function KawaiiShell({ children }) {
  return (
    <div className="min-h-dvh flex flex-col relative overflow-hidden"
      style={{
        fontFamily: "'Zen Maru Gothic', 'Quicksand', sans-serif",
        background: 'linear-gradient(135deg, #fff0f5 0%, #ffe4ec 50%, #fce4ff 100%)',
      }}>
      {/* Subtle sparkles */}
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
      <span className="text-pink-400">{connected ? '接続中' : '再接続中...'}</span>
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
    const existingId = localStorage.getItem(PLAYER_ID_KEY);
    send({ action: 'register', name: name.trim(), playerId: existingId });
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
    if (state.playerId) {
      localStorage.setItem(PLAYER_ID_KEY, state.playerId);
      setSubmitting(false);
    }
  }, [state.playerId]);

  return (
    <KawaiiShell>
      <ConnDot connected={connected} />
      <div className="flex-1 flex flex-col items-center justify-center px-6">
        <div className="animate-fade-in text-center mb-10">
          <p className="text-5xl mb-3">🎀✨</p>
          <h1 className="font-black text-3xl text-pink-500 tracking-tight"
            style={{ textShadow: '1px 1px 8px rgba(255,107,157,0.3)' }}>
            キラキラ おしゃれクイズ
          </h1>
          <p className="text-pink-300 mt-2 text-sm">名前を入力して参加してね！</p>
        </div>

        <div className="w-full max-w-sm bg-white/70 backdrop-blur-sm rounded-3xl border-2 border-pink-200 p-5 shadow-xl shadow-pink-100 animate-slide-up">
          {nameError && (
            <div className="mb-3 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-500 text-sm">
              {nameError}
            </div>
          )}
          <input type="text" value={name}
            onChange={(e) => { setName(e.target.value); setNameError(null); }}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            placeholder="あなたの名前" maxLength={20}
            className="w-full bg-pink-50 border-2 border-pink-200 rounded-xl px-4 py-3 text-lg text-gray-700 placeholder:text-pink-300 focus:outline-none focus:border-pink-400 transition-colors"
            autoFocus
          />
          <button onClick={handleSubmit} disabled={!name.trim() || !connected || submitting}
            className="w-full mt-4 px-6 py-3 bg-gradient-to-r from-pink-400 to-rose-400 text-white font-bold rounded-xl hover:from-pink-500 hover:to-rose-500 disabled:opacity-40 transition-all shadow-lg shadow-pink-200 active:scale-95">
            {submitting ? '接続中...' : '✨ 参加する'}
          </button>
        </div>
      </div>
    </KawaiiShell>
  );
}

/* ── Header ── */
function PlayerHeader({ name, score }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 bg-white/50 backdrop-blur-sm border-b border-pink-100">
      <span className="font-bold text-pink-600 truncate max-w-[50%]">{name}</span>
      <span className="font-black text-yellow-500 text-lg">{score} pt ⭐</span>
    </div>
  );
}

/* ── Waiting ── */
function WaitingScreen({ status }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 animate-fade-in">
      <div className="text-6xl mb-4 animate-pulse">🌸</div>
      <p className="font-bold text-xl text-pink-500">
        {status === 'init' ? '準備中だよ...' :
         status === 'accepting' ? '参加登録できたよ！🎉' :
         '次の問題をまってね'}
      </p>
      <p className="text-pink-300 text-sm mt-2">出題されたら自動でかわるよ</p>
    </div>
  );
}

/* ── Answer ── */
function AnswerScreen({ quiz, send }) {
  const [textAnswer, setTextAnswer] = useState('');
  const [selectedChoice, setSelectedChoice] = useState(null);

  if (!quiz) return null;

  const handleSubmit = () => {
    if (quiz.questionType === 'choice' && selectedChoice !== null) {
      send({ action: 'submit_answer', quizId: quiz.quizId, choiceIndex: selectedChoice });
    } else if (quiz.questionType === 'text' && textAnswer.trim()) {
      send({ action: 'submit_answer', quizId: quiz.quizId, answerText: textAnswer.trim() });
    }
  };

  const canSubmit = quiz.questionType === 'choice' ? selectedChoice !== null : textAnswer.trim().length > 0;

  return (
    <div className="flex-1 flex flex-col px-4 py-6 animate-slide-up">
      <div className="text-center mb-4">
        <span className="inline-block px-3 py-1 rounded-full bg-pink-100 text-pink-500 text-xs font-bold mb-2 border border-pink-200">
          第{quiz.cornerNumber}コーナー Q{quiz.questionNumber}
        </span>
        {quiz.cornerTitle && <p className="text-pink-300 text-xs">{quiz.cornerTitle}</p>}
      </div>

      <div className="bg-white/70 backdrop-blur-sm rounded-2xl border-2 border-pink-100 p-5 mb-6 shadow-sm">
        <p className="text-lg leading-relaxed text-gray-700 font-bold">{quiz.questionText}</p>
        <p className="text-right text-yellow-500 text-sm font-bold mt-2">+{quiz.points}pt ⭐</p>
      </div>

      <div className="flex-1">
        {quiz.questionType === 'text' ? (
          <input type="text" value={textAnswer}
            onChange={(e) => setTextAnswer(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && canSubmit && handleSubmit()}
            placeholder="こたえを入力..."
            className="w-full bg-white/70 border-2 border-pink-200 rounded-xl px-4 py-4 text-xl text-gray-700 placeholder:text-pink-300 focus:outline-none focus:border-pink-400 transition-colors"
            autoFocus
          />
        ) : (
          <div className="space-y-3">
            {quiz.choices?.map((choice, i) => (
              <button key={i} onClick={() => setSelectedChoice(i)}
                className={`w-full text-left px-5 py-4 rounded-xl border-2 transition-all text-base font-bold ${
                  selectedChoice === i
                    ? 'border-pink-400 bg-pink-50 text-pink-600'
                    : 'border-pink-100 bg-white/70 text-gray-600 hover:border-pink-200'
                }`}>
                <span className="font-black mr-3 text-sm text-pink-300">{String.fromCharCode(65 + i)}</span>{choice}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="mt-6 pb-safe">
        <button onClick={handleSubmit} disabled={!canSubmit}
          className="w-full px-6 py-4 bg-gradient-to-r from-pink-400 to-rose-400 text-white text-lg font-bold rounded-xl hover:from-pink-500 hover:to-rose-500 disabled:opacity-40 transition-all shadow-lg shadow-pink-200 active:scale-95">
          💖 回答する
        </button>
      </div>
    </div>
  );
}

/* ── Submitted ── */
function SubmittedScreen({ answer }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 animate-pop">
      <div className="text-5xl mb-4">✅</div>
      <p className="font-bold text-xl text-pink-500 mb-2">送信できたよ！</p>
      <div className="bg-white/70 rounded-2xl border-2 border-pink-100 p-5 text-center mt-4">
        <p className="text-pink-300 text-sm">あなたの回答</p>
        <p className="font-black text-2xl text-pink-600 mt-1">{answer.answerText}</p>
      </div>
      <p className="text-pink-300 text-sm mt-6">結果発表をまってね... 💫</p>
    </div>
  );
}

/* ── Judging ── */
function JudgingScreen({ answer }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 animate-fade-in">
      <div className="text-5xl mb-4 animate-pulse">🔍</div>
      <p className="font-bold text-xl text-pink-500">採点中...</p>
      {answer ? (
        <div className="bg-white/70 rounded-2xl border-2 border-pink-100 p-5 text-center mt-4">
          <p className="text-pink-300 text-sm">あなたの回答</p>
          <p className="font-bold text-xl text-pink-600 mt-1">{answer.answerText}</p>
        </div>
      ) : <p className="text-pink-300 text-sm mt-4">未回答だよ</p>}
    </div>
  );
}

/* ── Result ── */
function ResultScreen({ judgment, revealData, score }) {
  const isCorrect = judgment?.isCorrect;
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 animate-pop">
      {isCorrect && <PinkConfetti />}
      <div className="text-6xl mb-4">{isCorrect ? '🎉' : isCorrect === false ? '😢' : '🤔'}</div>
      <p className="font-black text-3xl mb-2">
        {isCorrect ? <span className="text-green-500">正解！🎊</span> :
         isCorrect === false ? <span className="text-red-400">不正解...</span> :
         <span className="text-pink-300">未回答</span>}
      </p>
      {isCorrect && judgment.pointsAwarded > 0 && (
        <p className="font-black text-2xl text-yellow-500 animate-count-up">+{judgment.pointsAwarded} pt ⭐</p>
      )}
      {revealData && (
        <div className="bg-white/70 rounded-2xl border-2 border-pink-200 p-5 text-center mt-6 w-full max-w-sm">
          <p className="text-pink-300 text-sm">正解は...</p>
          <p className="font-black text-2xl text-pink-600 mt-1">{revealData.correctAnswer}</p>
        </div>
      )}
      <div className="mt-6 px-4 py-2 rounded-xl bg-white/50 border border-pink-100">
        <span className="text-pink-400 text-sm">合計: </span>
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
      <h2 className="font-black text-2xl text-center text-pink-500 mb-6">👑 最終成績！</h2>
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
                {r.name} {isMe && '(あなた)'}
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
  const particles = Array.from({ length: 30 }, (_, i) => ({
    id: i, left: `${Math.random() * 100}%`, color: colors[i % colors.length],
    delay: `${Math.random() * 2}s`, size: `${6 + Math.random() * 6}px`,
  }));
  return (
    <div className="fixed inset-0 pointer-events-none z-50">
      {particles.map(p => (
        <div key={p.id} className="confetti-particle" style={{
          left: p.left, backgroundColor: p.color, animationDelay: p.delay,
          width: p.size, height: p.size, borderRadius: Math.random() > 0.5 ? '50%' : '2px',
        }} />
      ))}
    </div>
  );
}
