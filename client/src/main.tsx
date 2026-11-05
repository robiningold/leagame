import { createRoot } from 'react-dom/client';
import '@fontsource/fredoka/400.css';
import '@fontsource/fredoka/500.css';
import '@fontsource/fredoka/600.css';
import '@fontsource/fredoka/700.css';
import './styles.css';
import Tv from './views/Tv';
import Join from './views/Join';
import Admin from './views/Admin';
import { Background } from './components';

function Home() {
  return (
    <div className="app">
      <Background count={8} />
      <div className="phone" style={{ justifyContent: 'center', textAlign: 'center' }}>
        <h1 className="title" style={{ fontSize: 44 }}>
          🎉 Partyspiel
        </h1>
        <a className="btn big" href="/join">
          📱 Mitspielen
        </a>
        <a className="btn big ghost" href="/tv">
          📺 TV-Ansicht
        </a>
        <a className="btn big ghost" href="/admin">
          🎛️ Spielleitung
        </a>
      </div>
    </div>
  );
}

const path = location.pathname.replace(/\/+$/, '');
const titles: Record<string, string> = { '/tv': 'TV', '/join': 'Mitspielen', '/admin': 'Spielleitung' };
document.title = `${titles[path] ?? 'Start'} · Partyspiel`;
const Page = path === '/tv' ? Tv : path === '/join' ? Join : path === '/admin' ? Admin : Home;

createRoot(document.getElementById('root')!).render(<Page />);
