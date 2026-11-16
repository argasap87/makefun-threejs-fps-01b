// Where the player's hands meet the game: keys, mouse and pointer lock.
//
// Nothing here knows about rounds or weapons. It keeps the set of held keys,
// the mouse delta since the last frame, and whether the trigger is held, and
// reports pointer-lock changes so the game can pause when the lock drops.
// Pointer lock is the only way the mouse steers the view; without it the
// game shows its start panel instead of reading the mouse.
export function createInput(canvas, onLockChange) {
  const keys = new Set();
  const state = { keys, locked: false, firing: false, lookX: 0, lookY: 0 };

  function applyKey(event, down) {
    if (down) keys.add(event.code);
    else keys.delete(event.code);
    // The page must not scroll when the player jumps.
    if (event.code === 'Space') event.preventDefault();
  }

  function onMouseMove(event) {
    if (!state.locked) return;
    state.lookX += event.movementX;
    state.lookY += event.movementY;
  }

  function onMouseDown(event) {
    if (state.locked && event.button === 0) state.firing = true;
  }

  function onMouseUp(event) {
    if (event.button === 0) state.firing = false;
  }

  function onLockLost() {
    // Esc, alt-tab or the buy menu: nothing stays held.
    keys.clear();
    state.firing = false;
  }

  window.addEventListener('keydown', (event) => applyKey(event, true));
  window.addEventListener('keyup', (event) => applyKey(event, false));
  window.addEventListener('blur', () => keys.clear());
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  document.addEventListener('pointerlockchange', () => {
    state.locked = document.pointerLockElement === canvas;
    if (!state.locked) onLockLost();
    onLockChange(state.locked);
  });

  return {
    state,
    requestLock() {
      canvas.requestPointerLock();
    },
    // Hand over the look delta gathered since the last frame, then zero it.
    takeLook() {
      const look = { x: state.lookX, y: state.lookY };
      state.lookX = 0;
      state.lookY = 0;
      return look;
    },
  };
}
