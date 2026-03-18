import { useState, useEffect, useRef } from 'react';
import { useGame, useMessageHandler } from '../../contexts/GameContext';
import { useWebSocket } from '../../hooks/useWebSocket';
import { ADMIN_SECRET_KEY } from '../../config';
import { Button, Card, SectionTitle, formatElapsedMs } from '../../components/UI';
import { t } from '../../i18n';

/**
 * Parse a CSV string into quiz objects.
 */
function parseCsvToQuizzes(csvText) {
  const lines = csvText.trim().split(/\r?\n/);

  // Extract metadata from # comment lines
  let quizTitle = null;
  const dataLines = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('#title,')) {
      quizTitle = trimmed.substring('#title,'.length).trim();
    } else if (trimmed.startsWith('#')) {
      // Other comment lines — skip
    } else {
      dataLines.push(trimmed);
    }
  }

  if (dataLines.length < 2) throw new Error(t('admin.csv.noData'));
  const header = dataLines[0].split(',').map(h => h.trim());
  const quizzes = [];
  for (let i = 1; i < dataLines.length; i++) {
    const line = dataLines[i].trim();
    if (!line) continue;
    const values = [];
    let current = '';
    let inQuotes = false;
    for (const ch of line) {
      if (ch === '"') { inQuotes = !inQuotes; continue; }
      if (ch === ',' && !inQuotes) { values.push(current.trim()); current = ''; continue; }
      current += ch;
    }
    values.push(current.trim());
    const row = {};
    header.forEach((col, idx) => { row[col] = values[idx] || ''; });
    if (!row.questionText || !row.questionType) {
      throw new Error(t('admin.csv.invalidRow', { row: i + 1 }));
    }
    const qNum = parseInt(row.questionNumber) || i;
    quizzes.push({
      quizId: `q${String(qNum).padStart(3, '0')}`,
      questionNumber: qNum,
      questionText: row.questionText,
      questionType: row.questionType,
      modelAnswer: row.modelAnswer || null,
      acceptableAnswers: row.acceptableAnswers ? row.acceptableAnswers.split('|').map(s => s.trim()).filter(Boolean) : [],
      choices: row.choices ? row.choices.split('|').map(s => s.trim()).filter(Boolean) : [],
      correctChoiceIndex: row.correctChoiceIndex !== '' ? parseInt(row.correctChoiceIndex) : null,
      points: parseInt(row.points) || 10,
      order: qNum,
    });
  }
  return { quizzes, quizTitle };
}

