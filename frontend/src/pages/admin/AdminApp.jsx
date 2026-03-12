import { useState, useEffect, useRef } from 'react';
import { useGame, useMessageHandler } from '../../contexts/GameContext';
import { useWebSocket } from '../../hooks/useWebSocket';
import { ADMIN_SECRET_KEY } from '../../config';
import { ConnectionBadge, Button, Card, SectionTitle, formatElapsedMs } from '../../components/UI';

export default function AdminApp() {
  const { state, dispatch } = useGame();
  const handleMessage = useMessageHandler();
  const { send, connected } = useWebSocket(handleMessage);
  const [secret, setSecret] = useState(() => sessionStorage.getItem(ADMIN_SECRET_KEY) || '');
  const [submitting, setSubmitting] = useState(false);
  const authedSecretRef = useRef(sessionStorage.getItem(ADMIN_SECRET_KEY) || null);

  useEffect(() => {
    dispatch({ type: 'SET_CONNECTED', payload: connected });
  }, [connected, dispatch]);

  // Auto-login on mount if secret is in sessionStorage
  useEffect(() => {
    if (connected && authedSecretRef.current && !state.authed) {
      send({ action: 'connect_role', role: 'admin', secret: authedSecretRef.current });
      dispatch({ type: 'SET_ROLE', payload: 'admin' });
    }
  }, [connected]);

  useEffect(() => {
    if (state.authed) {
      setSubmitting(false);
      authedSecretRef.current = secret || authedSecretRef.current;
      if (authedSecretRef.current) {
        sessionStorage.setItem(ADMIN_SECRET_KEY, authedSecretRef.current);
      }
    }
    if (state.authError) setSubmitting(false);
  }, [state.authed, state.authError]);

  // Re-authenticate on reconnect
  useEffect(() => {
    if (connected && authedSecretRef.current && state.authed) {
      send({ action: 'connect_role', role: 'admin', secret: authedSecretRef.current });
    }
  }, [connected]);

  const handleLogin = () => {
    if (!secret.trim() || submitting) return;
    dispatch({ type: 'CLEAR_ERROR' });
    setSubmitting(true);
    send({ action: 'connect_role', role: 'admin', secret: secret.trim() });
    dispatch({ type: 'SET_ROLE', payload: 'admin' });
  };

  if (!state.authed) {
    return (
      <div className="min-h-screen bg-quiz-bg flex items-center justify-center">
        <ConnectionBadge connected={connected} />
        <Card className="w-full max-w-md mx-4">
          <h1 className="font-display font-black text-2xl text-quiz-text mb-6 text-center">🔐 管理者ログイン</h1>
          {state.authError && (
            <div className="mb-4 px-4 py-3 rounded-xl bg-quiz-accent/15 border border-quiz-accent/30 text-quiz-accent text-sm">{state.authError}</div>
          )}
          <input
            type="password" value={secret}
            onChange={(e) => { setSecret(e.target.value); dispatch({ type: 'CLEAR_ERROR' }); }}
            onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
            placeholder="管理者パスワード"
            className="w-full bg-quiz-surface border border-white/10 rounded-xl px-4 py-3 text-quiz-text font-body placeholder:text-quiz-muted/50 focus:outline-none focus:border-quiz-teal/50 transition-colors"
            autoFocus
          />
          <Button onClick={handleLogin} disabled={!connected || !secret.trim() || submitting} variant="accent" size="lg" className="w-full mt-4">
            {submitting ? '認証中...' : 'ログイン'}
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-quiz-bg p-4">
      <ConnectionBadge connected={connected} />
      <div className="flex items-center justify-between mb-4">
        <h1 className="font-display font-black text-xl text-quiz-text">🎛️ 管理画面</h1>
        <div className="flex items-center gap-3">
          <StatusBadge status={state.status} />
          <span className="text-quiz-muted text-sm">参加者: {state.players.length}名</span>
          <span className="text-quiz-muted text-sm">
            進行: {state.questionHistory.length}/{state.totalQuizCount}問
          </span>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 lg:col-span-3 space-y-4">
          <ControlPanel state={state} send={send} />
        </div>
        <div className="col-span-12 lg:col-span-5 space-y-4">
          <CurrentQuestion quiz={state.currentQuiz} state={state} />
          <AnswerList state={state} send={send} />
        </div>
        <div className="col-span-12 lg:col-span-4 space-y-4">
          <ScoreBoard players={state.players} rankings={state.rankings} />
          <QuizList quizzes={state.quizzes} history={state.questionHistory} />
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }) {
  const map = {
    init: { label: '初期状態', color: 'bg-quiz-muted' },
    accepting: { label: '参加受付中', color: 'bg-quiz-teal animate-pulse' },
    answering: { label: '回答受付中', color: 'bg-quiz-green animate-pulse' },
    judging: { label: '採点中', color: 'bg-quiz-gold animate-pulse' },
    showing_answer: { label: '正解発表中', color: 'bg-quiz-accent' },
    showing_scores: { label: '成績発表中', color: 'bg-quiz-purple' },
  };
  const s = map[status] || map.init;
  return (
    <span className="flex items-center gap-2 px-3 py-1 rounded-full bg-quiz-surface text-sm font-bold">
      <span className={`w-2 h-2 rounded-full ${s.color}`} />{s.label}
    </span>
  );
}

function ControlPanel({ state, send }) {
  const { status, quizzes, questionHistory, totalQuizCount } = state;
  const fileRef = useRef(null);
  const [loading, setLoading] = useState(false);

  // Find next un-asked quiz
  const nextQuiz = quizzes.find(q => !questionHistory.includes(q.quizId));
  const allAsked = questionHistory.length >= totalQuizCount && totalQuizCount > 0;

  const handleLoadFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const q = data.quizzes || data;
      send({ action: 'load_quizzes', quizzes: Array.isArray(q) ? q : [q] });
    } catch (err) {
      alert('JSON読み込み失敗: ' + err.message);
    }
    setLoading(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleResetAll = () => {
    if (window.confirm('全データを完全にリセットします。よろしいですか？\n(クイズデータ・参加者・回答が全て削除されます)')) {
      send({ action: 'reset_all' });
    }
  };

  return (
    <Card>
      <SectionTitle>進行コントロール</SectionTitle>
      <div className="space-y-2">

        {/* init: Load quizzes */}
        {status === 'init' && (
          <>
            <input ref={fileRef} type="file" accept=".json" onChange={handleLoadFile} className="hidden" />
            <Button onClick={() => fileRef.current?.click()} disabled={loading} variant="teal" size="sm" className="w-full">
              {loading ? '読み込み中...' : '📁 クイズJSON読み込み'}
            </Button>
          </>
        )}

        {/* accepting / showing_answer: Start next question */}
        {(status === 'accepting' || status === 'showing_answer') && nextQuiz && (
          <div>
            <p className="text-quiz-muted text-xs mb-1">
              次の問題: C{nextQuiz.cornerNumber}-Q{nextQuiz.questionNumber}
            </p>
            <p className="text-quiz-text text-sm mb-2 truncate">{nextQuiz.questionText}</p>
            <Button
              onClick={() => send({ action: 'start_question', quizId: nextQuiz.quizId })}
              variant="teal" size="sm" className="w-full"
            >
              ▶ 出題する
            </Button>
          </div>
        )}

        {/* showing_answer + all asked: Show final scores */}
        {status === 'showing_answer' && allAsked && (
          <Button onClick={() => send({ action: 'show_scores' })} variant="purple" size="sm" className="w-full">
            🏆 最終成績発表
          </Button>
        )}

        {/* answering: Close answers */}
        {status === 'answering' && (
          <Button onClick={() => send({ action: 'close_answers' })} variant="gold" size="sm" className="w-full">
            ⏹ 回答締切
          </Button>
        )}

        {/* judging: Reveal answer (enabled when all judged or manual) */}
        {status === 'judging' && (
          <Button onClick={() => send({ action: 'reveal_answer' })} variant="accent" size="sm" className="w-full">
            💡 正解発表
          </Button>
        )}

        <hr className="border-white/5 my-3" />

        {/* Reset - always available */}
        <Button onClick={handleResetAll} variant="danger" size="sm" className="w-full">
          🔄 全データリセット
        </Button>
      </div>
    </Card>
  );
}

function CurrentQuestion({ quiz, state }) {
  if (!quiz) {
    return (
      <Card className="text-center py-8">
        <p className="text-quiz-muted">
          {state.status === 'init' ? 'クイズデータを読み込んでください' :
           state.status === 'accepting' ? '参加者を待っています。準備ができたら出題してください' :
           '問題なし'}
        </p>
      </Card>
    );
  }
  return (
    <Card>
      <div className="flex items-center gap-2 mb-2">
        <span className="px-2 py-0.5 rounded bg-quiz-accent/20 text-quiz-accent text-xs font-bold">
          C{quiz.cornerNumber}-Q{quiz.questionNumber}
        </span>
        <span className="text-quiz-muted text-xs">{quiz.cornerTitle}</span>
        <span className="ml-auto text-quiz-gold text-sm font-bold">+{quiz.points}pt</span>
      </div>
      <p className="font-body text-quiz-text text-base leading-relaxed">{quiz.questionText}</p>
      {quiz.modelAnswer && (
        <p className="mt-2 text-sm">
          <span className="text-quiz-muted">模範解答: </span>
          <span className="text-quiz-green font-bold">{quiz.modelAnswer}</span>
        </p>
      )}
      {quiz.choices && (
        <div className="mt-2 space-y-1">
          {quiz.choices.map((c, i) => (
            <div key={i} className={`text-sm px-2 py-1 rounded ${i === quiz.correctChoiceIndex ? 'bg-quiz-green/20 text-quiz-green font-bold' : 'text-quiz-muted'}`}>
              {String.fromCharCode(65 + i)}. {c} {i === quiz.correctChoiceIndex && '✓'}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function AnswerList({ state, send }) {
  const { answers, currentQuiz } = state;
  if (!currentQuiz) return null;

  const handleJudge = (playerId, isCorrect) => {
    send({ action: 'judge', quizId: currentQuiz.quizId, playerId, isCorrect });
  };

  const handleAutoJudge = () => {
    const judgments = answers.filter(a => a.isCorrect == null).map(a => {
      let correct = false;
      if (currentQuiz.questionType === 'choice') {
        correct = a.choiceIndex === currentQuiz.correctChoiceIndex;
      } else if (currentQuiz.acceptableAnswers?.length > 0) {
        correct = currentQuiz.acceptableAnswers.some(acc => acc.toLowerCase() === a.answerText?.trim().toLowerCase());
      } else if (currentQuiz.modelAnswer) {
        correct = a.answerText?.trim().toLowerCase() === currentQuiz.modelAnswer.toLowerCase();
      }
      return { playerId: a.playerId, isCorrect: correct };
    });
    if (judgments.length > 0) send({ action: 'judge_bulk', quizId: currentQuiz.quizId, judgments });
  };

  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <SectionTitle className="!mb-0">回答一覧 ({answers.length}件)</SectionTitle>
        {(state.status === 'judging' || state.status === 'answering') && (
          <Button onClick={handleAutoJudge} variant="teal" size="sm">自動判定</Button>
        )}
      </div>
      <div className="space-y-1.5 max-h-[50vh] overflow-y-auto">
        {answers.length === 0 ? (
          <p className="text-quiz-muted text-sm text-center py-4">まだ回答がありません</p>
        ) : answers.map((a, i) => (
          <div key={a.playerId} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
            a.isCorrect === true ? 'bg-quiz-green/10 border border-quiz-green/20' :
            a.isCorrect === false ? 'bg-quiz-accent/10 border border-quiz-accent/20' : 'bg-quiz-surface/50'
          }`}>
            <span className="text-quiz-muted font-mono w-6 text-center text-xs">{i + 1}</span>
            <span className="font-bold text-quiz-text truncate w-20">{a.playerName}</span>
            <span className="flex-1 font-body text-quiz-text truncate">{a.answerText}</span>
            <span className="text-quiz-muted text-xs font-mono whitespace-nowrap">
              {a.elapsedMs != null ? formatElapsedMs(a.elapsedMs) : ''}
            </span>
            <div className="flex gap-1 ml-2 shrink-0">
              <button onClick={() => handleJudge(a.playerId, true)}
                className={`w-8 h-8 rounded-lg text-sm font-bold transition-colors ${
                  a.isCorrect === true ? 'bg-quiz-green text-white' : 'bg-quiz-surface text-quiz-muted hover:bg-quiz-green/30'
                }`}>○</button>
              <button onClick={() => handleJudge(a.playerId, false)}
                className={`w-8 h-8 rounded-lg text-sm font-bold transition-colors ${
                  a.isCorrect === false ? 'bg-quiz-accent text-white' : 'bg-quiz-surface text-quiz-muted hover:bg-quiz-accent/30'
                }`}>×</button>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function ScoreBoard({ players, rankings }) {
  const list = rankings.length > 0 ? rankings :
    [...players].sort((a, b) => (b.totalScore || 0) - (a.totalScore || 0)).map((p, i) => ({
      rank: i + 1, name: p.name, playerId: p.playerId, totalScore: p.totalScore || 0, correctCount: p.correctCount || 0,
    }));
  return (
    <Card className="max-h-[40vh] overflow-y-auto">
      <SectionTitle>成績一覧</SectionTitle>
      {list.length === 0 ? <p className="text-quiz-muted text-sm text-center">参加者なし</p> : (
        <div className="space-y-1">
          {list.map((p, i) => (
            <div key={p.playerId || i} className="flex items-center gap-2 text-sm py-1">
              <span className="font-mono font-bold text-quiz-muted w-6 text-right">{p.rank || i + 1}.</span>
              <span className="flex-1 truncate font-bold text-quiz-text">{p.name}</span>
              <span className="font-mono text-quiz-gold font-bold">{p.totalScore}pt</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function QuizList({ quizzes, history }) {
  if (!quizzes || quizzes.length === 0) return null;
  return (
    <Card className="max-h-[30vh] overflow-y-auto">
      <SectionTitle>クイズ一覧</SectionTitle>
      <div className="space-y-1">
        {quizzes.map(q => {
          const asked = history.includes(q.quizId);
          return (
            <div key={q.quizId} className={`text-sm py-1 border-b border-white/5 last:border-0 ${asked ? 'opacity-40' : ''}`}>
              <span className="font-mono text-xs text-quiz-muted">C{q.cornerNumber}-Q{q.questionNumber}</span>
              <span className="ml-2 text-quiz-text">{q.questionText?.substring(0, 35)}...</span>
              {asked && <span className="text-quiz-green text-xs ml-1">✓</span>}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
