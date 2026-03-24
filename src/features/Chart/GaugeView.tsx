/*
 * Copyright (c) 2015 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-4-Clause
 */

import React from 'react';
import { useSelector } from 'react-redux';
import { MasonryLayout } from '@nordicsemiconductor/pc-nrfconnect-shared';

import {
    getAppliedPhyEnabled,
    getPhyMaxThroughput,
    getPhyThroughput,
    getPhyUpdatedAt,
} from '../throughputDevice/throughputDeviceSlice';
import { PHY_LABELS } from '../throughputDevice/phyLabels';
import color from './rssiColors';
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
            <div
                className="d-flex flex-column h-100"
                style={{ gap: 16 }}
            >
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
                        phyLabel={PHY_LABELS[phyIdx]}
                        isHighlighted={phyIdx === lastUpdatedIndex}
                        size="large"
                    />
                </div>
            </div>
        );
    }

    // Multi-PHY: MasonryLayout tiles
    return (
        <div
            style={{
                height: '100%',
                overflow: 'auto',
                padding: 8,
            }}
        >
            <MasonryLayout minWidth={300}>
                {enabledIndices.map(phyIdx => (
                    <div
                        key={PHY_LABELS[phyIdx]}
                        style={{
                            background: '#ffffff',
                            borderRadius: 8,
                            padding: 16,
                            display: 'flex',
                            justifyContent: 'center',
                            alignItems: 'center',
                            minHeight: 220,
                        }}
                    >
                        <ThroughputGauge
                            currentKbps={phyThroughput[phyIdx] ?? 0}
                            maxRecordedKbps={phyMaxThroughput[phyIdx] ?? 0}
                            capacityKbps={PHY_MAX_KBPS[phyIdx] ?? 1000}
                            phyLabel={PHY_LABELS[phyIdx]}
                            isHighlighted={phyIdx === lastUpdatedIndex}
                        />
                    </div>
                ))}
            </MasonryLayout>
        </div>
    );
};

export default GaugeView;