export default function AdminApp() {
  const { state, dispatch } = useGame();
  const handleMessage = useMessageHandler();
  const { send, connected } = useWebSocket(handleMessage);
  const [secret, setSecret] = useState(() => sessionStorage.getItem(ADMIN_SECRET_KEY) || '');
  const [submitting, setSubmitting] = useState(false);
  const authedSecretRef = useRef(sessionStorage.getItem(ADMIN_SECRET_KEY) || null);

  useEffect(() => { dispatch({ type: 'SET_CONNECTED', payload: connected }); }, [connected, dispatch]);

  useEffect(() => {
    if (connected && authedSecretRef.current) {
      send({ action: 'connect_role', role: 'admin', secret: authedSecretRef.current });
      if (!state.authed) dispatch({ type: 'SET_ROLE', payload: 'admin' });
    }
  }, [connected]);

  useEffect(() => {
    if (state.authed) {
      setSubmitting(false);
      authedSecretRef.current = secret || authedSecretRef.current;
      if (authedSecretRef.current) sessionStorage.setItem(ADMIN_SECRET_KEY, authedSecretRef.current);
    }
    if (state.authError) setSubmitting(false);
  }, [state.authed, state.authError]);

  // Visibility resync for admin
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && connected && state.authed) {
        send({ action: 'connect_role', role: 'admin', secret: authedSecretRef.current });
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [connected, state.authed, send]);

  const handleLogin = () => {
    if (!secret.trim() || submitting) return;
    dispatch({ type: 'CLEAR_ERROR' }); setSubmitting(true);
    send({ action: 'connect_role', role: 'admin', secret: secret.trim() });
    dispatch({ type: 'SET_ROLE', payload: 'admin' });
  };

  if (!state.authed) {
    return (
      <div className="min-h-screen bg-quiz-bg flex items-center justify-center">
        <Card className="w-full max-w-md mx-4">
          <h1 className="font-display font-black text-2xl text-quiz-text mb-6 text-center">{t('admin.login.title')}</h1>
          {state.authError && <div className="mb-4 px-4 py-3 rounded-xl bg-quiz-accent/15 border border-quiz-accent/30 text-quiz-accent text-sm">{state.authError}</div>}
          <input type="password" value={secret}
            onChange={(e) => { setSecret(e.target.value); dispatch({ type: 'CLEAR_ERROR' }); }}
            onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
            placeholder={t('admin.login.placeholder')}
            className="w-full bg-quiz-surface border border-white/10 rounded-xl px-4 py-3 text-quiz-text font-body placeholder:text-quiz-muted/50 focus:outline-none focus:border-quiz-teal/50" autoFocus />
          <Button onClick={handleLogin} disabled={!connected || !secret.trim() || submitting} variant="accent" size="lg" className="w-full mt-4">
            {submitting ? t('admin.login.submitting') : t('admin.login.submit')}
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-quiz-bg p-4">
      {/* Header: title and info left, connection badge right */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <h1 className="font-display font-black text-xl text-quiz-text">{t('admin.dashboard.title')}</h1>
        {state.quizTitle && <span className="text-quiz-teal text-sm font-bold truncate max-w-xs">📋 {state.quizTitle}</span>}
        <StatusBadge status={state.status} />
        <span className="text-quiz-muted text-sm whitespace-nowrap">{t('admin.dashboard.players', { count: state.players.length })}</span>
        <span className="text-quiz-muted text-sm whitespace-nowrap">{t('admin.dashboard.progress', { done: state.questionHistory.length, total: state.totalQuizCount })}</span>
        <div className="ml-auto">
          <ConnBadge connected={connected} />
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

/* Inline connection badge (not fixed/absolute) */
function ConnBadge({ connected }) {
  return (
    <span className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-bold ${connected ? 'bg-quiz-green/20 text-quiz-green' : 'bg-quiz-accent/20 text-quiz-accent animate-pulse'}`}>
      <span className={`w-2 h-2 rounded-full ${connected ? 'bg-quiz-green' : 'bg-quiz-accent'}`} />
      {connected ? t('app.connecting') : t('app.reconnecting')}
    </span>
  );
}

function StatusBadge({ status }) {
  const key = `admin.status.${status}`;
  const colors = {
    init: 'bg-quiz-muted', accepting: 'bg-quiz-teal animate-pulse', answering: 'bg-quiz-green animate-pulse',
    judging: 'bg-quiz-gold animate-pulse', showing_answer: 'bg-quiz-accent', showing_scores: 'bg-quiz-purple',
  };
  return (
    <span className="flex items-center gap-2 px-3 py-1 rounded-full bg-quiz-surface text-sm font-bold">
      <span className={`w-2 h-2 rounded-full ${colors[status] || 'bg-quiz-muted'}`} />{t(key)}
    </span>
  );
}

function ControlPanel({ state, send }) {
  const { status, quizzes, questionHistory, totalQuizCount } = state;
  const fileRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const nextQuiz = quizzes.find(q => !questionHistory.includes(q.quizId));
  const allAsked = questionHistory.length >= totalQuizCount && totalQuizCount > 0;

  const handleLoadFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    try {
      const text = await file.text();
      const { quizzes, quizTitle } = parseCsvToQuizzes(text);
      send({ action: 'load_quizzes', quizzes, quizTitle });
    } catch (err) {
      alert(t('admin.csv.error', { detail: err.message }));
    }
    setLoading(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleResetAll = () => {
    if (window.confirm(t('admin.control.resetConfirm'))) send({ action: 'reset_all' });
  };

  return (
    <Card>
      <SectionTitle>{t('admin.control.title')}</SectionTitle>

      {/* Next question preview area (fixed height so button position stays stable) */}
      <div className="min-h-[80px] mb-2">
        {status === 'init' && (
          <p className="text-quiz-muted text-sm">{t('admin.question.empty.init')}</p>
        )}
        {(status === 'accepting' || status === 'showing_answer') && nextQuiz && (
          <>
            <p className="text-quiz-muted text-xs mb-1">{t('admin.control.nextQuestion')} Q{nextQuiz.questionNumber}</p>
            <p className="text-quiz-text text-sm truncate">{nextQuiz.questionText}</p>
          </>
        )}
        {(status === 'accepting' || status === 'showing_answer') && !nextQuiz && (
          <p className="text-quiz-muted text-sm">{t('admin.control.noMoreQuestions')}</p>
        )}
      </div>

      {/* Action buttons (position stays fixed regardless of content above) */}
      <div className="space-y-2">
        {status === 'init' && (
          <>
            <input ref={fileRef} type="file" accept=".csv" onChange={handleLoadFile} className="hidden" />
            <Button onClick={() => fileRef.current?.click()} disabled={loading} variant="teal" size="sm" className="w-full">
              {loading ? t('admin.control.loading') : t('admin.control.loadQuiz')}
            </Button>
          </>
        )}
        {(status === 'accepting' || status === 'showing_answer') && nextQuiz && (
          <Button onClick={() => send({ action: 'start_question', quizId: nextQuiz.quizId })} variant="teal" size="sm" className="w-full">
            {t('admin.control.startQuestion')}
          </Button>
        )}
        {status === 'showing_answer' && allAsked && (
          <Button onClick={() => send({ action: 'show_scores' })} variant="purple" size="sm" className="w-full">{t('admin.control.showScores')}</Button>
        )}
        {status === 'answering' && (
          <Button onClick={() => send({ action: 'close_answers' })} variant="gold" size="sm" className="w-full">{t('admin.control.closeAnswers')}</Button>
        )}
        {status === 'judging' && (
          <Button onClick={() => send({ action: 'reveal_answer' })} variant="accent" size="sm" className="w-full">{t('admin.control.revealAnswer')}</Button>
        )}
      </div>

      <hr className="border-white/5 my-3" />
      <Button onClick={handleResetAll} variant="danger" size="sm" className="w-full">{t('admin.control.resetAll')}</Button>
    </Card>
  );
}

/* CurrentQuestion: show modelAnswer + acceptableAnswers during answering/judging/showing_answer */
function CurrentQuestion({ quiz, state }) {
  if (!quiz) {
    const msg = state.status === 'init' ? t('admin.question.empty.init')
      : state.status === 'accepting' ? t('admin.question.empty.accepting')
      : t('admin.question.empty.default');
    return <Card className="text-center py-8"><p className="text-quiz-muted">{msg}</p></Card>;
  }

  const showAnswer = ['answering', 'judging', 'showing_answer'].includes(state.status);

  return (
    <Card>
      <div className="flex items-center gap-2 mb-2">
        <span className="px-2 py-0.5 rounded bg-quiz-accent/20 text-quiz-accent text-xs font-bold">Q{quiz.questionNumber}</span>
        <span className="ml-auto text-quiz-gold text-sm font-bold">+{quiz.points}pt</span>
      </div>
      <p className="font-body text-quiz-text text-base leading-relaxed">{quiz.questionText}</p>
      {quiz.choices && quiz.choices.length > 0 && (
        <div className="mt-2 space-y-1">
          {quiz.choices.map((c, i) => (
            <div key={i} className={`text-sm px-2 py-1 rounded ${i === quiz.correctChoiceIndex ? 'bg-quiz-green/20 text-quiz-green font-bold' : 'text-quiz-muted'}`}>
              {String.fromCharCode(65 + i)}. {c} {i === quiz.correctChoiceIndex && '\u2713'}
            </div>
          ))}
        </div>
      )}
      {/* Model answer display during active question states */}
      {showAnswer && quiz.modelAnswer && (
        <div className="mt-3 pt-3 border-t border-white/10">
          <p className="text-sm">
            <span className="text-quiz-muted">{t('admin.question.modelAnswer')} </span>
            <span className="text-quiz-green font-black text-base">{quiz.modelAnswer}</span>
          </p>
          {quiz.acceptableAnswers && quiz.acceptableAnswers.length > 0 && (
            <p className="text-quiz-muted text-xs mt-1">({quiz.acceptableAnswers.join(', ')})</p>
          )}
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

  const sorted = [...answers].sort((a, b) => (a.elapsedMs ?? Infinity) - (b.elapsedMs ?? Infinity));

  // Only the first unjudged answer can be judged (sequential, top-to-bottom)
  const firstUnjudgedIdx = sorted.findIndex(a => a.isCorrect === null);

  return (
    <Card>
      <SectionTitle className="!mb-3">{t('admin.answers.title', { count: answers.length })}</SectionTitle>
      <div className="space-y-1.5 max-h-[50vh] overflow-y-auto">
        {sorted.length === 0 ? (
          <p className="text-quiz-muted text-sm text-center py-4">{t('admin.answers.empty')}</p>
        ) : sorted.map((a, i) => {
          const judged = a.isCorrect !== null;
          const isActive = !judged && i === firstUnjudgedIdx;
          const canClick = judged || isActive;
          return (
            <div key={a.playerId} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
              a.isCorrect === true ? 'bg-quiz-green/10 border border-quiz-green/20' :
              a.isCorrect === false ? 'bg-quiz-accent/10 border border-quiz-accent/20' :
              isActive ? 'bg-quiz-surface/80 border border-quiz-teal/30' :
              'bg-quiz-surface/50'
            }`}>
              <span className="text-quiz-muted font-mono w-6 text-center text-xs">{i + 1}</span>
              <span className="font-bold text-quiz-text truncate w-20">{a.playerName}</span>
              <span className="flex-1 font-body text-quiz-text truncate">{a.answerText}</span>
              <span className="text-quiz-muted text-xs font-mono whitespace-nowrap">
                {a.elapsedMs != null ? formatElapsedMs(a.elapsedMs) : ''}
              </span>
              {a.isCorrect === true && a.pointsAwarded != null && (
                <span className="text-quiz-gold text-xs font-bold whitespace-nowrap">+{a.pointsAwarded}</span>
              )}
              <div className="flex gap-1 ml-1 shrink-0">
                <button onClick={() => isActive && handleJudge(a.playerId, true)}
                  disabled={!isActive}
                  className={`w-8 h-8 rounded-lg text-sm font-bold transition-colors ${
                    a.isCorrect === true ? 'bg-quiz-green text-white' :
                    isActive ? 'bg-quiz-surface text-quiz-muted hover:bg-quiz-green/30 hover:text-quiz-green' :
                    'bg-quiz-surface/30 text-quiz-muted/30 cursor-not-allowed'
                  }`}>{'\u25CB'}</button>
                <button onClick={() => isActive && handleJudge(a.playerId, false)}
                  disabled={!isActive}
                  className={`w-8 h-8 rounded-lg text-sm font-bold transition-colors ${
                    a.isCorrect === false ? 'bg-quiz-accent text-white' :
                    isActive ? 'bg-quiz-surface text-quiz-muted hover:bg-quiz-accent/30 hover:text-quiz-accent' :
                    'bg-quiz-surface/30 text-quiz-muted/30 cursor-not-allowed'
                  }`}>{'\u00D7'}</button>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function ScoreBoard({ players, rankings }) {
  const list = rankings.length > 0 ? [...rankings].sort((a, b) => (b.totalScore || 0) - (a.totalScore || 0)).map((r, i) => ({ ...r, rank: i + 1 })) :
    [...players].sort((a, b) => (b.totalScore || 0) - (a.totalScore || 0)).map((p, i) => ({
      rank: i + 1, name: p.name, playerId: p.playerId, totalScore: p.totalScore || 0,
    }));
  return (
    <Card className="max-h-[40vh] overflow-y-auto">
      <SectionTitle>{t('admin.scores.title')}</SectionTitle>
      {list.length === 0 ? <p className="text-quiz-muted text-sm text-center">{t('admin.scores.empty')}</p> : (
        <div className="space-y-1">
          {list.map((p, i) => (
            <div key={p.playerId || i} className="flex items-center gap-2 text-sm py-1">
              <span className="font-mono font-bold text-quiz-muted w-6 text-right">{p.rank}.</span>
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
      <SectionTitle>{t('admin.quizList.title')}</SectionTitle>
      <div className="space-y-1">
        {quizzes.map(q => {
          const asked = history.includes(q.quizId);
          return (
            <div key={q.quizId} className={`text-sm py-1 border-b border-white/5 last:border-0 ${asked ? 'opacity-40' : ''}`}>
              <span className="font-mono text-xs text-quiz-muted">Q{q.questionNumber}</span>
              <span className="ml-2 text-quiz-text">{q.questionText?.substring(0, 40)}...</span>
              {asked && <span className="text-quiz-green text-xs ml-1">{'\u2713'}</span>}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
