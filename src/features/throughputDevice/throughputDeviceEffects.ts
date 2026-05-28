/*
 * Copyright (c) 2015 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-4-Clause
 */

import {
    AppThunk,
    Device,
    DeviceSetup,
    DeviceSetupConfig,
    getAppFile,
    getDevices,
    isDeviceInDFUBootloader,
    jprogDeviceSetup,
    logger,
    prepareDevice,
    selectedDevice,
    sdfuDeviceSetup,
} from '@nordicsemiconductor/pc-nrfconnect-shared';
import { NrfutilDeviceLib } from '@nordicsemiconductor/pc-nrfconnect-shared/nrfutil/device';
import xRead from '@nordicsemiconductor/pc-nrfconnect-shared/nrfutil/device/xRead';
import { readFileSync } from 'fs';
import { SerialPort } from 'serialport';

import {
    applyCurrentPhyEnabled,
    applyEnableGraphOnSinglePhy,
    applyEnableProgressBars,
    applyEnableUartTerminal,
    applyOneActivePhyEnabled,
    applyShowAverageThroughput,
    applyVirtualFileSizeMb,
    clearCompanionProgrammingError,
    clearDeviceSetupAttempt,
    clearOneActivePhySequence,
    clearSerialPort,
    initializeOneActivePhySequence,
    markDemoStarted,
    hideCompanionProgrammingPrompt,
    markDeviceSetupAttemptStarted,
    setCompanionProgrammingError,
    setCompanionTargetSerial,
    setIsCompanionProgrammingInProgress,
    setIsPaused,
    setLastFlashedCompanionSerial,
    setSerialPort,
    showCompanionProgrammingPrompt,
} from './throughputDeviceSlice';

type JprogEntry = {
    key: string;
    description?: string;
    fw: string;
    fwIdAddress: number;
    fwVersion: string;
};

const TAIL_COMPARE_BYTES = 20;
const hexTailCache = new Map<string, { startAddress: number; bytesHex: string }>();

const normalizeHex = (value: string) => value.replace(/[^0-9a-fA-F]/g, '').toUpperCase();

const parseReadIntelHexToBytes = (intelHex: string) => {
    const bytes: number[] = [];

    intelHex
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(line => line.startsWith(':') && line.length >= 11)
        .forEach(line => {
            const count = Number.parseInt(line.slice(1, 3), 16);
            const recordType = Number.parseInt(line.slice(7, 9), 16);
            if (recordType !== 0x00 || count <= 0) {
                return;
            }

            const data = line.slice(9, 9 + count * 2);
            for (let i = 0; i < data.length; i += 2) {
                bytes.push(Number.parseInt(data.slice(i, i + 2), 16));
            }
        });

    return bytes;
};

const getHexTailSignature = (fwPath: string, compareBytes = TAIL_COMPARE_BYTES) => {
    const cached = hexTailCache.get(fwPath);
    if (cached) {
        return cached;
    }

    const text = readFileSync(fwPath, 'utf8');
    const lines = text
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean);

    let upperAddress = 0;
    let segmentAddress = 0;
    const mem = new Map<number, number>();

    lines.forEach(line => {
        if (!line.startsWith(':') || line.length < 11) {
            return;
        }

        const count = Number.parseInt(line.slice(1, 3), 16);
        const addr = Number.parseInt(line.slice(3, 7), 16);
        const recordType = Number.parseInt(line.slice(7, 9), 16);
        const data = line.slice(9, 9 + count * 2);

        if (recordType === 0x04) {
            upperAddress = Number.parseInt(data, 16) << 16;
            segmentAddress = 0;
            return;
        }

        if (recordType === 0x02) {
            segmentAddress = Number.parseInt(data, 16) << 4;
            upperAddress = 0;
            return;
        }

        if (recordType !== 0x00 || count <= 0) {
            return;
        }

        const baseAddress = upperAddress + segmentAddress + addr;
        for (let i = 0; i < count; i += 1) {
            const byteHex = data.slice(i * 2, i * 2 + 2);
            mem.set(baseAddress + i, Number.parseInt(byteHex, 16));
        }
    });

    const addresses = [...mem.keys()].sort((a, b) => a - b);
    if (addresses.length < compareBytes) {
        throw new Error(`Firmware file ${fwPath} has too little data to compare.`);
    }

    const endAddress = addresses[addresses.length - 1] + 1;
    const startAddress = endAddress - compareBytes;
    const tailBytes: number[] = [];

    for (let address = startAddress; address < endAddress; address += 1) {
        const value = mem.get(address);
        if (value === undefined) {
            throw new Error(
                `Firmware file ${fwPath} has sparse data in tail range 0x${startAddress.toString(
                    16,
                )}-0x${(endAddress - 1).toString(16)}.`,
            );
        }
        tailBytes.push(value);
    }

    const result = {
        startAddress,
        bytesHex: tailBytes
            .map(byte => byte.toString(16).padStart(2, '0'))
            .join('')
            .toUpperCase(),
    };

    hexTailCache.set(fwPath, result);
    return result;
};

