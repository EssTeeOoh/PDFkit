function canVibrate() {
  return typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
}

export function vibrate(pattern) {
  if (!canVibrate()) return;
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
