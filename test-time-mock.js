const fs = require('fs');

const injectCode = `
  window.MOCK_TIME = 0;
  window.FPS = 30;
  window.FRAME_STEP = 1000 / window.FPS;
  
  // Mock Dates & Performance
  const _Date = Date;
  window.Date.now = () => window.MOCK_TIME;
  window.performance.now = () => window.MOCK_TIME;
  
  // Mock rAF
  window._rafs = [];
  window.requestAnimationFrame = (cb) => {
    const id = Math.random();
    window._rafs.push({ id, cb });
    return id;
  };
  window.cancelAnimationFrame = (id) => {
    window._rafs = window._rafs.filter(r => r.id !== id);
  };
  
  // Mock Timers
  window._timers = [];
  window._timerId = 1;
  const _setTimeout = setTimeout;
  const _clearTimeout = clearTimeout;
  const _setInterval = setInterval;
  const _clearInterval = clearInterval;
  
  window.setTimeout = (cb, delay, ...args) => {
    const id = window._timerId++;
    window._timers.push({ id, cb, triggerTime: window.MOCK_TIME + delay, isInterval: false, args });
    return id;
  };
  window.clearTimeout = (id) => {
    window._timers = window._timers.filter(t => t.id !== id);
  };
  window.setInterval = (cb, delay, ...args) => {
    const id = window._timerId++;
    window._timers.push({ id, cb, triggerTime: window.MOCK_TIME + delay, delay, isInterval: true, args });
    return id;
  };
  window.clearInterval = window.clearTimeout;
  
  // Advance Time
  window.advanceTime = () => {
    window.MOCK_TIME += window.FRAME_STEP;
    
    // Update videos
    document.querySelectorAll('video').forEach(v => {
      if (v._isPlaying) {
         // Some videos loop, let's assume they handle it
         if (v.duration && v.currentTime >= v.duration && v.loop) {
           v.currentTime = 0;
         } else {
           v.currentTime += (window.FRAME_STEP / 1000);
         }
      }
    });
    
    // Fire timers
    const timersToFire = window._timers.filter(t => window.MOCK_TIME >= t.triggerTime);
    timersToFire.forEach(t => {
      t.cb(...t.args);
      if (t.isInterval) {
        t.triggerTime = window.MOCK_TIME + t.delay;
      } else {
        window.clearTimeout(t.id);
      }
    });
    
    // Fire rAF
    const rafs = window._rafs;
    window._rafs = [];
    rafs.forEach(r => r.cb(window.MOCK_TIME));
  };
  
  // Override HTMLVideoElement play/pause
  const _play = HTMLVideoElement.prototype.play;
  HTMLVideoElement.prototype.play = function() {
    this._isPlaying = true;
    this.pause(); // keep the real video paused
    return Promise.resolve();
  };
  HTMLVideoElement.prototype.pause = function() {
    this._isPlaying = false;
  };
`;

console.log("ready");
