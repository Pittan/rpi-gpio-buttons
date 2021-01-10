
const EventEmitter = require('events').EventEmitter;
const ButtonEvents = require('button-events');

const raspi = require('raspi');
const raspiGpio = require('raspi-gpio');

// 1, 2, 3, 4
// { number: 1, mode: ''}, { number: 1, mode: ''},
const Defaults = {
  pins: [], // array of button pin numbers (Acceptable values are based on https://github.com/nebrius/raspi-gpio#pin-naming)
  usePullUp: true, // is button input pulled high
  timing: {
    debounce: 30, // 30 ms debounce
    pressed: 200, // 200 ms in pressed state == button pressed
    clicked: 200 // 200 ms after released == button clicked
  }
  // Optional: gpio
};

class GPIOButtons extends EventEmitter {
  constructor (Config) {
    super();
    this.buttons = {};
    this.inputInstances = {};
    this.Config = Object.assign({}, Defaults, Config);
    this.Config.timing = Object.assign({}, Defaults.timing, this.Config.timing);
  }

  async init () {
    this.emit('debug', 'Initialize rpi-gpio-buttons.');
    this.gpio = await this.gpioSetup();
    this.inputInstances = await this.gpioButtonsSetup();
    await this.initListener(this.inputInstances);
  }

  // setup rpi-gpio
  async gpioSetup () {
    this.emit('debug', 'Setup rpi-gpio.');
    return new Promise((resolve) => {
      raspi.init(() => {
        resolve(raspiGpio);
      })
    });
  }

  // setup gpio button pins
  async gpioButtonsSetup () {
    this.emit('debug', 'Setup gpio button pins.');
    const inputInstances = {};
    // setup each pin as a button input
    for (let i = 0; i < this.Config.pins.length; i++) {
      try {
        const inputInstance = await this.buttonSetup(this.Config.pins[i]);
        if (typeof this.Config.pins[i] === 'object') {
          inputInstances[this.Config.pins[i].pin] = inputInstance
        } else {
          inputInstances[this.Config.pins[i]] = inputInstance
        }
      }
      catch (error) {
        this.emit('error', `Failed to setup button pin ${this.Config.pins[i]}. ${error.message}`);
      }
    }
    return inputInstances;
  }

  // configure the specified pin as a button input
  buttonSetup (pin) {
    return new Promise((resolve, reject) => {
      this.emit('debug', `Setup button pin ${pin}.`);
      // setup gpio pin for button use
      let pinNumber = pin;
      let pullResistor = this.gpio.PULL_UP;

      if (typeof pin === 'object') {
        pinNumber = pin.pin;
        pullResistor = pin.pullResistor; // PULL_NONE: 0, PULL_DOWN: 1, PULL_UP: 2
      }

      resolve(new this.gpio.DigitalInput({pinNumber, pullResistor}));
    });
  }

  // initialize gpio listener for buttons
  async initListener (buttonInstances) {
    for (let i = 0; i < this.Config.pins.length; i++) {
      let pin = typeof this.Config.pins[i] === 'object' ? this.Config.pins[i].pin : this.Config.pins[i];
      this.emit('debug', `Initialize listener for button pin ${pin}.`);
      try {
        let value = buttonInstances[pin].read();
        let buttonEvents = new ButtonEvents(Object.assign({}, this.Config, { preread: value }));
        // pass along all pin events
        buttonEvents
          .on('button_event', type => {
            this.emit('button_event', type, pin);
            this.emit(type, pin);
          })
          .on('button_changed', () => this.emit('button_changed', pin))
          .on('button_press', () => this.emit('button_press', pin))
          .on('button_release', () => this.emit('button_release', pin));
        this.buttons[pin] = buttonEvents;

        buttonInstances[pin].on('change', value => {
          this.buttons[pin].gpioChange(value === raspiGpio.HIGH);
        })
      }
      catch (error) {
        this.emit('error', `Failed preread and button events setup on pin ${pin}. ${error.message}`);
      }
    }
    // listen for changes on gpio
    this.emit('debug', `Listen for changes to gpio pins.`);
  }

  destroy () {
    return new Promise((resolve, reject) => {
      this.emit('debug', 'destroy() called, cleanup buttons.');
      Object.keys(this.buttons).forEach(be => this.buttons[be].cleanup());
      this.emit('debug', 'Destroy gpio.');
      resolve();
    });
  }
};

GPIOButtons.PULL_UP = raspiGpio.PULL_UP
GPIOButtons.PULL_DOWN = raspiGpio.PULL_DOWN
GPIOButtons.PULL_NONE = raspiGpio.PULL_NONE

module.exports = GPIOButtons;
