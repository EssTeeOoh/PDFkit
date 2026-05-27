// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: jest.fn().mockImplementation((query) => ({
    matches: query.includes("light"),
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

Object.defineProperty(window, "scrollTo", {
  writable: true,
  value: jest.fn(),
});

Object.defineProperty(window.HTMLElement.prototype, "scrollIntoView", {
  writable: true,
  value: jest.fn(),
});

Object.defineProperty(window.URL, "createObjectURL", {
  writable: true,
  value: jest.fn(() => "blob:mock-url"),
});

Object.defineProperty(window.URL, "revokeObjectURL", {
  writable: true,
  value: jest.fn(),
});

Object.defineProperty(HTMLAnchorElement.prototype, "click", {
  writable: true,
  value: jest.fn(),
});

Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
  writable: true,
  value: jest.fn(() => ({
    beginPath: jest.fn(),
    moveTo: jest.fn(),
    lineTo: jest.fn(),
    stroke: jest.fn(),
    clearRect: jest.fn(),
    fillText: jest.fn(),
  })),
});

Object.defineProperty(navigator, "sendBeacon", {
  writable: true,
  value: jest.fn(() => true),
});

Object.defineProperty(File.prototype, "arrayBuffer", {
  writable: true,
  value: jest.fn(async function arrayBuffer() {
    return new Blob([this]).arrayBuffer();
  }),
});

global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};
