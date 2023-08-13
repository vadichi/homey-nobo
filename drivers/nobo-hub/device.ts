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
import Net from 'net';



const Net = require('net');

const myPort = 8080;
const myHost = 'localhost';
const myNoboID = '!!!'; !!!


const client = new Net.Socket();


class Queue
{
    items: string[];
    
    add(s: string){
        items.unshift(1);
        items[0]=s;
        console.log('Queue: item added -' + s);
    }

    clear(){
        items.clear;
        console.log('Queue: clear');
    }

    async pull(): string {
        while (items.length == 0) {}
        console.log('Queue: item popped -' + items[items.length-1]);
        return items.pop();
    }

}

let msgQueue = new Queue;


function onConnect() {
    console.log('TCP connection established with the server.');
 }

function onData(chunk) {
    console.log(`Data received from the server: ${chunk.toString()}.`);
    msgQueue.add(chunk.toString());
    //??? client.end();
}

function onEnd() {
    console.log('Requested an end to the TCP connection');
}


client.connect({ port: myPort, host: myHost }, onConnect);


client.on('data', onData);
client.on('end', onEnd);

handShake();


//Protocol:
//HELLO <its version of command set> <Hub s.no.> <date and time in format 'yyyyMMddHHmmss'>\r"
handShake(){
    const currentDate = new Date();
    const dateTimeString = currentDate.getFullYear().toString()
    dateTimeString = dateTimeString + (currentDate.getMonth()+1).toString().padStart(2,'0');
    dateTimeString = dateTimeString + currentDate.getDate().toString().padStart(2,'0');
    dateTimeString = dateTimeString + currentDate.getHours().toString().padStart(2,'0');
    dateTimeString = dateTimeString + currentDate.getMinutes().toString().padStart(2,'0');
    dateTimeString = dateTimeString + currentDate.getSeconds().toString().padStart(2,'0');

    await client.write('HELLO 1.1 ' + myNoboID + ' ' + dateTimeString + '\r');
    response = msgQueue.poll();
    if(response == 'HELLO 1.1') {
        await client.write('HANDSHAKE\r');
        response = msgQueue.poll();
        if(response == 'HANDHAKE\r'){
            console.log('Handshake succeeded');
        }
        else{
            console.log('Handshake failed');
        }
    }
    else{
        console.log('Handshake failed');
    }
}

/*
чтение состояния: команда G00
нам среди ответов на G00 надо искать H04.
его пример H04 1 2 0 -1 -1 0 -1
его может не быть, если его нет - то хаб в режиме "normal"
если H04 есть - нам интересен только тот у которого последние два параметра 0 и -1
в нем нам интересен второй параметр 
normal = 0, comform = 1, eco = 2, away = 3
*/

//normal = 0, comform = 1, eco = 2, away = 3
getMode(){
    deviceMode = 0;//imply it is in a normal mode
    
    msgQueue.clear();
    await client.write('G00\r');
    console.log('Get mode request sent');

    response = msgQueue.poll();
    while(response != 'H05'){
        if(response.substring(0,2) == 'H04'){
            if(response.substring(response.length-4,response.length-1) == '0 -1'){
                deviceMode = response.charAt(6);
            }
        }
        response = msgQueue.poll();
    }
    console.log('Device is in '+ deviceMode + ' mode');
    return deviceMode;
}


/*
Protocol nodes:
normal: A03 1 0 3 -1 -1 0 -1
constant away: A03 1 3 3 -1 -1 0 -1
response - B03 ...
на потом: timer away: A03 1 3 1 ? -1 0 -1
*/
switchToMode(mode){
    msgQueue.clear();
    await client.write('A03 1 0 ' + mode + '-1 -1 0 -1\r');
    console.log('Change mode request sent');
    response = msgQueue.poll();
    if(response.substring(0,2) != 'B03'){
        console.log('Protocol violation from Nobo side. Reply recieved: '+ response);
    }    
}

switchToNormalMode(){
    switchToMode(0);
}

switchToConstantAwayMode(){
    switchToMode(3);
}

switchToTimerAwayMode(){
        console.log('Not implemented yet');
}


class NoboHub extends Homey.Device {

  async onInit() {
    this.log('NoboHub has been initialized');
  }

  async onAdded() {
    this.log('NoboHub has been added');
  }

  async onSettings({
    oldSettings,
    newSettings,
    changedKeys,
  }: {
    oldSettings: { [key: string]: boolean | string | number | undefined | null };
    newSettings: { [key: string]: boolean | string | number | undefined | null };
    changedKeys: string[];
  }): Promise<string | void> {
    this.log('NoboHub settings where changed');
  }

  async onRenamed(name: string) {
    this.log('NoboHub was renamed');
  }

  async onDeleted() {
    this.log('NoboHub has been deleted');
  }


client.on('...', foo)
  foo() {

  }
}

module.exports = NoboHub;
