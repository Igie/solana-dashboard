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
            const maxValue = new Decimal(selected.amount.toFixed())
            setAmountInternalInput(maxValue.toFixed());
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
                    value={mintInput}
                    onChange={handleMintChange}
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
                                        setMintInput(account.mint);
                                        onMintChange(account.mint);
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
                    disabled={!mintInput}
                >
                    Max
                </button>

                <input
                    type="number"
                    min="0"
                    step="any"
                    className="flex-1 gap-2 px-3 py-1 bg-gray-800 rounded-md text-sm outline-none"
                    placeholder="0.0"
                    value={amountInternalInput}
                    onChange={(e) => handleAmountInternalChange(e.target.value)}
                    onBlur={(e) => handleAmountOnBlur(e.target.value)}
                />

            </div>
        </div>
    )
}