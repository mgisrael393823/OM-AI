// Force mock canvas module before any other modules are loaded
// This prevents the "Cannot find module '../build/Release/canvas.node'" error

// Override require to intercept canvas module loading
const Module = require('module');
const originalRequire = Module.prototype.require;

Module.prototype.require = function(id) {
  if (id === 'canvas') {
    return {
      createCanvas: jest.fn((width = 300, height = 150) => ({
        getContext: jest.fn(() => ({
          drawImage: jest.fn(),
          fillRect: jest.fn(),
          clearRect: jest.fn(),
          getImageData: jest.fn(() => ({ data: [] })),
          putImageData: jest.fn(),
          createImageData: jest.fn(() => ({ data: [] })),
          setTransform: jest.fn(),
          resetTransform: jest.fn(),
          save: jest.fn(),
          restore: jest.fn(),
          scale: jest.fn(),
          rotate: jest.fn(),
          translate: jest.fn(),
          transform: jest.fn(),
          beginPath: jest.fn(),
          closePath: jest.fn(),
          moveTo: jest.fn(),
          lineTo: jest.fn(),
          bezierCurveTo: jest.fn(),
          quadraticCurveTo: jest.fn(),
          arc: jest.fn(),
          arcTo: jest.fn(),
          rect: jest.fn(),
          fill: jest.fn(),
          stroke: jest.fn(),
          clip: jest.fn(),
          isPointInPath: jest.fn(),
          measureText: jest.fn(() => ({ width: 0 }))
        })),
        toBuffer: jest.fn((callback) => {
          if (callback) callback(null, Buffer.from([]))
          return Promise.resolve(Buffer.from([]))
        }),
        toDataURL: jest.fn(() => 'data:image/png;base64,'),
        width,
        height
      })),
      loadImage: jest.fn(() => Promise.resolve({ width: 100, height: 100 })),
      Image: jest.fn(function() {
        this.width = 0
        this.height = 0
        this.src = ''
      }),
      ImageData: jest.fn(function(width = 0, height = 0) {
        this.width = width
        this.height = height
        this.data = new Uint8ClampedArray(width * height * 4)
      }),
      registerFont: jest.fn()
    };
  }
  return originalRequire.apply(this, arguments);
};