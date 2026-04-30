/*
 * Copyright (c) 2015 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-4-Clause
 */

import React from 'react';
import { useSelector } from 'react-redux';

import { PHY_LABELS } from '../throughputDevice/phyLabels';
import {
    getAppliedPhyEnabled,
    getPhyMaxThroughput,
    getPhyThroughput,
    getPhyUpdatedAt,
} from '../throughputDevice/throughputDeviceSlice';
import _color from './rssiColors';
import ThroughputGauge from './ThroughputGauge';

// Per-PHY theoretical maximum kbps (same as in Chart.tsx)
const PHY_MAX_KBPS = [7500, 6000, 4000, 3000, 2000, 2000, 1000];

interface GaugeViewProps {
    /** Rendered above gauges when only a single PHY is active */
    singlePhyTopContent?: React.ReactNode;
}

const GaugeView = ({ singlePhyTopContent }: GaugeViewProps) => {
    const appliedPhyEnabled = useSelector(getAppliedPhyEnabled);
    const phyThroughput = useSelector(getPhyThroughput);
    const phyMaxThroughput = useSelector(getPhyMaxThroughput);
    const phyUpdatedAt = useSelector(getPhyUpdatedAt);

    const enabledIndices = appliedPhyEnabled
        .map((enabled, index) => (enabled ? index : -1))
        .filter(index => index >= 0);

    // Calculate shared max capacity from all enabled PHYs (same scale as bars view)
    const maxSharedCapacity = Math.max(
        1,
        ...enabledIndices.map(idx => PHY_MAX_KBPS[idx] ?? 1000),
    );

    // Determine the most recently updated PHY for highlighting
    let lastUpdatedIndex = -1;
    let maxUpdatedAt = -Infinity;
    phyUpdatedAt.forEach((updatedAt, index) => {
        if (updatedAt && updatedAt > maxUpdatedAt) {
            maxUpdatedAt = updatedAt;
            lastUpdatedIndex = index;
        }
    });

    const isSinglePhy = enabledIndices.length === 1;

    if (isSinglePhy && singlePhyTopContent) {
        const phyIdx = enabledIndices[0];
        return (
            <div className="d-flex flex-column h-100" style={{ gap: 16 }}>
                <div style={{ flex: '0 0 45%', minHeight: 0 }}>
                    {singlePhyTopContent}
                </div>
                <div
                    style={{
                        flex: '1 1 auto',
                        minHeight: 0,
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                    }}
                >
                    <ThroughputGauge
                        currentKbps={phyThroughput[phyIdx] ?? 0}
                        maxRecordedKbps={phyMaxThroughput[phyIdx] ?? 0}
                        capacityKbps={PHY_MAX_KBPS[phyIdx] ?? 1000}
                        maxSharedCapacityKbps={maxSharedCapacity}
                        phyLabel={PHY_LABELS[phyIdx]}
                        isHighlighted={phyIdx === lastUpdatedIndex}
                        size="large"
                    />
                </div>
            </div>
        );
    }

    // Layout rules for multi-PHY gauge grid:
    // 2 → 1 row of 2, 3 → 2+1, 4 → 2×2, 5 → 3+2, 6 → 3+3, 7 → 4+3
    const count = enabledIndices.length;
    const getFirstRowCount = (c: number): number => {
        if (c <= 2) return c;
        if (c <= 4) return 2;
        if (c <= 5) return 3;
        if (c <= 6) return 3;
        return 4;
    };
    const firstRowCount = getFirstRowCount(count);

    const firstRow = enabledIndices.slice(0, firstRowCount);
    const secondRow = enabledIndices.slice(firstRowCount);

    const renderTile = (phyIdx: number) => (
        <div
            key={PHY_LABELS[phyIdx]}
            style={{
                background: '#ffffff',
                borderRadius: 8,
                padding: 16,
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                flex: '1 1 0',
                minWidth: 0,
            }}
        >
            <ThroughputGauge
                currentKbps={phyThroughput[phyIdx] ?? 0}
                maxRecordedKbps={phyMaxThroughput[phyIdx] ?? 0}
                maxSharedCapacityKbps={maxSharedCapacity}
                capacityKbps={PHY_MAX_KBPS[phyIdx] ?? 1000}
                phyLabel={PHY_LABELS[phyIdx]}
                isHighlighted={phyIdx === lastUpdatedIndex}
            />
        </div>
    );

    return (
        <div
            style={{
                height: '100%',
                overflow: 'auto',
                padding: 8,
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
            }}
        >
            <div
                style={{
                    display: 'flex',
                    gap: 8,
                    flex: '1 1 0',
                    minHeight: 0,
                }}
            >
                {firstRow.map(renderTile)}
            </div>
            {secondRow.length > 0 && (
                <div
                    style={{
                        display: 'flex',
                        gap: 8,
                        flex: '1 1 0',
                        minHeight: 0,
                    }}
                >
                    {secondRow.map(renderTile)}
                </div>
            )}
        </div>
    );
};

export default GaugeView;
