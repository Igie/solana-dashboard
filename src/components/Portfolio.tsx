import React, { useState, useEffect, useRef } from 'react'

import { LAMPORTS_PER_SOL } from '@solana/web3.js'

import { Coins, RefreshCw, TrendingUp, Wallet, ExternalLink } from 'lucide-react'
import { type TokenAccount } from '../tokenUtils'
import { useTokenAccounts } from '../contexts/TokenAccountsContext'
import { UnifiedWalletButton, useConnection, useWallet } from '@jup-ag/wallet-adapter'
import { toast } from 'sonner'

const Portfolio: React.FC = () => {
  const { connection } = useConnection()
  const { publicKey, connected } = useWallet()

  const [solBalance, setSolBalance] = useState<number | null>(null)
  const { tokenAccounts, tokenMetadata, refreshTokenAccounts } = useTokenAccounts()
  const [loading, setLoading] = useState(false)
  const [totalValue, setTotalValue] = useState<number>(0)
  const [solPrice, setSolPrice] = useState<number>(0)
  const [popupIndex, setPopupIndex] = useState<number | null>(null)
  const popupRef = useRef<HTMLDivElement | null>(null)

  // Fetch all portfolio data
  const fetchPortfolioData = async () => {
    setLoading(true)
    try {
      const solPrice = tokenMetadata.find(x => x?.mint === "So11111111111111111111111111111111111111112")?.price || 0
      const balance = await connection.getBalance(publicKey!)

      setSolBalance(balance / LAMPORTS_PER_SOL)
      setSolPrice(solPrice)

      await refreshTokenAccounts();
    } catch (err) {
      console.error('Error fetching SOL balance:', err)
      toast.error('Failed to fetch SOL balance')
    }
    setLoading(false)
  }
  const togglePopup = (index: number) => {
    setPopupIndex(popupIndex === index ? null : index)
  }

  const handleSwap = (ta: TokenAccount) => {
    window.Jupiter.init({
      formProps: {
        initialInputMint: ta.mint,
        initialOutputMint: 'So11111111111111111111111111111111111111112',
        initialAmount: (ta.amount * (10 ** ta.decimals)).toFixed(0),
        swapMode: 'ExactIn',
      },
    });

    window.Jupiter.onSuccess = async () => await fetchPortfolioData()
    setPopupIndex(null)
  }

  const handleCopyMint = async (mint: string) => {
    await navigator.clipboard.writeText(mint)
    setPopupIndex(null)
  }

  // Calculate total portfolio value
  useEffect(() => {
    let total = 0
    // Add SOL value
    if (solBalance && solPrice) {
      total += solBalance * solPrice
    }

    // Add token values
    tokenAccounts.forEach(token => {
      total += token.value
    })

    setTotalValue(total)
  }, [solBalance, solPrice, tokenAccounts])

  // Fetch data when wallet connects
  useEffect(() => {
    if (connected && publicKey) {
      fetchPortfolioData()
    }
  }, [publicKey, connection])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        popupRef.current &&
        !popupRef.current.contains(event.target as Node)
      ) {
        setPopupIndex(null)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  if (!connected) {
    return (
      <div className="text-center py-12">
        <Wallet className="w-16 h-16 mx-auto mb-6 text-gray-400" />
        <h2 className="text-2xl font-bold mb-4 text-gray-300">Connect Your Wallet</h2>
        <p className="text-gray-400 mb-6">Connect your Solana wallet to view your portfolio</p>
        <UnifiedWalletButton buttonClassName="!bg-purple-600 hover:!bg-purple-700 !rounded-lg !font-medium !px-8 !py-3" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={fetchPortfolioData}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-800 rounded-lg font-medium transition-colors"
        >
          {loading ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
          Refresh
        </button>
      </div>

      {/* Portfolio Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <div className="bg-gradient-to-br from-purple-900/30 to-purple-800/20 border border-purple-700/50 rounded-2xl p-2">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-purple-300">Total Value</h3>
            <TrendingUp className="w-5 h-5 text-purple-400" />
          </div>
          <div className="text-3xl font-bold text-white">
            ${totalValue.toFixed(2)}
          </div>
          <div className="text-sm text-purple-300 mt-2">
            Estimated USD value
          </div>
        </div>

        <div className="bg-gradient-to-br from-green-900/30 to-green-800/20 border border-green-700/50 rounded-2xl p-2">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-green-300">SOL Balance</h3>
            <Coins className="w-5 h-5 text-green-400" />
          </div>
          <div className="text-3xl font-bold text-white">
            {solBalance ? solBalance.toFixed(4) : '0.0000'}
          </div>
          <div className="text-sm text-green-300 mt-2">
            Native SOL tokens
          </div>
        </div>

        <div className="bg-gradient-to-br from-blue-900/30 to-blue-800/20 border border-blue-700/50 rounded-2xl p-2">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-blue-300">Token Types</h3>
            <Coins className="w-5 h-5 text-blue-400" />
          </div>
          <div className="text-3xl font-bold text-white">
            {tokenAccounts.length}
          </div>
          <div className="text-sm text-blue-300 mt-2">
            Different tokens held
          </div>
        </div>
      </div>
      {/* Token Holdings */}
      <div className="bg-gray-900 border border-gray-700 rounded-2xl">
        <div className="p-6 border-b border-gray-700">
          <h2 className="text-xl font-semibold text-white flex items-center gap-2">
            <Coins className="w-5 h-5" />
            Token Holdings
          </h2>
        </div>
        {loading ? (
          <div className="p-8 text-center">
            <RefreshCw className="w-8 h-8 mx-auto mb-4 text-purple-400 animate-spin" />
            <p className="text-gray-400">Loading token accounts...</p>
          </div>
        ) : tokenAccounts.length === 0 ? (
          <div className="p-8 text-center">
            <Coins className="w-12 h-12 mx-auto mb-4 text-gray-400" />
            <h3 className="text-lg font-semibold text-gray-300 mb-2">No Tokens Found</h3>
            <p className="text-gray-500">
              {publicKey ? 'No SPL tokens detected in this wallet' : 'Connect wallet to view tokens'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-700">
            {/* Token Entries */}
            {tokenAccounts.map((token, index) => (
              <div
                key={index}
                className="p-1 hover:bg-gray-800/50 transition-colors"
              >
                <div className="flex items-center">
                  {/* Left Side */}
                  <div className="flex items-center space-x-1 min-w-[10rem] flex-shrink-0">
                    <div className="relative w-10 h-10">
                      <div
                        className="w-10 h-10 rounded-full overflow-hidden bg-gray-700 cursor-pointer"
                        onClick={() => togglePopup(index)}
                      >
                        {token.image ? (
                          <img
                            src={token.image}
                            alt={token.symbol}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              const target = e.target as HTMLImageElement
                              target.style.display = 'none'
                              target.nextElementSibling?.classList.remove('hidden')
                            }}
                          />
                        ) : null}
                        <div className={`w-full h-full bg-gradient-to-br from-blue-500 to-cyan-500 rounded-full flex items-center justify-center ${token.image ? 'hidden' : ''}`}>
                          <span className="text-white font-bold text-xs">
                            {token.symbol.slice(0, 3).toUpperCase()}
                          </span>
                        </div>
                      </div>

                      {/* Popup Menu */}
                      {popupIndex === index && (
                        <div
                          ref={popupRef}
                          className="absolute z-50 top-12 left-0 w-48 bg-gray-900 border border-gray-700 rounded-xl shadow-lg p-2 space-y-1"
                        >
                          <button
                            onClick={() => handleSwap(token)}
                            className="block w-full text-left px-3 py-2 text-sm text-white hover:bg-purple-700 rounded-md"
                            aria-label={`Swap ${token.symbol} via Jupiter`}
                          >
                            Swap via Jupiter
                          </button>
                          <button
                            onClick={() => handleCopyMint(token.mint)}
                            className="block w-full text-left px-3 py-2 text-sm text-white hover:bg-gray-700 rounded-md"
                          >
                            Copy Mint Address
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1 truncate">
                      <div className="text-white truncate">{token.name}</div>
                      <div className="text-sm text-gray-400 flex items-center gap-2">
                        <span>{token.symbol}</span>
                        <button
                          onClick={() => window.open(`https://solscan.io/token/${token.mint}`, '_blank')}
                          className="text-purple-400 hover:text-purple-300 transition-colors"
                        >
                          <ExternalLink className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                 
                  {/* Right Side */}
                  <div className="ml-auto text-right min-w-[6rem]">
                    <div className="font-semibold  text-white">
                      {token.amount < 1
                        ? token.amount.toFixed(Math.min(6, token.decimals))
                        : token.amount.toLocaleString(undefined, {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: Math.min(4, token.decimals)
                        })
                      }
                    </div>
                    <div className="text-sm text-gray-400 flex flex-col items-end">
                      <span>${token.value.toFixed(2)}</span>
                      {token.price > 0 && (
                        <span className="text-xs">
                          ${token.price < 0.01 ? token.price.toFixed(6) : token.price.toFixed(4)} each
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default Portfolio
