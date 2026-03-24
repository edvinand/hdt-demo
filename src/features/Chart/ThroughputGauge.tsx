/*
 * Copyright (c) 2015 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-4-Clause
 */

import React from 'react';

import color from './rssiColors';

// Arc geometry: 240° sweep starting at 150° (gap at the bottom)
const ARC_START_DEG = 150;
const ARC_SWEEP_DEG = 240;
const ARC_END_DEG = ARC_START_DEG + ARC_SWEEP_DEG;

const toRad = (deg: number) => (deg * Math.PI) / 180;

const polarToCartesian = (
    cx: number,
    cy: number,
    r: number,
    angleDeg: number,
) => ({
    x: cx + r * Math.cos(toRad(angleDeg)),
    y: cy + r * Math.sin(toRad(angleDeg)),
});

const describeArc = (
    cx: number,
    cy: number,
    r: number,
    startDeg: number,
    endDeg: number,
) => {
    const start = polarToCartesian(cx, cy, r, startDeg);
    const end = polarToCartesian(cx, cy, r, endDeg);
    const sweep = endDeg - startDeg;
    const largeArc = sweep > 180 ? 1 : 0;
    return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`;
};

interface ThroughputGaugeProps {
    currentKbps: number;
    maxRecordedKbps: number;
    capacityKbps: number;
    phyLabel: string;
    isHighlighted?: boolean;
    size?: 'normal' | 'large';
}

const ThroughputGauge = ({
    currentKbps,
    maxRecordedKbps,
    capacityKbps,
    phyLabel,
    isHighlighted = false,
    size = 'normal',
}: ThroughputGaugeProps) => {
    const viewSize = 200;
    const cx = viewSize / 2;
    const cy = viewSize / 2;
    const strokeWidth = size === 'large' ? 22 : 16;
    const r = (viewSize - strokeWidth) / 2 - 4;

    const safeCapacity = Math.max(1, capacityKbps);
    const currentFraction = Math.min(1, Math.max(0, currentKbps / safeCapacity));
    const maxFraction = Math.min(1, Math.max(0, maxRecordedKbps / safeCapacity));

    // Arc angles for current value
    const currentEndDeg =
        ARC_START_DEG + ARC_SWEEP_DEG * currentFraction;

    // Max tick angle
    const maxTickDeg = ARC_START_DEG + ARC_SWEEP_DEG * maxFraction;

    // Full background arc
    const bgArcPath = describeArc(cx, cy, r, ARC_START_DEG, ARC_END_DEG);

    // Filled arc for current value (avoid zero-length arc)
    const fillArcPath =
        currentFraction > 0.001
            ? describeArc(cx, cy, r, ARC_START_DEG, currentEndDeg)
            : '';

    // Max-value tick mark — radial line offset forward by strokeWidth
    // so it appears at the visual end of the arc stroke, not cutting through it
    const strokeOffsetDeg = (strokeWidth / r) * (180 / Math.PI)/2;
    const adjustedTickDeg = maxTickDeg + strokeOffsetDeg;
    const tickInner = polarToCartesian(cx, cy, r - strokeWidth / 2 - 4, adjustedTickDeg);
    const tickOuter = polarToCartesian(cx, cy, r + strokeWidth / 2 + 4, adjustedTickDeg);

    const fillColor = isHighlighted ? color.bar.highlight : color.bar.normal;
    const labelFontSize = size === 'large' ? 18 : 14;
    const valueFontSize = size === 'large' ? 16 : 12;
    const phyFontSize = size === 'large' ? 14 : 11;

    return (
        <div
            style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                width: '100%',
                height: '100%',
                minHeight: 0,
            }}
        >
            <svg
                viewBox={`0 0 ${viewSize} ${viewSize}`}
                style={{
                    width: '100%',
                    height: '100%',
                    maxWidth: size === 'large' ? 320 : 220,
                    flex: '1 1 auto',
                    minHeight: 0,
                }}
            >
                {/* Background arc */}
                <path
                    d={bgArcPath}
                    fill="none"
                    stroke={color.bar.background}
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                />

                {/* Filled arc for current throughput */}
                {fillArcPath && (
                    <path
                        d={fillArcPath}
                        fill="none"
                        stroke={fillColor}
                        strokeWidth={strokeWidth}
                        strokeLinecap="round"
                        style={{
                            transition: 'stroke-dashoffset 0.5s ease',
                        }}
                    />
                )}

                {/* Black tick at max recorded value */}
                {maxRecordedKbps > 0 && (
                    <line
                        x1={tickInner.x}
                        y1={tickInner.y}
                        x2={tickOuter.x}
                        y2={tickOuter.y}
                        stroke="#000000"
                        strokeWidth={2.5}
                        strokeLinecap="round"
                    />
                )}

                {/* Center text: value / max kbps */}
                <text
                    x={cx}
                    y={cy - 6}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill={color.label}
                    fontSize={labelFontSize}
                    fontWeight="bold"
                    fontFamily='Roboto, "Segoe UI", sans-serif'
                >
                    {currentKbps} / {maxRecordedKbps} kbps
                </text>

                {/* Capacity label below */}
                <text
                    x={cx}
                    y={cy + valueFontSize + 8}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill={color.label}
                    fontSize={phyFontSize}
                    fontFamily='Roboto, "Segoe UI", sans-serif'
                    opacity={0.6}
                >
                    max {safeCapacity} kbps
                </text>
            </svg>
            <div
                style={{
                    textAlign: 'center',
                    fontWeight: 'bold',
                    fontSize: size === 'large' ? 16 : 13,
                    color: color.label,
                    fontFamily: 'Roboto, "Segoe UI", sans-serif',
                    marginTop: -8,
                }}
            >
                {phyLabel}
            </div>
        </div>
    );
};

export default ThroughputGauge;