const matchingFirmwareForDevice = (
    device: Device,
    deviceInfo: Parameters<DeviceSetup['isExpectedFirmware']>[1],
    firmware: JprogEntry[],
) => {
    const family = (device.devkit?.deviceFamily || '').toLowerCase();
    const deviceType = (deviceInfo?.jlink?.deviceVersion || '').toLowerCase();
    const shortDeviceType = deviceType.split('_').shift();
    const boardVersion = (device.devkit?.boardVersion || '').toLowerCase();

    return firmware.filter(fw => {
        const key = fw.key.toLowerCase();
        return (
            key === deviceType ||
            key === shortDeviceType ||
            key === boardVersion ||
            key === family
        );
    });
};

const resetDeviceSafely = async (device: Device, role: string) => {
    try {
        await NrfutilDeviceLib.reset(device);
        logger.info(
            `Reset ${role} (${device.serialNumber ?? 'unknown'}).`,
        );
    } catch (error) {
        logger.warn(
            `Failed to reset ${role} (${device.serialNumber ?? 'unknown'}): ${String(
                error,
            )}`,
        );
    }
};

export const writeCurrentConfigToDevice = (): AppThunk =>
    async (dispatch, getState) => {
        const state = getState().app.rssi;
        if (!state.serialPort || !state.rssiDevice) {
            return;
        }

        const device = selectedDevice(getState());
        const isPca10056 =
            device?.devkit?.boardVersion?.toUpperCase() === 'PCA10056';

        const effectivePhyEnabled = state.phyEnabled.map(
            (enabled: boolean, index: number) =>
            isPca10056 && index < 5 ? false : enabled,
        );

        const firstActivePhyIndex = effectivePhyEnabled.findIndex(
            (enabled: boolean) => enabled,
        );
        const oneActiveStartMask = effectivePhyEnabled.map(
            (enabled: boolean, index: number) =>
                enabled && index === firstActivePhyIndex,
        );

        const shouldResumeOneActiveSequence =
            state.pendingOneActivePhyEnabled &&
            state.wasStopped &&
            state.oneActivePhySequenceActive &&
            state.oneActivePhyCurrentIndex >= 0;

        const phyMaskForWrite = state.pendingOneActivePhyEnabled
            ? shouldResumeOneActiveSequence
                ? state.appliedPhyEnabled
                : oneActiveStartMask
            : effectivePhyEnabled;

        dispatch(setIsPaused(false));
        dispatch(applyVirtualFileSizeMb());
        dispatch(applyEnableGraphOnSinglePhy());
        dispatch(applyEnableProgressBars());
        dispatch(applyEnableUartTerminal());
        dispatch(applyShowAverageThroughput());
        dispatch(applyOneActivePhyEnabled());

        if (state.pendingOneActivePhyEnabled) {
            if (!shouldResumeOneActiveSequence) {
                dispatch(initializeOneActivePhySequence(effectivePhyEnabled));
            }
        } else {
            dispatch(clearOneActivePhySequence());
            dispatch(applyCurrentPhyEnabled());
        }

        await state.rssiDevice.writeConfig({
            delay: state.delay,
            phyEnabled: phyMaskForWrite,
            virtualFileSizeMb: state.pendingVirtualFileSizeMb,
            connectionIntervalUnits: state.connectionIntervalUnits,
            packetSizeBytes: state.packetSizeBytes,
        });

        dispatch(markDemoStarted());
    };

