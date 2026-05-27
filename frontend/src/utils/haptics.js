function canVibrate() {
  return typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
}

function isCoarsePointer() {
  return typeof window !== "undefined"
    && typeof window.matchMedia === "function"
    && window.matchMedia("(pointer: coarse)").matches;
}

export function vibrate(pattern) {
  if (!canVibrate() || !isCoarsePointer()) return;
  navigator.vibrate(pattern);
}

export function hapticTap() {
  vibrate(10);
}

export function hapticSuccess() {
  vibrate([12, 28, 12]);
}

export function hapticError() {
  vibrate(50);
}
