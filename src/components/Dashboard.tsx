import React from 'react'
import { UnifiedWalletButton, useWallet } from '@jup-ag/wallet-adapter'
import { useSettings } from '../contexts/SettingsContext'
import { DecimalInput } from './Simple/DecimalInput'
import Decimal from 'decimal.js'

const Dashboard: React.FC = () => {
  const {
    jupSlippage, setJupSlippage,
    includeDammv2Route, setIncludeDammv2Route,
    swapSolDefaultAmount, setSwapSolDefaultAmount,
    devFee, setDevFee
  } = useSettings()
  const { connected } = useWallet()

  return (
    <div className="space-y-2">
      {/* Wallet Connection */}
      <div className="bg-gray-900 border border-gray-700 rounded p-2">
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
      {/* Settings */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <div className="bg-gray-900 border border-gray-700 rounded p-2">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">Jupiter Route Settings</h3>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <label className="w-28 text-white md:text-xs">Slippage</label>
              <div>
                <DecimalInput className="w-14 bg-gray-800 border border-gray-700 rounded-md px-2 text-white md:text-xs placeholder-gray-500"
                  value={jupSlippage?.toString() || ""}
                  onChange={() => { }}
                  onBlur={
                    (v) => {
                      if (v.greaterThan(100)) v = new Decimal(100);
                      setJupSlippage(parseFloat(v.toFixed(2)));
                    }}
                />
                <span className="text-gray-400 px-1 md:text-xs">%</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <label className="w-28 text-green-100 md:text-xs">Include DAMM v2</label>
              <input
                type="checkbox"
                checked={includeDammv2Route}
                onChange={(e) => {
                  setIncludeDammv2Route(e.target.checked);
                }}
                className="h-4 w-4 accent-purple-600"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="w-28 text-white md:text-xs">SOL Swap Default Amount</label>
              <div>
                <DecimalInput className="w-14 bg-gray-800 border border-gray-700 rounded-md px-2 text-white md:text-xs placeholder-gray-500"
                  value={swapSolDefaultAmount?.toString() || ""}
                  onChange={() => { }}
                  onBlur={
                    (v) => {
                      setSwapSolDefaultAmount(parseFloat(v.toFixed(6)));
                    }}
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <label className="w-28 text-white md:text-xs">Developer Fee</label>
              <div>
                <DecimalInput className="w-14 bg-gray-800 border border-gray-700 rounded-md px-2 text-white md:text-xs placeholder-gray-500"
                  value={devFee?.toFixed(2) || ""}
                  onChange={() => { }}
                  onBlur={
                    (v) => {
                      if (v.greaterThan(2.55)) v = new Decimal(2.55);
                      if (v.lessThan(0.5)) v = new Decimal(0);
                      setDevFee(parseFloat(v.toFixed(2)));
                    }}
                />
                <span className="text-gray-400 px-1 md:text-xs">%</span>
              </div>
            </div>
          </div>


        </div>
      </div>
    </div>
  )
}
export default Dashboard