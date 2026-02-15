
interface Token {
    name: string;
    // Allow other properties since we don't know the full shape of the privacycash token
    [key: string]: any;
}

interface TokenSelectorProps {
    tokens: Token[];
    liveToken: string;
    setLiveToken: (tokenName: string) => void;
}

export default function TokenSelector({ tokens, liveToken, setLiveToken }: TokenSelectorProps) {
    return (
        <select
            value={liveToken}
            onChange={(e) => setLiveToken(e.target.value)}
            style={{
                padding: '8px',
                fontSize: '18px',
                border: '1px solid #ccc',
                borderRadius: '6px',
                backgroundColor: 'var(--background)',
                color: 'var(--foreground)',
            }}
        >
            {tokens.map((t) => (
                <option key={t.name} value={t.name.toLowerCase()}>
                    {uiTokenName(t.name)}
                </option>
            ))}
        </select>
    );
}

function uiTokenName(name: string) {
    switch (name) {
        case 'jlwsol':
            return 'jlWSOL'
        case 'jlusdc':
            return 'jlUSDC'
        case 'store':
            return 'stORE'
        default:
            return name.toUpperCase()
    }
}