"use client";

import dynamic from 'next/dynamic';
import { useWallet } from '@solana/wallet-adapter-react';
import { useEffect, useRef } from 'react';

const WalletMultiButton = dynamic(
    async () => (await import('@solana/wallet-adapter-react-ui')).WalletMultiButton,
    { ssr: false }
);

interface ConnectButtonProps {
    onConnected?: () => void;
    onDisconnected?: () => void;
}

export default function ConnectButton({ onConnected, onDisconnected }: ConnectButtonProps) {
    const { connected } = useWallet();
    const prevConnected = useRef(connected);

    useEffect(() => {
        if (connected && !prevConnected.current) {
            onConnected?.();
        } else if (!connected && prevConnected.current) {
            onDisconnected?.();
        }
        prevConnected.current = connected;
    }, [connected, onConnected, onDisconnected]);

    return <WalletMultiButton />;
}
