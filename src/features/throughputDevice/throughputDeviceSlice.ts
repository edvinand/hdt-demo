/*
 * Copyright (c) 2021 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-4-Clause
 */

import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { AutoDetectTypes } from '@serialport/bindings-cpp';
import { SerialPort } from 'serialport';

import type { RootState } from '../../app/store';
import { RssiDevice } from './createThroughputDevice';

const initialData = () => new Array(81).fill(undefined).map(() => []);

interface RssiState {
    isPaused: boolean;
    buffer: readonly number[];
    data: readonly (readonly number[])[];
    dataMax: readonly number[];
    delay: number;
    virtualFileSizeMb: number;
    pendingVirtualFileSizeMb: number;
    connectionIntervalUnits: number;
    packetSizeBytes: number;
    enableGraphOnSinglePhy: boolean;
    pendingEnableGraphOnSinglePhy: boolean;
    enableUartTerminal: boolean;
    pendingEnableUartTerminal: boolean;
    isPhyFrozen: boolean;
    noDataReceived: boolean;
    phyEnabled: boolean[];
    appliedPhyEnabled: boolean[];
    phyThroughput: number[];
    phyUpdatedAt: number[];
    phyMaxThroughput: number[];
    uartLog: { direction: 'tx' | 'rx'; text: string }[];
    fileTransferResetTrigger: number;
    serialPort?: SerialPort<AutoDetectTypes>;
    rssiDevice?: RssiDevice;
}

const initialState: RssiState = {
    isPaused: false,
    buffer: [],
    data: initialData(),
    dataMax: [],
    delay: 5,
    virtualFileSizeMb: 100,
    pendingVirtualFileSizeMb: 100,
    connectionIntervalUnits: 40,
    packetSizeBytes: 247,
    enableGraphOnSinglePhy: true,
    pendingEnableGraphOnSinglePhy: true,
    enableUartTerminal: false,
    pendingEnableUartTerminal: false,
    isPhyFrozen: false,
    noDataReceived: false,
    phyEnabled: [true, true, true, true, true, true, true],
    appliedPhyEnabled: [true, true, true, true, true, true, true],
    phyThroughput: [0, 0, 0, 0, 0, 0, 0],
    phyUpdatedAt: [0, 0, 0, 0, 0, 0, 0],
    phyMaxThroughput: [0, 0, 0, 0, 0, 0, 0],
    uartLog: [],
    fileTransferResetTrigger: 0,
};

const rssiSlice = createSlice({
    name: 'rssi',
    initialState,
    reducers: {
        setSerialPort: (
            state,
            action: PayloadAction<SerialPort<AutoDetectTypes>>,
        ) => {
            state.serialPort = action.payload;
        },
        setRssiDevice: (state, action: PayloadAction<RssiDevice>) => {
            state.rssiDevice = action.payload;
        },

        clearSerialPort: state => {
            state.serialPort = undefined;
            state.rssiDevice = undefined;
        },

        toggleIsPaused: state => {
            state.isPaused = !state.isPaused;
        },

        clearRssiData: state => {
            state.data = initialData();
            state.dataMax = [];
            state.noDataReceived = false;
        },

        resetRssiStore: state => {
            state.buffer = [];
            state.data = initialData();
            state.dataMax = [];
            state.noDataReceived = false;
            state.isPaused = false;
            state.isPhyFrozen = false;
        },

        loadDefaultConfig: state => {
            state.delay = initialState.delay;
            state.phyEnabled = [...initialState.phyEnabled];
            state.virtualFileSizeMb = initialState.virtualFileSizeMb;
            state.pendingVirtualFileSizeMb = initialState.pendingVirtualFileSizeMb;
            state.connectionIntervalUnits = initialState.connectionIntervalUnits;
            state.packetSizeBytes = initialState.packetSizeBytes;
            state.enableGraphOnSinglePhy = initialState.enableGraphOnSinglePhy;
            state.pendingEnableGraphOnSinglePhy = initialState.pendingEnableGraphOnSinglePhy;
            state.enableUartTerminal = initialState.enableUartTerminal;
            state.pendingEnableUartTerminal = initialState.pendingEnableUartTerminal;
        },

        applyCurrentPhyEnabled: state => {
            state.appliedPhyEnabled = [...state.phyEnabled];
        },

        setDelay: (state, action: PayloadAction<number>) => {
            state.delay = action.payload;
        },

        setVirtualFileSizeMb: (state, action: PayloadAction<number>) => {
            state.virtualFileSizeMb = action.payload;
        },

        setPendingVirtualFileSizeMb: (state, action: PayloadAction<number>) => {
            state.pendingVirtualFileSizeMb = action.payload;
        },

        applyVirtualFileSizeMb: state => {
            state.virtualFileSizeMb = state.pendingVirtualFileSizeMb;
            state.fileTransferResetTrigger += 1;
        },

        setConnectionIntervalUnits: (state, action: PayloadAction<number>) => {
            state.connectionIntervalUnits = action.payload;
        },

        setPacketSizeBytes: (state, action: PayloadAction<number>) => {
            state.packetSizeBytes = action.payload;
        },

        setEnableGraphOnSinglePhy: (
            state,
            action: PayloadAction<boolean>,
        ) => {
            state.pendingEnableGraphOnSinglePhy = action.payload;
        },

        applyEnableGraphOnSinglePhy: state => {
            state.enableGraphOnSinglePhy = state.pendingEnableGraphOnSinglePhy;
        },

        setEnableUartTerminal: (state, action: PayloadAction<boolean>) => {
            state.pendingEnableUartTerminal = action.payload;
        },

        applyEnableUartTerminal: state => {
            state.enableUartTerminal = state.pendingEnableUartTerminal;
        },

        setIsPhyFrozen: (state, action: PayloadAction<boolean>) => {
            state.isPhyFrozen = action.payload;
        },

        resetIsPhyFrozen: state => {
            state.isPhyFrozen = false;
        },

        setPhyEnabled: (
            state,
            action: PayloadAction<{ index: number; enabled: boolean }>,
        ) => {
            const { index, enabled } = action.payload;

            if (index >= 0 && index < state.phyEnabled.length) {
                state.phyEnabled[index] = enabled;
            }
        },

        logUart: (
            state,
            action: PayloadAction<{ direction: 'tx' | 'rx'; text: string }>,
        ) => {
            state.uartLog = [...state.uartLog, action.payload].slice(-50);
        },

        onReceiveRssiData: (state, action: PayloadAction<Buffer>) => {
            if (!state.serialPort || !state.serialPort.isOpen) {
                state.data = initialData();
                state.dataMax = [];
                return;
            }

            if (state.isPaused) {
                return;
            }

            state.buffer = [...state.buffer, ...action.payload];

            if (state.buffer.length > 246) {
                state.buffer.splice(0, state.buffer.length - 246);
            }

            // Expect frames of the form:
            // [0xff][phy][throughput_hi][throughput_lo]
            // where throughput is a 16-bit value (kbps).
            while (state.buffer.length >= 4) {
                // Discard until we find the frame marker 0xff
                while (state.buffer.length && state.buffer.shift() !== 0xff);

                // Need at least PHY + 2 throughput bytes remaining
                if (state.buffer.length < 3) break;

                const [phy, throughputHi, throughputLo] =
                    state.buffer.splice(0, 3);
                const throughput = (throughputHi << 8) | throughputLo;

                if (phy >= 0 && phy < state.phyThroughput.length) {
                    state.phyThroughput[phy] = throughput;
                    state.phyUpdatedAt[phy] = Date.now();
                    const currentMax = state.phyMaxThroughput[phy] ?? 0;
                    if (throughput > currentMax) {
                        state.phyMaxThroughput[phy] = throughput;
                    }
                }
            }
        },

        onReceiveNoRssiData: state => {
            if (state.isPaused) {
                return;
            }
            state.noDataReceived = true;
        },
    },
});

