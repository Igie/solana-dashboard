import { Home, TrendingUp, BotIcon, PlayIcon, DnaIcon, HelpCircle } from 'lucide-react';
import Dashboard from '../components/Dashboard';
import Portfolio from '../components/Portfolio';
import DammPositions from '../components/DammPositions';
import Dammv2PoolCreation from '../components/Dammv2PoolCreation';
import Dammv2Browser from '../components/Dammv2Browser';
import AboutPage from '../components/AboutPage';

export const tabs = [
  { id: 'dashboard', name: 'Dashboard', icon: Home, component: Dashboard },
  { id: 'portfolio', name: 'Portfolio', icon: TrendingUp, component: Portfolio },
  { id: 'dammv2', name: 'Positions', icon: BotIcon, component: DammPositions },
  { id: 'dammv2PoolCreation', name: 'Creation', icon: PlayIcon, component: Dammv2PoolCreation },
  { id: 'dammv2browser', name: 'Browser', icon: DnaIcon, component: Dammv2Browser },
  { id: 'aboutPage', name: 'About', icon: HelpCircle, component: AboutPage },
] as const;

