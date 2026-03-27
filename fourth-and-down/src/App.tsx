import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Shell } from './components/layout/Shell';
import { Dashboard } from './pages/Dashboard';
import { Lights } from './pages/Lights';
import { Scenes } from './pages/Scenes';
import { Receiver } from './pages/Receiver';
import { Settings } from './pages/Settings';
import { Players } from './pages/Players';
import { Games } from './pages/Games';
import { Join } from './pages/Join';
import { Darts } from './pages/Darts';
import { AmbientSync } from './pages/AmbientSync';
import { AmbientSetup } from './pages/AmbientSetup';
import { Trivia } from './pages/Trivia';
import { TriviaPhone } from './pages/TriviaPhone';
import { CatchPhrase } from './pages/CatchPhrase';
import { CatchPhrasePhone } from './pages/CatchPhrasePhone';
import { Blackjack } from './pages/Blackjack';
import { BlackjackPhone } from './pages/BlackjackPhone';
import { Pool } from './pages/Pool';
import { Poker } from './pages/Poker';
import { DiceGames } from './pages/DiceGames';
import { CareerStats } from './pages/CareerStats';
import { OldFashionedLab } from './pages/OldFashionedLab';
import { PhoneDrinkLab } from './pages/PhoneDrinkLab';
import { Leaderboard } from './pages/Leaderboard';
import { EndOfNight } from './pages/EndOfNight';
import { Cribbage } from './pages/Cribbage';
import { Dominoes } from './pages/Dominoes';
import { GameDJ } from './pages/GameDJ';
import { Teams } from './pages/Teams';
import { Music } from './pages/Music';
import { Drinks } from './pages/Drinks';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Phone pages — no shell/nav, full screen */}
        <Route path="join" element={<Join />} />
        <Route path="join/drinks" element={<PhoneDrinkLab />} />
        <Route path="trivia/play" element={<TriviaPhone />} />
        <Route path="catchphrase/play" element={<CatchPhrasePhone />} />
        <Route path="blackjack/play" element={<BlackjackPhone />} />
        <Route path="end-of-night" element={<EndOfNight />} />

        <Route element={<Shell />}>
          <Route index element={<Dashboard />} />
          <Route path="players" element={<Players />} />
          <Route path="games" element={<Games />} />
          <Route path="darts" element={<Darts />} />
          <Route path="trivia" element={<Trivia />} />
          <Route path="catchphrase" element={<CatchPhrase />} />
          <Route path="blackjack" element={<Blackjack />} />
          <Route path="pool" element={<Pool />} />
          <Route path="poker" element={<Poker />} />
          <Route path="dice" element={<DiceGames />} />
          <Route path="career-stats" element={<CareerStats />} />
          <Route path="leaderboard" element={<Leaderboard />} />
          <Route path="bar-lab" element={<OldFashionedLab />} />
          <Route path="scenes" element={<Scenes />} />
          <Route path="lights" element={<Lights />} />
          <Route path="receiver" element={<Receiver />} />
          <Route path="ambient" element={<AmbientSync />} />
          <Route path="ambient/setup" element={<AmbientSetup />} />
          <Route path="cribbage" element={<Cribbage />} />
          <Route path="dominoes" element={<Dominoes />} />
          <Route path="dj" element={<GameDJ />} />
          <Route path="teams" element={<Teams />} />
          <Route path="drinks" element={<Drinks />} />
          <Route path="music" element={<Music />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
