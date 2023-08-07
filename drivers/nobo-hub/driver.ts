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
import dgram from 'dgram';
import PairSession from "homey/lib/PairSession";

const DISCOVERY_MESSAGE_MARKER: string = '__NOBOHUB__';

class NoboHubDriver extends Homey.Driver {

  private broadcast_receive_socket: dgram.Socket | undefined;
  private discovered_devices: { ip: string, serial_digits: string }[] = [];

  async onInit() {
    this.broadcast_receive_socket = dgram.createSocket('udp4');
    this.broadcast_receive_socket.bind(10000, () => {
      this.broadcast_receive_socket?.setBroadcast(true);
    });
    this.broadcast_receive_socket.on('message', (message, sender) => {
      let sender_ip = sender.address;

      for (let discovered_device of this.discovered_devices) {
        if (discovered_device.ip == sender_ip) { return; }
      }

      let message_text = message.toString();
      let message_serial_segment_start = message_text.indexOf(DISCOVERY_MESSAGE_MARKER) + DISCOVERY_MESSAGE_MARKER.length;
      let message_serial_segment = message_text.substring(message_serial_segment_start);

      this.discovered_devices.push({ ip: sender_ip, serial_digits: message_serial_segment });

      this.log(`NoboHubDriver has discovered a new Nobo Hub at ${sender_ip}, serial no. ${message_serial_segment}XXX`);
    });

    this.log('NoboHubDriver has been initialized');
  }

  async onPairListDevices() {
    // Allow for 2 cycles (2 * 2 seconds) of discovery messages to pass to ensure all devices are discovered
    await new Promise(resolve => setTimeout(resolve, 4100));

    let devices = [];
    for (let discovered_device of this.discovered_devices) {
        devices.push({
            name: `Nobo Hub ${discovered_device.serial_digits}XXX`,
            data: {
              serial_digits: discovered_device.serial_digits,
            },
            store: {
              ip: discovered_device.ip,
            }
        });
    }

    return devices;
  }
}

module.exports = NoboHubDriver;
