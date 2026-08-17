import { problems } from './data/problems.js';

const problem = problems[0];
const board = document.querySelector('#board');
const defenseGrid = document.querySelector('#defenseGrid');
const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');

let replayingDefenseClick = false;
let animatingDefense = false;
let arrivalTimer = null;

function squareEl(square){
  return board?.querySelector(`[data-square="${square}"]`);
}

function flashArrival(square){
  const target = squareEl(square);
  if(!target) return;
  target.classList.remove('defense-arrival');
  void target.offsetWidth;
  target.classList.add('defense-arrival');
  if(arrivalTimer) clearTimeout(arrivalTimer);
  arrivalTimer = setTimeout(()=>target.classList.remove('defense-arrival'), 760);
}

function playDefenseMove(defense, button){
  const from = defense.black.slice(0,2);
  const to = defense.black.slice(2,4);
  const fromSquare = squareEl(from);
  const toSquare = squareEl(to);
  const piece = fromSquare?.querySelector('.piece');

  if(!board || !fromSquare || !toSquare || !piece || reduceMotion?.matches){
    replayingDefenseClick = true;
    button.click();
    replayingDefenseClick = false;
    requestAnimationFrame(()=>flashArrival(to));
    return;
  }

  animatingDefense = true;
  button.classList.add('defense-preview');

  const boardRect = board.getBoundingClientRect();
  const fromRect = fromSquare.getBoundingClientRect();
  const toRect = toSquare.getBoundingClientRect();
  const dx = toRect.left - fromRect.left;
  const dy = toRect.top - fromRect.top;

  const flyer = document.createElement('div');
  flyer.className = 'defense-flyer';
  flyer.style.left = `${fromRect.left - boardRect.left}px`;
  flyer.style.top = `${fromRect.top - boardRect.top}px`;
  flyer.style.width = `${fromRect.width}px`;
  flyer.style.height = `${fromRect.height}px`;

  const clone = piece.cloneNode(true);
  flyer.append(clone);
  board.append(flyer);
  piece.classList.add('defense-source-hidden');
  toSquare.classList.add('defense-preview-target');

  requestAnimationFrame(()=>{
    requestAnimationFrame(()=>{
      flyer.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
    });
  });

  window.setTimeout(()=>{
    flyer.remove();
    piece.classList.remove('defense-source-hidden');
    toSquare.classList.remove('defense-preview-target');
    button.classList.remove('defense-preview');

    replayingDefenseClick = true;
    button.click();
    replayingDefenseClick = false;
    animatingDefense = false;

    requestAnimationFrame(()=>flashArrival(to));
  }, 430);
}

if(defenseGrid){
  defenseGrid.addEventListener('click', event=>{
    const button = event.target.closest('.defense-chip');
    if(!button || !defenseGrid.contains(button) || replayingDefenseClick) return;
    if(button.disabled || animatingDefense) return;

    const buttons = [...defenseGrid.querySelectorAll('.defense-chip')];
    const index = buttons.indexOf(button);
    const defense = problem.defenses[index];
    if(!defense) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    playDefenseMove(defense, button);
  }, true);
}
