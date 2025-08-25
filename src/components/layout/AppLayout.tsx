import React from 'react';
import { Navigation, MobileNavigation } from './Navigation';
import { ArrowLeftRight } from 'lucide-react';

export function AppLayout({
  activeTab,
  setActiveTab,
  network,
  setNetwork,
  children,
  onSwap
}: {
  activeTab: string;
  setActiveTab: (id: string) => void;
  network: 'mainnet' | 'devnet';
  setNetwork: (n: 'mainnet' | 'devnet') => void;
  onSwap: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col h-full bg-black text-white">
      <header className="bg-gray-900 border-b border-gray-700">
        <div className="max-w-screen-xl mx-auto px-4 flex items-center justify-between h-16">
          <h1 className="text-xl font-bold">DAMMv2 Dashboard</h1>

          <Navigation activeTab={activeTab} onTabChange={setActiveTab} />

          <div className="flex items-center space-x-4">
            <button
              onClick={onSwap}
              className="flex items-center px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 rounded-lg font-medium hover:scale-105 transition-all"
            >
              <ArrowLeftRight className="w-4 h-4 mr-2" />
              Swap
            </button>
            <button
              onClick={() => setNetwork(network === 'mainnet' ? 'devnet' : 'mainnet')}
              className="px-3 py-2 border border-gray-600 text-sm rounded-md hover:bg-gray-700"
            >
              {network === 'mainnet' ? 'Mainnet 🔒' : 'Devnet 🧪'}
            </button>
          </div>
        </div>
      </header>

       <main className="flex flex-col h-[calc(100vh-65px)] pb-[calc(4rem+var(10px))] w-full px-4 py-2">
        <div className="w-full max-w-screen-2xl mx-auto">
          {children}
        </div>
      </main>

      <MobileNavigation activeTab={activeTab} onTabChange={setActiveTab} />
    </div>
  );
}
