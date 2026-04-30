/*
 * Copyright (c) 2015 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-4-Clause
 */

import React, { useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { NumberInput } from '@nordicsemiconductor/pc-nrfconnect-shared';

import {
    getDelay,
    setDelay,
} from '../../features/throughputDevice/throughputDeviceSlice';

export default () => {
    const dispatch = useDispatch();
    const delay = useSelector(getDelay);

    const setDelayOnly = useCallback(
        (newDelay: number) => {
            dispatch(setDelay(newDelay));
        },
        [dispatch],
    );

    return (
        <NumberInput
            showSlider
            minWidth
            range={{ min: 1, max: 10 }}
            value={delay}
            onChange={setDelayOnly}
            label="Change PHY every"
            unit="s"
        />
    );
};
