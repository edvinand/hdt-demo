/*
 * Temporary UART debug terminal overlay
 */

import React, { useEffect, useRef } from 'react';
import { useSelector } from 'react-redux';

import { getUartLog } from './throughputDeviceSlice';

const UartTerminal = () => {
    const log = useSelector(getUartLog);

    const containerRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        el.scrollTop = el.scrollHeight;
    }, [log]);

    if (!log.length) return null;

    return (
        <div
            ref={containerRef}
            style={{
                position: 'absolute',
                top: 8,
                right: 8,
                width: 320,
                height: 160,
                backgroundColor: 'rgba(0, 0, 0, 0.8)',
                color: '#0f0',
                fontFamily: 'monospace',
                fontSize: 10,
                padding: 4,
                borderRadius: 4,
                overflow: 'auto',
                zIndex: 10,
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
    );
};

export default UartTerminal;
