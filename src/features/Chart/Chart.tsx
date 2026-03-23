/*
 * Copyright (c) 2015 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-4-Clause
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Bar, Line } from 'react-chartjs-2';
import { useDispatch, useSelector } from 'react-redux';
import {
    Alert,
    getReadbackProtection,
    Main,
    selectedDevice,
} from '@nordicsemiconductor/pc-nrfconnect-shared';
import {
    BarElement,
    CategoryScale,
    Chart,
    Filler,
    LineElement,
    LinearScale,
    PointElement,
} from 'chart.js';
import ChartDataLabels from 'chartjs-plugin-datalabels';

import { recoverHex } from '../throughputDevice/throughputDeviceEffects';
import {
    getNoDataReceived,
    getAppliedPhyEnabled,
    getPhyThroughput,
    getPhyUpdatedAt,
    getPhyMaxThroughput,
    getVirtualFileSizeMb,
    getFileTransferResetTrigger,
    getEnableGraphOnSinglePhy,
    getEnableUartTerminal,
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
        const fileSizeMbData: number[] = fileTransferDataset?.fileSizeMb ?? [];

        const maxData: number[] =
            maxIndex >= 0 ? chart.data.datasets[maxIndex].data ?? [] : [];

        const xLeft = xScale.getPixelForValue(0);
        const trackWidth = chartArea.right - xLeft;

        const maxMeta =
            maxIndex >= 0 ? chart.getDatasetMeta(maxIndex) : undefined;

        meta.data.forEach((bar: any, index: number) => {
            const percent = fileTransferData[index] ?? 0;
            const elapsedMs = elapsedData[index] ?? 0;
            const fileSizeMb = fileSizeMbData[index] ?? 100;

            const halfHeight = (bar.height as number) / 2;
            const yBottom = (bar.y as number) + halfHeight;
            const phyCount = meta.data.length;
            const barHeight = Math.max(1, bar.height as number);

            let fontSizeLabel = Math.max(10, Math.floor(barHeight * 0.55));
            if (phyCount <= 5) {
                fontSizeLabel = Math.max(fontSizeLabel, 18);
            }

            const paddingX = Math.max(6, Math.round(fontSizeLabel * 0.35));
            const paddingY = Math.max(3, Math.round(fontSizeLabel * 0.2));
            const radius = Math.max(4, Math.round(fontSizeLabel * 0.3));

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
                    )}% of ${fileSizeMb}MB (${timeLabel})`,
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
            const textY = (bar.y as number) - fontSizeLabel / 2 - 1;

            if (
                textY - paddingY < chartArea.top ||
                textY + fontSizeLabel + paddingY > chartArea.bottom
            ) {
                return;
            }

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
                `bold ${fontSizeLabel}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
            const metrics = ctx.measureText(label);
            const boxWidth = metrics.width + paddingX * 2;
            const boxHeight = fontSizeLabel + paddingY * 2;
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
                `bold ${fontSizeLabel}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
            const maxMetrics = ctx.measureText(maxLabel);
            const maxPaddingX = paddingX;
            const maxPaddingY = paddingY;
            const maxBoxWidth = maxMetrics.width + maxPaddingX * 2;
            const maxBoxHeight = fontSizeLabel + maxPaddingY * 2;
            const maxRadius = radius;
            // Align the RIGHT edge of the box with the x-position for safeMax
            // (the right edge of the grey max-throughput bar), then clamp so
            // the whole box stays inside the chart area.
            const xMax = xScale.getPixelForValue(safeMax);
            let maxBoxX = xMax - maxBoxWidth;
            const minGap = Math.max(12, Math.round(fontSizeLabel * 1.2));
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
    Filler,
    LineElement,
    LinearScale,
    PointElement,
    throughputLabelPlugin,
);

const ANIMATION_DURATION_MS = 500;
const MIN_GRAPH_MAX_KBPS = 100;
const GRAPH_Y_HEADROOM = 1.1;
const GRAPH_X_MAX_PERCENT = 100;

type ThroughputSample = {
    progressPercent: number;
    throughputKbps: number;
};

const withOpacity = (hexColor: string, opacity: number) => {
    if (!hexColor.startsWith('#')) return hexColor;

    const alpha = Math.round(opacity * 255)
        .toString(16)
        .padStart(2, '0');

    return `${hexColor}${alpha}`;
};

const createTransferHistoryGradient = (chart: any) => {
    const { ctx, chartArea } = chart;

    if (!chartArea) {
        return withOpacity(color.bar.normal, 0.28);
    }

    const gradient = ctx.createLinearGradient(
        0,
        chartArea.top,
        0,
        chartArea.bottom,
    );
    gradient.addColorStop(0, withOpacity(color.bar.highlight, 0.45));
    gradient.addColorStop(1, withOpacity(color.bar.normal, 0.08));

    return gradient;
};

export default () => {
    const appliedPhyEnabled = useSelector(getAppliedPhyEnabled);
    const phyThroughput = useSelector(getPhyThroughput);
    const phyUpdatedAt = useSelector(getPhyUpdatedAt);
    const phyMaxThroughput = useSelector(getPhyMaxThroughput);
    const virtualFileSizeMb = useSelector(getVirtualFileSizeMb);
    const fileTransferResetTrigger = useSelector(getFileTransferResetTrigger);
    const enableGraphOnSinglePhy = useSelector(getEnableGraphOnSinglePhy);
    const enableUartTerminal = useSelector(getEnableUartTerminal);
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
    const isSinglePhyActive = enabledIndices.length === 1;
    const singleActivePhyIndex = isSinglePhyActive ? enabledIndices[0] : -1;
    const shouldShowSinglePhyGraph =
        enableGraphOnSinglePhy && isSinglePhyActive;
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
    const [singlePhyHistory, setSinglePhyHistory] = useState<
        ThroughputSample[]
    >([]);
    const [singlePhyHistoryArmed, setSinglePhyHistoryArmed] =
        useState(false);
    const lastTickRef = useRef(now);
    const lastSampledUpdatedAtRef = useRef(0);
    const lastSinglePhyProgressRef = useRef<number | null>(null);

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

    // Reset file transfer progress and elapsed time when fileTransferResetTrigger changes
    useEffect(() => {
        setFileTransferProgress(prevProgress => prevProgress.map(() => 0));
        setFileTransferElapsedMs(prevElapsed => prevElapsed.map(() => 0));
        setSinglePhyHistory([]);
        lastSampledUpdatedAtRef.current = 0;
        setSinglePhyHistoryArmed(shouldShowSinglePhyGraph);
    }, [fileTransferResetTrigger]);

    useEffect(() => {
        if (shouldShowSinglePhyGraph) return;

        setSinglePhyHistory([]);
        lastSampledUpdatedAtRef.current = 0;
        lastSinglePhyProgressRef.current = null;
        setSinglePhyHistoryArmed(false);
    }, [shouldShowSinglePhyGraph]);

    useEffect(() => {
        if (!shouldShowSinglePhyGraph || singleActivePhyIndex < 0) {
            lastSinglePhyProgressRef.current = null;
            return;
        }

        const currentProgress = fileTransferProgress[singleActivePhyIndex] ?? 0;
        const previousProgress = lastSinglePhyProgressRef.current;

        if (
            previousProgress !== null &&
            currentProgress < previousProgress
        ) {
            setSinglePhyHistory([]);
            lastSampledUpdatedAtRef.current = 0;
            setSinglePhyHistoryArmed(true);
        }

        lastSinglePhyProgressRef.current = currentProgress;
    }, [
        fileTransferProgress,
        shouldShowSinglePhyGraph,
        singleActivePhyIndex,
    ]);

    useEffect(() => {
        const previous = lastTickRef.current;
        lastTickRef.current = now;
        const dtMs = now - previous;
        if (dtMs <= 0) return;

        const clampedFileSizeMb = Math.max(1, virtualFileSizeMb);
        const fileSizeBits = clampedFileSizeMb * 1024 * 1024 * 8;

        // Simulate file transfer progress for a virtual file size per PHY.
        // Interpret throughput as kbps and advance progress according to
        // actual download time for that file size.
        setFileTransferProgress(prevProgress =>
            prevProgress.map((value, index) => {
                const throughputKbps = activeThroughput[index] ?? 0;
                if (throughputKbps <= 0) return value;

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
    }, [
        now,
        activeThroughput,
        fileTransferProgress,
        fileTransferElapsedMs,
        bestCompletedElapsedMs,
        virtualFileSizeMb,
    ]);

    useEffect(() => {
        if (
            !singlePhyHistoryArmed ||
            !shouldShowSinglePhyGraph ||
            singleActivePhyIndex < 0
        ) {
            return;
        }

        const updatedAt = phyUpdatedAt[singleActivePhyIndex] ?? 0;
        if (!updatedAt || updatedAt === lastSampledUpdatedAtRef.current) {
            return;
        }

        lastSampledUpdatedAtRef.current = updatedAt;

        setSinglePhyHistory(previousHistory => {
            const progressPercent =
                fileTransferProgress[singleActivePhyIndex] ?? 0;
            const throughputKbps = activeThroughput[singleActivePhyIndex] ?? 0;
            const nextSample = { progressPercent, throughputKbps };
            const lastSample = previousHistory[previousHistory.length - 1];

            if (
                lastSample &&
                lastSample.progressPercent === nextSample.progressPercent &&
                lastSample.throughputKbps === nextSample.throughputKbps
            ) {
                return previousHistory;
            }

            return [...previousHistory, nextSample];
        });
    }, [
        activeThroughput,
        fileTransferProgress,
        fileTransferElapsedMs,
        phyUpdatedAt,
        shouldShowSinglePhyGraph,
        singleActivePhyIndex,
        singlePhyHistoryArmed,
    ]);

    const singlePhyGraphPoints = useMemo(
        () =>
            singlePhyHistory.map(sample => ({
                x: sample.progressPercent,
                y: sample.throughputKbps,
            })),
        [singlePhyHistory],
    );

    const currentSinglePhyThroughput =
        singleActivePhyIndex >= 0 ? activeThroughput[singleActivePhyIndex] ?? 0 : 0;
    const singlePhyGraphMax = Math.max(
        MIN_GRAPH_MAX_KBPS,
        Math.ceil(
            (Math.max(
                currentSinglePhyThroughput,
                ...singlePhyHistory.map(sample => sample.throughputKbps),
            ) * GRAPH_Y_HEADROOM) /
                100,
        ) * 100,
    );

    const throughputBar = (
        <Bar
            data={{
                labels: visibleLabels,
                datasets: [
                    {
                        label: 'Max throughput',
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
                            index => fileTransferProgress[index] ?? 0,
                        ),
                        elapsedMs: enabledIndices.map(
                            index => fileTransferElapsedMs[index] ?? 0,
                        ),
                        fileSizeMb: enabledIndices.map(() => virtualFileSizeMb),
                        bestCompletedMs: enabledIndices.map(
                            index => bestCompletedElapsedMs[index] ?? 0,
                        ),
                        datalabels: {
                            display: false,
                        },
                    } as any,
                    {
                        label: 'Throughput',
                        backgroundColor: enabledIndices.map(index => {
                            if (index === lastUpdatedPhyIndex) {
                                return color.bar.highlight;
                            }
                            return color.bar.normal;
                        }),
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
    );

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
                    {shouldShowSinglePhyGraph ? (
                        <div className="d-flex flex-column h-100" style={{ gap: 16 }}>
                            <div style={{ flex: '0 0 38%', minHeight: 0 }}>
                                <Line
                                    data={{
                                        datasets: [
                                            {
                                                label: 'Transfer history',
                                                data: singlePhyGraphPoints,
                                                parsing: false,
                                                fill: true,
                                                borderColor: color.bar.highlight,
                                                backgroundColor: (context: any) =>
                                                    createTransferHistoryGradient(
                                                        context.chart,
                                                    ),
                                                pointRadius: 0,
                                                pointHitRadius: 8,
                                                pointHoverRadius: 0,
                                                tension: 0.25,
                                                borderWidth: 2,
                                            },
                                        ],
                                    }}
                                    options={{
                                        responsive: true,
                                        animation: false,
                                        maintainAspectRatio: false,
                                        plugins: {
                                            legend: { display: false },
                                            tooltip: { enabled: false },
                                            datalabels: { display: false },
                                            title: {
                                                display: true,
                                                text: `${PHY_LABELS[singleActivePhyIndex]} transfer history`,
                                                align: 'start',
                                                color: color.label,
                                                font: { size: 14 },
                                                padding: { bottom: 12 },
                                            },
                                        },
                                        scales: {
                                            x: {
                                                type: 'linear',
                                                min: 0,
                                                max: GRAPH_X_MAX_PERCENT,
                                                grid: {
                                                    color: withOpacity(
                                                        color.bar.highlight,
                                                        0.08,
                                                    ),
                                                },
                                                border: {
                                                    display: false,
                                                },
                                                ticks: {
                                                    color: color.label,
                                                    maxTicksLimit: 6,
                                                    callback: (
                                                        value: string | number,
                                                    ) => `${value}%`,
                                                },
                                            },
                                            y: {
                                                min: 0,
                                                max: singlePhyGraphMax,
                                                grid: {
                                                    color: withOpacity(
                                                        color.bar.highlight,
                                                        0.08,
                                                    ),
                                                },
                                                border: {
                                                    display: false,
                                                },
                                                ticks: {
                                                    color: color.label,
                                                    precision: 0,
                                                    maxTicksLimit: 4,
                                                },
                                                title: {
                                                    display: true,
                                                    text: 'kbps',
                                                    color: color.label,
                                                    font: { size: 12 },
                                                },
                                            },
                                        },
                                        elements: {
                                            line: {
                                                capBezierPoints: true,
                                            },
                                        },
                                    } as any}
                                />
                            </div>
                            <div style={{ flex: '1 1 auto', minHeight: 0 }}>
                                {throughputBar}
                            </div>
                        </div>
                    ) : (
                        throughputBar
                    )}
                </Main>
                {enableUartTerminal && <UartTerminal />}
            </div>
        </div>
    );
};
