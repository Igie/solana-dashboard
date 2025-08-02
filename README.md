App that helps you to manage, create and close DAMMv2 positions, browse and create new pools with custom scheduler, claim fees and such.
Currently only Phantom wallet is fully supported. Warnings during transactions are false positive, as this is a new dApp. Solflare is partially supported, as Claim Fee does not work and I have no idea why.

Usage: go to https://solana-dashboard-two.vercel.app/ connect your wallet, and do whatever app allows.
To see 20 recently created pools, go to Pool Creator or Browser and click on refresh button. This also adds some lag on the UI due to heavy method use, though this cannot be replaced and is implemented that way by cp-amm-sdk.

Note: This currently uses free Helius RPC, so it might work bad if there are many users connected at the same time. Future plans to upgrade RPC, if userbase expands.

I am still new to this and await your suggestions.
