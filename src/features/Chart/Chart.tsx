/*
 * Copyright (c) 2015 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-4-Clause
 */

import React, { useEffect, useRef, useState } from 'react';
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
    getAppliedPhyEnabled,
    getPhyThroughput,
    getPhyUpdatedAt,
    getPhyMaxThroughput,
} from '../throughputDevice/throughputDeviceSlice';
import UartTerminal from '../throughputDevice/UartTerminal';
import { PHY_LABELS } from '../throughputDevice/phyLabels';
import color from './rssiColors';

import './alert.scss';

const throughputLabelPlugin = {
    id: 'throughputLabelPlugin',
    afterDatasetsDraw(chart: any) {
        const throughputIndex = chart.data.datasets.findIndex(
            (ds: any) => ds.label === 'Throughput',
        );
        if (throughputIndex < 0) return;

        const fileTransferIndex = chart.data.datasets.findIndex(
            (ds: any) => ds.label === 'filetransfer',
        );
        const maxIndex = chart.data.datasets.findIndex(
            (ds: any) => ds.label === 'Max throughput',
        );

        const { ctx, chartArea, scales } = chart;
        if (!chartArea || !scales || !scales.x) return;

        const meta = chart.getDatasetMeta(throughputIndex);
        const xScale = scales.x;
        const throughputData: number[] =
            chart.data.datasets[throughputIndex].data ?? [];

        const fileTransferDataset: any =
            fileTransferIndex >= 0
                ? chart.data.datasets[fileTransferIndex]
                : undefined;
        const fileTransferData: number[] =
            fileTransferDataset?.data ?? [];
        const elapsedData: number[] = fileTransferDataset?.elapsedMs ?? [];

        const maxData: number[] =
            maxIndex >= 0 ? chart.data.datasets[maxIndex].data ?? [] : [];

        const xLeft = xScale.getPixelForValue(0);
        const trackWidth = chartArea.right - xLeft;

        const maxMeta =
            maxIndex >= 0 ? chart.getDatasetMeta(maxIndex) : undefined;

        meta.data.forEach((bar: any, index: number) => {
            const percent = fileTransferData[index] ?? 0;
            const elapsedMs = elapsedData[index] ?? 0;

            const halfHeight = (bar.height as number) / 2;
            const yBottom = (bar.y as number) + halfHeight;

            // Draw 0-100% bar directly below this PHY's bar.
            // Clamp Y so the bar and its label always fit in the chart area.
            let trackY = yBottom + 8;
            const trackHeight = 24;
            const maxTrackTop = chartArea.bottom - (trackHeight + 20);
            if (trackY > maxTrackTop) trackY = maxTrackTop;

            if (trackY + trackHeight >= chartArea.top && trackWidth > 0) {
                ctx.save();
                // Grey track and blue fill for file-transfer progress
                ctx.fillStyle = color.bar.background; // grey track
                ctx.fillRect(xLeft, trackY, trackWidth, trackHeight);
                ctx.fillStyle = color.bar.normal; // blue fill
                const clampedPercent = Math.max(0, Math.min(100, percent));
                ctx.fillRect(
                    xLeft,
                    trackY,
                    (trackWidth * clampedPercent) / 100,
                    trackHeight,
                );

                // Percentage label + timer in the bottom-left corner of the bar
                const totalSeconds = Math.floor(elapsedMs / 1000);
                const minutes = Math.floor(totalSeconds / 60);
                const seconds = totalSeconds % 60;
                const timeLabel = `${String(minutes).padStart(2, '0')}:${String(
                    seconds,
                ).padStart(2, '0')}`;

                // Timestamp for right side (best/fastest completion time)
                const bestCompletedMs = (fileTransferDataset as any)?.bestCompletedMs?.[index] ?? 0;
                const bestTotalSeconds = Math.floor(bestCompletedMs / 1000);
                const bestMinutes = Math.floor(bestTotalSeconds / 60);
                const bestSeconds = bestTotalSeconds % 60;
                const bestTimeLabel = `${String(bestMinutes).padStart(2, '0')}:${String(
                    bestSeconds,
                ).padStart(2, '0')}`;

                ctx.fillStyle = color.label;
                ctx.font =
                    '16px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
                ctx.textAlign = 'left';
                ctx.textBaseline = 'bottom';
                ctx.fillText(
                    `${Math.round(
                        clampedPercent,
                    )}% of 100MB (${timeLabel})`,
                    xLeft + 4,
                    trackY + trackHeight - 2,
                );

                // Timestamp label on the right side of the bar (best completion time so far)
                ctx.textAlign = 'right';
                ctx.textBaseline = 'bottom';
                ctx.fillText(
                    `(${bestTimeLabel})`,
                    xLeft + trackWidth - 4,
                    trackY + trackHeight - 2,
                );
                ctx.restore();
            }

            const textX = xLeft + 10;
            const textY = yBottom + 50;

            if (textY > chartArea.bottom) return;

            const rawValue = throughputData[index];
            const safeValue =
                rawValue === undefined ||
                rawValue === null ||
                Number.isNaN(rawValue)
                    ? 0
                    : rawValue;
            const label = `${safeValue} kbps`;

            ctx.save();
            ctx.font =
                'bold 26px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
            const metrics = ctx.measureText(label);
            const paddingX = 10;
            const paddingY = 10;
            const boxWidth = metrics.width + paddingX * 2;
            const boxHeight = 26 + paddingY * 2;
            const radius = 8;
            const boxX = textX - paddingX;
            const boxY = textY - paddingY;

            ctx.fillStyle = color.bar.normal;
            ctx.beginPath();
            ctx.moveTo(boxX + radius, boxY);
            ctx.lineTo(boxX + boxWidth - radius, boxY);
            ctx.quadraticCurveTo(
                boxX + boxWidth,
                boxY,
                boxX + boxWidth,
                boxY + radius,
            );
            ctx.lineTo(boxX + boxWidth, boxY + boxHeight - radius);
            ctx.quadraticCurveTo(
                boxX + boxWidth,
                boxY + boxHeight,
                boxX + boxWidth - radius,
                boxY + boxHeight,
            );
            ctx.lineTo(boxX + radius, boxY + boxHeight);
            ctx.quadraticCurveTo(
                boxX,
                boxY + boxHeight,
                boxX,
                boxY + boxHeight - radius,
            );
            ctx.lineTo(boxX, boxY + radius);
            ctx.quadraticCurveTo(boxX, boxY, boxX + radius, boxY);
            ctx.closePath();
            ctx.fill();

            ctx.fillStyle = color.bar.highlight;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            ctx.fillText(label, textX, textY);
            ctx.restore();

            // Max throughput label on the opposite side using the same style
            const rawMax = maxData[index];
            const safeMax =
                rawMax === undefined ||
                rawMax === null ||
                Number.isNaN(rawMax)
                    ? 0
                    : rawMax;
            const maxLabel = `${safeMax} kbps`;

            ctx.save();
            ctx.font =
                'bold 26px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
            const maxMetrics = ctx.measureText(maxLabel);
            const maxPaddingX = 10;
            const maxPaddingY = 10;
            const maxBoxWidth = maxMetrics.width + maxPaddingX * 2;
            const maxBoxHeight = 26 + maxPaddingY * 2;
            const maxRadius = 8;
            // Align the RIGHT edge of the box with the x-position for safeMax
            // (the right edge of the grey max-throughput bar), then clamp so
            // the whole box stays inside the chart area.
            const xMax = xScale.getPixelForValue(safeMax);
            let maxBoxX = xMax - maxBoxWidth;
            const minGap = 50;
            const currentBoxRight = boxX + boxWidth;
            if (maxBoxX < currentBoxRight + minGap) {
                maxBoxX = currentBoxRight + minGap;
            }
            if (maxBoxX < xLeft) maxBoxX = xLeft;
            if (maxBoxX + maxBoxWidth > chartArea.right) {
                maxBoxX = chartArea.right - maxBoxWidth;
            }

            const maxBoxY = textY - maxPaddingY;

            ctx.fillStyle = color.bar.background;
            ctx.beginPath();
            ctx.moveTo(maxBoxX + maxRadius, maxBoxY);
            ctx.lineTo(maxBoxX + maxBoxWidth - maxRadius, maxBoxY);
            ctx.quadraticCurveTo(
                maxBoxX + maxBoxWidth,
                maxBoxY,
                maxBoxX + maxBoxWidth,
                maxBoxY + maxRadius,
            );
            ctx.lineTo(
                maxBoxX + maxBoxWidth,
                maxBoxY + maxBoxHeight - maxRadius,
            );
            ctx.quadraticCurveTo(
                maxBoxX + maxBoxWidth,
                maxBoxY + maxBoxHeight,
                maxBoxX + maxBoxWidth - maxRadius,
                maxBoxY + maxBoxHeight,
            );
            ctx.lineTo(maxBoxX + maxRadius, maxBoxY + maxBoxHeight);
            ctx.quadraticCurveTo(
                maxBoxX,
                maxBoxY + maxBoxHeight,
                maxBoxX,
                maxBoxY + maxBoxHeight - maxRadius,
            );
            ctx.lineTo(maxBoxX, maxBoxY + maxRadius);
            ctx.quadraticCurveTo(
                maxBoxX,
                maxBoxY,
                maxBoxX + maxRadius,
                maxBoxY,
            );
            ctx.closePath();
            ctx.fill();

            ctx.fillStyle = color.bar.highlight;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            ctx.fillText(maxLabel, maxBoxX + maxPaddingX, textY);
            ctx.restore();
        });
    },
};

