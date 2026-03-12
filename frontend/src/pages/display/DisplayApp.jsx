import { useState, useEffect, useRef } from 'react';
import { useGame, useMessageHandler } from '../../contexts/GameContext';
import { useWebSocket } from '../../hooks/useWebSocket';
import { DISPLAY_SECRET_KEY } from '../../config';
import { formatElapsedMs } from '../../components/UI';
import { t } from '../../i18n';

export default function DisplayApp() {
  const { state, dispatch } = useGame();
  const handleMessage = useMessageHandler();
  const { send, connected } = useWebSocket(handleMessage);
  const [secret, setSecret] = useState(() => sessionStorage.getItem(DISPLAY_SECRET_KEY) || '');
  const [submitting, setSubmitting] = useState(false);
  const authedSecretRef = useRef(sessionStorage.getItem(DISPLAY_SECRET_KEY) || null);

  useEffect(() => { dispatch({ type: 'SET_CONNECTED', payload: connected }); }, [connected, dispatch]);

  // Auto-login on mount if secret in sessionStorage
  useEffect(() => {
    if (connected && authedSecretRef.current && !state.authed) {
      send({ action: 'connect_role', role: 'display', secret: authedSecretRef.current });
      dispatch({ type: 'SET_ROLE', payload: 'display' });
    }
  }, [connected]);

  useEffect(() => {
    if (state.authed) { setSubmitting(false); authedSecretRef.current = secret || authedSecretRef.current; if (authedSecretRef.current) sessionStorage.setItem(DISPLAY_SECRET_KEY, authedSecretRef.current); }
    if (state.authError) setSubmitting(false);
  }, [state.authed, state.authError]);

  // Re-auth on reconnect
  useEffect(() => {
    if (connected && authedSecretRef.current && state.authed) {
      send({ action: 'connect_role', role: 'display', secret: authedSecretRef.current });
    }
  }, [connected]);

  const handleLogin = () => {
    if (!secret.trim() || submitting) return;
    dispatch({ type: 'CLEAR_ERROR' }); setSubmitting(true);
    send({ action: 'connect_role', role: 'display', secret: secret.trim() });
    dispatch({ type: 'SET_ROLE', payload: 'display' });
  };

  // Login screen (not 16:9 - just centered)
  if (!state.authed) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ fontFamily: "'Zen Maru Gothic', sans-serif", background: 'linear-gradient(135deg,#fff0f5,#ffe4ec)' }}>
        <div className="w-full max-w-md mx-4 bg-white/80 backdrop-blur-sm border-2 border-pink-200 rounded-3xl p-8 shadow-xl">
          <h1 className="font-black text-2xl text-pink-500 mb-6 text-center">{t('display.login.title')}</h1>
          {state.authError && <div className="mb-4 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-500 text-sm">{state.authError}</div>}
          <input type="password" value={secret}
            onChange={(e) => { setSecret(e.target.value); dispatch({ type: 'CLEAR_ERROR' }); }}
            onKeyDown={(e) => e.key === 'Enter' && handleLogin()} placeholder={t('display.login.placeholder')}
            className="w-full bg-pink-50 border-2 border-pink-200 rounded-xl px-4 py-3 text-gray-700 placeholder:text-pink-300 focus:outline-none focus:border-pink-400" autoFocus />
          <button onClick={handleLogin} disabled={!connected || !secret.trim() || submitting}
            className="w-full mt-4 px-6 py-3 bg-gradient-to-r from-pink-400 to-rose-400 text-white font-bold rounded-xl disabled:opacity-40 shadow-lg shadow-pink-200">
            {submitting ? t('display.login.submitting') : t('display.login.submit')}
          </button>
        </div>
      </div>
    );
  }

  // Main display - 16:9 responsive
  return (
    <div className="w-screen h-screen overflow-hidden relative" style={{
      fontFamily: "'Zen Maru Gothic', 'Quicksand', sans-serif",
      background: 'linear-gradient(135deg, #fff0f5 0%, #ffe4ec 30%, #ffd6e7 60%, #fff0f5 100%)',
    }}>
      {/* Floating sparkles background */}
      <Sparkles />
      {/* Connection dot */}
      <div className="fixed" style={{ top: '0.5vw', right: '0.5vw', zIndex: 50 }}>
        <span className={`inline-block rounded-full ${connected ? 'bg-green-400' : 'bg-red-400 animate-pulse'}`}
          style={{ width: '0.6vw', height: '0.6vw' }} />
      </div>
      <div className="relative z-10 w-full h-full">
        {(state.status === 'init' || state.status === 'accepting') && <AcceptingView players={state.players} status={state.status} />}
        {state.status === 'answering' && <QuestionView quiz={state.currentQuiz} answerCount={state.answerCount} answerTotal={state.answerTotal}
          qIndex={state.questionHistory.length} qTotal={state.totalQuizCount} liveCorrectPlayers={state.liveCorrectPlayers} />}
        {state.status === 'judging' && <JudgingView liveCorrectPlayers={state.liveCorrectPlayers} />}
        {state.status === 'showing_answer' && <RevealView revealData={state.revealData} />}
        {state.status === 'showing_scores' && <ScoresView rankings={state.rankings} />}
      </div>
    </div>
  );
}

