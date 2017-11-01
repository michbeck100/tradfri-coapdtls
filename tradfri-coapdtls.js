/*
  Copyright (c) 2017 treban

  tradfri-coapdtls is licensed under an MIT +no-false-attribs license.
  All rights not explicitly granted in the MIT license are reserved.
  See the included LICENSE file for more details.
 */

(function() {
  'use strict';
  var Agent, TradfriCoapdtls, URL, events, net, parameters, pthrottler, util,
    bind = function(fn, me){ return function(){ return fn.apply(me, arguments); }; },
    extend = function(child, parent) { for (var key in parent) { if (hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
    hasProp = {}.hasOwnProperty;

  pthrottler = require('p-throttler');

  Agent = require('./lib/agent');

  parameters = require('./lib/parameters');

  net = require('net');

  URL = require('url');

  util = require('util');

  events = require('events');

  TradfriCoapdtls = (function(superClass) {
    var coapTiming, throttler, tradfriIP, tradfriconnector;

    extend(TradfriCoapdtls, superClass);

    throttler = pthrottler.create(10, {
      'coap-req': 1
    });

    TradfriCoapdtls.globalAgent = null;

    TradfriCoapdtls.dtls_opts = null;

    tradfriconnector = null;

    tradfriIP = null;

    coapTiming = {
      ackTimeout: 0.5,
      ackRandomFactor: 1.0,
      maxRetransmit: 2,
      maxLatency: 2,
      piggybackReplyMs: 10,
      debug: 0
    };

    function TradfriCoapdtls(config) {
      this._send_command = bind(this._send_command, this);
      this._send_request = bind(this._send_request, this);
      this.setObserverGroup = bind(this.setObserverGroup, this);
      this.setObserver = bind(this.setObserver, this);
      this.connect = bind(this.connect, this);
      tradfriIP = config.hubIpAddress;
      parameters.refreshTiming(coapTiming);
      this.dtls_opts = {
        host: tradfriIP,
        port: 5684,
        psk: new Buffer(config.securityId),
        PSKIdent: new Buffer(config.clientId),
        peerPublicKey: null,
        key: null
      };
    }

    TradfriCoapdtls.prototype.connect = function() {
      return new Promise((function(_this) {
        return function(resolve, reject) {
          return _this.globalAgent = new Agent({
            type: 'udp4',
            host: tradfriIP,
            port: 5684
          }, _this.dtls_opts, function(res) {
            return resolve();
          });
        };
      })(this));
    };

    TradfriCoapdtls.prototype.finish = function() {
      this.globalAgent.finish();
      throttler.abort();
      return throttler = pthrottler.create(10, {
        'coap-req': 1
      });
    };

    TradfriCoapdtls.prototype.initPSK = function(ident) {
      var payload;
      payload = {
        9090: ident
      };
      return this._send_request('/15011/9063', payload, false, true);
    };

    TradfriCoapdtls.prototype.getGatewayInfo = function() {
      return this._send_request('/15011/15012');
    };

    TradfriCoapdtls.prototype.setGateway = function(pay) {
      var payload;
      payload = {
        9023: pay
      };
      return this._send_request('/15011/15012', payload);
    };

    TradfriCoapdtls.prototype.getAllDevices = function() {
      var promarr;
      promarr = [];
      return this.getAllDeviceIDs().then((function(_this) {
        return function(ids) {
          ids.forEach(function(id) {
            return promarr.push(_this.getDevicebyID(id));
          });
          return Promise.all(promarr);
        };
      })(this))["catch"](((function(_this) {
        return function(err) {
          return reject(err);
        };
      })(this)));
    };

    TradfriCoapdtls.prototype.getAllGroups = function() {
      var promarr2;
      promarr2 = [];
      return this.getAllGroupIDs().then((function(_this) {
        return function(ids) {
          ids.forEach(function(id) {
            return promarr2.push(_this.getGroupbyID(id));
          });
          return Promise.all(promarr2);
        };
      })(this))["catch"](((function(_this) {
        return function(err) {
          return reject(err);
        };
      })(this)));
    };

    TradfriCoapdtls.prototype.getAllScenes = function(gid) {
      var promarr3;
      promarr3 = [];
      return this.getAllScenesIDs(gid).then((function(_this) {
        return function(ids) {
          ids.forEach(function(id) {
            return promarr3.push(_this.getScenebyID(gid, id));
          });
          return Promise.all(promarr3);
        };
      })(this))["catch"](((function(_this) {
        return function(err) {
          return reject(err);
        };
      })(this)));
    };

    TradfriCoapdtls.prototype.getAllDeviceIDs = function() {
      return this._send_request('/15001');
    };

    TradfriCoapdtls.prototype.getAllGroupIDs = function() {
      return this._send_request('/15004');
    };

    TradfriCoapdtls.prototype.getAllScenesIDs = function(gid) {
      return this._send_request('/15005' + gid);
    };

    TradfriCoapdtls.prototype.getDevicebyID = function(id) {
      return this._send_request('/15001/' + id);
    };

    TradfriCoapdtls.prototype.getGroupbyID = function(id) {
      return this._send_request('/15004/' + id);
    };

    TradfriCoapdtls.prototype.getScenebyID = function(gid, id) {
      return this._send_request('/15005/' + gid + '/' + id);
    };

    TradfriCoapdtls.prototype.setDevice = function(id, sw, time) {
      var payload;
      if (time == null) {
        time = 5;
      }
      payload = {
        3311: [
          {
            5850: sw.state,
            5712: time
          }
        ]
      };
      if (sw.brightness > 0) {
        payload[3311][0][5851] = sw.brightness;
      }
      return this._send_request('/15001/' + id, payload);
    };

    TradfriCoapdtls.prototype.setGroup = function(id, sw, time) {
      var payload;
      if (time == null) {
        time = 5;
      }
      payload = {
        5850: sw.state,
        5712: time
      };
      if (sw.brightness > 0) {
        payload[5851] = sw.brightness;
      }
      return this._send_request('/15004/' + id, payload);
    };

    TradfriCoapdtls.prototype.setColorHex = function(id, color, time) {
      var payload;
      if (time == null) {
        time = 5;
      }
      payload = {
        3311: [
          {
            5706: color,
            5712: time
          }
        ]
      };
      return this._send_request('/15001/' + id, payload);
    };

    TradfriCoapdtls.prototype.setColorXY = function(id, colorX, colorY, time) {
      var payload;
      if (time == null) {
        time = 5;
      }
      payload = {
        3311: [
          {
            5709: colorX,
            5710: colorY,
            5712: time
          }
        ]
      };
      return this._send_request('/15001/' + id, payload);
    };

    TradfriCoapdtls.prototype.setColorTemp = function(id, color, time) {
      var payload;
      if (time == null) {
        time = 5;
      }
      payload = {
        3311: [
          {
            5709: color,
            5710: 27000,
            5712: time
          }
        ]
      };
      return this._send_request('/15001/' + id, payload);
    };

    TradfriCoapdtls.prototype.setScene = function(gid, id) {
      var payload;
      payload = {
        5850: 1,
        9039: id
      };
      return this._send_request('/15004/' + gid, payload);
    };

    TradfriCoapdtls.prototype.setObserver = function(id, callback) {
      return this._send_request('/15001/' + id, false, callback);
    };

    TradfriCoapdtls.prototype.setObserverGroup = function(id, callback) {
      return this._send_request('/15004/' + id, false, callback);
    };

    TradfriCoapdtls.prototype._send_request = function(command, payload, callback, ident) {
      return throttler.enqueue((function(_this) {
        return function(bla) {
          return _this._send_command(command, payload, callback, ident);
        };
      })(this), 'coap-req');
    };

    TradfriCoapdtls.prototype._send_command = function(command, payload, callback, ident) {
      this.req = null;
      return new Promise((function(_this) {
        return function(resolve, reject) {
          var url;
          url = {
            protocol: "coaps:",
            slashes: true,
            auth: null,
            host: tradfriIP + ":5684",
            port: "5684",
            hostname: tradfriIP,
            hash: null,
            search: null,
            query: null,
            method: "GET",
            pathname: command,
            path: command,
            href: "coaps://" + tradfriIP + ":5684" + command
          };
          if (payload) {
            if (ident) {
              url["method"] = "POST";
            } else {
              url["method"] = "PUT";
            }
          } else {
            url["method"] = "GET";
          }
          if (callback) {
            url["observe"] = true;
          }
          _this.req = _this.globalAgent.request(url, _this.dtlsOpts);
          _this.req.on('error', function(error) {
            return reject(error);
          });
          if (payload) {
            _this.req.write(JSON.stringify(payload));
          }
          _this.req.on('response', function(res) {
            if (res.code === '4.04' || res.code === '4.05') {
              return reject(res.code);
            } else {
              if (callback) {
                res.on('data', function(dat) {
                  return callback(JSON.parse(dat.toString()));
                });
                resolve("RC : " + res.code);
              }
              if (!payload) {
                return resolve(JSON.parse(res.payload.toString()));
              } else {
                if (ident) {
                  return resolve(JSON.parse(res.payload.toString()));
                } else {
                  return resolve("RC: " + res._packet.code);
                }
              }
            }
          });
          return _this.req.end();
        };
      })(this));
    };

    return TradfriCoapdtls;

  })(events.EventEmitter);

  module.exports = TradfriCoapdtls;

}).call(this);