const jprogDeviceSetupWithHexTailVerify = (
    firmware: JprogEntry[],
    needSerialport = false,
    hideDeviceSetupWhenProtected = false,
): DeviceSetup => {
    const baseSetup = jprogDeviceSetup(
        firmware,
        needSerialport,
        hideDeviceSetupWhenProtected,
    );

    return {
        ...baseSetup,
        isExpectedFirmware:
            (device, deviceInfo) =>
            async dispatch => {
                const baseResult = {
                    validFirmware: false,
                    device,
                };

                const candidates = matchingFirmwareForDevice(
                    baseResult.device,
                    deviceInfo,
                    firmware,
                );

                for (const candidate of candidates) {
                    try {
                        const tail = getHexTailSignature(candidate.fw);
                        const read = await xRead(baseResult.device, {
                            address: tail.startAddress,
                            bytes: TAIL_COMPARE_BYTES,
                            width: 8,
                            direct: true,
                        });

                        const readHex = normalizeHex(
                            parseReadIntelHexToBytes(read.intelHex)
                                .map(byte => byte.toString(16).padStart(2, '0'))
                                .join(''),
                        );

                        if (readHex === tail.bytesHex) {
                            logger.info(
                                `Matched firmware by HEX tail for ${candidate.key} at 0x${tail.startAddress.toString(
                                    16,
                                )}.`,
                            );
                            return {
                                ...baseResult,
                                validFirmware: true,
                            };
                        }
                    } catch (error) {
                        logger.warn(
                            `HEX tail verification failed for ${candidate.key}: ${String(
                                error,
                            )}`,
                        );
                    }
                }

                return baseResult;
            },
    };
};

