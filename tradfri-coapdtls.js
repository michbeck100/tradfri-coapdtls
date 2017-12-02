/*
 * Copyright (c) 2017 treban, dlemper
 *
 * tradfri-coapdtls is licensed under an MIT +no-false-attribs license.
 * All rights not explicitly granted in the MIT license are reserved.
 * See the included LICENSE file for more details.
 */

'use strict';

const pthrottler = require('p-throttler')

const Agent = require('./lib/agent')
const parameters = require('./lib/parameters')
const net = require('net')
const URL = require('url')
const util = require('util')
const events = require('events')

const throttler = pthrottler.create(10, { 'coap-req': 1 });

const coapTiming = {
  ackTimeout: 0.5,
  ackRandomFactor: 1.0,
  maxRetransmit: 2,
  maxLatency: 2,
  piggybackReplyMs: 10,
  debug: 0,
};

class TradfriCoapdtls extends events.EventEmitter {
  constructor (config) {
    super();

    this.globalAgent = null;
    this.dtlsOpts = null;

    this.config = config;
    parameters.refreshTiming(coapTiming);

    this.dtlsOpts = {
      host: this.config.hubIpAddress,
      port: 5684,
      psk: new Buffer(this.config.psk || this.config.securityId), // key
      PSKIdent: new Buffer(this.config.psk ? this.config.clientId : 'Client_identity'), // user
      peerPublicKey: null,
      key: null,
    };
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.globalAgent = new Agent({
        type: 'udp4',
        host: this.config.hubIpAddress,
        port: 5684,
      }, this.dtlsOpts, res => resolve());
    })
    .then(() => (this.config.psk ? Promise.resolve() : this._initPSK(this.config.clientId)));
  }

  finish() {
    this.globalAgent.finish();
    throttler.abort();
    throttler = pthrottler.create(10, { 'coap-req': 1 });
  }

  _initPSK(ident) {
    return this._send_request('/15011/9063', {
      9090: ident
    }, false, true)
      .then((data) => {
        this.dtlsOpts.PSKIdent = new Buffer(ident);
        this.dtlsOpts.psk = new Buffer(data['9091']);
        console.log('Put this key into config.psk:', data['9091']);
      });
  };

  getGatewayInfo() {
    return this._send_request('/15011/15012');
  }

  setGateway(payload) {
    return this._send_request('/15011/15012', { 9023: payload });
  }

  getAllDevices() {
    return this.getAllDeviceIDs()
      .then(ids => Promise.all(ids.map(id => this.getDevicebyID(id))));
  }

  getAllGroups() {
    return this.getAllGroupIDs()
      .then(ids => Promise.all(ids.map(id => this.getGroupbyID(id))));
  }

  getAllScenes(gid) {
    return this.getAllScenesIDs(gid)
      .then(ids => Promise.all(ids.map(id => this.getScenebyID(gid,id))));
  }

  getAllDeviceIDs() {
    return this._send_request('/15001');
  }

  getAllGroupIDs() {
    return this._send_request('/15004');
  }

  getAllScenesIDs(gid) {
    return this._send_request(`/15005${gid}`);
  }

  getDevicebyID(id) {
    return this._send_request(`/15001/${id}`);
  }

  getGroupbyID(id) {
    return this._send_request(`/15004/${id}`);
  }

  getScenebyID(gid, id) {
    return this._send_request(`/15005/${gid}/${id}`);
  }

  setDevice(id, sw, time = 5) {
    return this._send_request(`/15001/${id}`, {
      3311: [{
        5850: sw.state,
        5712: time,
        0: sw.brightness > 0 ? { 5851: sw.brightness } : undefined,
      }],
    });
  }

  setGroup(id, sw, time = 5) {
    return this._send_request(`/15004/${id}`, {
      5850: sw.state,
      5712: time,
      5851: sw.brightness > 0 ? sw.brightness : undefined,
    });
  }

  setColorHex(id, color, time = 5) {
    return this._send_request(`/15001/${id}`, {
      3311: [{
        5706: color,
        5712: time,
      }],
    });
  }

  setColorXY(id, colorX, colorY, time = 5) {
    return this._send_request(`/15001/${id}`, {
      3311: [{
        5709: colorX,
        5710: colorY,
        5712: time,
      }]
    });
  }

  setColorTemp(id,color,time=5) {
    return this._send_request(`/15001/${id}`, {
      3311: [{
        5709: color,
        5710: 27000,
        5712: time,
      }],
    });
  }

  setScene(gid, id) {
    return this._send_request(`/15004/${gid}`, {
      5850: 1,
      9039: id,
    });
  }

  setObserver(id, callback) {
    return this._send_request(`/15001/${id}`, false, callback);
  }

  setObserverGroup(id, callback) {
    return this._send_request(`/15004/${id}`, false, callback);
  }

  _send_request(command, payload, callback, ident) {
    return throttler.enqueue(() => this._send_command(command, payload, callback, ident), 'coap-req');
  }

  _send_command(command, payload, callback, ident) {
    this.req = null;
    return new Promise((resolve, reject) => {
      const url = {
        protocol: 'coaps:',
        slashes: true,
        auth: null,
        host: `${this.config.hubIpAddress}:5684`,
        port: '5684',
        hostname: this.config.hubIpAddress,
        hash: null,
        search: null,
        query: null,
        method: 'GET',
        pathname: command,
        path: command,
        href: `coaps://${this.config.hubIpAddress}:5684${command}`,
      };

      if (payload) {
        if (ident) {
          url.method = 'POST';
        } else {
          url.method = 'PUT';
        }
      } else {
        url.method = 'GET';
      }

      if (callback) {
        url.observe = true;
      }

      this.req = this.globalAgent.request(url, this.dtlsOpts);

      this.req.on('error', reject);

      if (payload) {
        this.req.write(JSON.stringify(payload));
      }

      this.req.on('response', (res) => {
        if (res.code.startsWith('4')) {
          reject(res.code);
        } else {
          if (callback) {
            res.on('data', dat => callback(JSON.parse(dat.toString())));
            resolve(`RC: ${res.code}`);
          }

          if ((ident || !payload) && res.payload.toString()) {
            resolve(JSON.parse(res.payload.toString()));
          } else if (payload) {
            resolve(`RC: ${res._packet.code}`);
          } else {
            reject('empty message');
          }
        }
      });

      this.req.end();
    });
  }
}

module.exports = TradfriCoapdtls;