export const getSerialPort = (state: RootState) => state.app.rssi.serialPort;
export const getRssiDevice = (state: RootState) => state.app.rssi.rssiDevice;
export const getIsConnected = (state: RootState) => !!state.app.rssi.serialPort;
export const getIsPaused = (state: RootState) => state.app.rssi.isPaused;

export const getRssi = (state: RootState) =>
    state.app.rssi.data.map(scan => scan[0]);
export const getRssiMax = (state: RootState) => state.app.rssi.dataMax;
export const getDelay = (state: RootState) => state.app.rssi.delay;
export const getVirtualFileSizeMb = (state: RootState) =>
    state.app.rssi.virtualFileSizeMb;
export const getPendingVirtualFileSizeMb = (state: RootState) =>
    state.app.rssi.pendingVirtualFileSizeMb;
export const getFileTransferResetTrigger = (state: RootState) =>
    state.app.rssi.fileTransferResetTrigger;
export const getConnectionIntervalUnits = (state: RootState) =>
    state.app.rssi.connectionIntervalUnits;
export const getPacketSizeBytes = (state: RootState) =>
    state.app.rssi.packetSizeBytes;
export const getEnableGraphOnSinglePhy = (state: RootState) =>
    state.app.rssi.enableGraphOnSinglePhy;
export const getPendingEnableGraphOnSinglePhy = (state: RootState) =>
    state.app.rssi.pendingEnableGraphOnSinglePhy;
export const getEnableUartTerminal = (state: RootState) =>
    state.app.rssi.enableUartTerminal;
export const getPendingEnableUartTerminal = (state: RootState) =>
    state.app.rssi.pendingEnableUartTerminal;
export const getIsPhyFrozen = (state: RootState) => state.app.rssi.isPhyFrozen;

export const getNoDataReceived = (state: RootState) =>
    state.app.rssi.noDataReceived;

export const getPhyEnabled = (state: RootState) => state.app.rssi.phyEnabled;
export const getAppliedPhyEnabled = (state: RootState) =>
    state.app.rssi.appliedPhyEnabled;
export const getPhyThroughput = (state: RootState) =>
    state.app.rssi.phyThroughput;
export const getPhyUpdatedAt = (state: RootState) =>
    state.app.rssi.phyUpdatedAt;
export const getPhyMaxThroughput = (state: RootState) =>
    state.app.rssi.phyMaxThroughput;
export const getUartLog = (state: RootState) => state.app.rssi.uartLog;

export const {
    setSerialPort,
    setRssiDevice,
    clearSerialPort,
    toggleIsPaused,
    resetRssiStore,
    clearRssiData,
    setDelay,
    setVirtualFileSizeMb,
    setPendingVirtualFileSizeMb,
    applyVirtualFileSizeMb,
    setConnectionIntervalUnits,
    setPacketSizeBytes,
    setEnableGraphOnSinglePhy,
    applyEnableGraphOnSinglePhy,
    setEnableUartTerminal,
    applyEnableUartTerminal,
    setIsPhyFrozen,
    resetIsPhyFrozen,
    setPhyEnabled,
    applyCurrentPhyEnabled,
    loadDefaultConfig,
    logUart,
    onReceiveRssiData,
    onReceiveNoRssiData,
} = rssiSlice.actions;
export default rssiSlice.reducer;
