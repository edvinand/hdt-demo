/*
 * Temporary UART debug terminal overlay
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useSelector } from 'react-redux';

import { getRssiDevice, getUartLog } from './throughputDeviceSlice';

const UartTerminal = () => {
    const log = useSelector(getUartLog);
    const rssiDevice = useSelector(getRssiDevice);

    const containerRef = useRef<HTMLDivElement | null>(null);
    const [uartCommandText, setUartCommandText] = useState('');
    const [isUartSendInFlight, setIsUartSendInFlight] = useState(false);

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        el.scrollTop = el.scrollHeight;
    }, [log]);

    const onSendUartCommand = useCallback(async () => {
        if (!rssiDevice || isUartSendInFlight || !uartCommandText.trim()) {
            return;
        }

        setIsUartSendInFlight(true);
        try {
            await rssiDevice.sendUartCommand(uartCommandText);
            setUartCommandText('');
        } finally {
            setIsUartSendInFlight(false);
        }
    }, [rssiDevice, isUartSendInFlight, uartCommandText]);

    const onUartInputKeyDown = useCallback(
        (e: React.KeyboardEvent<HTMLInputElement>) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                onSendUartCommand();
            }
        },
        [onSendUartCommand],
    );

    if (!log.length) return null;

    return (
        <div
            style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: 320,
                height: 220,
                backgroundColor: 'rgba(0, 0, 0, 0.8)',
                color: '#0f0',
                fontFamily: 'monospace',
                fontSize: 10,
                padding: 8,
                borderRadius: 4,
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                zIndex: 10,
            }}
        >
            <div
                ref={containerRef}
                style={{
                    flex: '1 1 auto',
                    overflow: 'auto',
                    minHeight: 0,
                }}
            >
                {log.map((entry, index) => (
                    // eslint-disable-next-line react/no-array-index-key
                    <div key={index}>
                        <span style={{ color: '#888' }}>
                            {entry.direction.toUpperCase()}&nbsp;
                        </span>
                        <span>{entry.text}</span>
                    </div>
                ))}
            </div>
            <div>
                <label
                    htmlFor="uart-terminal-command-input"
                    style={{
                        display: 'block',
                        fontSize: 11,
                        fontWeight: 500,
                        marginBottom: 6,
                        color: '#b8ffb8',
                    }}
                >
                </label>
                <input
                    id="uart-terminal-command-input"
                    type="text"
                    placeholder="Enter command and press Enter..."
                    value={uartCommandText}
                    onChange={e => setUartCommandText(e.target.value)}
                    onKeyDown={onUartInputKeyDown}
                    disabled={isUartSendInFlight || !rssiDevice}
                    style={{
                        width: '100%',
                        padding: '8px 10px',
                        fontSize: 12,
                        border: '1px solid rgba(255, 255, 255, 0.18)',
                        borderRadius: 4,
                        fontFamily: 'monospace',
                        boxSizing: 'border-box',
                        backgroundColor: 'rgba(0, 0, 0, 0.35)',
                        color: '#d8ffd8',
                        opacity: isUartSendInFlight || !rssiDevice ? 0.6 : 1,
                        cursor:
                            isUartSendInFlight || !rssiDevice
                                ? 'not-allowed'
                                : 'text',
                    }}
                />
            </div>
        </div>
    );
};

export default UartTerminal;