Chart.register(
    ChartDataLabels,
    BarElement,
    CategoryScale,
    LinearScale,
    throughputLabelPlugin,
);

const ANIMATION_DURATION_MS = 500;

export default () => {
    const appliedPhyEnabled = useSelector(getAppliedPhyEnabled);
    const phyThroughput = useSelector(getPhyThroughput);
    const phyUpdatedAt = useSelector(getPhyUpdatedAt);
    const phyMaxThroughput = useSelector(getPhyMaxThroughput);
    const device = useSelector(selectedDevice);
    const readbackProtection = useSelector(getReadbackProtection);
    const noData = useSelector(getNoDataReceived);
    const dispatch = useDispatch();

    const activeThroughput = phyThroughput;
    const enabledIndices = appliedPhyEnabled
        .map((enabled, index) => (enabled ? index : -1))
        .filter(index => index >= 0);
    const visibleLabels = enabledIndices.map(index => PHY_LABELS[index]);
    const visibleMaxThroughput = enabledIndices.map(
        index => phyMaxThroughput[index] ?? 0,
    );
    const visibleThroughput = enabledIndices.map(
        index => activeThroughput[index] ?? 0,
    );
    const maxValue = Math.max(1, ...phyThroughput, ...phyMaxThroughput);
    const [now, setNow] = useState(() => Date.now());
    const [stickyMax, setStickyMax] = useState(maxValue);
    const [lastUpdatedPhyIndex, setLastUpdatedPhyIndex] = useState<number>(-1);
    const [fileTransferProgress, setFileTransferProgress] = useState<
        number[]
    >(() => new Array(phyThroughput.length).fill(0));
    const [fileTransferElapsedMs, setFileTransferElapsedMs] = useState<
        number[]
    >(() => new Array(phyThroughput.length).fill(0));
    const [bestCompletedElapsedMs, setBestCompletedElapsedMs] = useState<
        number[]
    >(() => new Array(phyThroughput.length).fill(0));
    const lastTickRef = useRef(now);

    useEffect(() => {
        // Find which PHY was most recently updated
        let maxUpdatedAt = -Infinity;
        let lastUpdatedIndex = -1;

        phyUpdatedAt.forEach((updatedAt, index) => {
            if (updatedAt && updatedAt > maxUpdatedAt) {
                maxUpdatedAt = updatedAt;
                lastUpdatedIndex = index;
            }
        });

        setLastUpdatedPhyIndex(lastUpdatedIndex);
    }, [phyUpdatedAt]);

    useEffect(() => {
        setStickyMax(prev => Math.max(prev, maxValue));
    }, [maxValue]);

    const roundedStickyMax = Math.max(
        100,
        Math.ceil((stickyMax || 0) / 100) * 100,
    );

    useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), 100);
        return () => clearInterval(id);
    }, []);

    useEffect(() => {
        const previous = lastTickRef.current;
        lastTickRef.current = now;
        const dtMs = now - previous;
        if (dtMs <= 0) return;

        // Simulate file transfer progress for a 100 MB file per PHY.
        // Interpret throughput as kbps and advance progress according to
        // actual download time for a 100 MB file.
        setFileTransferProgress(prevProgress =>
            prevProgress.map((value, index) => {
                const throughputKbps = activeThroughput[index] ?? 0;
                if (throughputKbps <= 0) return value;

                // 100 MB in bits (100 * 1024 * 1024 bytes * 8 bits/byte)
                const fileSizeBits = 100 * 1024 * 1024 * 8;
                // throughputKbps is kilobits per second, dtMs is milliseconds
                // Bits transferred in this interval: throughputKbps * dtMs
                // (since kbps * 1000 * dtMs/1000 = kbps * dtMs)
                const delta =
                    (throughputKbps * dtMs * 100) / fileSizeBits;
                const next = value + delta;

                // When reaching or exceeding 100%, wrap back to 0% and start over
                if (next >= 100) {
                    return 0;
                }

                return next;
            }),
        );

        setFileTransferElapsedMs(prevElapsed =>
            prevElapsed.map((elapsed, index) => {
                const throughputKbps = activeThroughput[index] ?? 0;
                if (throughputKbps <= 0) return elapsed;

                const fileSizeBits = 100 * 1024 * 1024 * 8;
                const delta =
                    (throughputKbps * dtMs * 100) / fileSizeBits;
                const currentProgress = fileTransferProgress[index] ?? 0;
                const nextProgress = currentProgress + delta;

                if (nextProgress >= 100) {
                    return 0;
                }

                return elapsed + dtMs;
            }),
        );

        setBestCompletedElapsedMs(prevBest =>
            prevBest.map((best, index) => {
                const throughputKbps = activeThroughput[index] ?? 0;
                if (throughputKbps <= 0) return best;

                const fileSizeBits = 100 * 1024 * 1024 * 8;
                const delta =
                    (throughputKbps * dtMs * 100) / fileSizeBits;
                const currentProgress = fileTransferProgress[index] ?? 0;
                const nextProgress = currentProgress + delta;

                // When progress reaches 100%, update bestCompletedElapsedMs if this time is better (lower)
                if (nextProgress >= 100) {
                    const completedTime = (fileTransferElapsedMs[index] ?? 0) + dtMs;
                    return best === 0 ? completedTime : Math.min(best, completedTime);
                }

                return best;
            }),
        );
    }, [now, activeThroughput, fileTransferProgress, fileTransferElapsedMs, bestCompletedElapsedMs]);

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
                            labels: visibleLabels,
                            datasets: [
                                {
                                    label: 'Max throughput',
                                    // Light gray bars to indicate max throughput
                                    backgroundColor: color.bar.background,
                                    borderWidth: 0,
                                    grouped: false,
                                    order: 1,
                                    barThickness: 50,
                                    datalabels: {
                                        display: false,
                                    },
                                    data: visibleMaxThroughput,
                                },
                                {
                                    label: 'filetransfer',
                                    backgroundColor: 'transparent',
                                    borderWidth: 0,
                                    grouped: false,
                                    order: 2,
                                    barThickness: 1,
                                    data: enabledIndices.map(
                                        index =>
                                            fileTransferProgress[index] ?? 0,
                                    ),
                                    // Custom field consumed by throughputLabelPlugin
                                    elapsedMs: enabledIndices.map(
                                        index =>
                                            fileTransferElapsedMs[index] ?? 0,
                                    ),
                                    bestCompletedMs: enabledIndices.map(
                                        index =>
                                            bestCompletedElapsedMs[index] ?? 0,
                                    ),
                                    datalabels: {
                                        display: false,
                                    },
                                } as any,
                                {
                                    label: 'Throughput',
                                    backgroundColor: enabledIndices.map(
                                        (index) => {
                                            if (index === lastUpdatedPhyIndex) {
                                                return color.bar.highlight;
                                            }
                                            return color.bar.normal;
                                        },
                                    ),
                                    borderWidth: 0,
                                    grouped: false,
                                    order: 0,
                                    barThickness: 50,
                                    data: visibleThroughput,
                                    datalabels: {
                                        display: false,
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
                                        text: 'Throughput kbps',
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
                                    max: roundedStickyMax,
                                },
                                y: {
                                    type: 'category',
                                    offset: true,
                                    ticks: {
                                        // Use the labels array (visibleLabels) directly
                                        // so disabled PHYs keep their original numbering.
                                        color: color.label,
                                    },
                                    title: {
                                        display: false,
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
