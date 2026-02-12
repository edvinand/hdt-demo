/*
 * Copyright (c) 2015 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-4-Clause
 */

import React from 'react';
import { Group, SidePanel } from '@nordicsemiconductor/pc-nrfconnect-shared';

import useThroughputDevice from '../../features/throughputDevice/useThroughputDevice';
import ControlButtons from './ControlButtons';
import Delay from './Delay';
import ToggleLed from './ToggleLed';
import ConfigPhySelector from './ConfigPhySelector';

export default () => {
    useThroughputDevice();

    return (
        <SidePanel>
            <Group heading="Controls">
                <ControlButtons />
            </Group>

            <Group heading="SELECTED PHYS">
                <ConfigPhySelector />
                <Delay />
            </Group>

            <Group heading="Device">
                <ToggleLed />
            </Group>
        </SidePanel>
    );
};
