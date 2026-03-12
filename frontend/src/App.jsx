import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { GameProvider } from './contexts/GameContext';
import PlayerApp from './pages/player/PlayerApp';
import AdminApp from './pages/admin/AdminApp';
import DisplayApp from './pages/display/DisplayApp';
import { ROUTES } from './config';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route
          path={ROUTES.PLAYER}
          element={
            <GameProvider>
              <PlayerApp />
            </GameProvider>
          }
        />
        <Route
          path={ROUTES.ADMIN}
          element={
            <GameProvider>
              <AdminApp />
            </GameProvider>
          }
        />
        <Route
          path={ROUTES.DISPLAY}
          element={
            <GameProvider>
              <DisplayApp />
            </GameProvider>
          }
        />
        <Route path="*" element={<Navigate to={ROUTES.PLAYER} replace />} />
      </Routes>
    </BrowserRouter>
  );
}
