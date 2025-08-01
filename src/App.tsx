import React, { useMemo, useState } from 'react'
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react'
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui'
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets'
import { Home, TrendingUp, ArrowLeftRight, BotIcon, PlayIcon, DnaIcon } from 'lucide-react'


// Import tab components
import Dashboard from './components/Dashboard'
import Portfolio from './components/Portfolio'

// Import wallet adapter CSS

import '@solana/wallet-adapter-react-ui/styles.css'
import DammPositions from './components/DammPositions';
import Dammv2PoolCreation from './components/Dammv2PoolCreation'
import { DammUserPositionsProvider } from './contexts/DammUserPositionsContext'
import { DEVNET_HELIUS_RPC, MAINNET_HELIUS_RPC } from './constants'
import { TokenAccountsProvider } from './contexts/TokenAccountsContext'
import { TransactionManagerProvider } from './contexts/TransactionManagerContext'

import './App.css'
import { Toaster } from 'sonner'
import Dammv2Browser from './components/Dammv2Browser'

const GlobalProviders = ({ children }: { children: React.ReactNode }) => (

  <TransactionManagerProvider>
          
  <TokenAccountsProvider>
  <DammUserPositionsProvider>
    {children}
  </DammUserPositionsProvider>
  </TokenAccountsProvider>
  </TransactionManagerProvider>
)




// Tab configuration
const tabs = [
  {
    id: 'dashboard',
    name: 'Dashboard',
    icon: Home,
    component: Dashboard,
  },
  {
    id: 'portfolio',
    name: 'Portfolio',
    icon: TrendingUp,
    component: Portfolio,
  },
  {
    id: 'dammv2',
    name: 'DAMMv2 Positions',
    icon: BotIcon,
    component: DammPositions,
  },
  {
    id: 'dammv2PoolCreation',
    name: 'DAMMv2 Pool Creation',
    icon: PlayIcon,
    component: Dammv2PoolCreation,
  },
    {
    id: 'dammv2browser',
    name: 'DAMMv2 Browser',
    icon: DnaIcon,
    component: Dammv2Browser,
  },
]

// Main App component with providers and tabs
function App() {
  const [network, setNetwork] = useState<'mainnet' | 'devnet'>('mainnet')

  const endpoint = network === 'mainnet' ? MAINNET_HELIUS_RPC : DEVNET_HELIUS_RPC

  const [activeTab, setActiveTab] = useState('dashboard')

  // Configure supported wallets
  const wallets = useMemo(
    () => [
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter(),
    ],
    []
  )

  const ActiveComponent = tabs.find(tab => tab.id === activeTab)?.component || Dashboard

  //toast.success(`Loaded ${ActiveComponent.name}`)

  const handleSwapClick = () => {
    window.Jupiter.init({
      displayMode: 'modal',
    })
  };

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <GlobalProviders>
            <Toaster
        position="bottom-left"
        richColors
        closeButton
        theme="dark"
        toastOptions={{
          classNames: {
            toast: 'max-w-100 rounded-xl shadow-lg border border-gray-800 bg-gray-900 text-white',
            title: 'font-semibold',
            description: 'text-sm text-gray-300',
          },
        }}
      />
            <div className="min-h-screen bg-black text-white">
              {/* Header with Navigation */}
              <header className="bg-gray-900 border-b border-gray-700">
                <div className="max-w-8/10 mx-auto px-4">
                  <div className="flex items-center justify-between h-16">
                    <div className="flex items-center space-x-8">
                      <h1 className="text-xl font-bold text-white">Solana Dashboard</h1>

                      {/* Tab Navigation */}
                      <nav className="flex space-x-1">
                        {tabs.map((tab) => {
                          const Icon = tab.icon
                          return (
                            <button
                              key={tab.id}
                              onClick={() => setActiveTab(tab.id)}
                              className={`flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === tab.id
                                ? 'bg-purple-600 text-white'
                                : 'text-gray-300 hover:text-white hover:bg-gray-700'
                                }`}
                            >
                              <Icon className="w-4 h-4 mr-2" />
                              {tab.name}
                            </button>
                          )
                        })}
                      </nav>
                    </div>
                    
                    {/* Swap Button */}
                    <div className="flex items-center space-x-4">
                      
                      <button
                        onClick={handleSwapClick}
                        className="flex items-center px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 rounded-lg font-medium transition-all duration-200 transform hover:scale-105"
                      >
                        <ArrowLeftRight className="w-4 h-4 mr-2" />
                        Swap
                      </button>
                      <button
                      onClick={() => setNetwork(network === 'mainnet' ? 'devnet' : 'mainnet')}
                      className="px-3 py-2 border border-gray-600 text-sm rounded-md hover:bg-gray-700 transition"
                      title="Switch cluster"
                    >
                      {network === 'mainnet' ? 'Mainnet 🔒' : 'Devnet 🧪'}
                    </button>
                    </div>
                  </div>
                </div>
              </header>

              {/* Main Content */}
              <main className="max-w-9/10 mx-auto px-4 py-6">
                <ActiveComponent />
              </main>
            </div>
          </GlobalProviders>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  )
}

export default App