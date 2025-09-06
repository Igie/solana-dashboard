import React, { useState, useEffect } from 'react'
import { Activity, CheckCircle, XCircle, Wallet, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { UnifiedWalletButton, useConnection, useWallet } from '@jup-ag/wallet-adapter'

const Dashboard: React.FC = () => {
  const { connection } = useConnection()
  const { publicKey, connected, connecting } = useWallet()
  
  const [currentSlot, setCurrentSlot] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)

  // Fetch current slot
  const fetchSlot = async () => {
    try {
      setLoading(true)
      const slot = await connection.getSlot()
      setCurrentSlot(slot)
    } catch (err) {
      console.error('Error fetching slot:', err)
      toast.error('Failed to fetch current slot')
    } finally {
      setLoading(false)
    }
  }

  // Fetch data when wallet connects
  useEffect(() => {
    if (connected && publicKey) {
      fetchSlot()
    }
  }, [connection])

  useEffect(() => {
    
  }, [])

  return (
    <div className="space-y-2">
      {/* Wallet Connection */}
      <div className="bg-gray-900 border border-gray-700 rounded-2xl p-2">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold mb-2">Wallet Connection</h2>
            <p className="text-gray-400 text-sm">
              {connected ? 'Wallet connected successfully' : 'Connect a Solana wallet to get started'}
            </p>
          </div>
          <div className="flex gap-2">
            <UnifiedWalletButton 
            buttonClassName="!bg-purple-600 hover:!bg-purple-700 !rounded-lg !font-medium !px-6 !py-2"
             currentUserClassName='"!bg-red-600 hover:!bg-red-700 !rounded-lg !font-medium !px-4 !py-2"'
             >
             </UnifiedWalletButton>
            {/* {connected && (
              <UnifiedWalletButton buttonClassName="!bg-red-600 hover:!bg-red-700 !rounded-lg !font-medium !px-4 !py-2" />
            )} */}
          </div>
        </div>
      </div>
      {/* Connection Status */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <div className="bg-gray-900 border border-gray-700 rounded-2xl p-2">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">RPC Connection</h3>
            <button
              onClick={fetchSlot}
              disabled={loading}
              className="p-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 rounded-lg transition-colors"
            >
              {loading ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
            </button>
          </div>
          <div className="flex items-center mb-2">
            <CheckCircle className="w-5 h-5 mr-2 text-green-400" />
            <span className="text-green-400">Connected to Helius RPC</span>
          </div>
          {currentSlot && (
            <div className="mt-4 p-3 bg-gray-800 border border-gray-600 rounded-lg">
              <div className="flex justify-between items-center">
                <span className="text-gray-300">Current Slot:</span>
                <span className="font-mono text-purple-400 font-bold">
                  {currentSlot.toLocaleString()}
                </span>
              </div>
            </div>
          )}
        </div>
        <div className="bg-gray-900 border border-gray-700 rounded-2xl p-2">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Wallet className="w-5 h-5" />
              Wallet Status
            </h3>
          </div>
          {connecting && (
            <div className="flex items-center text-yellow-400">
              <Activity className="w-5 h-5 mr-2 animate-spin" />
              Connecting...
            </div>
          )}
          {connected && publicKey ? (
            <div className="space-y-3">
              <div className="flex items-center text-green-400">
                <CheckCircle className="w-5 h-5 mr-2" />
                Wallet Connected
              </div>
              
              <div className="p-3 bg-gray-800 border border-gray-600 rounded-lg">
                <div className="text-sm text-gray-400 mb-1">Address:</div>
                <div className="font-mono text-xs text-purple-400 break-all">
                  {publicKey.toString()}
                </div>
              </div>
            </div>
          ) : !connecting && (
            <div className="flex items-center text-gray-400">
              <XCircle className="w-5 h-5 mr-2" />
              No wallet connected
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
export default Dashboard