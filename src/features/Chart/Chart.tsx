/*
 * Copyright (c) 2015 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-4-Clause
 */

import React, { useEffect, useState } from 'react';
import { Bar } from 'react-chartjs-2';
import { useDispatch, useSelector } from 'react-redux';
import {
    Alert,
    getReadbackProtection,
    Main,
    selectedDevice,
} from '@nordicsemiconductor/pc-nrfconnect-shared';
import { BarElement, CategoryScale, Chart, LinearScale } from 'chart.js';
import ChartDataLabels from 'chartjs-plugin-datalabels';

import { recoverHex } from '../throughputDevice/throughputDeviceEffects';
import {
    getNoDataReceived,
    getPhyEnabled,
    getPhyThroughput,
    getPhyUpdatedAt,
    getPhyMaxThroughput,
} from '../throughputDevice/throughputDeviceSlice';
import UartTerminal from '../throughputDevice/UartTerminal';
import color from './rssiColors';

import './alert.scss';

Chart.register(ChartDataLabels, BarElement, CategoryScale, LinearScale);

const PHY_LABELS = ['PHY 1', 'PHY 2', 'PHY 3', 'PHY 4', 'PHY 5'];
const ANIMATION_DURATION_MS = 500;

export default () => {
    const phyEnabled = useSelector(getPhyEnabled);
    const phyThroughput = useSelector(getPhyThroughput);
    const phyUpdatedAt = useSelector(getPhyUpdatedAt);
    const phyMaxThroughput = useSelector(getPhyMaxThroughput);
    const device = useSelector(selectedDevice);
    const readbackProtection = useSelector(getReadbackProtection);
    const noData = useSelector(getNoDataReceived);
    const dispatch = useDispatch();

    const activeThroughput = phyThroughput;
    const maxValue = Math.max(1, ...phyThroughput, ...phyMaxThroughput);
    const [now, setNow] = useState(() => Date.now());
    const [stickyMax, setStickyMax] = useState(maxValue);
    const HIGHLIGHT_MS = 500;

    useEffect(() => {
        setStickyMax(prev => Math.max(prev, maxValue));
    }, [maxValue]);

    useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), 100);
        return () => clearInterval(id);
    }, []);

    return (
        <div className="d-flex flex-column h-100">
            {device &&
                noData &&
                readbackProtection !== 'NRFDL_PROTECTION_STATUS_NONE' && (
                    <Alert variant="warning">
                        <div className="d-flex align-items-center readback-protection-warning flex-wrap">
                            No data received. Unable to verify compatible
                            firmware because the selected device has readback
                            protection enabled.
                            <button
                                type="button"
                                onClick={() => dispatch(recoverHex(device))}
                            >
                                Program compatible firmware
                            </button>
                        </div>
                    </Alert>
                )}
            <div className="position-relative flex-grow-1 overflow-hidden">
                <Main>
                    <Bar
                        data={{
                            labels: PHY_LABELS,
                            datasets: [
                                {
                                    label: 'Max throughput',
                                    backgroundColor: phyMaxThroughput.map(
                                        value =>
                                            value > 0
                                                ? color.bar.advertisementMax
                                                : color.bar.background,
                                    ),
                                    borderWidth: 0,
                                    grouped: false,
                                    order: 1,
                                    barThickness: 50,
                                    datalabels: {
                                        display: false,
                                    },
                                    data: phyMaxThroughput,
                                },
                                {
                                    label: 'Throughput',
                                    backgroundColor: activeThroughput.map(
                                        (value, index) => {
                                            if (!phyEnabled[index]) {
                                                return color.bar.background;
                                            }
                                            const updatedAt =
                                                phyUpdatedAt[index];
                                            if (
                                                updatedAt &&
                                                now - updatedAt <
                                                    HIGHLIGHT_MS
                                            ) {
                                                return color.bar.highlight;
                                            }
                                            return color.bar.normal;
                                        },
                                    ),
                                    borderWidth: 0,
                                    grouped: false,
                                    order: 0,
                                    barThickness: 50,
                                    data: activeThroughput,
                                    datalabels: {
                                        color: color.label,
                                        anchor: 'end',
                                        align: 'end',
                                        formatter: (v: number) =>
                                            v > 0 ? v : '',
                                        offset: 4,
                                        font: { size: 11 },
                                    },
                                },
                            ],
                        }}
                        options={{
                            responsive: true,
                            animation: { duration: ANIMATION_DURATION_MS },
                            maintainAspectRatio: false,
                            indexAxis: 'y',
                            plugins: {
                                legend: { display: false },
                                tooltip: { enabled: false },
                            },
                            scales: {
                                x: {
                                    type: 'linear',
                                    position: 'bottom',
                                    title: {
                                        display: true,
                                        text: 'Throughput [kbps]',
                                        color: color.label,
                                        font: { size: 14 },
                                        padding: { top: 10 },
                                    },
                                    grid: {
                                        display: false,
                                    },
                                    border: {
                                        display: false,
                                    },
                                    ticks: {
                                        color: color.label,
                                        precision: 0,
                                    },
                                    min: 0,
                                    max: stickyMax,
                                },
                                y: {
                                    type: 'category',
                                    offset: true,
                                    ticks: {
                                        callback: (_, index) =>
                                            PHY_LABELS[index] ?? '',
                                        color: color.label,
                                    },
                                    title: {
                                        display: true,
                                        text: 'PHY',
                                        color: color.label,
                                        font: { size: 14 },
                                    },
                                    grid: {
                                        display: false,
                                    },
                                    border: {
                                        display: false,
                                    },
                                },
                            },
                        }}
                    />
                </Main>
                <UartTerminal />
            </div>
        </div>
    );
};
