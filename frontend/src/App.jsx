import { BrowserRouter, Routes, Route, Navigate, Link } from 'react-router-dom';
import { GameProvider } from './contexts/GameContext';
import PlayerApp from './pages/player/PlayerApp';
import AdminApp from './pages/admin/AdminApp';
import DisplayApp from './pages/display/DisplayApp';

function Home() {
  return (
    <div className="min-h-screen bg-quiz-bg flex flex-col items-center justify-center px-6">
      <div className="text-7xl mb-6">🎯</div>
      <h1 className="font-display font-black text-4xl text-quiz-text mb-2">Kira-Kira OshareQuiz</h1>
      <p className="text-quiz-muted font-body mb-10">画面を選択してください</p>

      <div className="grid gap-4 w-full max-w-sm">
        <Link
          to="/player"
          className="flex items-center gap-4 px-6 py-5 rounded-2xl bg-quiz-card border border-white/5 hover:border-quiz-teal/30 transition-colors group"
        >
          <span className="text-3xl">📱</span>
          <div>
            <p className="font-display font-bold text-lg text-quiz-text group-hover:text-quiz-teal transition-colors">解答者</p>
            <p className="text-quiz-muted text-sm">スマホで参加</p>
          </div>
        </Link>

        <Link
          to="/admin"
          className="flex items-center gap-4 px-6 py-5 rounded-2xl bg-quiz-card border border-white/5 hover:border-quiz-accent/30 transition-colors group"
        >
          <span className="text-3xl">🎛️</span>
          <div>
            <p className="font-display font-bold text-lg text-quiz-text group-hover:text-quiz-accent transition-colors">管理者</p>
            <p className="text-quiz-muted text-sm">クイズ進行を管理</p>
          </div>
        </Link>

        <Link
          to="/display"
          className="flex items-center gap-4 px-6 py-5 rounded-2xl bg-quiz-card border border-white/5 hover:border-quiz-purple/30 transition-colors group"
        >
          <span className="text-3xl">📺</span>
          <div>
            <p className="font-display font-bold text-lg text-quiz-text group-hover:text-quiz-purple transition-colors">表示用</p>
            <p className="text-quiz-muted text-sm">プロジェクタに投影</p>
          </div>
        </Link>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route
          path="/player"
          element={
            <GameProvider>
              <PlayerApp />
            </GameProvider>
          }
        />
        <Route
          path="/admin"
          element={
            <GameProvider>
              <AdminApp />
            </GameProvider>
          }
        />
        <Route
          path="/display"
          element={
            <GameProvider>
              <DisplayApp />
            </GameProvider>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