/* ── Sparkles background ── */
function Sparkles() {
  const s = Array.from({ length: 20 }, (_, i) => ({
    id: i, left: `${Math.random() * 100}%`, top: `${Math.random() * 100}%`,
    delay: `${Math.random() * 5}s`, dur: `${3 + Math.random() * 4}s`,
  }));
  return (
    <div className="fixed inset-0 pointer-events-none z-0">
      {s.map(x => <div key={x.id} className="absolute animate-pulse" style={{ left: x.left, top: x.top, animationDelay: x.delay, animationDuration: x.dur, fontSize: '1.5vw', opacity: 0.25, color: '#ff6b9d' }}>✦</div>)}
    </div>
  );
}

/* ── Confetti (pink themed) ── */
function PinkConfetti() {
  const c = ['#ff6b9d', '#ffd700', '#ff9ecd', '#ffb6c1', '#f0a0ff', '#87ceeb'];
  return (
    <div className="fixed inset-0 pointer-events-none z-50">
      {Array.from({ length: 40 }, (_, i) => (
        <div key={i} className="confetti-particle" style={{
          left: `${Math.random() * 100}%`, backgroundColor: c[i % c.length],
          animationDelay: `${Math.random() * 2}s`,
          width: `${0.4 + Math.random() * 0.4}vw`, height: `${0.4 + Math.random() * 0.4}vw`,
          borderRadius: Math.random() > 0.5 ? '50%' : '2px',
        }} />
      ))}
    </div>
  );
}

