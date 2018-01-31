/*jslint node:true*/
"use strict";

var require, module, Service, Characteristic, temperatureService, setTimeout;
var osmosis = require("osmosis");

module.exports = function (homebridge) {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    homebridge.registerAccessory("homebridge-weatherlink", "WeatherLink", WeatherAccessory);
};

function WeatherAccessory(log, config) {
    this.log = log;
    
    this.name = config.name;
    this.username = config.username;
    this.scale = config.scale || "celsius";
    
    if (config.pollingInterval !== null) {
        this.pollingInterval = parseInt(config.pollingInterval, 10) * 1000 * 60;
    } else {
        this.pollingInterval = 0;
    }
    
    this.cachedWeatherObj = undefined;
    this.lastupdate = 0;

    // start periodical polling in background with setTimeout
    if (this.pollingInterval > 0) {
        var that = this;
        setTimeout(function () {
            that.backgroundPolling();
        }, this.pollingInterval);
    }
}

WeatherAccessory.prototype = {
    backgroundPolling: function () {
        this.log.info("Polling data in background");
        this.getStateTemp(function (error, temperature) {
            if (!error && temperature !== null) {
                temperatureService.setCharacteristic(Characteristic.CurrentTemperature, temperature);
            }
        }.bind(this));

        var that = this;
        setTimeout(function () {
            that.backgroundPolling();
        }, this.pollingInterval);
    },

    getStateTemp: function (callback) {
        var url = this.makeURL(),
            temperature = this.returnTemp();
        // Only fetch new data once per minute
        if (!this.cachedWeatherObj || this.pollingInterval > 0 || this.lastupdate + 60 < (Date.now() / 1000 | 0)) {
            this.httpRequest(url, function (responseBody) {
                this.cachedWeatherObj = JSON.parse(responseBody);
                this.lastupdate = (Date.now() / 1000);
                var temperature = this.returnTemp();
                callback(null, temperature);
            }.bind(this));
        } else {
            this.log("Returning cached data", temperature);
            callback(null, temperature);
        }
    },

    returnTemp: function () {
        var temperature = 0;
        if (this.cachedWeatherObj) {
            temperature = parseFloat(this.cachedWeatherObj.currentTemp);
            this.log("Fetched temperature " + temperature + " in " + this.scale + " scale for " + this.name);
        }
        return temperature;
    },
    
    makeURL: function () {
        var url = "http://www.weatherlink.com/user/";
        url += this.username + "/index.php?view=main&headers=0";
        if (this.scale === "fahrenheit") {
            url += "&type=2";
        } else {
            url += "&type=1";
        }
        return url;
    },

    getServices: function () {
        var informationService = new Service.AccessoryInformation();
        informationService
            .setCharacteristic(Characteristic.Manufacturer, "WeatherLink")
            .setCharacteristic(Characteristic.Model, this.scale)
            .setCharacteristic(Characteristic.SerialNumber, this.username)
            .setCharacteristic(Characteristic.FirmwareRevision, "0.0.1");
        temperatureService = new Service.TemperatureSensor(this.name);
        temperatureService
            .getCharacteristic(Characteristic.CurrentTemperature)
            .setProps({
                minValue: -60,
                maxValue: 120
            })
            .on("get", this.getStateTemp.bind(this));
        return [informationService, temperatureService];
    },

    httpRequest: function (url, callback) {
        var savedData = [];
        osmosis
            .get(url)
            .set({
                "currentTemp": '//td[@class="glamor_temp"]/text()'
            })
            .data(function (data) {
                savedData.push(JSON.stringify(data));
            })
            .done(function () {
                callback(savedData);
            });
    }
};

if (!Date.now) {
    Date.now = function () {
        return new Date().getTime();
    };
}
