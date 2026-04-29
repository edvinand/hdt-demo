/*
 * Copyright (c) 2015 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-4-Clause
 */

import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { StateSelector } from '@nordicsemiconductor/pc-nrfconnect-shared';

import {
    getDisplayType,
    setDisplayType,
} from '../../features/throughputDevice/throughputDeviceSlice';

const DISPLAY_OPTIONS = ['Bars', 'Gauge'] as const;

const DisplayTypeSelector = () => {
    const dispatch = useDispatch();
    const displayType = useSelector(getDisplayType);

    const selectedItem = displayType === 'gauge' ? 'Gauge' : 'Bars';

    return (
        <div className="tw-flex tw-items-center tw-justify-between tw-gap-3 tw-px-1">
            <span className="tw-text-xs tw-font-medium tw-uppercase tw-tracking-wide tw-text-gray-600">
                Display
            </span>
            <div className="tw-w-32">
                <StateSelector
                    items={[...DISPLAY_OPTIONS]}
                    selectedItem={selectedItem}
                    size="sm"
                    onSelect={selectedIndex => {
                        dispatch(
                            setDisplayType(
                                selectedIndex === 1 ? 'gauge' : 'bars',
                            ),
                        );
                    }}
                />
            </div>
        </div>
    );
};

export default DisplayTypeSelector;