/* ── Accepting / QR with quiet zone ── */
function AcceptingView({ players, status }) {
  const playerUrl = window.location.origin + '/';
  // QR spec: quiet zone = 4 modules minimum. We embed it via padding around the image.
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=600x600&data=${encodeURIComponent(playerUrl)}&color=ff6b9d&bgcolor=FFFFFF&margin=4`;

  return (
    <div className="w-full h-full flex flex-col items-center justify-center">
      <div className="text-center" style={{ marginBottom: '2vh' }}>
        <p style={{ fontSize: '4vw', lineHeight: 1 }}>✨🎀✨</p>
        <h1 className="font-black text-pink-500" style={{ fontSize: '4.5vw', textShadow: '2px 2px 10px rgba(255,107,157,0.3)', marginTop: '1vh' }}>
          {t('app.title')}
        </h1>
      </div>

      {status === 'init' ? (
        <p className="font-bold text-pink-400" style={{ fontSize: '2vw' }}>{t('display.accepting.waiting')}</p>
      ) : (
        <>
          <div className="bg-white/70 backdrop-blur-sm border-2 border-pink-200 shadow-xl shadow-pink-100"
            style={{ borderRadius: '2vw', padding: '2.5vw', marginBottom: '2vh' }}>
            <p className="text-center text-pink-500 font-bold" style={{ fontSize: '1.8vw', marginBottom: '1.5vh' }}>{t('display.accepting.scan')}</p>
            <div className="flex items-center" style={{ gap: '3vw' }}>
              {/* QR with white quiet zone background */}
              <div style={{
                backgroundColor: '#FFFFFF',
                padding: '1.5vw',
                borderRadius: '1vw',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <img src={qrUrl} alt="QR" style={{ width: '20vw', height: '20vw', display: 'block' }} crossOrigin="anonymous" />
              </div>
              <div className="text-center" style={{ maxWidth: '25vw' }}>
                <p className="text-pink-400" style={{ fontSize: '1.3vw', marginBottom: '0.5vh' }}>{t('display.accepting.url')}</p>
                <p className="font-black text-pink-600" style={{ fontSize: '3vw', lineHeight: 1.2, wordBreak: 'break-all' }}>
                  {playerUrl}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white/50 backdrop-blur-sm border border-pink-200"
            style={{ borderRadius: '1.5vw', padding: '1vw 3vw' }}>
            <span className="font-bold text-pink-500" style={{ fontSize: '2vw' }}>
              {t('display.accepting.players')} <span className="text-pink-600 font-black" style={{ fontSize: '2.5vw' }}>{players.length}</span> {t('display.accepting.unit')}
            </span>
          </div>
        </>
      )}
    </div>
  );
}

/* ── Question + live correct panel (from admin ○) ── */
function QuestionView({ quiz, answerCount, answerTotal, qIndex, qTotal, liveCorrectPlayers }) {
  if (!quiz) return null;
  return (
    <div className="w-full h-full flex">
      <div className="flex flex-col items-center justify-center" style={{ width: '68%', padding: '2vw' }}>
        <div className="flex items-center" style={{ gap: '1vw', marginBottom: '1.5vh' }}>
          <span className="font-black text-pink-500 bg-pink-100 border border-pink-200"
            style={{ fontSize: '1.6vw', padding: '0.4vw 1.2vw', borderRadius: '1vw' }}>
            {t('display.question.corner', { corner: quiz.cornerNumber })}
          </span>
          {quiz.cornerTitle && <span className="font-bold text-pink-400" style={{ fontSize: '1.4vw' }}>{quiz.cornerTitle}</span>}
          <span className="font-black text-rose-500 bg-rose-100 border border-rose-200"
            style={{ fontSize: '1.6vw', padding: '0.4vw 1.2vw', borderRadius: '1vw' }}>
            Q{quiz.questionNumber}
          </span>
          <span className="text-pink-300" style={{ fontSize: '1.2vw' }}>({qIndex}/{qTotal})</span>
        </div>

        <div className="text-center" style={{ maxWidth: '55vw', marginBottom: '2vh' }}>
          <p className="font-black text-gray-700" style={{ fontSize: '3.2vw', lineHeight: 1.3 }}>{quiz.questionText}</p>
        </div>

        {quiz.choices && (
          <div className="grid grid-cols-2" style={{ gap: '1vw', width: '55vw', marginBottom: '1.5vh' }}>
            {quiz.choices.map((c, i) => (
              <div key={i} className="flex items-center bg-white/70 border-2 border-pink-100"
                style={{ gap: '1vw', padding: '1vw 1.5vw', borderRadius: '1.2vw' }}>
                <span className="font-black text-pink-400" style={{ fontSize: '1.8vw' }}>{String.fromCharCode(65 + i)}</span>
                <span className="font-bold text-gray-700" style={{ fontSize: '1.6vw' }}>{c}</span>
              </div>
            ))}
          </div>
        )}

        <span className="font-black text-yellow-600 bg-yellow-50 border-2 border-yellow-200"
          style={{ fontSize: '1.4vw', padding: '0.3vw 1.5vw', borderRadius: '1vw' }}>
          {t('display.question.points', { pts: quiz.points })}
        </span>

        <div style={{ width: '50vw', marginTop: '1.5vh' }}>
          <div className="flex items-center justify-between" style={{ marginBottom: '0.5vh' }}>
            <span className="font-bold text-pink-500" style={{ fontSize: '1.3vw' }}>{t('display.question.answer')}</span>
            <span className="font-mono text-pink-400" style={{ fontSize: '1.3vw' }}>{answerCount} / {answerTotal}</span>
          </div>
          <div className="bg-pink-100 overflow-hidden" style={{ borderRadius: '0.5vw', height: '1vw' }}>
            <div className="h-full bg-gradient-to-r from-pink-400 to-rose-400 transition-all duration-500"
              style={{ width: `${answerTotal > 0 ? (answerCount / answerTotal) * 100 : 0}%`, borderRadius: '0.5vw' }} />
          </div>
        </div>
      </div>

      {/* Right panel: correct players (updated when admin presses ○) */}
      <div className="flex flex-col border-l border-pink-200 bg-white/30" style={{ width: '32%', padding: '1.5vw' }}>
        <p className="font-black text-pink-500 text-center" style={{ fontSize: '1.4vw', marginBottom: '1vh' }}>
          {t('display.question.correctTitle')}
        </p>
        <div className="flex-1 overflow-hidden">
          {liveCorrectPlayers.length === 0 ? (
            <p className="text-pink-300 text-center" style={{ fontSize: '1.2vw', marginTop: '3vh' }}>{t('display.question.noCorrectYet')}</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6vw' }}>
              {liveCorrectPlayers.slice(0, 12).map((p, i) => (
                <div key={p.playerId} className="flex items-center bg-white/60 border border-pink-100 animate-slide-up"
                  style={{ padding: '0.5vw 1vw', borderRadius: '0.8vw', animationDelay: `${i * 0.05}s`, animationFillMode: 'both' }}>
                  <span className="font-black text-pink-400 shrink-0" style={{ fontSize: '1.1vw', width: '2.5vw', textAlign: 'center' }}>
                    {i < 3 ? ['🥇','🥈','🥉'][i] : `${p.rank}`}
                  </span>
                  <span className="font-bold text-gray-700 truncate" style={{ fontSize: '1.2vw', flex: 1 }}>{p.playerName}</span>
                  <span className="font-black text-yellow-500 shrink-0" style={{ fontSize: '1vw', marginLeft: '0.5vw' }}>
                    +{p.pointsAwarded}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Judging View ── */
function JudgingView({ liveCorrectPlayers }) {
  return (
    <div className="w-full h-full flex">
      <div className="flex flex-col items-center justify-center" style={{ width: '68%' }}>
        <div className="animate-pulse" style={{ fontSize: '5vw', marginBottom: '2vh' }}>🔍</div>
        <p className="font-black text-pink-500" style={{ fontSize: '3.5vw' }}>{t('display.judging.title')}</p>
        <p className="text-pink-300 font-bold" style={{ fontSize: '1.8vw', marginTop: '1vh' }}>{t('display.judging.hint')}</p>
      </div>
      <div className="flex flex-col border-l border-pink-200 bg-white/30" style={{ width: '32%', padding: '1.5vw' }}>
        <p className="font-black text-pink-500 text-center" style={{ fontSize: '1.4vw', marginBottom: '1vh' }}>
          {t('display.question.correctTitle')}
        </p>
        <div className="flex-1 overflow-hidden">
          {liveCorrectPlayers.length === 0 ? (
            <p className="text-pink-300 text-center" style={{ fontSize: '1.2vw', marginTop: '3vh' }}>{t('display.question.noCorrectYet')}</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6vw' }}>
              {liveCorrectPlayers.slice(0, 12).map((p, i) => (
                <div key={p.playerId} className="flex items-center bg-white/60 border border-pink-100"
                  style={{ padding: '0.5vw 1vw', borderRadius: '0.8vw' }}>
                  <span className="font-black text-pink-400 shrink-0" style={{ fontSize: '1.1vw', width: '2.5vw', textAlign: 'center' }}>
                    {i < 3 ? ['🥇','🥈','🥉'][i] : `${p.rank}`}
                  </span>
                  <span className="font-bold text-gray-700 truncate" style={{ fontSize: '1.2vw', flex: 1 }}>{p.playerName}</span>
                  <span className="font-black text-yellow-500 shrink-0" style={{ fontSize: '1vw', marginLeft: '0.5vw' }}>+{p.pointsAwarded}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Reveal Answer View ── */
function RevealView({ revealData }) {
  if (!revealData) return null;
  const { correctAnswer, correctPlayers, totalAnswers, correctCount, incorrectCount, points } = revealData;
  return (
    <div className="w-full h-full flex flex-col items-center justify-center overflow-auto" style={{ padding: '2vw' }}>
      {correctPlayers.length > 0 && <PinkConfetti />}
      <div className="text-center" style={{ marginBottom: '2.5vh' }}>
        <p className="font-bold text-pink-400" style={{ fontSize: '1.8vw', marginBottom: '1vh' }}>{t('display.reveal.correct')}</p>
        <div className="inline-block bg-gradient-to-r from-pink-50 to-rose-50 border-pink-300 shadow-xl shadow-pink-100"
          style={{ padding: '1.5vw 4vw', borderRadius: '2vw', borderWidth: '3px', borderStyle: 'solid' }}>
          <p className="font-black text-pink-600" style={{ fontSize: '4vw' }}>{correctAnswer}</p>
        </div>
        <p className="font-bold text-pink-400" style={{ fontSize: '1.3vw', marginTop: '1vh' }}>+{points} pt ⭐</p>
      </div>
      <div className="flex" style={{ gap: '3vw', marginBottom: '2vh' }}>
        <div className="text-center bg-white/60 border border-green-200" style={{ borderRadius: '1.5vw', padding: '0.8vw 2vw' }}>
          <p className="font-black text-green-500" style={{ fontSize: '3vw' }}>{correctCount}</p>
          <p className="font-bold text-green-400" style={{ fontSize: '1vw' }}>{t('display.reveal.correctCount')}</p>
        </div>
        <div className="text-center bg-white/60 border border-red-200" style={{ borderRadius: '1.5vw', padding: '0.8vw 2vw' }}>
          <p className="font-black text-red-400" style={{ fontSize: '3vw' }}>{incorrectCount}</p>
          <p className="font-bold text-red-300" style={{ fontSize: '1vw' }}>{t('display.reveal.incorrectCount')}</p>
        </div>
      </div>
      {correctPlayers.length > 0 ? (
        <div style={{ width: '55vw' }}>
          <p className="font-bold text-pink-500 text-center" style={{ fontSize: '1.5vw', marginBottom: '1vh' }}>{t('display.reveal.correctPlayersTitle')}</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6vw' }}>
            {correctPlayers.slice(0, 10).map((p, i) => (
              <div key={p.playerId} className="flex items-center bg-white/70 border-2 border-pink-100 animate-slide-up shadow-sm"
                style={{ padding: '0.7vw 1.5vw', borderRadius: '1vw', animationDelay: `${i * 0.1}s`, animationFillMode: 'both' }}>
                <span className="shrink-0" style={{ fontSize: '1.6vw', width: '2.5vw', textAlign: 'center' }}>
                  {i < 3 ? ['🥇','🥈','🥉'][i] : <span className="font-black text-pink-400">{p.rank}</span>}
                </span>
                <span className="flex-1 font-bold text-gray-700" style={{ fontSize: '1.6vw' }}>{p.playerName}</span>
                <span className="font-black text-yellow-500 shrink-0" style={{ fontSize: '1.3vw' }}>+{p.pointsAwarded}</span>
                <span className="font-mono text-pink-400 shrink-0" style={{ fontSize: '1vw', marginLeft: '1vw' }}>{formatElapsedMs(p.elapsedMs)}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="font-bold text-pink-300" style={{ fontSize: '2vw' }}>{t('display.reveal.noCorrect')}</p>
      )}
    </div>
  );
}

/* ── Final Scores View ── */
function ScoresView({ rankings }) {
  const sorted = [...rankings].sort((a, b) => (b.totalScore || 0) - (a.totalScore || 0))
    .map((r, i) => ({ ...r, rank: i + 1 }));
  const barMax = sorted[0]?.totalScore || 1;
  return (
    <div className="w-full h-full flex flex-col items-center overflow-auto" style={{ padding: '2vw' }}>
      <p style={{ fontSize: '3.5vw', marginBottom: '0.5vh' }}>👑</p>
      <h2 className="font-black text-pink-500" style={{ fontSize: '3.5vw', textShadow: '2px 2px 10px rgba(255,107,157,0.3)', marginBottom: '2vh' }}>
        {t('display.scores.title')}
      </h2>
      <div style={{ width: '65vw', display: 'flex', flexDirection: 'column', gap: '0.6vw' }}>
        {sorted.slice(0, 15).map((r, i) => {
          const isTop3 = r.rank <= 3;
          const bw = Math.max(5, (r.totalScore / barMax) * 100);
          return (
            <div key={r.playerId || i} className={`flex items-center animate-slide-up ${
              isTop3 ? 'bg-white/80 border-2 border-pink-300 shadow-lg shadow-pink-100' : 'bg-white/50 border border-pink-100'
            }`} style={{ padding: '0.7vw 1.5vw', borderRadius: '1vw', animationDelay: `${i * 0.08}s`, animationFillMode: 'both', gap: '1vw' }}>
              <span className="shrink-0" style={{ fontSize: isTop3 ? '2vw' : '1.4vw', width: '3vw', textAlign: 'center' }}>
                {i < 3 ? ['🥇','🥈','🥉'][i] : <span className="font-black text-pink-400">{r.rank}</span>}
              </span>
              <span className={`font-black truncate ${isTop3 ? 'text-pink-600' : 'text-gray-600'}`}
                style={{ fontSize: '1.6vw', width: '12vw' }}>{r.name}</span>
              <div className="flex-1 bg-pink-50 border border-pink-100 overflow-hidden"
                style={{ height: '1.2vw', borderRadius: '0.6vw' }}>
                <div className="h-full bg-gradient-to-r from-pink-400 to-rose-400 animate-fill"
                  style={{ width: `${bw}%`, borderRadius: '0.6vw' }} />
              </div>
              <span className="font-black text-yellow-500 shrink-0" style={{ fontSize: '1.6vw', width: '8vw', textAlign: 'right' }}>
                {r.totalScore} pt
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
