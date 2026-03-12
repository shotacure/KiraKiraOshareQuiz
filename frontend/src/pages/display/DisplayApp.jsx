import { useState, useEffect, useRef } from 'react';
import { useGame, useMessageHandler } from '../../contexts/GameContext';
import { useWebSocket } from '../../hooks/useWebSocket';
import { ConnectionBadge, RankBadge, ProgressBar, Confetti, formatElapsedMs } from '../../components/UI';

export default function DisplayApp() {
  const { state, dispatch } = useGame();
  const handleMessage = useMessageHandler();
  const { send, connected } = useWebSocket(handleMessage);
  const [secret, setSecret] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const authedSecretRef = useRef(null);

  useEffect(() => {
    dispatch({ type: 'SET_CONNECTED', payload: connected });
  }, [connected, dispatch]);

  useEffect(() => {
    if (state.authed) {
      setSubmitting(false);
      authedSecretRef.current = secret;
    }
    if (state.authError) {
      setSubmitting(false);
    }
  }, [state.authed, state.authError]);

  // Re-authenticate on WebSocket reconnect
  useEffect(() => {
    if (connected && authedSecretRef.current) {
      send({ action: 'connect_role', role: 'display', secret: authedSecretRef.current });
    }
  }, [connected, send]);

  const handleLogin = () => {
    if (!secret.trim() || submitting) return;
    dispatch({ type: 'CLEAR_ERROR' });
    setSubmitting(true);
    send({ action: 'connect_role', role: 'display', secret: secret.trim() });
    dispatch({ type: 'SET_ROLE', payload: 'display' });
  };

  if (!state.authed) {
    return (
      <div className="min-h-screen bg-quiz-bg flex items-center justify-center">
        <ConnectionBadge connected={connected} />
        <div className="w-full max-w-md mx-4 bg-quiz-card/60 border border-white/5 rounded-2xl p-8">
          <h1 className="font-display font-black text-2xl text-quiz-text mb-6 text-center">📺 表示用画面</h1>

          {state.authError && (
            <div className="mb-4 px-4 py-3 rounded-xl bg-quiz-accent/15 border border-quiz-accent/30 text-quiz-accent text-sm font-body">
              {state.authError}
            </div>
          )}

          <input
            type="password"
            value={secret}
            onChange={(e) => { setSecret(e.target.value); dispatch({ type: 'CLEAR_ERROR' }); }}
            onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
            placeholder="パスワード"
            className="w-full bg-quiz-surface border border-white/10 rounded-xl px-4 py-3 text-quiz-text font-body placeholder:text-quiz-muted/50 focus:outline-none focus:border-quiz-teal/50 transition-colors"
            autoFocus
          />
          <button
            onClick={handleLogin}
            disabled={!connected || !secret.trim() || submitting}
            className="w-full mt-4 px-6 py-3 bg-quiz-accent text-white font-display font-bold rounded-xl hover:bg-quiz-accent/80 disabled:opacity-40 transition-colors"
          >
            {submitting ? '認証中...' : '表示開始'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-quiz-bg overflow-hidden relative">
      {/* Ambient background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-1/4 -left-1/4 w-1/2 h-1/2 bg-quiz-purple/5 rounded-full blur-3xl" />
        <div className="absolute -bottom-1/4 -right-1/4 w-1/2 h-1/2 bg-quiz-accent/5 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10">
        <ConnectionBadge connected={connected} />
        {state.status === 'waiting' && <StandbyView players={state.players} />}
        {state.status === 'answering' && <QuestionView quiz={state.currentQuiz} answerCount={state.answerCount} answerTotal={state.answerTotal} />}
        {state.status === 'judging' && <JudgingView quiz={state.currentQuiz} />}
        {state.status === 'showing_answer' && <RevealView revealData={state.revealData} />}
        {state.status === 'showing_scores' && <ScoresView rankings={state.rankings} />}
      </div>
    </div>
  );
}

/* ── Standby ── */
function StandbyView({ players }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center animate-fade-in">
      <div className="text-8xl mb-8">🎯</div>
      <h1 className="font-display font-black text-6xl text-quiz-text tracking-tight mb-4">
        クイズ大会
      </h1>
      <p className="font-display text-2xl text-quiz-muted">まもなく開始します</p>
      <div className="mt-10 px-8 py-4 rounded-2xl bg-quiz-surface/50 border border-white/5">
        <span className="font-display font-bold text-3xl text-quiz-teal">
          参加者: {players.length}名
        </span>
      </div>
    </div>
  );
}

/* ── Question (answering) ── */
function QuestionView({ quiz, answerCount, answerTotal }) {
  if (!quiz) return null;
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-12 animate-slide-up">
      {/* Corner & question number */}
      <div className="flex items-center gap-4 mb-6">
        <span className="px-5 py-2 rounded-full bg-quiz-accent/20 text-quiz-accent font-display font-bold text-xl">
          第{quiz.cornerNumber}コーナー
        </span>
        {quiz.cornerTitle && (
          <span className="text-quiz-muted font-display text-xl">{quiz.cornerTitle}</span>
        )}
        <span className="px-4 py-2 rounded-full bg-quiz-teal/20 text-quiz-teal font-display font-bold text-xl">
          Q{quiz.questionNumber}
        </span>
      </div>

      {/* Question text */}
      <div className="max-w-4xl text-center mb-8">
        <p className="font-display font-black text-4xl lg:text-5xl text-quiz-text leading-tight">
          {quiz.questionText}
        </p>
      </div>

      {/* Choices (if applicable) */}
      {quiz.choices && (
        <div className="grid grid-cols-2 gap-4 max-w-3xl w-full mb-8">
          {quiz.choices.map((choice, i) => (
            <div
              key={i}
              className="flex items-center gap-4 px-6 py-5 rounded-2xl bg-quiz-card/60 border border-white/5"
            >
              <span className="font-mono font-bold text-2xl text-quiz-muted">
                {String.fromCharCode(65 + i)}
              </span>
              <span className="font-display font-bold text-2xl text-quiz-text">{choice}</span>
            </div>
          ))}
        </div>
      )}

      {/* Points */}
      <div className="mb-6">
        <span className="px-6 py-2 rounded-full bg-quiz-gold/20 text-quiz-gold font-display font-bold text-xl">
          +{quiz.points} pt
        </span>
      </div>

      {/* Answer progress */}
      <div className="w-full max-w-lg">
        <div className="flex items-center justify-between mb-2">
          <span className="font-display font-bold text-quiz-teal text-lg">回答してください！</span>
          <span className="font-mono text-quiz-muted text-lg">
            {answerCount} / {answerTotal}
          </span>
        </div>
        <ProgressBar current={answerCount} total={answerTotal} />
      </div>
    </div>
  );
}

/* ── Judging ── */
function JudgingView({ quiz }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center animate-fade-in">
      <div className="text-7xl mb-6 animate-pulse">⚖️</div>
      <p className="font-display font-black text-4xl text-quiz-text">回答を締め切りました</p>
      <p className="font-display text-2xl text-quiz-muted mt-4">判定中...</p>
    </div>
  );
}

/* ── Reveal Answer ── */
function RevealView({ revealData }) {
  if (!revealData) return null;
  const { correctAnswer, correctPlayers, totalAnswers, correctCount, incorrectCount, points, questionText } = revealData;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-12 animate-pop">
      {correctPlayers.length > 0 && <Confetti />}

      {/* Correct answer */}
      <div className="text-center mb-10">
        <p className="font-display text-2xl text-quiz-muted mb-3">正解</p>
        <div className="inline-block px-10 py-5 rounded-2xl bg-gradient-to-r from-quiz-gold/20 to-quiz-gold/5 border-2 border-quiz-gold/30">
          <p className="font-display font-black text-5xl lg:text-6xl text-quiz-gold">
            {correctAnswer}
          </p>
        </div>
        <p className="text-quiz-muted text-lg mt-3 font-display">+{points} pt</p>
      </div>

      {/* Stats */}
      <div className="flex gap-8 mb-8">
        <div className="text-center">
          <p className="font-mono font-bold text-4xl text-quiz-green">{correctCount}</p>
          <p className="text-quiz-muted text-sm">正解</p>
        </div>
        <div className="text-center">
          <p className="font-mono font-bold text-4xl text-quiz-accent">{incorrectCount}</p>
          <p className="text-quiz-muted text-sm">不正解</p>
        </div>
        <div className="text-center">
          <p className="font-mono font-bold text-4xl text-quiz-muted">{totalAnswers}</p>
          <p className="text-quiz-muted text-sm">回答数</p>
        </div>
      </div>

      {/* Correct players ranked by speed */}
      {correctPlayers.length > 0 && (
        <div className="w-full max-w-2xl">
          <p className="font-display font-bold text-xl text-quiz-text text-center mb-4">
            正解者 (回答順)
          </p>
          <div className="space-y-3">
            {correctPlayers.slice(0, 10).map((p, i) => (
              <div
                key={p.playerId}
                className="flex items-center gap-4 px-6 py-4 rounded-xl bg-quiz-card/60 border border-white/5 animate-slide-up"
                style={{ animationDelay: `${i * 0.1}s`, animationFillMode: 'both' }}
              >
                <RankBadge rank={p.rank} />
                <span className="flex-1 font-display font-bold text-2xl text-quiz-text">
                  {p.playerName}
                </span>
                <span className="font-mono text-quiz-muted text-lg">
                  {formatElapsedMs(p.elapsedMs)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {correctPlayers.length === 0 && (
        <p className="font-display text-2xl text-quiz-muted">正解者はいませんでした</p>
      )}
    </div>
  );
}

/* ── Scores ── */
function ScoresView({ rankings }) {
  return (
    <div className="min-h-screen flex flex-col items-center py-12 px-8 animate-fade-in">
      <div className="text-6xl mb-4">🏆</div>
      <h2 className="font-display font-black text-5xl text-quiz-text mb-10">現在の成績</h2>

      <div className="w-full max-w-3xl space-y-3">
        {rankings.slice(0, 15).map((r, i) => {
          const isTop3 = r.rank <= 3;
          const barMaxScore = rankings[0]?.totalScore || 1;
          const barWidth = Math.max(5, (r.totalScore / barMaxScore) * 100);

          return (
            <div
              key={r.playerId || i}
              className={`flex items-center gap-4 px-6 py-4 rounded-xl animate-slide-up ${
                isTop3 ? 'bg-quiz-card border border-quiz-gold/20' : 'bg-quiz-surface/50'
              }`}
              style={{ animationDelay: `${i * 0.08}s`, animationFillMode: 'both' }}
            >
              <RankBadge rank={r.rank} />
              <span className={`w-40 truncate font-display font-bold text-2xl ${isTop3 ? 'text-quiz-gold' : 'text-quiz-text'}`}>
                {r.name}
              </span>
              <div className="flex-1 h-6 bg-quiz-surface rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-quiz-teal to-quiz-green animate-fill"
                  style={{ width: `${barWidth}%` }}
                />
              </div>
              <span className="font-mono font-bold text-2xl text-quiz-gold w-24 text-right">
                {r.totalScore} pt
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
