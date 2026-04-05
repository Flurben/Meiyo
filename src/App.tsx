import { Game } from './components/Game';
import { AuthProvider } from './AuthProvider';
import { ErrorBoundary } from './components/ErrorBoundary';

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <div className="min-h-screen bg-slate-950">
          <Game />
        </div>
      </AuthProvider>
    </ErrorBoundary>
  );
}
