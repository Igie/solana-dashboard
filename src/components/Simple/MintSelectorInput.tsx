import React, { useState, useRef, useEffect } from 'react'
import Decimal from 'decimal.js'
import type { TokenAccount } from '../../tokenUtils'
import { useTokenAccounts } from '../../contexts/TokenAccountsContext'

type Props = {
    tokenAccounts: TokenAccount[]
    mint: string
    amount: Decimal
    onMintChange: (mint: string) => void
    onAmountChange: (amount: Decimal) => void
    onOpenDropdown: () => void
}

export const MintSelectorInput: React.FC<Props> = ({
    tokenAccounts,
    mint,
    amount,
    onMintChange,
    onAmountChange,
    onOpenDropdown,
}) => {
    const [mintInput, setMintInput] = useState(mint)

    const [amountInternalInput, setAmountInternalInput] = useState(amount.toFixed())

    const [dropdownOpen, setDropdownOpen] = useState(false)

    const { loading } = useTokenAccounts();

    const inputRef = useRef<HTMLInputElement>(null)
    const dropdownRef = useRef<HTMLDivElement>(null)

    const testDecimal = (value: string) => {
        return /^[0-9]*[.,]?[0-9]*$/.test(value)

    }

    const handleMax = () => {
        const selected = tokenAccounts.find(t => t.mint === mintInput)
        if (selected) {
            const maxValue = new Decimal(selected.amount.toString())
            setAmountInternalInput(maxValue.toString());
            onAmountChange(maxValue);
        }
    }

    useEffect(() => {
        if (mint !== mintInput) setMintInput(mint);
    }, [mint]);

    useEffect(() => {
        setAmountInternalInput(amount.toFixed());
    }, [amount]);

    // Handle mint input
    const handleMintChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        setMintInput(value);
        onMintChange(value);
    };

    const handleAmountInternalChange = (value: string) => {
        if (testDecimal(value)) {
            setAmountInternalInput(value);
        }
    }

    // Handle amount input (with validation)

    const handleAmountOnBlur = (value: string) => {

        if (testDecimal(value)) {
            const d = new Decimal(value);
            onAmountChange(d);
            setAmountInternalInput(d.toFixed());
        }
    };

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (
                dropdownRef.current &&
                !dropdownRef.current.contains(e.target as Node) &&
                inputRef.current &&
                !inputRef.current.contains(e.target as Node)
            ) {
                setDropdownOpen(false)
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [amountInternalInput, mintInput])
    const selectedTokenAccount = tokenAccounts.find(x => x.mint === mintInput);

    return (
        <div className="relative w-full max-w-full p-1 bg-gray-900 rounded-md text-white space-y-1 border border-gray-700">

            {/* Mint Selector */}
            <div className="flex items-center justify-between gap-1">
                <div className="relative">
                    <button
                        className="flex items-center gap-1 px-1 py-1 bg-gray-800 rounded-md hover:bg-gray-700 max-w-full truncate"
                        onMouseUp={() => {
                            if (!dropdownOpen && onOpenDropdown) {
                                onOpenDropdown()
                            }
                            setDropdownOpen(!dropdownOpen)
                        }}
                    >
                        {selectedTokenAccount ? (
                            <>
                                <img src={selectedTokenAccount.image} alt="" className="w-4 h-4 rounded-full" />
                                <span className="text-xs truncate">{selectedTokenAccount.symbol}</span>
                            </>
                        ) : (
                            <span className="text-xs truncate">Select</span>
                        )}
                    </button>

                    {dropdownOpen && (
                        <div
                            ref={dropdownRef}
                            className="absolute left-0 z-10 mt-1 bg-gray-800 border border-gray-700 rounded-md shadow-lg 
                                        max-h-60 overflow-y-auto w-64 max-w-[calc(100vw-2rem)]"
                        >

                            {loading ? (
                                <div className="p-2 text-sm text-center">Loading...</div>
                            ) : tokenAccounts.length === 0 ? (
                                <div className="p-2 text-sm text-center">No tokens</div>
                            ) : (
                                tokenAccounts
                                    .sort((a, b) => b.amount * b.price - a.amount * a.price)
                                    .map((account) => {
                                        if (!account) return null;
                                        return (
                                            <button
                                                key={account.mint}
                                                className="w-full flex items-start px-3 py-1 hover:bg-gray-700 text-sm gap-3 text-left"
                                                onClick={() => {
                                                    setMintInput(account.mint);
                                                    onMintChange(account.mint);
                                                    setDropdownOpen(false);
                                                }}
                                            >
                                                {/* Left side: icon + name + amount */}
                                                <div className="flex flex-col items-start gap-0.5 min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        {account.image && (
                                                            <img
                                                                src={account.image}
                                                                alt=""
                                                                className="w-4 h-4 rounded-full flex-shrink-0"
                                                            />
                                                        )}
                                                        <span className="text-xs truncate">
                                                            {account.symbol || account.mint.slice(0, 4) + '...'}
                                                        </span>
                                                    </div>
                                                    <div className="text-xs text-gray-400">
                                                        {account.amount.toFixed(2)}
                                                    </div>
                                                </div>

                                                {/* Right side: total value */}
                                                <div className="ml-auto text-xs text-gray-300 whitespace-nowrap">
                                                    ${(account.amount * account.price).toFixed(2)}
                                                </div>
                                            </button>
                                        );
                                    })
                            )}
                        </div>
                    )}
                </div>

                <input
                    type="text"
                    placeholder="Paste mint address"
                    className="flex-1 min-w-0 px-2 py-1 bg-gray-800 rounded-md text-xs outline-none overflow-hidden"
                    value={mintInput}
                    onChange={handleMintChange}
                />
            </div>

            {/* Amount Input */}
            <div className="flex items-center justify-start gap-1">
                <button
                    className="gap-2 px-2 min-w-10 py-1 text-xs bg-gray-700 rounded-md hover:bg-gray-600 overflow-hidden"
                    onClick={handleMax}
                    disabled={!mintInput}
                >
                    Max
                </button>

                <input
                    type="number"
                    min="0"
                    step="any"
                    className="flex-1 min-w-0 px-2 py-1 bg-gray-800 rounded-md text-xs outline-none overflow-hidden"
                    placeholder="0.0"
                    value={amountInternalInput}
                    onChange={(e) => handleAmountInternalChange(e.target.value)}
                    onBlur={(e) => handleAmountOnBlur(e.target.value)}
                />

            </div>
        </div>
    )
}