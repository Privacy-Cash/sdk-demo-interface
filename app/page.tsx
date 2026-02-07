'use client';
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import ConnectButton from "./components/ConnectButton";
import TokenSelector from "./components/TokenSelector";
import { deposit, depositSPL, EncryptionService, getBalanceFromUtxos, getBalanceFromUtxosSPL, getUtxos, getUtxosSPL, setLogger, tokens, withdraw, withdrawSPL } from "privacycash/utils";
import { useEffect, useState } from "react";
import { LAMPORTS_PER_SOL, PublicKey, VersionedTransaction } from "@solana/web3.js";

export default function Home() {
  const [liveToken, setLiveToken] = useState('sol')
  const token = tokens.find(t => t.name.toLowerCase() === liveToken)!;
  const { publicKey, signMessage, signTransaction } = useWallet()
  const [signedSignature, setSignedSignature] = useState<Uint8Array | null>(null);
  const { connection } = useConnection()
  const [isUpdatingBalance, setIsUpdatingBalance] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [hasher, setHasher] = useState<any>(null);
  const [depositTx, setDepositTx] = useState<string | null>(null);

  const [depositAmount, setDepositAmount] = useState<number>(0);
  const [withdrawAmount, setWithdrawAmount] = useState<number>(0);
  const [withdrawTx, setWithdrawTx] = useState<string | null>(null);
  const [isTrading, setIsTrading] = useState<boolean>(false);
  const [withdrawRecipient, setWithdrawRecipient] = useState<string>('');

  // set up logger
  useEffect(() => {
    setLogger((level, message) => {
      if (level == 'info') {
        setStatus(message)
      }
      const prefix = `[${level.toUpperCase()}]`;
      console.log(prefix, message);
    })
  }, []);

  useEffect(() => {
    (async () => {
      const { WasmFactory } = await import('@lightprotocol/hasher.rs');
      const lightWasm = await WasmFactory.getInstance()
      setHasher(lightWasm)
    })()
  }, []);

  useEffect(() => {
    // reset balance when token changes
    setBalance(null);
  }, [liveToken]);

  // set signedSignature when publicKey changes if we have it cached
  useEffect(() => {
    if (!publicKey) {
      setSignedSignature(null);
      return;
    }
    const cachedSigHex = localStorage.getItem('sig-' + publicKey.toString());
    if (cachedSigHex) {
      const sigBytes = Uint8Array.from(Buffer.from(cachedSigHex, 'hex'));
      setSignedSignature(sigBytes);
    } else {
      signPrivacyCash();
    }
  }, [publicKey]);

  let signPrivacyCash = async () => {
    if (!signMessage || !publicKey) {
      throw new Error('Wallet not connected');
    }
    const encodedMessage = new TextEncoder().encode(`Privacy Money account sign in`)

    // ask for sign
    let signature: Uint8Array
    try {
      signature = await signMessage(encodedMessage)
      setSignedSignature(signature);
      // cache signature in localstorage
      localStorage.setItem('sig-' + publicKey.toString(), Buffer.from(signature).toString('hex'));
    } catch (err: any) {
      if (err instanceof Error && err.message?.toLowerCase().includes('user rejected')) {
        throw new Error('User rejected the signature request')
      }
      throw new Error('Failed to sign message: ' + err.message)
    }

  }

  const updateBalance = async () => {
    if (!publicKey || !signedSignature) {
      return;
    }
    setIsUpdatingBalance(true);
    let encryptionService = new EncryptionService();
    encryptionService.deriveEncryptionKeyFromSignature(signedSignature);
    let newUtxo = 0

    // set UTXO offset to avoid fetching too many UTXOs on first fetch. 
    let firstTimeFetchNumber = 60_000
    let offset = await getUtxoOffset(firstTimeFetchNumber, token.name.toLowerCase());
    console.log('Using UTXO offset:', offset);
    try {
      if (token.name.toLowerCase() == 'sol') {
        const myValidUtxos = await getUtxos({
          connection,
          publicKey,
          storage: localStorage,
          encryptionService,
          offset
        });
        newUtxo = getBalanceFromUtxos(myValidUtxos).lamports / LAMPORTS_PER_SOL
      } else {
        const myValidUtxosSPL = await getUtxosSPL({
          connection,
          publicKey,
          storage: localStorage,
          encryptionService,
          mintAddress: token.pubkey,
          offset
        });
        newUtxo = getBalanceFromUtxosSPL(myValidUtxosSPL).base_units / token.units_per_token
      }
      setBalance(newUtxo)
    } finally {
      setIsUpdatingBalance(false);
      setStatus(null);
    }
  }

  const handleDeposit = async () => {
    if (!publicKey || depositAmount <= 0 || !signTransaction || !signedSignature || !hasher) {
      return;
    }
    setStatus('Depositing..');
    setIsTrading(true);
    try {
      let encryptionService = new EncryptionService();
      encryptionService.deriveEncryptionKeyFromSignature(signedSignature);
      if (token.name.toLowerCase() == 'sol') {
        let res = await deposit({
          // referrer: referrer ? referrer : '',
          lightWasm: hasher,
          connection,
          amount_in_lamports: depositAmount * 1_000_000_000,
          keyBasePath: '/circuit2',
          publicKey: publicKey,
          transactionSigner: async (tx: VersionedTransaction) => {
            // let user sign the tx
            return await signTransaction(tx)
          },
          storage: localStorage,
          encryptionService
        })
        setDepositTx(res.tx);
      } else {
        let res = await depositSPL({
          lightWasm: hasher,
          connection,
          base_units: depositAmount * token.units_per_token,
          keyBasePath: '/circuit2',
          publicKey: publicKey,
          transactionSigner: async (tx: VersionedTransaction) => {
            // let user sign the tx
            return await signTransaction(tx)
          },
          storage: localStorage,
          encryptionService,
          mintAddress: token.pubkey,
        })
        setDepositTx(res.tx);
      }
    } finally {
      setStatus(null);
      setIsTrading(false);
      // update balance after deposit
      try {
        await updateBalance();
      } catch (e) {
        console.error('Failed to update balance after deposit', e);
      }
    }
  }

  const handleWithdraw = async () => {
    if (!publicKey || withdrawAmount <= 0 || !signTransaction || !signedSignature || !hasher || !withdrawRecipient) {
      return;
    }
    setStatus('Withdrawing..');
    setIsTrading(true);
    try {
      let encryptionService = new EncryptionService();
      encryptionService.deriveEncryptionKeyFromSignature(signedSignature);
      if (token.name.toLowerCase() == 'sol') {
        let res = await withdraw({
          // referrer: referrer ? referrer : '',
          lightWasm: hasher,
          connection,
          amount_in_lamports: withdrawAmount * 1_000_000_000,
          keyBasePath: '/circuit2',
          publicKey: publicKey,
          storage: localStorage,
          encryptionService,
          recipient: new PublicKey(withdrawRecipient),
        })
        setWithdrawTx(res.tx);
      } else {
        let res = await withdrawSPL({
          lightWasm: hasher,
          connection,
          base_units: withdrawAmount * token.units_per_token,
          keyBasePath: '/circuit2',
          publicKey: publicKey,
          storage: localStorage,
          encryptionService,
          recipient: new PublicKey(withdrawRecipient),
          mintAddress: token.pubkey,
        })
        setWithdrawTx(res.tx);
      }
    } finally {
      setStatus(null);
      setIsTrading(false);
      // update balance after withdraw
      try {
        await updateBalance();
      } catch (e) {
        console.error('Failed to update balance after withdraw', e);
      }
    }
  }

  return (
    <div style={{ maxWidth: 600, margin: '10px auto', display: 'flex', flexDirection: 'column', gap: '20px', position: 'relative' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, backgroundColor: 'var(--background)', padding: '10px 0', zIndex: 10 }}>
        <div>
          <div>PrivacyCash Example</div>
          <div style={{ color: '#999' }}>{status}</div>
        </div>
        <ConnectButton onDisconnected={() => {
          setSignedSignature(null)
        }} />
      </div>



      <div>{publicKey && signedSignature == null && <button onClick={() => signPrivacyCash()}>Sign PrivacyCash</button>}</div>
      <h3>Token</h3>
      <div style={{ display: 'flex', gap: 10 }}>
        <TokenSelector tokens={tokens} liveToken={liveToken} setLiveToken={setLiveToken} />
      </div>


      {signedSignature && <div style={{ display: 'flex', gap: '10px' }}>
        <div>Balance</div>
        <div>{balance !== null ? balance + ' ' + token.name.toUpperCase() : 'N/A'} {isUpdatingBalance && 'Updating...'}</div>
        <div><button onClick={updateBalance} disabled={isUpdatingBalance || isTrading}>Update Balance</button></div>
      </div>}

      <div>
        <h3>Deposit</h3>
        <div>amount: <input type="number" value={depositAmount} onChange={(e) => setDepositAmount(Number(e.target.value))} /></div>
        <div><button onClick={handleDeposit} disabled={isTrading || isUpdatingBalance}>Deposit</button></div>
        {depositTx && <div>Deposit Tx: {depositTx}</div>}
      </div>

      <div>
        <h3>Withdraw</h3>
        <div>amount: <input type="number" value={withdrawAmount} onChange={(e) => setWithdrawAmount(Number(e.target.value))} /></div>
        <div>recipient: <input type="text" value={withdrawRecipient} onChange={(e) => setWithdrawRecipient(e.target.value)} placeholder="solana address" /></div>
        <div><button onClick={handleWithdraw} disabled={isTrading || isUpdatingBalance}>Withdraw</button></div>
        {withdrawTx && <div>Withdraw Tx: {withdrawTx}</div>}
      </div>

    </div>
  );
}


async function getUtxoOffset(firstTimeFetchNumber: number, tokenSymbol: string): Promise<number> {
  let offset = 0
  try {
    let res = await fetch('https://api3.privacycash.org/merkle/root?token=' + tokenSymbol)
    let j = await res.json()
    if (typeof j.nextIndex == 'number') {
      if (j.nextIndex > firstTimeFetchNumber) {
        offset = j.nextIndex - firstTimeFetchNumber
      }
    }
  } catch (e: any) {
    return 0
  }
  return offset
}