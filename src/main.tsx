import { Component } from 'react';
import type { ReactNode, ErrorInfo } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { bootstrapModels } from './integrations/models/runtime';
import './styles/fonts.css';
import './styles/game.css';
import './styles/mobile-game.css';
import './styles/weather.css';
import './styles/compact-hud.css';
import { worldMessages } from './gameMessages';
import { WorldChannel } from './components/WorldChannel';

class GameBoundary extends Component<{ children: ReactNode }, { error: boolean }> {
  state = { error: false };
  static getDerivedStateFromError() { return { error: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) { worldMessages.append('error',error.message);console.error('CampMind rendering error', error, info.componentStack); }
  render() {
    if (this.state.error) return <><main className="error-screen"><button className="primary-button" onClick={() => window.location.reload()}>重新加载游戏</button></main><WorldChannel /></>;
    return this.props.children;
  }
}
void bootstrapModels();
createRoot(document.getElementById('root')!).render(<GameBoundary><App /></GameBoundary>);
