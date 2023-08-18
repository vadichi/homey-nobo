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
import PairSession from "homey/lib/PairSession";
import {DiscoveredDevice} from './definitions';
import * as Buffer from "buffer";
import * as dgram from "dgram";
import {NoboHubAPI} from "./device_api";

const DISCOVERY_MESSAGE_MARKER: string = '__NOBOHUB__';
const DISCOVERY_PORT: number = 10000;

export class NoboHubDriver extends Homey.Driver {

    static addedDeviceAPIConnection: NoboHubAPI | undefined = undefined;
    static addedDeviceSerial: string | undefined = undefined;

    private discovery_listener: dgram.Socket = dgram.createSocket('udp4');
    private discovered_devices: DiscoveredDevice[] = Array<DiscoveredDevice>(0);

    async onInit() {
        this.log('Initialising');

        this.discovery_listener.bind(DISCOVERY_PORT, () => {
            this.discovery_listener.setBroadcast(true);
        });

        this.discovery_listener.on('message', async (message: Buffer, sender: dgram.RemoteInfo) => {
            await this.discoveryHandleMessage(message, sender);
        });

        this.log('Started listening for discovery broadcasts');
        this.log('Initialised');
    }

    async onPair(session: PairSession) {
        this.log('New pairing session started');

        session.setHandler('list_devices', async () => {
            return await this.discoveryListDevices();
        });

        let selected_device: any;
        session.setHandler('list_devices_selection', async (selected_devices) => {
            selected_device = selected_devices[0];

            this.log(`Selected device ${selected_device.name}`);
        });

        session.setHandler('pincode', async(pin_data) => {
            let pin = pin_data[0].concat(pin_data[1]).concat(pin_data[2]);
            let serial = selected_device.data.serial_start.concat(pin);

            this.log(`Attempting to pair with a Nobo-Hub at ${selected_device.store.ip} with serial ${serial}`);

            let api = new NoboHubAPI(this);
            let result = await api.attemptConnection(selected_device.store.ip, serial);

            if (result) {
                NoboHubDriver.addedDeviceSerial = serial;
                NoboHubDriver.addedDeviceAPIConnection = api;
            }

            return result;
        });
    }

    private async discoveryListDevices() {
        await new Promise(resolve => setTimeout(resolve, 4100));

        return this.discovered_devices.map(discovered_device => {
           return {
               name: `Nobo Hub ${discovered_device.serial_start}`,
               data: {
                   serial_start: discovered_device.serial_start,
               },
               store: {
                   ip: discovered_device.ip,
               },
               settings: {
                   serial: parseInt(discovered_device.serial_start)
               }
           }
        });
    }

    private async discoveryHandleMessage(message: Buffer, sender: dgram.RemoteInfo) {
        let sender_ip: string = sender.address;

        for (let discovered_device of this.discovered_devices) {
            if (discovered_device.ip == sender_ip) { return; }
        }

        let message_text: string = message.toString();
        let message_serial_index: number = message_text.indexOf(DISCOVERY_MESSAGE_MARKER) + DISCOVERY_MESSAGE_MARKER.length;
        let message_serial: string = message_text.substring(message_serial_index);

        this.discovered_devices.push({ ip: sender_ip, serial_start: message_serial });

        this.log(`Discovered a new Nobo-Hub at ${sender_ip}, serial no. ${message_serial}XXX`);
    }
}

module.exports = NoboHubDriver;
export default NoboHubDriver;
