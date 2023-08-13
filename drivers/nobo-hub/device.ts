/*
 * Copyright 2023 Vadim Chichikalyuk
 *
 * This file is part of Homey-Nobo
 *
 * Homey-Nobo is free software: you can redistribute it and/or modify it under
 * the terms of the GNU General Public License as published by the Free Software
 * Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * Homey-Nobo is distributed in the hope that it will be useful, but WITHOUT
 * ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
 * FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License along
 * with Homey-Nobo. If not, see <https://www.gnu.org/licenses/>.
 */

import Homey from 'homey';
import {DiscoveredDevice} from './definitions';
import {NoboHubAPI} from './device_api';

export class NoboHub extends Homey.Device {

    private static addedDeviceSerial: string = '';

    static attemptConnection(device: DiscoveredDevice, serial_end: string) {
        let serial: string = device.serial_start.concat(serial_end);


    }

    async onAdded() {
        this.log('Adding a new device');

        this.log(`Changing temporary serial to ${NoboHub.addedDeviceSerial}`);
        await this.setSettings({serial: NoboHub.addedDeviceSerial});

        this.log('New device added');
    }

    async onInit() {
        this.log('Initialised');
    }

}

module.exports = NoboHub;
