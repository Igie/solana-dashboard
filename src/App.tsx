import React, { useEffect, useState } from 'react'
import {
  ConnectionProvider,
  UnifiedWalletProvider,
} from '@jup-ag/wallet-adapter'
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui'
import { Toaster } from 'sonner'
import { DEVNET_HELIUS_RPC, MAINNET_HELIUS_RPC } from './constants'
import { TransactionManagerProvider } from './contexts/TransactionManagerContext'
import { TokenAccountsProvider } from './contexts/TokenAccountsContext'
import { DammUserPositionsProvider } from './contexts/DammUserPositionsContext'
import { CpAmmProvider } from './contexts/CpAmmContext'
import { type Cluster } from '@solana/web3.js'
import AppInner from './AppInner'
import { SolflareWalletAdapter } from '@solana/wallet-adapter-solflare'
import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom'
import { SettingsProvider } from './contexts/SettingsContext'
import { DammV2PoolProvider } from './contexts/Dammv2PoolContext'
import { GetSlotProvider } from './contexts/GetSlotContext'
import { TokenMetadataProvider } from './contexts/TokenMetadataContext'

interface GlobalProvidersProps {
  children: React.ReactNode
}

const GlobalProviders: React.FC<GlobalProvidersProps> = ({ children }) => (
  <SettingsProvider>
    <GetSlotProvider>

      <TransactionManagerProvider>
        <CpAmmProvider>

          <TokenMetadataProvider>
            <TokenAccountsProvider>
              <DammV2PoolProvider>
                <DammUserPositionsProvider>{children}</DammUserPositionsProvider>
              </DammV2PoolProvider>

            </TokenAccountsProvider>
          </TokenMetadataProvider>

        </CpAmmProvider>
      </TransactionManagerProvider>

    </GetSlotProvider>
  </SettingsProvider>
)

const App: React.FC = () => {
  const [network, setNetwork] = useState<Cluster>('mainnet-beta')
  const endpoint =
    network === 'mainnet-beta' ? MAINNET_HELIUS_RPC : DEVNET_HELIUS_RPC

  useEffect(() => {
    console.log('App component mounted')
  }, [])

  return (
    <ConnectionProvider endpoint={endpoint} config={{ commitment: 'confirmed' }}>
      <UnifiedWalletProvider
        wallets={[new PhantomWalletAdapter, new SolflareWalletAdapter]}
        config={{
          autoConnect: true,
          env: network,
          metadata: {
            name: 'DAMMv2',
            description: 'Tool to help with your DAMMv2 life on Meteora',
            url: 'https://www.dammv2.me/',
            iconUrls: ['http://dammv2.me/favicon.ico'],
          },
          walletlistExplanation: {
            href: 'https://station.jup.ag/docs/additional-topics/wallet-list',
          },
          theme: 'dark',
          lang: 'en',
        }}
      >
        <WalletModalProvider>
          <GlobalProviders>
            <Toaster position="bottom-right" richColors theme="dark" />

            <AppInner
              network={network}
              setNetwork={setNetwork}
            />
          </GlobalProviders>
        </WalletModalProvider>
      </UnifiedWalletProvider>
    </ConnectionProvider>
  )
}

export default App
