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
import {NoboHubAPI} from "./device_api";
import NoboHubDriver from "./driver";

export class NoboHub extends Homey.Device {
    private apiConnection: NoboHubAPI | undefined = undefined;

    async onInit() {
        this.log('Initialising');

        if (NoboHubDriver.addedDeviceSerial != undefined) {
            this.log('Initialising as a new device');

            this.log(`Changing temporary serial to ${NoboHubDriver.addedDeviceSerial!}`);
            await this.setSettings({serial: parseInt(NoboHubDriver.addedDeviceSerial!)});

            this.apiConnection = NoboHubDriver.addedDeviceAPIConnection!;
            this.apiConnection!.updateOwner(this);
        }

        if (this.apiConnection == undefined) {
            let ip = this.getStoreValue('ip');
            let serial = String(this.getSetting('serial'));

            this.log(`Attempting connection to an existing device at ${ip}`);

            // Handle result; launch repair if necessary
            this.apiConnection = new NoboHubAPI(this);
            await this.apiConnection.attemptConnection(ip, serial);
        }

        this.log('Initialised');
    }


    async onDeleted() {
        this.log('Removing')

        await this.apiConnection!.closeConnection();

        this.log('Removed');
    }

    async onUninit() {
        this.log('Uninitialising');

        await this.apiConnection!.closeConnection();

        this.log('Uninitialised');
    }

}

module.exports = NoboHub;
export default NoboHub;
