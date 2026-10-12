import { Component } from 'react';
import type { ReactNode, ErrorInfo } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/fonts.css';
import './styles/game.css';
import './styles/mobile-game.css';
import './styles/weather.css';

class GameBoundary extends Component<{ children: ReactNode }, { error: boolean }> {
  state = { error: false };
  static getDerivedStateFromError() { return { error: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('CampMind rendering error', error, info.componentStack); }
  render() {
    if (this.state.error) return <main className="error-screen"><h1>营地需要重新整理一下。</h1><p>游戏遇到了意外。刷新页面后，可以尝试继续已保存的旅程。</p><button className="primary-button" onClick={() => window.location.reload()}>重新加载游戏</button></main>;
    return this.props.children;
  }
}
createRoot(document.getElementById('root')!).render(<GameBoundary><App /></GameBoundary>);
