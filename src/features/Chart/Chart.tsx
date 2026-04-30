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
    ConfirmationDialog,
    getDevices,
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

import { recoverHex, confirmCompanionProgramming, cancelCompanionProgramming } from '../throughputDevice/throughputDeviceEffects';
import {
    getNoDataReceived,
    getAppliedPhyEnabled,
    getPhyThroughput,
    getPhyUpdatedAt,
    getPhyMaxThroughput,
    getVirtualFileSizeMb,
    getFileTransferResetTrigger,
    getEnableGraphOnSinglePhy,
    getEnableProgressBars,
    getEnableUartTerminal,
    getDisplayType,
    getShowCompanionProgrammingPrompt,
    getCompanionTargetSerial,
    getCompanionProgrammingError,
    getMainProgrammedSerial,
    getShowStartupDialog,
    hideStartupDialog,
    setCompanionTargetSerial,
} from '../throughputDevice/throughputDeviceSlice';
import UartTerminal from '../throughputDevice/UartTerminal';
import { PHY_LABELS } from '../throughputDevice/phyLabels';
import color from './rssiColors';
import GaugeView from './GaugeView';

import './alert.scss';

// Per-PHY theoretical maximum kbps (index matches PHY_LABELS and appliedPhyEnabled)
const PHY_MAX_KBPS = [7500, 6000, 4000, 3000, 2000, 2000, 1000];
const ROBOTO_FONT_FAMILY = 'Roboto, "Segoe UI", sans-serif';
const STARTUP_DIALOG_DISMISSED_KEY = 'hdt-demo.startup-dialog-dismissed';

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
        const showProgressBars = fileTransferDataset?.showProgressBars !== false;
        const fileTransferData: number[] =
            fileTransferDataset?.data ?? [];
        const elapsedData: number[] = fileTransferDataset?.elapsedMs ?? [];
        const fileSizeMbData: number[] = fileTransferDataset?.fileSizeMb ?? [];

        const maxData: number[] =
            maxIndex >= 0 ? (chart.data.datasets[maxIndex] as any).actualMaxValues ?? [] : [];

        const xLeft = xScale.getPixelForValue(0);
        const trackWidth = chartArea.right - xLeft;

        const maxMeta =
            maxIndex >= 0 ? chart.getDatasetMeta(maxIndex) : undefined;

        // Compute available height per category slot so all rows
        // shrink equally when space is tight instead of only the last.
        const phyCount = meta.data.length;
        const slotHeight =
            phyCount > 1
                ? Math.abs(
                      (meta.data[1].y as number) -
                          (meta.data[0].y as number),
                  )
                : chartArea.bottom - chartArea.top;

        meta.data.forEach((bar: any, index: number) => {
            const percent = fileTransferData[index] ?? 0;
            const elapsedMs = elapsedData[index] ?? 0;
            const fileSizeMb = fileSizeMbData[index] ?? 100;

            const halfHeight = (bar.height as number) / 2;
            const yBottom = (bar.y as number) + halfHeight;
            const barHeight = Math.max(1, bar.height as number);

            // Skip bars that are entirely outside the chart area
            if (yBottom < chartArea.top || (bar.y as number) - halfHeight > chartArea.bottom) {
                return;
            }

            let fontSizeLabel = Math.max(10, Math.floor(barHeight * 0.55));
            if (phyCount <= 5) {
                fontSizeLabel = Math.max(fontSizeLabel, 18);
            }
            fontSizeLabel = Math.min(fontSizeLabel, 20);
            const throughputFontSize = Math.min(22, fontSizeLabel + 2);
            const progressFontSize = Math.max(10, fontSizeLabel - 2);

            const rawValue = throughputData[index];
            const safeValue =
                rawValue === undefined || rawValue === null || Number.isNaN(rawValue)
                    ? 0
                    : rawValue;

            const rawMax = maxData[index];
            const safeMax =
                rawMax === undefined || rawMax === null || Number.isNaN(rawMax)
                    ? 0
                    : rawMax;

            // Black vertical line at the max recorded value position
            if (safeMax > 0) {
                const xMax = xScale.getPixelForValue(safeMax);
                ctx.save();
                ctx.strokeStyle = '#000000';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(xMax, (bar.y as number) - halfHeight);
                ctx.lineTo(xMax, (bar.y as number) + halfHeight);
                ctx.stroke();
                ctx.restore();
            }

            // Resolve this bar's fill color so the label matches the bar
            const barColors = chart.data.datasets[throughputIndex].backgroundColor as string[] | string;
            const barFillColor = Array.isArray(barColors)
                ? (barColors[index] ?? color.bar.normal)
                : (barColors ?? color.bar.normal);

            const labelGap = 5; // px between bar bottom and label, and between progress bar and label

            // Throughput label below the throughput bar
            const throughputTextY = yBottom + labelGap;
            const label = `${safeValue} / ${safeMax} kbps`;

            ctx.save();
            ctx.font = `bold ${throughputFontSize}px ${ROBOTO_FONT_FAMILY}`;
            ctx.fillStyle = barFillColor;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            ctx.fillText(label, xLeft + 10, throughputTextY);
            ctx.restore();

            // Progress bar positioned below the throughput label
            const spaceBelow = slotHeight / 2 - halfHeight;
            const trackHeight = Math.min(
                barHeight * 0.35,
                Math.max(8, Math.round(spaceBelow * 0.3)),
            );
            const trackY = throughputTextY + throughputFontSize + labelGap;

            if (
                showProgressBars &&
                trackY + trackHeight >= chartArea.top &&
                trackWidth > 0
            ) {
                ctx.save();
                ctx.fillStyle = color.bar.background;
                ctx.fillRect(xLeft, trackY, trackWidth, trackHeight);
                ctx.fillStyle = color.bar.normal;
                const clampedPercent = Math.max(0, Math.min(100, percent));
                ctx.fillRect(
                    xLeft,
                    trackY,
                    (trackWidth * clampedPercent) / 100,
                    trackHeight,
                );
                ctx.restore();

                // Progress labels below the progress bar
                const totalSeconds = Math.floor(elapsedMs / 1000);
                const minutes = Math.floor(totalSeconds / 60);
                const seconds = totalSeconds % 60;
                const timeLabel = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

                const bestCompletedMs = (fileTransferDataset as any)?.bestCompletedMs?.[index] ?? 0;
                const bestTotalSeconds = Math.floor(bestCompletedMs / 1000);
                const bestMinutes = Math.floor(bestTotalSeconds / 60);
                const bestSeconds = bestTotalSeconds % 60;
                const bestTimeLabel = `${String(bestMinutes).padStart(2, '0')}:${String(bestSeconds).padStart(2, '0')}`;

                const progressTextY = trackY + trackHeight + labelGap;
                ctx.save();
                ctx.font = `${progressFontSize}px ${ROBOTO_FONT_FAMILY}`;
                ctx.fillStyle = color.bar.normal;
                ctx.textAlign = 'left';
                ctx.textBaseline = 'top';
                ctx.fillText(
                    `${Math.round(clampedPercent)}% of ${fileSizeMb}MB (${timeLabel})`,
                    xLeft + 10,
                    progressTextY,
                );
                ctx.textAlign = 'right';
                ctx.fillText(
                    `Best: ${bestTimeLabel}`,
                    xLeft + trackWidth - 10,
                    progressTextY,
                );
                ctx.restore();
            }
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

Chart.defaults.font.family = ROBOTO_FONT_FAMILY;

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
    const enableProgressBars = useSelector(getEnableProgressBars);
    const enableUartTerminal = useSelector(getEnableUartTerminal);
    const displayType = useSelector(getDisplayType);
    const device = useSelector(selectedDevice);
    const readbackProtection = useSelector(getReadbackProtection);
    const noData = useSelector(getNoDataReceived);
    const showCompanionPrompt = useSelector(getShowCompanionProgrammingPrompt);
    const companionTargetSerial = useSelector(getCompanionTargetSerial);
    const companionProgrammingError = useSelector(
        getCompanionProgrammingError,
    );
    const mainProgrammedSerial = useSelector(getMainProgrammedSerial);
    const connectedDevices = useSelector(getDevices);
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
    const visibleCapacityMax = enabledIndices.map(index => PHY_MAX_KBPS[index] ?? 1000);
    const visibleChartMax = Math.max(100, ...visibleCapacityMax);
    const isSinglePhyActive = enabledIndices.length === 1;
    const singleActivePhyIndex = isSinglePhyActive ? enabledIndices[0] : -1;
    const shouldShowSinglePhyGraph =
        enableGraphOnSinglePhy && isSinglePhyActive;
    const [now, setNow] = useState(() => Date.now());
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
    const showStartupDialog = useSelector(getShowStartupDialog);
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

    // Compute eligible companion devices for the prompt
    const eligibleCompanionDevices = useMemo(() => {
        if (!mainProgrammedSerial) return [];
        return connectedDevices
            .filter(d => {
                const board = d.devkit?.boardVersion?.toUpperCase();
                return (
                    (board === 'PCA10156' || board === 'PCA10056') &&
                    d.serialNumber &&
                    d.serialNumber !== mainProgrammedSerial
                );
            })
            .map(d => ({
                serialNumber: d.serialNumber!,
                boardVersion: d.devkit?.boardVersion ?? 'Device',
            }));
    }, [mainProgrammedSerial, connectedDevices]);

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
                        maxBarThickness: 50,
                        datalabels: {
                            display: false,
                        },
                        data: visibleCapacityMax,
                        actualMaxValues: visibleMaxThroughput,
                    } as any,
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
                        showProgressBars: enableProgressBars,
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
                        maxBarThickness: 50,
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
                        max: visibleChartMax,
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
        <div className="d-flex flex-column h-100 chart-main-pane">
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
                    {displayType === 'gauge' ? (
                        <GaugeView
                            singlePhyTopContent={
                                shouldShowSinglePhyGraph ? (
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
                                                    border: { display: false },
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
                                                    border: { display: false },
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
                                                line: { capBezierPoints: true },
                                            },
                                        } as any}
                                    />
                                ) : undefined
                            }
                        />
                    ) : shouldShowSinglePhyGraph ? (
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
            <ConfirmationDialog
                isVisible={showStartupDialog}
                title="Getting Started with HDT Demo"
                confirmLabel="Ok"
                onConfirm={() => dispatch(hideStartupDialog())}
                optionalLabel="Don't show again"
                onOptional={() => {
                    localStorage.setItem(STARTUP_DIALOG_DISMISSED_KEY, 'true');
                    dispatch(hideStartupDialog());
                }}
            >
                <div style={{ maxWidth: 520, fontSize: 13, lineHeight: 1.6 }}>
                    <section style={{ marginBottom: 16 }}>
                        <strong style={{ fontSize: 14 }}>Hardware Requirements</strong>
                        <p style={{ margin: '6px 0 0' }}>
                            You need two Nordic development kits:
                        </p>
                        <ul style={{ margin: '6px 0 0', paddingLeft: 20 }}>
                            <li>
                                <strong>Primary device</strong> — DK connected to this
                                PC (PCA10156/nRF54L15 DK for HDT PHYs, or PCA10056/nRF52840 DK for standard BLE)
                            </li>
                            <li>
                                <strong>Companion device</strong> — a second DK running
                                the companion firmware (central role)
                            </li>
                        </ul>
                    </section>

                    <section style={{ marginBottom: 16 }}>
                        <strong style={{ fontSize: 14 }}>Getting Started</strong>
                        <ol style={{ margin: '6px 0 0', paddingLeft: 20 }}>
                            <li>
                                Connect and select your primary device using the device
                                selector at the top.
                            </li>
                            <li>
                                The app programs compatible firmware automatically. If the kit is already programmed with the correct firmware, you can skip this.
                            </li>
                            <li>
                                Select your desired PHYs and click{' '}
                                <strong>Write config</strong> to apply settings to the
                                device. (<strong>At evaluation state, only LE 1M and LE 2M are supported</strong>)
                            </li>
                            <li>
                                Live throughput per PHY is shown in the main view.
                            </li>
                        </ol>
                    </section>

                    <section style={{ marginBottom: 16 }}>
                        <strong style={{ fontSize: 14 }}>PHY Modes</strong>
                        <table
                            style={{
                                marginTop: 6,
                                width: '100%',
                                borderCollapse: 'collapse',
                                fontSize: 12,
                            }}
                        >
                            <thead>
                                <tr style={{ borderBottom: '1px solid #ccc' }}>
                                    <th
                                        style={{
                                            textAlign: 'left',
                                            padding: '3px 8px 3px 0',
                                        }}
                                    >
                                        PHY
                                    </th>
                                    <th
                                        style={{
                                            textAlign: 'left',
                                            padding: '3px 8px',
                                        }}
                                    >
                                        Peak throughput
                                    </th>
                                    <th
                                        style={{
                                            textAlign: 'left',
                                            padding: '3px 0',
                                        }}
                                    >
                                        Requires
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {(
                                    [
                                        ['HDT7.5', '~7500 kbps', 'PCA10156'],
                                        ['HDT6', '~6000 kbps', 'PCA10156'],
                                        ['HDT4', '~4000 kbps', 'PCA10156'],
                                        ['HDT3', '~3000 kbps', 'PCA10156'],
                                        ['HDT2', '~2000 kbps', 'PCA10156'],
                                        [
                                            'LE 2M',
                                            '~1300 kbps',
                                            'PCA10156 / PCA10056',
                                        ],
                                        [
                                            'LE 1M',
                                            '~740 kbps',
                                            'PCA10156 / PCA10056',
                                        ],
                                    ] as [string, string, string][]
                                ).map(([phy, kbps, hw]) => (
                                    <tr
                                        key={phy}
                                        style={{ borderBottom: '1px solid #eee' }}
                                    >
                                        <td
                                            style={{
                                                padding: '3px 8px 3px 0',
                                                fontWeight: 500,
                                            }}
                                        >
                                            {phy}
                                        </td>
                                        <td style={{ padding: '3px 8px' }}>
                                            {kbps}
                                        </td>
                                        <td
                                            style={{
                                                padding: '3px 0',
                                                color: '#555',
                                            }}
                                        >
                                            {hw}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </section>

                    <section>
                        <strong style={{ fontSize: 14 }}>Tips</strong>
                        <ul style={{ margin: '6px 0 0', paddingLeft: 20 }}>
                            <li>
                                Use <strong>Bars</strong> view for a side-by-side PHY
                                comparison; use <strong>Gauge</strong> speedometer style readout.
                            </li>
                            <li>
                                Enable <strong>Progress bars</strong> in Advanced to
                                simulate a virtual file transfer.
                            </li>
                            <li>
                                <strong>Write config</strong> applies your PHY selection
                                and settings to the connected device.
                            </li>
                            <li>
                                When only one PHY is enabled, you can see the
                                throughput history over time in the single PHY 
                                graph. Use this to see how throughput evolves during 
                                a transfer, and how it is affected by distance, 
                                obstacles, etc.
                            </li>
                            <li>
                                Reopen this dialog anytime via the{' '}
                                <strong>Help</strong> button at the bottom of the side
                                panel.
                            </li>
                        </ul>
                    </section>
                </div>
            </ConfirmationDialog>
            {showCompanionPrompt && (
                <ConfirmationDialog
                    isVisible={showCompanionPrompt}
                    title="Program Companion Device"
                    onConfirm={() => dispatch(confirmCompanionProgramming())}
                    onCancel={() => dispatch(cancelCompanionProgramming())}
                >
                    <div style={{ minWidth: '400px', maxWidth: '600px' }}>
                        {companionProgrammingError && (
                            <div
                                style={{
                                    marginBottom: '12px',
                                    padding: '8px 12px',
                                    backgroundColor: '#fee',
                                    borderLeft: '3px solid #c33',
                                    borderRadius: '4px',
                                    color: '#c33',
                                    fontSize: '14px',
                                }}
                            >
                                {companionProgrammingError}
                            </div>
                        )}
                        <label
                            style={{
                                display: 'block',
                                marginBottom: '12px',
                                fontSize: '14px',
                                fontWeight: 500,
                            }}
                        >
                            Select companion device:
                        </label>
                        <select
                            value={companionTargetSerial ?? 'none'}
                            onChange={e =>
                                dispatch(setCompanionTargetSerial(e.target.value))
                            }
                            style={{
                                display: 'block',
                                width: '100%',
                                padding: '8px',
                                borderRadius: '4px',
                                border: '1px solid #ccc',
                                fontSize: '14px',
                                cursor: 'pointer',
                                marginBottom: '12px',
                            }}
                        >
                            <option value="none">No companion device</option>
                            {eligibleCompanionDevices.map(device => (
                                <option
                                    key={device.serialNumber}
                                    value={device.serialNumber}
                                >
                                    {device.boardVersion} ({device.serialNumber})
                                </option>
                            ))}
                        </select>
                        <p style={{ fontSize: '13px', color: '#666', margin: 0 }}>
                            If you select a device above and click Program, the same
                            firmware as the main device will be flashed to it. Select
                            "No companion device" to skip this step.
                        </p>
                    </div>
                </ConfirmationDialog>
            )}
        </div>
    );
};
