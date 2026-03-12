import { useState, useEffect } from 'react';
import { useGame, useMessageHandler } from '../../contexts/GameContext';
import { useWebSocket } from '../../hooks/useWebSocket';
import { PLAYER_ID_KEY, PLAYER_NAME_KEY } from '../../config';
import { ConnectionBadge, Button, Card, Confetti } from '../../components/UI';

export default function PlayerApp() {
  const { state, dispatch } = useGame();
  const handleMessage = useMessageHandler();
  const { send, connected } = useWebSocket(handleMessage);

  useEffect(() => {
    dispatch({ type: 'SET_CONNECTED', payload: connected });
  }, [connected, dispatch]);

  // Auto-reconnect: re-register to restore server-side connection mapping,
  // then get_state to sync current game state.
  useEffect(() => {
    if (connected && state.playerId && state.playerName) {
      send({
        action: 'register',
        name: state.playerName,
        playerId: state.playerId,
      });
      // Small delay to ensure register completes before state sync
      const timer = setTimeout(() => {
        send({ action: 'get_state' });
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [connected]);

  if (!state.playerId) {
    return <LoginScreen send={send} connected={connected} />;
  }

  return (
    <div className="min-h-dvh bg-quiz-bg flex flex-col">
      <ConnectionBadge connected={connected} />
      <PlayerHeader name={state.playerName} score={state.totalScore} />

      {state.status === 'waiting' && <WaitingScreen />}
      {state.status === 'answering' && !state.myAnswer && (
        <AnswerScreen quiz={state.currentQuiz} send={send} />
      )}
      {state.status === 'answering' && state.myAnswer && <SubmittedScreen answer={state.myAnswer} />}
      {state.status === 'judging' && <JudgingScreen answer={state.myAnswer} />}
      {(state.status === 'showing_answer') && (
        <ResultScreen judgment={state.myJudgment} revealData={state.revealData} score={state.totalScore} />
      )}
      {state.status === 'showing_scores' && <ScoresScreen rankings={state.rankings} playerId={state.playerId} />}
    </div>
  );
}

/* ── Login ── */
function LoginScreen({ send, connected }) {
  const { dispatch } = useGame();
  const [name, setName] = useState(() => localStorage.getItem(PLAYER_NAME_KEY) || '');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = () => {
    if (!name.trim() || !connected) return;
    setSubmitting(true);
    const existingId = localStorage.getItem(PLAYER_ID_KEY);
    send({ action: 'register', name: name.trim(), playerId: existingId });
    localStorage.setItem(PLAYER_NAME_KEY, name.trim());
  };

  // Listen for registration result via context
  const { state } = useGame();
  useEffect(() => {
    if (state.playerId) {
      localStorage.setItem(PLAYER_ID_KEY, state.playerId);
      setSubmitting(false);
    }
  }, [state.playerId]);

  return (
    <div className="min-h-dvh bg-quiz-bg flex flex-col items-center justify-center px-6">
      <ConnectionBadge connected={connected} />
      <div className="animate-fade-in text-center mb-10">
        <div className="text-5xl mb-3">🎯</div>
        <h1 className="font-display font-black text-3xl text-quiz-text tracking-tight">
          クイズ大会
        </h1>
        <p className="text-quiz-muted mt-2 text-sm">名前を入力して参加しよう</p>
      </div>

      <Card className="w-full max-w-sm animate-slide-up">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          placeholder="あなたの名前"
          maxLength={20}
          className="w-full bg-quiz-surface border border-white/10 rounded-xl px-4 py-3 text-lg text-quiz-text font-body placeholder:text-quiz-muted/50 focus:outline-none focus:border-quiz-teal/50 focus:ring-1 focus:ring-quiz-teal/30 transition-colors"
          autoFocus
        />
        <Button
          onClick={handleSubmit}
          disabled={!name.trim() || !connected || submitting}
          variant="accent"
          size="lg"
          className="w-full mt-4"
        >
          {submitting ? '接続中...' : '参加する'}
        </Button>
      </Card>
    </div>
  );
}

/* ── Header bar ── */
function PlayerHeader({ name, score }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 bg-quiz-surface/50 border-b border-white/5">
      <span className="font-display font-bold text-quiz-text truncate max-w-[50%]">{name}</span>
      <span className="font-mono font-bold text-quiz-gold text-lg">{score} pt</span>
    </div>
  );
}

/* ── Waiting ── */
function WaitingScreen() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 animate-fade-in">
      <div className="text-6xl mb-4 animate-pulse">⏳</div>
      <p className="font-display font-bold text-xl text-quiz-text">次の問題をお待ちください</p>
      <p className="text-quiz-muted text-sm mt-2">出題されると自動で切り替わります</p>
    </div>
  );
}

/* ── Answer Input ── */
function AnswerScreen({ quiz, send }) {
  const [textAnswer, setTextAnswer] = useState('');
  const [selectedChoice, setSelectedChoice] = useState(null);

  if (!quiz) return null;

  const handleSubmit = () => {
    if (quiz.questionType === 'choice' && selectedChoice !== null) {
      send({
        action: 'submit_answer',
        quizId: quiz.quizId,
        choiceIndex: selectedChoice,
      });
    } else if (quiz.questionType === 'text' && textAnswer.trim()) {
      send({
        action: 'submit_answer',
        quizId: quiz.quizId,
        answerText: textAnswer.trim(),
      });
    }
  };

  const canSubmit =
    quiz.questionType === 'choice' ? selectedChoice !== null : textAnswer.trim().length > 0;

  return (
    <div className="flex-1 flex flex-col px-4 py-6 animate-slide-up">
      {/* Question header */}
      <div className="text-center mb-4">
        <span className="inline-block px-3 py-1 rounded-full bg-quiz-accent/20 text-quiz-accent text-xs font-bold mb-2">
          第{quiz.cornerNumber}コーナー Q{quiz.questionNumber}
        </span>
        {quiz.cornerTitle && (
          <p className="text-quiz-muted text-xs">{quiz.cornerTitle}</p>
        )}
      </div>

      {/* Question text */}
      <Card className="mb-6">
        <p className="font-body text-lg leading-relaxed text-quiz-text">{quiz.questionText}</p>
        <p className="text-right text-quiz-gold text-sm font-bold mt-2">+{quiz.points}pt</p>
      </Card>

      {/* Input area */}
      <div className="flex-1">
        {quiz.questionType === 'text' ? (
          <input
            type="text"
            value={textAnswer}
            onChange={(e) => setTextAnswer(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && canSubmit && handleSubmit()}
            placeholder="回答を入力..."
            className="w-full bg-quiz-surface border border-white/10 rounded-xl px-4 py-4 text-xl text-quiz-text font-body placeholder:text-quiz-muted/50 focus:outline-none focus:border-quiz-teal/50 focus:ring-1 focus:ring-quiz-teal/30 transition-colors"
            autoFocus
          />
        ) : (
          <div className="space-y-3">
            {quiz.choices?.map((choice, i) => (
              <button
                key={i}
                onClick={() => setSelectedChoice(i)}
                className={`w-full text-left px-5 py-4 rounded-xl border-2 transition-all duration-200 font-body text-base ${
                  selectedChoice === i
                    ? 'border-quiz-teal bg-quiz-teal/10 text-quiz-teal'
                    : 'border-white/10 bg-quiz-surface text-quiz-text hover:border-white/20'
                }`}
              >
                <span className="font-mono font-bold mr-3 text-sm opacity-60">
                  {String.fromCharCode(65 + i)}
                </span>
                {choice}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Submit button */}
      <div className="mt-6 pb-safe">
        <Button onClick={handleSubmit} disabled={!canSubmit} variant="teal" size="lg" className="w-full">
          回答する
        </Button>
      </div>
    </div>
  );
}

/* ── Submitted (waiting for judgment) ── */
function SubmittedScreen({ answer }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 animate-pop">
      <div className="text-5xl mb-4">✅</div>
      <p className="font-display font-bold text-xl text-quiz-text mb-2">回答を送信しました！</p>
      <Card className="text-center mt-4">
        <p className="text-quiz-muted text-sm">あなたの回答</p>
        <p className="font-display font-bold text-2xl text-quiz-teal mt-1">{answer.answerText}</p>
      </Card>
      <p className="text-quiz-muted text-sm mt-6">結果発表をお待ちください...</p>
    </div>
  );
}

/* ── Judging (answer closed, admin judging) ── */
function JudgingScreen({ answer }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 animate-fade-in">
      <div className="text-5xl mb-4 animate-pulse">⚖️</div>
      <p className="font-display font-bold text-xl text-quiz-text">回答を締め切りました</p>
      {answer ? (
        <Card className="text-center mt-4">
          <p className="text-quiz-muted text-sm">あなたの回答</p>
          <p className="font-display font-bold text-xl text-quiz-teal mt-1">{answer.answerText}</p>
        </Card>
      ) : (
        <p className="text-quiz-muted text-sm mt-4">未回答</p>
      )}
      <p className="text-quiz-muted text-sm mt-6">判定中...</p>
    </div>
  );
}

/* ── Result ── */
function ResultScreen({ judgment, revealData, score }) {
  const isCorrect = judgment?.isCorrect;
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 animate-pop">
      {isCorrect && <Confetti />}
      <div className="text-6xl mb-4">{isCorrect ? '🎉' : isCorrect === false ? '😢' : '🤔'}</div>
      <p className="font-display font-black text-3xl mb-2">
        {isCorrect ? (
          <span className="text-quiz-green">正解！</span>
        ) : isCorrect === false ? (
          <span className="text-quiz-accent">不正解</span>
        ) : (
          <span className="text-quiz-muted">未回答</span>
        )}
      </p>
      {isCorrect && judgment.pointsAwarded > 0 && (
        <p className="font-mono font-bold text-2xl text-quiz-gold animate-count-up">
          +{judgment.pointsAwarded} pt
        </p>
      )}

      {revealData && (
        <Card className="text-center mt-6 w-full max-w-sm">
          <p className="text-quiz-muted text-sm">正解</p>
          <p className="font-display font-bold text-2xl text-quiz-gold mt-1">
            {revealData.correctAnswer}
          </p>
        </Card>
      )}

      <div className="mt-6 px-4 py-2 rounded-xl bg-quiz-surface">
        <span className="text-quiz-muted text-sm">あなたの合計: </span>
        <span className="font-mono font-bold text-quiz-gold text-lg">{score} pt</span>
      </div>
    </div>
  );
}

/* ── Scores overlay ── */
function ScoresScreen({ rankings, playerId }) {
  return (
    <div className="flex-1 flex flex-col px-4 py-6 animate-fade-in">
      <h2 className="font-display font-black text-2xl text-center mb-6">🏆 現在の成績</h2>
      <div className="space-y-2">
        {rankings.map((r, i) => {
          const isMe = r.playerId === playerId;
          return (
            <div
              key={r.playerId || i}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                isMe ? 'bg-quiz-teal/15 border border-quiz-teal/30' : 'bg-quiz-surface/50'
              }`}
              style={{ animationDelay: `${i * 0.05}s` }}
            >
              <span className="font-mono font-bold text-quiz-muted w-8 text-center">
                {r.rank}
              </span>
              <span className={`flex-1 font-body font-bold truncate ${isMe ? 'text-quiz-teal' : 'text-quiz-text'}`}>
                {r.name} {isMe && '(あなた)'}
              </span>
              <span className="font-mono font-bold text-quiz-gold">{r.totalScore} pt</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
