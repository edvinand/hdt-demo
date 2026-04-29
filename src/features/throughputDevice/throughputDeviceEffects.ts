/*
 * Copyright (c) 2015 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-4-Clause
 */

import {
    AppThunk,
    Device,
    DeviceSetupConfig,
    getAppFile,
    getDevices,
    isDeviceInDFUBootloader,
    jprogDeviceSetup,
    logger,
    prepareDevice,
    sdfuDeviceSetup,
} from '@nordicsemiconductor/pc-nrfconnect-shared';
import { SerialPort } from 'serialport';

import {
    clearDeviceSetupAttempt,
    clearSerialPort,
    hideCompanionProgrammingPrompt,
    markDeviceSetupAttemptStarted,
    setCompanionProgrammingError,
    setCompanionTargetSerial,
    setLastFlashedCompanionSerial,
    setSerialPort,
    showCompanionProgrammingPrompt,
} from './throughputDeviceSlice';

export const deviceSetupConfig: DeviceSetupConfig = {
    deviceSetups: [
        sdfuDeviceSetup(
            [
                {
                    key: 'pca10059',
                    application: getAppFile('fw/rssi-10059.hex'),
                    semver: 'rssi_cdc_acm 2.0.0+dfuMay-22-2018-10-43-22',
                    params: {},
                },
            ],
            true,
            d =>
                !isDeviceInDFUBootloader(d) &&
                !!d.serialPorts &&
                d.serialPorts.length > 0 &&
                !!d.traits.nordicUsb &&
                !!d.usb &&
                d.usb.device.descriptor.idProduct === 0xc00a,
        ),
        jprogDeviceSetup(
            [
                //{
                //    key: 'nrf52_family',
                //    fw: getAppFile('fw/rssi-10040.hex'),
                //    fwVersion: 'rssi-fw-1.0.0',
                //    fwIdAddress: 0x2000,
                //},
                {
                    key: 'PCA10156',
                    fw: getAppFile('fw/hdt-nrf54l15.hex'),
                    fwVersion: 'hdt-nrf54l15',
                    fwIdAddress: 0x0,
                },
                {
                    key: 'PCA10056',
                    fw: getAppFile('fw/hdt-nrf52840.hex'),
                    fwVersion: 'hdt-nrf52840',
                    fwIdAddress: 0x0,
                },
            ],
            true,
            true,
        ),
    ],
};

export const closeDevice = (): AppThunk => dispatch => {
    dispatch(clearSerialPort());
};

export const openDevice =
    (device: Device): AppThunk =>
    dispatch => {
        // Reset serial port settings
        const ports = device.serialPorts;

        if (ports && ports.length > 0) {
            const boardVersion =
                device.devkit?.boardVersion?.toUpperCase() ?? '';

            let portIndex: number;
            if (boardVersion === 'PCA10056') {
                // nRF52840DK: use COM0/VCOM0.
                portIndex = 0;
            } else if (boardVersion === 'PCA10156') {
                // nRF54L15DK: use COM1/VCOM1 when present, otherwise COM0.
                portIndex = ports.length > 1 ? 1 : 0;
            } else {
                // Default behavior for other boards.
                portIndex = ports.length > 1 ? 1 : 0;
            }

            const comPort = ports[portIndex].comName;
            if (comPort) {
                logger.info(
                    `Opening Serial port ${comPort} (board=${boardVersion}, index=${portIndex})`,
                );
                const serialPort = new SerialPort(
                    { path: comPort, baudRate: 115200 },
                    error => {
                        if (error) {
                            logger.error(
                                `Failed to open serial port ${comPort}.`,
                            );
                            logger.error(`Error ${error}.`);
                            return;
                        }

                        dispatch(setSerialPort(serialPort));
                        logger.info(`Serial Port ${comPort} has been opened`);
                    },
                );
            }
        }
    };

export const setupDeviceAndOpen =
    (device: Device): AppThunk =>
    (dispatch, getState) => {
        // Clear any stale companion state before starting a new main programming flow.
        dispatch(markDeviceSetupAttemptStarted());
        const family = device.devkit?.deviceFamily?.toLowerCase() ?? '';
        const boardVersion =
            device.devkit?.boardVersion?.toUpperCase() ?? '';

        dispatch(hideCompanionProgrammingPrompt());

        const isNrf54Family = family.includes('nrf54');
        const isNrf54Board =
            boardVersion === 'PCA10156' ||
            boardVersion === 'PCA10175' ||
            boardVersion === 'PCA10184' ||
            boardVersion === 'PCA10188';

        if (isNrf54Family || isNrf54Board) {
            logger.info(
                'Detected nRF54-family device. Skipping firmware version check and offering to program blinky firmware.',
            );
            const checkCurrentFirmwareVersion = false;
            const requireUserConfirmation = true;

            return dispatch(
                prepareDevice(
                    device,
                    deviceSetupConfig,
                    programmedDevice => {
                        dispatch(openDevice(programmedDevice));
                        if (getState().app.rssi.didRunProgrammingInCurrentSetup) {
                            dispatch(
                                openCompanionProgrammingPrompt(
                                    programmedDevice.serialNumber ?? '',
                                ),
                            );
                        }
                        dispatch(clearDeviceSetupAttempt());
                    },
                    reason => {
                        if (reason) {
                            logger.error('Device setup failed.', reason);
                        }
                        dispatch(clearDeviceSetupAttempt());
                    },
                    undefined,
                    checkCurrentFirmwareVersion,
                    requireUserConfirmation,
                ),
            );
        }

        const checkCurrentFirmwareVersion = true;
        const requireUserConfirmation = true;

        return dispatch(
            prepareDevice(
                device,
                deviceSetupConfig,
                programmedDevice => {
                    dispatch(openDevice(programmedDevice));
                    if (getState().app.rssi.didRunProgrammingInCurrentSetup) {
                        dispatch(
                            openCompanionProgrammingPrompt(
                                programmedDevice.serialNumber ?? '',
                            ),
                        );
                    }
                    dispatch(clearDeviceSetupAttempt());
                },
                reason => {
                    if (reason) {
                        logger.error('Device setup failed.', reason);
                    }
                    dispatch(clearDeviceSetupAttempt());
                },
                undefined,
                checkCurrentFirmwareVersion,
                requireUserConfirmation,
            ),
        );
    };