const jprogFirmware: JprogEntry[] = [
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
];

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
        jprogDeviceSetupWithHexTailVerify(
            jprogFirmware,
            true,
            false,
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
        const boardVersion = device.devkit?.boardVersion?.toUpperCase() ?? '';

        dispatch(hideCompanionProgrammingPrompt());

        const isNrf54Family = family.includes('nrf54');
        const isNrf54Board =
            boardVersion === 'PCA10156' ||
            boardVersion === 'PCA10175' ||
            boardVersion === 'PCA10184' ||
            boardVersion === 'PCA10188';

        if (isNrf54Family || isNrf54Board) {
            logger.info(
                'Detected nRF54-family device. Verifying firmware before prompting for programming.',
            );
            const checkCurrentFirmwareVersion = true;
            const requireUserConfirmation = true;

            return dispatch(
                prepareDevice(
                    device,
                    deviceSetupConfig,
                    async programmedDevice => {
                        await resetDeviceSafely(programmedDevice, 'main device');
                        dispatch(openDevice(programmedDevice));
                        dispatch(
                            openCompanionProgrammingPrompt(
                                programmedDevice.serialNumber ?? '',
                            ),
                        );
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
                async programmedDevice => {
                    await resetDeviceSafely(programmedDevice, 'main device');
                    dispatch(openDevice(programmedDevice));
                    dispatch(
                        openCompanionProgrammingPrompt(
                            programmedDevice.serialNumber ?? '',
                        ),
                    );
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
        dispatch(markDeviceSetupAttemptStarted());
        getState().app.rssi.serialPort?.close(() => {
            dispatch(clearSerialPort());
            dispatch(
                prepareDevice(
                    device,
                    deviceSetupConfig,
                    async programmedDevice => {
                        await resetDeviceSafely(programmedDevice, 'main device');
                        dispatch(openDevice(programmedDevice));
                        dispatch(
                            openCompanionProgrammingPrompt(
                                programmedDevice.serialNumber ?? '',
                            ),
                        );
                        dispatch(clearDeviceSetupAttempt());
                    },
                    reason => {
                        if (reason) {
                            logger.error('Device recovery/programming failed.', reason);
                        }
                        dispatch(clearDeviceSetupAttempt());
                    },
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
        dispatch(setIsCompanionProgrammingInProgress(false));

        // Set default selection: try last flashed companion if still connected, else first eligible
        const lastFlashed = getState().app.rssi.lastFlashedCompanionSerial;
        const defaultCompanion =
            lastFlashed &&
            eligibleCompanions.some(d => d.serialNumber === lastFlashed)
                ? lastFlashed
                : (eligibleCompanions[0].serialNumber ?? 'none');
        dispatch(setCompanionTargetSerial(defaultCompanion));
    };

export const confirmCompanionProgramming =
    (): AppThunk => async (dispatch, getState) => {
        const state = getState().app.rssi;
        const selectedSerial = state.companionTargetSerial;

        // If user selected "none", skip companion flashing and close dialog
        if (selectedSerial === 'none' || !selectedSerial) {
            logger.info(
                'Skipping companion device programming (none selected)',
            );
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

        // Find the correct firmware hex for this board
        const firmware = jprogFirmware.find(
            fw => fw.key.toUpperCase() === board,
        );
        if (!firmware) {
            dispatch(
                setCompanionProgrammingError(
                    `No firmware available for companion board ${board}.`,
                ),
            );
            return;
        }

        dispatch(clearCompanionProgrammingError());
        dispatch(setIsCompanionProgrammingInProgress(true));

        try {
            // Check companion device protection status directly
            const protectionResult =
                await NrfutilDeviceLib.getProtectionStatus(selectedDevice);
            const isProtected =
                protectionResult.protectionStatus !==
                'NRFDL_PROTECTION_STATUS_NONE';

            // HEX-tail check: skip programming if already running correct firmware
            if (!isProtected) {
                try {
                    const tail = getHexTailSignature(firmware.fw);
                    const read = await xRead(selectedDevice, {
                        address: tail.startAddress,
                        bytes: TAIL_COMPARE_BYTES,
                        width: 8,
                        direct: true,
                    });
                    const readHex = normalizeHex(
                        parseReadIntelHexToBytes(read.intelHex)
                            .map(byte =>
                                byte.toString(16).padStart(2, '0'),
                            )
                            .join(''),
                    );
                    if (readHex === tail.bytesHex) {
                        logger.info(
                            `Companion device (${selectedSerial}) already has correct firmware — skipping programming.`,
                        );
                        await resetDeviceSafely(
                            selectedDevice,
                            'companion device',
                        );
                        dispatch(setIsCompanionProgrammingInProgress(false));
                        dispatch(
                            setLastFlashedCompanionSerial(selectedSerial),
                        );
                        dispatch(hideCompanionProgrammingPrompt());
                        return;
                    }
                } catch {
                    // xRead failed — proceed to program
                }
            }

            const batch = NrfutilDeviceLib.batch();

            if (isProtected) {
                logger.info(
                    `Companion device (${selectedSerial}) is protected — recovering.`,
                );
                batch.recover('Application', {
                    onTaskBegin: () =>
                        logger.info('Recovering companion device'),
                    onTaskEnd: () =>
                        logger.info('Finished recovering companion device.'),
                    onException: () =>
                        logger.error('Failed to recover companion device.'),
                });
            }

            batch.program(firmware.fw, 'Application', undefined, undefined, {
                onTaskBegin: () =>
                    logger.info('Programming companion device'),
                onTaskEnd: () =>
                    logger.info('Finished programming companion device.'),
                onException: () =>
                    logger.error('Failed to program companion device.'),
            });

            batch.reset('Application', undefined, {
                onTaskBegin: () =>
                    logger.info('Resetting companion device'),
                onTaskEnd: () =>
                    logger.info('Finished resetting companion device.'),
                onException: () =>
                    logger.error('Failed to reset companion device.'),
            });

            await batch.run(selectedDevice);

            logger.info(
                `Companion device (${selectedSerial}) programmed successfully.`,
            );
            dispatch(setIsCompanionProgrammingInProgress(false));
            dispatch(setLastFlashedCompanionSerial(selectedSerial));
            dispatch(hideCompanionProgrammingPrompt());
        } catch (error) {
            logger.error('Companion device programming failed.', error);
            dispatch(setIsCompanionProgrammingInProgress(false));
            dispatch(
                setCompanionProgrammingError(
                    `Failed to program companion device: ${error || 'unknown error'}`,
                ),
            );
        }
    };

export const cancelCompanionProgramming = (): AppThunk => dispatch => {
    logger.info('Companion device programming cancelled by user');
    dispatch(setIsCompanionProgrammingInProgress(false));
    dispatch(hideCompanionProgrammingPrompt());
};
