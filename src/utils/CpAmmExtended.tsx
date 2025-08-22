import { derivePoolAuthority, getOrCreateATAInstruction, getTokenProgram, unwrapSOLInstruction, type BuildLiquidatePositionInstructionParams, type BuildRemoveAllLiquidityInstructionParams, type ClaimPositionFeeInstructionParams, type ClosePositionInstructionParams, type CpAmm, type PrepareTokenAccountParams, type RefreshVestingParams, type RemoveAllLiquidityAndClosePositionParams, type TxBuilder } from "@meteora-ag/cp-amm-sdk";
import { NATIVE_MINT, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { Transaction, type PublicKey, type TransactionInstruction } from "@solana/web3.js";

export class CpAmmExtended {
    private cpAmm: CpAmm;
    private poolAuthority: PublicKey;
    constructor(cpAmm: CpAmm) {
        this.cpAmm = cpAmm;
        this.poolAuthority = derivePoolAuthority();
    }

    async removeAllLiquidityAndClosePosition(
    params: RemoveAllLiquidityAndClosePositionParams
  ): TxBuilder {
    const {
      owner,
      position,
      positionNftAccount,
      positionState,
      poolState,
      tokenAAmountThreshold,
      tokenBAmountThreshold,
      vestings,
      currentPoint,
    } = params;

    const { pool } = positionState;
    const { tokenAMint, tokenBMint } = poolState;

    const { canUnlock, reason } = this.cpAmm.canUnlockPosition(
      positionState,
      vestings,
      currentPoint
    );

    if (!canUnlock) {
      throw new Error(`Cannot remove liquidity: ${reason}`);
    }

    const tokenAProgram = getTokenProgram(poolState.tokenAFlag);
    const tokenBProgram = getTokenProgram(poolState.tokenBFlag);

    const {
      tokenAAta: tokenAAccount,
      tokenBAta: tokenBAccount,
      instructions: preInstructions,
    } = await this.prepareTokenAccounts({
      payer: owner,
      tokenAOwner: owner,
      tokenBOwner: owner,
      tokenAMint,
      tokenBMint,
      tokenAProgram,
      tokenBProgram,
    });

    const postInstructions: TransactionInstruction[] = [];
    if (
      [tokenAMint.toBase58(), tokenBMint.toBase58()].includes(
        NATIVE_MINT.toBase58()
      )
    ) {
      const closeWrappedSOLIx = await unwrapSOLInstruction(owner);
      closeWrappedSOLIx && postInstructions.push(closeWrappedSOLIx);
    }

    // 1. refresh vesting if vesting account provided
    if (vestings.length > 0) {
      const refreshVestingInstruction =
        await this.buildRefreshVestingInstruction({
          owner,
          position,
          positionNftAccount,
          pool,
          vestingAccounts: vestings.map((item) => item.account),
        });

      refreshVestingInstruction &&
        preInstructions.push(refreshVestingInstruction);
    }

    const transaction = new Transaction();

    if (preInstructions.length > 0) {
      transaction.add(...preInstructions);
    }

    // 2. claim fee, remove liquidity and close position
    const liquidatePositionInstructions =
      await this.buildLiquidatePositionInstruction({
        owner,
        position,
        positionNftAccount,
        positionState,
        poolState,
        tokenAAccount,
        tokenBAccount,
        tokenAAmountThreshold,
        tokenBAmountThreshold,
      });

    transaction.add(...liquidatePositionInstructions);

    if (postInstructions.length > 0) {
      transaction.add(...postInstructions);
    }

    return transaction;
  }

    public async prepareTokenAccounts(
        params: PrepareTokenAccountParams
    ): Promise<{
        tokenAAta: PublicKey;
        tokenBAta: PublicKey;
        instructions: TransactionInstruction[];
    }> {
        const {
            payer,
            tokenAOwner,
            tokenBOwner,
            tokenAMint,
            tokenBMint,
            tokenAProgram,
            tokenBProgram,
        } = params;
        const instructions: TransactionInstruction[] = [];
        const [
            { ataPubkey: tokenAAta, ix: createInputTokenAccountIx },
            { ataPubkey: tokenBAta, ix: createOutputTokenAccountIx },
        ] = await Promise.all([
            getOrCreateATAInstruction(
                this.cpAmm._program.provider.connection,
                tokenAMint,
                tokenAOwner,
                payer,
                true,
                tokenAProgram
            ),
            getOrCreateATAInstruction(
                this.cpAmm._program.provider.connection,
                tokenBMint,
                tokenBOwner,
                payer,
                true,
                tokenBProgram
            ),
        ]);
        createInputTokenAccountIx && instructions.push(createInputTokenAccountIx);
        createOutputTokenAccountIx && instructions.push(createOutputTokenAccountIx);

        return { tokenAAta, tokenBAta, instructions };
    }

    private async buildRefreshVestingInstruction(
    params: RefreshVestingParams
  ): Promise<TransactionInstruction | null> {
    const { owner, position, positionNftAccount, pool, vestingAccounts } =
      params;

    if (vestingAccounts.length == 0) {
      return null;
    }

    return await this.cpAmm._program.methods
      .refreshVesting()
      .accountsPartial({
        position,
        positionNftAccount,
        pool,
        owner,
      })
      .remainingAccounts(
        vestingAccounts.map((pubkey: PublicKey) => {
          return {
            isSigner: false,
            isWritable: true,
            pubkey,
          };
        })
      )
      .instruction();
  }

  private async buildLiquidatePositionInstruction(
    params: BuildLiquidatePositionInstructionParams
  ): Promise<TransactionInstruction[]> {
    const {
      owner,
      position,
      positionNftAccount,
      positionState,
      poolState,
      tokenAAccount,
      tokenBAccount,
      tokenAAmountThreshold,
      tokenBAmountThreshold,
    } = params;

    const { nftMint: positionNftMint, pool } = positionState;
    const { tokenAMint, tokenBMint, tokenAVault, tokenBVault } = poolState;
    const tokenAProgram = getTokenProgram(poolState.tokenAFlag);
    const tokenBProgram = getTokenProgram(poolState.tokenBFlag);

    const instructions: TransactionInstruction[] = [];

    // 1. claim position fee
    const claimPositionFeeInstruction =
      await this.buildClaimPositionFeeInstruction({
        owner,
        poolAuthority: this.poolAuthority,
        pool,
        position,
        positionNftAccount,
        tokenAAccount,
        tokenBAccount,
        tokenAVault,
        tokenBVault,
        tokenAMint,
        tokenBMint,
        tokenAProgram,
        tokenBProgram,
      });

    instructions.push(claimPositionFeeInstruction);

    // 2. remove all liquidity
    const removeAllLiquidityInstruction =
      await this.buildRemoveAllLiquidityInstruction({
        poolAuthority: this.poolAuthority,
        owner,
        pool,
        position,
        positionNftAccount,
        tokenAAccount,
        tokenBAccount,
        tokenAAmountThreshold,
        tokenBAmountThreshold,
        tokenAMint,
        tokenBMint,
        tokenAVault,
        tokenBVault,
        tokenAProgram,
        tokenBProgram,
      });
    instructions.push(removeAllLiquidityInstruction);
    // 3. close position
    const closePositionInstruction = await this.buildClosePositionInstruction({
      owner,
      poolAuthority: this.poolAuthority,
      pool,
      position,
      positionNftMint,
      positionNftAccount,
    });
    instructions.push(closePositionInstruction);

    return instructions;
  }

  private async buildClaimPositionFeeInstruction(
    params: ClaimPositionFeeInstructionParams
  ): Promise<TransactionInstruction> {
    const {
      owner,
      poolAuthority,
      pool,
      position,
      positionNftAccount,
      tokenAAccount,
      tokenBAccount,
      tokenAVault,
      tokenBVault,
      tokenAMint,
      tokenBMint,
      tokenAProgram,
      tokenBProgram,
    } = params;
    return await this.cpAmm._program.methods
      .claimPositionFee()
      .accountsPartial({
        poolAuthority,
        owner,
        pool,
        position,
        positionNftAccount,
        tokenAAccount,
        tokenBAccount,
        tokenAVault,
        tokenBVault,
        tokenAMint,
        tokenBMint,
        tokenAProgram,
        tokenBProgram,
      })
      .instruction();
  }

  private async buildClosePositionInstruction(
    params: ClosePositionInstructionParams
  ): Promise<TransactionInstruction> {
    const {
      owner,
      poolAuthority,
      pool,
      position,
      positionNftAccount,
      positionNftMint,
    } = params;

    return await this.cpAmm._program.methods
      .closePosition()
      .accountsPartial({
        positionNftMint,
        positionNftAccount,
        pool,
        position,
        poolAuthority,
        rentReceiver: owner,
        owner,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .instruction();
  }

  private async buildRemoveAllLiquidityInstruction(
    params: BuildRemoveAllLiquidityInstructionParams
  ): Promise<TransactionInstruction> {
    const {
      poolAuthority,
      owner,
      pool,
      position,
      positionNftAccount,
      tokenAAccount,
      tokenBAccount,
      tokenAAmountThreshold,
      tokenBAmountThreshold,
      tokenAMint,
      tokenBMint,
      tokenAVault,
      tokenBVault,
      tokenAProgram,
      tokenBProgram,
    } = params;
    return await this.cpAmm._program.methods
      .removeAllLiquidity(tokenAAmountThreshold, tokenBAmountThreshold)
      .accountsPartial({
        poolAuthority,
        pool,
        position,
        positionNftAccount,
        owner,
        tokenAAccount,
        tokenBAccount,
        tokenAMint,
        tokenBMint,
        tokenAVault,
        tokenBVault,
        tokenAProgram,
        tokenBProgram,
      })
      .instruction();
  }

}