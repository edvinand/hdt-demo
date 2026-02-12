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
    noDataReceived: boolean;
    phyEnabled: boolean[];
    phyThroughput: number[];
    phyUpdatedAt: number[];
    phyMaxThroughput: number[];
    uartLog: { direction: 'tx' | 'rx'; text: string }[];
    serialPort?: SerialPort<AutoDetectTypes>;
    rssiDevice?: RssiDevice;
}

const initialState: RssiState = {
    isPaused: false,
    buffer: [],
    data: initialData(),
    dataMax: [],
    delay: 5,
    noDataReceived: false,
    phyEnabled: [true, true, true, true, true],
    phyThroughput: [0, 0, 0, 0, 0],
    phyUpdatedAt: [0, 0, 0, 0, 0],
    phyMaxThroughput: [0, 0, 0, 0, 0],
    uartLog: [],
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
        },

        loadDefaultConfig: state => {
            state.delay = initialState.delay;
            state.phyEnabled = [...initialState.phyEnabled];
        },

        setDelay: (state, action: PayloadAction<number>) => {
            state.delay = action.payload;
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
            while (state.buffer.length >= 3) {
                while (state.buffer.length && state.buffer.shift() !== 0xff);

                const [phy, throughput] = state.buffer.splice(0, 2);
                if (phy !== 0xff && throughput !== 0xff) {
                    if (phy >= 0 && phy < state.phyThroughput.length) {
                        state.phyThroughput[phy] = throughput;
                        state.phyUpdatedAt[phy] = Date.now();
                        const currentMax = state.phyMaxThroughput[phy] ?? 0;
                        if (throughput > currentMax) {
                            state.phyMaxThroughput[phy] = throughput;
                        }
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

export const getNoDataReceived = (state: RootState) =>
    state.app.rssi.noDataReceived;

export const getPhyEnabled = (state: RootState) => state.app.rssi.phyEnabled;
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
    setPhyEnabled,
    loadDefaultConfig,
    logUart,
    onReceiveRssiData,
    onReceiveNoRssiData,
} = rssiSlice.actions;
export default rssiSlice.reducer;
