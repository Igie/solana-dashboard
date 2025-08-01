import React, { useState, useRef, useEffect } from 'react'
import Decimal from 'decimal.js'
import type { TokenAccount } from '../../tokenUtils'
import { useTokenAccounts } from '../../contexts/TokenAccountsContext'

type Props = {
    tokenAccounts: TokenAccount[]
    mint: string
    amount: Decimal
    onChange: (data: { mint: string, amount: Decimal }) => void
    onOpenDropdown: () => void
}

export const MintSelectorInput: React.FC<Props> = ({
    tokenAccounts,
    mint: externalMint,
    amount: externalAmount,
    onChange,
    onOpenDropdown,
}) => {
    const [mint, setMint] = useState('')

    const [inputValue, setInputValue] = useState('')

    const [dropdownOpen, setDropdownOpen] = useState(false)

    const { loading } = useTokenAccounts();

    const inputRef = useRef<HTMLInputElement>(null)
    const dropdownRef = useRef<HTMLDivElement>(null)


    const handleMintChange = (newMint: string) => {
        setMint(newMint);
        onChange({ mint, amount: externalAmount })
        triggerAmountChange();
    }


    const triggerAmountChange = () => {
        const parsed = new Decimal(inputValue.replace(',', '.'))
        if (!parsed.isNaN()) {
            onChange({ mint, amount: parsed })
        }
    }

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value

        // Allow: digits, dot, comma
        if (/^[0-9]*[.,]?[0-9]*$/.test(value)) {
            setInputValue(value)
        }
    }

    const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            triggerAmountChange()
            inputRef.current?.blur()
        }
    }

    const handleMax = () => {
        const selected = tokenAccounts.find(t => t.mint === mint)
        if (selected) {
            const maxValue = new Decimal(selected.amount.toString())
            setInputValue(maxValue.toString())
            onChange({ mint, amount: maxValue })
        }
    }




    useEffect(() => {
        if (externalAmount !== undefined && externalAmount.toString() !== inputValue) {
            setInputValue(externalAmount.toString())
        }
    }, [externalAmount])

    useEffect(() => {
        if (externalMint !== mint) {
            setMint(externalMint)
        }
    }, [externalMint])

    // Reset amount to 0 when mint changes (externally or via dropdown)
    useEffect(() => {
        const amountIsZero = externalAmount?.equals?.(0)
        if (!amountIsZero) {
            setInputValue('0')
            onChange({ mint, amount: new Decimal(0) })
        } else {
            setInputValue('0')
        }
    }, [mint])

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (
                dropdownRef.current &&
                !dropdownRef.current.contains(e.target as Node) &&
                inputRef.current &&
                !inputRef.current.contains(e.target as Node)
            ) {
                setDropdownOpen(false)
                triggerAmountChange()
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [inputValue, mint])

    useEffect(() => { }, [tokenAccounts])

    const selectedTokenAccount = tokenAccounts.find(x => x.mint === mint);

    return (
        <div className="relative w-full p-2 bg-gray-900 rounded-lg text-white space-y-2 border border-gray-700">
            {/* Mint Selector */}
            <div className="flex items-center justify-between gap-2">
                <button
                    className="min-w-40 flex items-center gap-2 px-3 py-1 bg-gray-800 rounded-md hover:bg-gray-700"
                    onMouseUp={() => {
                        if (!dropdownOpen && onOpenDropdown) {
                            onOpenDropdown()
                        }
                        setDropdownOpen(!dropdownOpen)
                    }}
                >
                    {selectedTokenAccount ? (
                        <>
                            <img src={selectedTokenAccount.image} alt="" className="w-5 h-5 rounded-full" />
                            <span>{selectedTokenAccount.symbol}</span>
                        </>
                    ) : (
                        <span>Select</span>
                    )}
                </button>
                <input
                    type="text"
                    placeholder="Paste mint address"
                    className="flex-1 px-2 py-1 bg-gray-800 rounded-md text-sm outline-none"
                    value={mint}
                    onChange={e => handleMintChange(e.target.value)}
                />

            </div>

            {/* Dropdown */}
            {dropdownOpen && (
                <div
                    className="absolute z-10 mt-1 w-full bg-gray-800 border border-gray-700 rounded-md shadow-lg max-h-60 overflow-auto"
                    ref={dropdownRef}
                >
                    {loading ? (
                        <div className="p-2 text-sm text-center">Loading...</div>
                    ) : tokenAccounts.length === 0 ? (
                        <div className="p-2 text-sm text-center">No tokens</div>
                    ) : (
                        tokenAccounts.map((account) => {
                            return (
                                <button
                                    key={account.mint}
                                    className="w-full flex items-center px-3 py-2 hover:bg-gray-700 text-sm gap-2"
                                    onClick={() => {
                                        handleMintChange(account.mint)
                                        setDropdownOpen(false)
                                    }}
                                >
                                    {account?.image && <img src={account.image} alt="" className="w-4 h-4 rounded-full" />}
                                    <span>{account?.symbol || account.mint.slice(0, 4) + '...'}</span>
                                </button>
                            )
                        })
                    )}
                </div>
            )}

            {/* Amount Input */}
            <div className="flex items-center justify-between gap-2">
                <button
                    className="min-w-40 gap-2 px-3 py-1 text-xs bg-gray-700 rounded hover:bg-gray-600"
                    onClick={handleMax}
                    disabled={!mint}
                >
                    Max
                </button>

                <input
                    type="decimal"
                    min="0"
                    step="any"
                    className="flex-1 gap-2 px-3 py-1 bg-gray-800 rounded-md text-sm outline-none"
                    placeholder="0.0"
                    value={inputValue}
                    onChange={handleInputChange}
                    onBlur={() => {
                        const amount = new Decimal(inputValue || '0')
                        if (!amount.equals(externalAmount)) {
                            onChange({ mint, amount })
                        }
                    }}
                    onKeyDown={handleInputKeyDown}
                />

            </div>
        </div>
    )
}