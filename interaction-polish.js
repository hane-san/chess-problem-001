const board = document.querySelector('#board');

const HOLD_MS = 220;
let gesture = null;
let bypass = false;

function interactionEnabled(){
  const phase=document.body.dataset.phase;
  return (phase==='key'||phase==='mate') &&
    !document.body.classList.contains('key-settling') &&
    !document.body.classList.contains('mate-settling');
}

function movableWhiteSquare(target){
  if(!interactionEnabled()) return null;
  const square = target?.closest?.('.square');
  if(!square || !board?.contains(square)) return null;
  return square.querySelector('.piece.white') ? square : null;
}

function emitPointer(type, target, source){
  if(!target) target = board;
  bypass = true;
  try{
    const event = new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      pointerId: source.pointerId,
      pointerType: source.pointerType || 'touch',
      isPrimary: source.isPrimary ?? true,
      button: 0,
      buttons: type === 'pointerup' || type === 'pointercancel' ? 0 : 1,
      clientX: source.clientX,
      clientY: source.clientY,
      screenX: source.screenX || 0,
      screenY: source.screenY || 0,
      pressure: type === 'pointerup' ? 0 : (source.pressure || .5)
    });
    target.dispatchEvent(event);
  }finally{
    bypass = false;
  }
}

function targetAt(x, y){
  return document.elementFromPoint(x, y)?.closest?.('.square') || board;
}

function clearMoveGuides(){
  board?.classList.remove('hold-active');
  board?.querySelectorAll('.square').forEach(square=>{
    square.classList.remove('selected','legal','capture-target','hover-target');
  });
}

function cancelHold(){
  if(!gesture) return;
  if(gesture.timer) clearTimeout(gesture.timer);
  gesture = null;
  clearMoveGuides();
}

board?.addEventListener('pointerdown', event=>{
  if(bypass) return;
  const square = movableWhiteSquare(event.target);
  event.preventDefault();
  event.stopImmediatePropagation();

  if(!square){
    cancelHold();
    return;
  }

  cancelHold();
  gesture = {
    id: event.pointerId,
    source: square,
    activated: false,
    latest: event,
    timer: null
  };

  try{ board.setPointerCapture(event.pointerId); }catch{}

  gesture.timer = window.setTimeout(()=>{
    if(!gesture || gesture.id !== event.pointerId || !interactionEnabled()) return;
    gesture.activated = true;
    board.classList.add('hold-active');
    // The core app now selects the piece and calculates its complete legal range.
    // This path is identical for the Key and for White's mating move.
    emitPointer('pointerdown', gesture.source, gesture.latest);
    if(navigator.vibrate) navigator.vibrate(7);
  }, HOLD_MS);
}, true);

board?.addEventListener('pointermove', event=>{
  if(bypass || !gesture || gesture.id !== event.pointerId) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  gesture.latest = event;
  if(!gesture.activated) return;
  emitPointer('pointermove', targetAt(event.clientX,event.clientY), event);
}, true);

board?.addEventListener('pointerup', event=>{
  if(bypass || !gesture || gesture.id !== event.pointerId) return;
  event.preventDefault();
  event.stopImmediatePropagation();

  const current = gesture;
  if(current.timer) clearTimeout(current.timer);
  if(current.activated){
    emitPointer('pointermove', targetAt(event.clientX,event.clientY), event);
    emitPointer('pointerup', targetAt(event.clientX,event.clientY), event);
  }

  gesture = null;
  try{ board.releasePointerCapture(event.pointerId); }catch{}
  requestAnimationFrame(clearMoveGuides);
}, true);

board?.addEventListener('pointercancel', event=>{
  if(bypass || !gesture || gesture.id !== event.pointerId) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  if(gesture.timer) clearTimeout(gesture.timer);
  if(gesture.activated) emitPointer('pointercancel', board, event);
  gesture = null;
  clearMoveGuides();
}, true);

board?.addEventListener('lostpointercapture', ()=>{
  if(!gesture) return;
  if(gesture.timer) clearTimeout(gesture.timer);
  gesture = null;
  clearMoveGuides();
}, true);

board?.addEventListener('contextmenu', event=>event.preventDefault(), true);
