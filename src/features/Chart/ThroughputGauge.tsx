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
    maxSharedCapacityKbps?: number; // Shared scale across all gauges (defaults to capacityKbps if not provided)
    phyLabel: string;
    isHighlighted?: boolean;
    size?: 'normal' | 'large';
}

const ThroughputGauge = ({
    currentKbps,
    maxRecordedKbps,
    capacityKbps,
    maxSharedCapacityKbps,
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
    const safeSharedCapacity = Math.max(1, maxSharedCapacityKbps ?? capacityKbps);

    // Background arc scaled to individual PHY capacity
    const capacityFraction = Math.min(1, Math.max(0, safeCapacity / safeSharedCapacity));
    const capacityEndDeg = ARC_START_DEG + ARC_SWEEP_DEG * capacityFraction;

    // Fill arc scaled to shared capacity (same as bars view)
    const currentFraction = Math.min(1, Math.max(0, currentKbps / safeSharedCapacity));
    const maxFraction = Math.min(1, Math.max(0, maxRecordedKbps / safeSharedCapacity));

    // Arc angles for current value
    const currentEndDeg =
        ARC_START_DEG + ARC_SWEEP_DEG * currentFraction;

    // Background arc scaled to individual PHY capacity.
    // When possible, split it into two segments with a tiny gap after the
    // max-recorded throughput position instead of drawing a black tick.
    // The gap starts where the blue arc's rounded linecap visually ends
    // when current throughput reaches that recorded max.
    const maxIndicatorDeg = ARC_START_DEG + ARC_SWEEP_DEG * maxFraction;
    const lineCapDeg = (strokeWidth / (2 * r)) * (180 / Math.PI);
    const visibleGapDeg = size === 'large' ? 2.4 : 2.0;
    const leadingArcEndDeg = maxIndicatorDeg;
    const trailingArcStartDeg =
        maxIndicatorDeg + visibleGapDeg + 2 * lineCapDeg;
    const canShowMaxGap =
        maxRecordedKbps > 0 &&
        leadingArcEndDeg > ARC_START_DEG + lineCapDeg &&
        trailingArcStartDeg < capacityEndDeg - lineCapDeg;

    const bgArcPathLeading = canShowMaxGap
        ? describeArc(
              cx,
              cy,
              r,
              ARC_START_DEG,
              leadingArcEndDeg,
          )
        : '';
    const bgArcPathTrailing = canShowMaxGap
        ? describeArc(
              cx,
              cy,
              r,
              trailingArcStartDeg,
              capacityEndDeg,
          )
        : '';
    const bgArcPath = canShowMaxGap
        ? ''
        : describeArc(cx, cy, r, ARC_START_DEG, capacityEndDeg);

    // Filled arc for current value (avoid zero-length arc)
    const fillArcPath =
        currentFraction > 0.001
            ? describeArc(cx, cy, r, ARC_START_DEG, currentEndDeg)
            : '';

    const fillColor = isHighlighted ? color.bar.highlight : color.bar.normal;
    const labelFontSize = size === 'large' ? 18 : 14;
    const valueFontSize = size === 'large' ? 16 : 12;
    const phyFontSize = size === 'large' ? 14 : 11;
    const phyLabelY = cy + r + strokeWidth / 2 + (size === 'large' ? 4 : 3);

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
                {bgArcPath && (
                    <path
                        d={bgArcPath}
                        fill="none"
                        stroke={color.bar.background}
                        strokeWidth={strokeWidth}
                        strokeLinecap="round"
                    />
                )}
                {bgArcPathLeading && (
                    <path
                        d={bgArcPathLeading}
                        fill="none"
                        stroke={color.bar.background}
                        strokeWidth={strokeWidth}
                        strokeLinecap="round"
                    />
                )}
                {bgArcPathTrailing && (
                    <path
                        d={bgArcPathTrailing}
                        fill="none"
                        stroke={color.bar.background}
                        strokeWidth={strokeWidth}
                        strokeLinecap="round"
                    />
                )}

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
                    PHY: {safeCapacity} kbps
                </text>

                {/* PHY name directly below arc */}
                <text
                    x={cx}
                    y={phyLabelY}
                    textAnchor="middle"
                    dominantBaseline="hanging"
                    fill={color.label}
                    fontSize={size === 'large' ? 16 : 13}
                    fontWeight="bold"
                    fontFamily='Roboto, "Segoe UI", sans-serif'
                >
                    {phyLabel}
                </text>
            </svg>
        </div>
    );
};

export default ThroughputGauge;
