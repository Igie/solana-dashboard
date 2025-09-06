import React, { useState } from 'react';
import { ConnectionProvider, UnifiedWalletProvider } from '@jup-ag/wallet-adapter';
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { Toaster } from 'sonner';
import { tabs } from './config/tabs';
import { AppLayout } from './components/layout/AppLayout';
import { DEVNET_HELIUS_RPC, MAINNET_HELIUS_RPC } from './constants';
import { TransactionManagerProvider } from './contexts/TransactionManagerContext';
import { TokenAccountsProvider } from './contexts/TokenAccountsContext';
import { DammUserPositionsProvider } from './contexts/DammUserPositionsContext';
import { CpAmmProvider } from './contexts/CpAmmContext';

const GlobalProviders = ({ children }: { children: React.ReactNode }) => (

  <TransactionManagerProvider>

    <TokenAccountsProvider>
      <CpAmmProvider>
        <DammUserPositionsProvider>
          {children}
        </DammUserPositionsProvider>
      </CpAmmProvider>
    </TokenAccountsProvider>
  </TransactionManagerProvider>
)

function App() {
  const [network, setNetwork] = useState<'mainnet' | 'devnet'>('mainnet');
  const endpoint = network === 'mainnet' ? MAINNET_HELIUS_RPC : DEVNET_HELIUS_RPC;
  const [activeTab, setActiveTab] = useState('dashboard');

  const ActiveComponent = tabs.find(t => t.id === activeTab)?.component || tabs[0].component;

  const handleSwapClick = () => window.Jupiter.init({ displayMode: 'modal' });

  return (
    <ConnectionProvider endpoint={endpoint} config={{ commitment: 'confirmed' }}>
      <UnifiedWalletProvider
        wallets={[new PhantomWalletAdapter(), new SolflareWalletAdapter()]}
        config={{
          autoConnect: true,
          env: "mainnet-beta",
          metadata: {
            name: "DAMMv2 Dashboard",
            description: "Tool to help with your DAMMv2 life on Meteora",
            url: "https://www.dammv2.me/",
            iconUrls: ["http://dammv2.me/favicon.ico"],
          },
          walletlistExplanation: {
            href: "https://station.jup.ag/docs/additional-topics/wallet-list",
          },
          theme: "dark",
          lang: "en",
        }}
      >
        <WalletModalProvider>
          <GlobalProviders>
            <Toaster position="bottom-right" richColors theme="dark" />
            <AppLayout
              activeTab={activeTab}
              setActiveTab={setActiveTab}
              network={network}
              setNetwork={setNetwork}
              onSwap={handleSwapClick}
            >
              <ActiveComponent />
            </AppLayout>
          </GlobalProviders>
        </WalletModalProvider>
      </UnifiedWalletProvider>
    </ConnectionProvider>
  );
}

export default App;
