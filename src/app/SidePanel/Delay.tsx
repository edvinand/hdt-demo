/*
 * Copyright (c) 2015 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-4-Clause
 */

import React, { useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { NumberInput, Overlay } from '@nordicsemiconductor/pc-nrfconnect-shared';

import {
    getDelay,
    getPendingOneActivePhyEnabled,
    setDelay,
} from '../../features/throughputDevice/throughputDeviceSlice';

export default () => {
    const dispatch = useDispatch();
    const delay = useSelector(getDelay);
    const oneActivePhyEnabled = useSelector(getPendingOneActivePhyEnabled);

    const setDelayOnly = useCallback(
        (newDelay: number) => {
            dispatch(setDelay(newDelay));
        },
        [dispatch],
    );

    return (
        <div className={oneActivePhyEnabled ? 'tw-opacity-50' : ''}>
            <Overlay
                tooltipId="change-phy-every-tooltip"
                tooltipChildren={
                    <p>
                        The time it spends on a single PHY before cycling
                        through to the next active PHY.
                    </p>
                }
                placement="right"
            >
                <NumberInput
                    showSlider
                    minWidth
                    range={{ min: 1, max: 10 }}
                    value={delay}
                    onChange={setDelayOnly}
                    label="Change PHY every"
                    unit="s"
                    disabled={oneActivePhyEnabled}
                />
            </Overlay>
        </div>
    );
};
