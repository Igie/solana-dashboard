import React, { useEffect, useState } from 'react'

import { tabs } from './config/tabs'

import { Navigation, MobileNavigation } from './components/layout/Navigation'
import { ArrowLeftRight } from 'lucide-react'
import { LAMPORTS_PER_SOL, type Cluster } from '@solana/web3.js'
import { useTransactionManager } from './contexts/TransactionManagerContext'



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

  const { solBalance, refreshBalance } = useTransactionManager()
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
        <div className="max-w-screen-xl mx-auto px-4 flex items-center justify-between h-16">
          <h1 className="text-xl font-bold">DAMMv2 Dashboard</h1>
          <h3 className="font-medium text-green-500">
            SOL: {(solBalance / LAMPORTS_PER_SOL).toFixed(4)}
          </h3>
          <Navigation activeTab={activeTab} onTabChange={setActiveTab} />

          <div className="flex items-center space-x-4">
            <button
              onClick={async () => {
                window.Jupiter.init({
                  displayMode: 'modal',
                  onSuccess: async () => {
                    refreshBalance()
                  },
                })
              }}
              className="flex items-center px-2 py-2 bg-gradient-to-r from-purple-600 to-blue-600 rounded-md font-medium"
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
              className="px-2 py-2 border border-gray-600 text-sm rounded-md hover:bg-gray-700"
            >
              {network === 'mainnet-beta' ? 'Mainnet 🔒' : 'Devnet 🧪'}
            </button>
          </div>
        </div>
      </header>

      <main className="flex flex-col h-[calc(100vh-65px)] pb-[calc(4rem+var(10px))] w-full px-4 py-2">
        <div className="w-full max-w-screen-2xl mx-auto">
          <ActiveComponent />
        </div>
      </main>

      <MobileNavigation activeTab={activeTab} onTabChange={setActiveTab} />
    </div>

  )
}

export default AppInner
