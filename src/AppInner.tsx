import React, { useEffect, useState } from 'react'

import { tabs } from './config/tabs'

import { Navigation, MobileNavigation } from './components/layout/Navigation'
import { ArrowLeftRight } from 'lucide-react'
import { type Cluster } from '@solana/web3.js'
import { useTokenAccounts } from './contexts/TokenAccountsContext'



interface ComponentMap {
  [key: string]: React.FC
}

interface AppInnerProps {
  network: Cluster
  setNetwork: (n: Cluster) => void

}

const AppInner: React.FC<AppInnerProps> = ({
  network,
  setNetwork,
}) => {
  const [components, setComponents] = useState<ComponentMap>({})
  const [activeTab, setActiveTab] = useState('dashboard')

  const { solBalance } = useTokenAccounts()
  const ActiveComponent =
    components[activeTab] || (() => <div>Loading...</div>)

  useEffect(() => {
    setComponents(
      tabs
        .map((t) => ({ [t.id]: t.component }))
        .reduce((a, b) => ({ ...a, ...b }), {})
    )
  }, [])

  return (
    <div className="flex flex-col h-full bg-black text-white">
      <header className="bg-gray-900 border-b border-gray-700">
        <div className="max-w-screen-xl mx-auto px-2 flex items-center justify-between h-10">
          <div className="font-bold md:text-lg text-xs text-nowrap">DAMMv2 Dashboard</div>
          <div className="font-medium md:text-lg text-xs text-green-500 text-nowrap">
            SOL: {(solBalance).toFixed(4)}
          </div>
          <Navigation activeTab={activeTab} onTabChange={setActiveTab} />

          <div className="flex items-center space-x-2">
            <button
              onClick={async () => {
                window.Jupiter.init({
                  displayMode: 'modal',
                })
              }}
              className="flex items-center md:text-md text-xs px-2 py-1.5 bg-gradient-to-r from-purple-600 to-indigo-600 rounded-md"
            >
              <ArrowLeftRight className="w-4 h-4 mr-2" />
              Swap
            </button>
            <button
              onClick={() =>
                setNetwork(
                  network === 'mainnet-beta' ? 'devnet' : 'mainnet-beta'
                )
              }
              className="px-1 py-1 flex items-center md:text-md text-xs border border-gray-600 rounded hover:bg-gray-700"
            >
              {network === 'mainnet-beta' ? 'Mainnet 🔒' : 'Devnet 🧪'}
            </button>
          </div>
        </div>
      </header>

      <main className="flex flex-col h-[calc(100vh-42px)] pb-[calc(4rem+var(10px))] w-full px-4 py-2">
        <div className="w-full max-w-screen-2xl mx-auto">
          <ActiveComponent />
        </div>
      </main>

      <MobileNavigation activeTab={activeTab} onTabChange={setActiveTab} />
    </div>

  )
}

export default AppInner
