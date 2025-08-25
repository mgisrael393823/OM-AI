// Mock implementation of the canvas module for Jest tests
// This prevents the "Cannot find module '../build/Release/canvas.node'" error

const createContext = () => ({
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
  measureText: jest.fn(() => ({ width: 0 })),
  canvas: {
    width: 300,
    height: 150
  }
})

const createCanvas = jest.fn((width = 300, height = 150) => ({
  getContext: jest.fn(() => createContext()),
  toBuffer: jest.fn((callback) => {
    if (callback) callback(null, Buffer.from([]))
    return Promise.resolve(Buffer.from([]))
  }),
  toDataURL: jest.fn(() => 'data:image/png;base64,'),
  width,
  height
}))

const loadImage = jest.fn(() => Promise.resolve({ width: 100, height: 100 }))

const Image = jest.fn(function() {
  this.width = 0
  this.height = 0
  this.src = ''
  this.onload = null
  this.onerror = null
})

const ImageData = jest.fn(function(width = 0, height = 0) {
  this.width = width
  this.height = height
  this.data = new Uint8ClampedArray(width * height * 4)
})

const registerFont = jest.fn()

module.exports = {
  createCanvas,
  loadImage,
  Image,
  ImageData,
  registerFont,
  Canvas: createCanvas
}