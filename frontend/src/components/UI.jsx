import { useState, useEffect } from 'react';

/* ── Connection status indicator ── */
export function ConnectionBadge({ connected }) {
  return (
    <div className="fixed top-2 right-2 z-50 flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-body bg-quiz-surface/80 backdrop-blur-sm">
      <span
        className={`w-2 h-2 rounded-full ${
          connected ? 'bg-quiz-green' : 'bg-quiz-accent animate-pulse'
        }`}
      />
      <span className="text-quiz-muted">
        {connected ? '接続中' : '再接続中...'}
      </span>
    </div>
  );
}

/* ── Big accent button ── */
export function Button({ children, onClick, disabled, variant = 'accent', className = '', size = 'md' }) {
  const base = 'font-display font-bold rounded-xl transition-all duration-200 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed';
  const sizes = {
    sm: 'px-4 py-2 text-sm',
    md: 'px-6 py-3 text-base',
    lg: 'px-8 py-4 text-lg',
  };
  const variants = {
    accent: 'bg-quiz-accent text-white hover:bg-quiz-accent/80 shadow-lg shadow-quiz-accent/20',
    teal: 'bg-quiz-teal text-quiz-bg hover:bg-quiz-teal/80 shadow-lg shadow-quiz-teal/20',
    gold: 'bg-quiz-gold text-quiz-bg hover:bg-quiz-gold/80 shadow-lg shadow-quiz-gold/20',
    green: 'bg-quiz-green text-white hover:bg-quiz-green/80 shadow-lg shadow-quiz-green/20',
    purple: 'bg-quiz-purple text-white hover:bg-quiz-purple/80 shadow-lg shadow-quiz-purple/20',
    ghost: 'bg-quiz-surface text-quiz-text hover:bg-quiz-card border border-white/10',
    danger: 'bg-red-600 text-white hover:bg-red-500',
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

/* ── Card container ── */
export function Card({ children, className = '' }) {
  return (
    <div className={`bg-quiz-card/60 backdrop-blur-sm border border-white/5 rounded-2xl p-5 ${className}`}>
      {children}
    </div>
  );
}

/* ── Section heading ── */
export function SectionTitle({ children, className = '' }) {
  return (
    <h2 className={`font-display font-bold text-lg text-quiz-muted mb-3 ${className}`}>
      {children}
    </h2>
  );
}

/* ── Elapsed time display ── */
export function ElapsedTime({ startTime }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!startTime) return;
    const start = new Date(startTime).getTime();
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [startTime]);

  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  return (
    <span className="font-mono text-quiz-gold">
      {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
    </span>
  );
}

/* ── Format elapsed ms to readable ── */
export function formatElapsedMs(ms) {
  if (ms == null) return '--';
  const secs = (ms / 1000).toFixed(1);
  return `${secs}秒`;
}

/* ── Rank badge ── */
export function RankBadge({ rank }) {
  const icons = { 1: '🥇', 2: '🥈', 3: '🥉' };
  if (icons[rank]) {
    return <span className="text-2xl">{icons[rank]}</span>;
  }
  return (
    <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-quiz-surface text-quiz-muted font-mono text-sm font-bold">
      {rank}
    </span>
  );
}

/* ── Progress bar ── */
export function ProgressBar({ current, total, className = '' }) {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  return (
    <div className={`w-full bg-quiz-surface rounded-full h-3 overflow-hidden ${className}`}>
      <div
        className="h-full bg-gradient-to-r from-quiz-teal to-quiz-green rounded-full transition-all duration-500 ease-out"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/* ── Confetti effect ── */
export function Confetti() {
  const colors = ['#e94560', '#f5c518', '#00d2d3', '#6c5ce7', '#00b894', '#fd79a8'];
  const particles = Array.from({ length: 40 }, (_, i) => ({
    id: i,
    left: `${Math.random() * 100}%`,
    color: colors[i % colors.length],
    delay: `${Math.random() * 2}s`,
    size: `${6 + Math.random() * 6}px`,
  }));
  return (
    <div className="fixed inset-0 pointer-events-none z-50">
      {particles.map((p) => (
        <div
          key={p.id}
          className="confetti-particle"
          style={{
            left: p.left,
            backgroundColor: p.color,
            animationDelay: p.delay,
            width: p.size,
            height: p.size,
            borderRadius: Math.random() > 0.5 ? '50%' : '2px',
          }}
        />
      ))}
    </div>
  );
}