export const recoverHex =
    (device: Device): AppThunk =>
    (dispatch, getState) => {
        getState().app.rssi.serialPort?.close(() => {
            dispatch(clearSerialPort());
            dispatch(
                prepareDevice(
                    device,
                    deviceSetupConfig,
                    programmedDevice => {
                        dispatch(openDevice(programmedDevice));
                    },
                    () => {},
                    undefined,
                    false,
                    false,
                ),
            );
        });
    };

export const openCompanionProgrammingPrompt =
    (mainSerial: string): AppThunk =>
    (dispatch, getState) => {
        const connectedDevices = getDevices(getState());

        // Filter to compatible boards (PCA10156 and PCA10056) excluding the main device
        const eligibleCompanions = connectedDevices.filter(d => {
            const board = d.devkit?.boardVersion?.toUpperCase();
            const isEligible =
                (board === 'PCA10156' || board === 'PCA10056') &&
                d.serialNumber &&
                d.serialNumber !== mainSerial;
            return isEligible;
        });

        // If no eligible companions exist, skip the prompt entirely
        if (eligibleCompanions.length === 0) {
            logger.info(
                'No eligible companion devices available for programming.',
            );
            return;
        }

        // Show the companion programming prompt
        dispatch(showCompanionProgrammingPrompt({ mainSerial }));

        // Set default selection: try last flashed companion if still connected, else first eligible
        const lastFlashed = getState().app.rssi.lastFlashedCompanionSerial;
        const defaultCompanion =
            lastFlashed &&
            eligibleCompanions.some(d => d.serialNumber === lastFlashed)
                ? lastFlashed
                : eligibleCompanions[0].serialNumber ?? 'none';
        dispatch(setCompanionTargetSerial(defaultCompanion));
    };

export const confirmCompanionProgramming =
    (): AppThunk =>
    (dispatch, getState) => {
        const state = getState().app.rssi;
        const selectedSerial = state.companionTargetSerial;

        // If user selected "none", skip companion flashing and close dialog
        if (selectedSerial === 'none' || !selectedSerial) {
            logger.info('Skipping companion device programming (none selected)');
            dispatch(hideCompanionProgrammingPrompt());
            return;
        }

        // Get all connected devices and find the selected companion
        const connectedDevices = getDevices(getState());
        const selectedDevice = connectedDevices.find(
            d => d.serialNumber === selectedSerial,
        );

        // Validate that the selected device still exists and is eligible
        if (!selectedDevice) {
            dispatch(
                setCompanionProgrammingError(
                    `Selected companion (${selectedSerial}) is no longer connected.`,
                ),
            );
            return;
        }

        const board = selectedDevice.devkit?.boardVersion?.toUpperCase();
        if (board !== 'PCA10156' && board !== 'PCA10056') {
            dispatch(
                setCompanionProgrammingError(
                    `Selected device is not a compatible companion (${board}).`,
                ),
            );
            return;
        }

        const programmingCallback = (result: any) => {
            if (result?.serialNumber) {
                logger.info(
                    `Companion device (${result.serialNumber}) programmed successfully.`,
                );
                dispatch(setLastFlashedCompanionSerial(result.serialNumber));
                dispatch(hideCompanionProgrammingPrompt());
            }
        };

        const errorCallback = (reason?: unknown) => {
            if (reason) {
                logger.error('Companion device programming failed.', reason);
            }
            dispatch(
                setCompanionProgrammingError(
                    `Failed to program companion device: ${reason || 'unknown error'}`,
                ),
            );
        };

        // Program the companion device with the same firmware setup config
        // Set requireUserConfirmation to false since user already confirmed in companion dialog
        dispatch(
            prepareDevice(
                selectedDevice,
                deviceSetupConfig,
                programmingCallback,
                errorCallback,
                undefined,
                false,
                false,
            ),
        );
    };

export const cancelCompanionProgramming = (): AppThunk => dispatch => {
    logger.info('Companion device programming cancelled by user');
    dispatch(hideCompanionProgrammingPrompt());
};
