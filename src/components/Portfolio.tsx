import React, { useState, useEffect, useRef } from 'react'

import { LAMPORTS_PER_SOL, VersionedTransaction } from '@solana/web3.js'

import { Coins, RefreshCw, Wallet, ExternalLink, CheckCircle, XCircle } from 'lucide-react'
import { type TokenAccount } from '../tokenUtils'
import { useTokenAccounts } from '../contexts/TokenAccountsContext'
import { UnifiedWalletButton, useConnection, useWallet } from '@jup-ag/wallet-adapter'
import { toast } from 'sonner'
import { getQuote, getSwapTransactionVersioned } from '../JupSwapApi'
import { useTransactionManager } from '../contexts/TransactionManagerContext'
import { txToast } from './Simple/TxToast'
import { TOKEN_PROGRAM_ID } from '@solana/spl-token'
import Decimal from "decimal.js"
import { useSettings } from '../contexts/SettingsContext'


const Portfolio: React.FC = () => {
  const { jupSlippage, includeDammv2Route } = useSettings();
  const { connection } = useConnection()
  const { publicKey, connected } = useWallet()
  const { sendTxn, sendMultiTxn } = useTransactionManager();

  const [solBalance, setSolBalance] = useState<number | null>(null)
  const { tokenAccounts, refreshTokenAccounts } = useTokenAccounts()
  const [loading, setLoading] = useState(false)
  const [popupIndex, setPopupIndex] = useState<number | null>(null)
  const popupRef = useRef<HTMLDivElement | null>(null)

  const [selectedAccounts, setSelectedAccounts] = useState<Set<TokenAccount>>(new Set());
  const [lastSelectedAccount, setLastSelectedAccount] = useState<TokenAccount | null>(null);

  // Fetch all portfolio data
  const fetchPortfolioData = async () => {
    setLoading(true)
    try {
      const balance = await connection.getBalance(publicKey!)

      setSolBalance(balance / LAMPORTS_PER_SOL)

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
    setPopupIndex(null);
    window.Jupiter.init({
      formProps: {
        initialInputMint: ta.mint,
        initialOutputMint: 'So11111111111111111111111111111111111111112',
        initialAmount: (ta.amount.mul(Decimal.pow(10, ta.decimals))).toFixed(0),
        swapMode: 'ExactIn',
      },

    });

    window.Jupiter.onSuccess = async () => {
      await fetchPortfolioData();
    }
  }

  const getSwapToSolTx = async (ta: TokenAccount) => {
    try {
      const quote = await getQuote({
        inputMint: ta.mint,
        outputMint: 'So11111111111111111111111111111111111111112',
        amount: ta.amount.mul(Decimal.pow(10, ta.decimals)),
        slippageBps: jupSlippage ? jupSlippage * 100 : 200,
      excludeDexes: includeDammv2Route ? [] : ['Meteora DAMM v2'],
      }, false)

      const txn = await getSwapTransactionVersioned(quote, publicKey!);
      return txn;
    } catch {
      return null;
    }
  }

  const handleSwapToSol = async (ta: TokenAccount) => {
    const quote = await getQuote({
      inputMint: ta.mint,
      outputMint: 'So11111111111111111111111111111111111111112',
      amount: ta.amount.mul(Decimal.pow(10, ta.decimals)),
      slippageBps: jupSlippage ? jupSlippage * 100 : 200,
      excludeDexes: includeDammv2Route ? [] : ['Meteora DAMM v2'],
    })

    const txn = await getSwapTransactionVersioned(quote, publicKey!);

    await sendTxn(txn, undefined, {
      notify: true,
      onError: () => {
        txToast.error("Swap failed");
      },
      onSuccess: async (x) => {
        setPopupIndex(null);
        txToast.success("Swap successful", x);
        await refreshTokenAccounts();
      }
    });
  }

  // const getMultiBurnAndCloseTokenAccountTx = async (tas: TokenAccount[]) => {
  //   const txns = [];
  //   let tx = new Transaction();
  //   tx.feePayer = publicKey!
  //   let count = 0;

  //   for (const ta of tas) {
  //     try {
  //       const mintPubKey = new PublicKey(ta.mint);
  //       let tokenProgram = null;
  //       try {
  //       tokenProgram = new PublicKey(ta.tokenProgram);
  //       } catch(e){
  //         console.log(ta);
  //         continue;
  //       }

  //       if (!tokenProgram) continue;

  //       const ataPubKey = getAssociatedTokenAddressSync(mintPubKey, publicKey!, false, tokenProgram);
  //       if (ta.amount.greaterThan(0)) {
  //         const burnIx = createBurnCheckedInstruction(
  //           ataPubKey,
  //           mintPubKey,
  //           publicKey!,
  //           BigInt(ta.amount.mul(Decimal.pow(10, ta.decimals)).toString()),
  //           ta.decimals,
  //           [],
  //           tokenProgram
  //         );
  //         tx.add(burnIx);
  //         tx.signatures.length
  //       }

  //       const closeAccountIx = createCloseAccountInstruction(
  //         ataPubKey,
  //         publicKey!,
  //         publicKey!,
  //         [],
  //         tokenProgram
  //       )
  //       tx.add(closeAccountIx);
  //       count++;

  //       if (count > 10) {
  //         count = 0;

  //         try {
  //           const simulated = await connection.simulateTransaction(tx);
  //           if (!simulated.value.err) {
  //             console.log(simulated);
  //             const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({
  //               units: simulated.value.unitsConsumed! * 1.2,
  //             });

  //             const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({
  //               microLamports: 1000000,
  //             });
  //             const txFinal = new Transaction();
  //             txFinal.add(modifyComputeUnits, addPriorityFee, ...tx.instructions);
  //             txns.push(txFinal);
  //           }
  //         } catch (e) {
  //           console.log(ta);
  //           console.log(e);
  //         };

  //         tx.instructions.splice(0);

  //       }
  //     } catch (e) { console.log(e) };
  //   }

  //   try {
  //     const simulated = await connection.simulateTransaction(tx);
  //     if (!simulated.value.err) {
  //       console.log(simulated);
  //       const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({
  //         units: simulated.value.unitsConsumed! * 1.2,
  //       });

  //       const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({
  //         microLamports: 1000000,
  //       });
  //       const txFinal = new Transaction();
  //       txFinal.add(modifyComputeUnits, addPriorityFee, ...tx.instructions);
  //       txns.push(txFinal);
  //     }
  //   } catch (e) { console.log(e) };

  //   return txns;
  // }

  const handleCopyMint = async (mint: string) => {
    await navigator.clipboard.writeText(mint)
    setPopupIndex(null)
  }

  // Fetch data when wallet connects
  useEffect(() => {
    setSelectedAccounts(new Set());
    if (connected && publicKey) {
      fetchPortfolioData()
    }
  }, [connection, publicKey])

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
    <div className="flex flex-col h-[calc(100vh-140px)] lg:h-[calc(100vh-75px)] space-y-2 px-2 md:px-0">
      {/* Portfolio Overview */}
      <div className="grid grid-cols-2 gap-1">
        <div className="bg-gradient-to-br from-green-900/30 to-green-800/20 border border-green-700/50 rounded-2xl p-2">
          <div className="flex items-center justify-between mb-1">
            <h3 className="font-semibold text-green-300">SOL Balance</h3>
            <Coins className="w-5 h-5 text-green-400" />
          </div>
          <div className="sm:text-3xl font-bold text-white">
            {solBalance ? solBalance.toFixed(4) : '0.0000'}
          </div>
        </div>
        <div className="bg-gradient-to-br from-blue-900/30 to-blue-800/20 border border-blue-700/50 rounded-2xl p-2">
          <div className="flex items-center justify-between mb-1">
            <h3 className="font-semibold text-blue-300">Token Types</h3>
            <Coins className="w-5 h-5 text-blue-400" />
          </div>
          <div className="sm:text-3xl font-bold text-white">
            {tokenAccounts.length}
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between">
        <button
          onClick={async () => {
            await fetchPortfolioData();
            setSelectedAccounts(new Set());
          }}
          disabled={loading}
          className="flex items-center gap-1 px-2 py-1 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-800 rounded-lg font-medium transition-colors"
        >
          {loading ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
          Refresh
        </button>
      </div>
      <div className="bg-green-900/20 border border-green-700/50 rounded-xl p-1">
        <div className="sm:flex-row items-start sm:items-center justify-between gap-1">

          <div className="flex justify-between px-2 w-full sm:w-auto">
            <button
              className="bg-blue-600 hover:bg-blue-500 px-4 py-1 rounded text-white flex-1 sm:flex-none"
              onClick={async () => {
                const selectedAccountsTemp = [...selectedAccounts];

                const txns: VersionedTransaction[] = [];
                for (const pos of selectedAccountsTemp) {
                  const txn = await getSwapToSolTx(pos)
                  if (txn)
                    txns.push(txn);
                }
                if (txns.length == 0) {
                  txToast.error("Did not get quote for any mint!")
                  return;
                }


                if (txns.length > 0) {
                  setSelectedAccounts(new Set());
                  await sendMultiTxn(txns.map(x => {
                    return {
                      tx: x,
                    }
                  }), {
                    onSuccess: async () => {
                      await refreshTokenAccounts();
                    }
                  })
                }
              }
              }
            >
              Swap All to SOL ({selectedAccounts.size})
            </button>
            {/* <button
              className="bg-purple-600 hover:bg-purple-500 px-4 py-1 rounded text-white flex-1 sm:flex-none"
              onClick={async () => {
                const selectedAccountsTemp = [...selectedAccounts];
                const txns: Transaction[] = await getMultiBurnAndCloseTokenAccountTx(selectedAccountsTemp)

                if (txns.length > 0)
                  await sendMultiTxn(txns.map(x => {
                    return {
                      tx: x,
                    }
                  }), {
                    onSuccess: async () => {
                      setSelectedAccounts(new Set());
                      await refreshTokenAccounts();
                    }
                  })
              }}
            >
              Burn All ({selectedAccounts.size})
            </button> */}

          </div>
        </div>
      </div>
      {/* Token Holdings */}
      <div className="flex flex-col bg-gray-900 border border-gray-700 rounded-2xl flex-1 min-h-0">
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
          <div className="flex flex-col h-full overflow-hidden">
            <div className="flex-1 overflow-y-auto divide-y divide-gray-700">
              {/* Token Entries */}
              {tokenAccounts.map((tokenAccount, index) => (
                <div
                  key={index}
                  className="p-1 hover:bg-gray-800/50 transition-colors"
                >
                  <div className="flex items-center">
                    {/* Left Side */}
                    <div className="flex items-center space-x-1 min-w-[10rem] flex-shrink-0">
                      <input
                        type="checkbox"
                        className="scale-125 accent-purple-600"
                        checked={selectedAccounts.has(tokenAccount)}
                        onChange={(e) => {
                          if (lastSelectedAccount !== null && (e.nativeEvent as MouseEvent).shiftKey) {
                            const index1 = tokenAccounts.indexOf(tokenAccount);
                            const index2 = tokenAccounts.indexOf(lastSelectedAccount);
                            const addedRange = tokenAccounts.slice(Math.min(index1, index2), Math.max(index1, index2) + 1);
                            setSelectedAccounts(new Set([...selectedAccounts, ...addedRange]));
                            setLastSelectedAccount(tokenAccount);
                            return;
                          }
                          setLastSelectedAccount(tokenAccount);
                          if (e.target.checked) {
                            setSelectedAccounts(new Set(selectedAccounts.add(tokenAccount)));
                          }
                          if (!e.target.checked) {
                            setSelectedAccounts(new Set<TokenAccount>(Array.from(selectedAccounts).filter(x => x !== tokenAccount)));
                          }
                        }}
                      />
                      <div className="relative w-10 h-10">
                        <div
                          className="relative w-10 h-10 rounded-full bg-gray-700 cursor-pointer"
                          onClick={() => togglePopup(index)}
                        >
                          {/* Token image */}
                          {tokenAccount.image ? (
                            <img
                              src={tokenAccount.image}
                              alt={tokenAccount.symbol}
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                const target = e.target as HTMLImageElement;
                                target.style.display = "none";
                                target.nextElementSibling?.classList.remove("hidden");
                              }}
                            />
                          ) : null}

                          {/* Fallback symbol circle */}
                          <div
                            className={`w-full h-full bg-gradient-to-br from-blue-500 to-cyan-500 rounded-full flex items-center justify-center ${tokenAccount.image ? "hidden" : ""
                              }`}
                          >
                            <span className="text-white font-bold text-xs">
                              {tokenAccount.symbol.slice(0, 3).toUpperCase()}
                            </span>
                          </div>

                          {/* Verification badge */}
                          <div className="absolute -bottom-1 -right-1 bg-gray-900 rounded-full p-[2px] shadow-md">
                            {tokenAccount.isVerified ? (
                              <CheckCircle className="w-3 h-3 text-blue-500" />
                            ) : (
                              <XCircle className="w-3 h-3 text-red-500" />
                            )}
                          </div>
                        </div>

                        {/* Popup Menu */}
                        {popupIndex === index && (
                          <div
                            ref={popupRef}
                            className="absolute z-50 top-12 left-0 w-48 bg-gray-900 border border-gray-700 rounded-xl shadow-lg p-2 space-y-1"
                          >
                            <button
                              onClick={() => handleSwap(tokenAccount)}
                              className="block w-full text-left px-3 py-2 text-sm text-white hover:bg-purple-700 rounded-md"
                              aria-label={`Swap ${tokenAccount.symbol} via Jupiter`}
                            >
                              Swap via Jupiter
                            </button>

                            <button
                              onClick={() => handleSwapToSol(tokenAccount)}
                              className="block w-full text-left px-3 py-2 text-sm text-white hover:bg-purple-700 rounded-md"
                            >
                              Swap all to SOL
                            </button>
                            <button
                              onClick={() => handleCopyMint(tokenAccount.mint)}
                              className="block w-full text-left px-3 py-2 text-sm text-white hover:bg-gray-700 rounded-md"
                            >
                              Copy Mint Address
                            </button>
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1 truncate">
                        <div className="text-white truncate">{tokenAccount.name}</div>
                        <div className="text-sm text-gray-400 flex items-center gap-2">
                          <span>{tokenAccount.symbol}</span>
                          <button
                            onClick={() => window.open(`https://solscan.io/token/${tokenAccount.mint}`, '_blank')}
                            className="text-purple-400 hover:text-purple-300 transition-colors"
                          >
                            <ExternalLink className="w-3 h-3" />
                          </button>
                          <span>{tokenAccount.tokenProgram == TOKEN_PROGRAM_ID.toBase58() ? "TOKEN" : "2022"}</span>
                        </div>
                      </div>
                    </div>

                    {/* Right Side */}
                    <div className="ml-auto text-right min-w-[6rem]">
                      <div className="font-semibold  text-white">
                        {tokenAccount.amount.lessThan(1)
                          ? tokenAccount.amount.toFixed(Math.min(6, tokenAccount.decimals))
                          : tokenAccount.amount.toNumber().toLocaleString(undefined, {
                            minimumFractionDigits: 0,
                            maximumFractionDigits: Math.min(4, tokenAccount.decimals)
                          })
                        }
                      </div>
                      <div className="text-sm text-gray-400 flex flex-col items-end">
                        <span>${tokenAccount.value.toFixed(2)}</span>

                        {tokenAccount.price && tokenAccount.price.greaterThan(0) && (
                          <span className="text-xs">
                            ${tokenAccount.price.lessThan(0.01) ? tokenAccount.price.toFixed(6) : tokenAccount.price.toFixed(4)} each
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default Portfolio
