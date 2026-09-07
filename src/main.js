// Bootstrap: title screen, then hand control to the game.

import { Game } from './game.js';
import { hasSave, saveSummary } from './core/save.js';
import { buildTileArt, TS, groundCanvas, objectCanvas } from './gfx/tileart.js';
import { buildSprites, humanSprite } from './gfx/sprites.js';
import { tileId } from './world/tiles.js';
import { PAL } from './gfx/palette.js';

const $ = (id) => document.getElementById(id);

/** A tiny animated vignette behind the title: a figure by a torch at night. */
function drawTitleArt() {
  buildTileArt();
  buildSprites();
  const canvas = $('title-canvas');
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const W = canvas.width, H = canvas.height;

  const ids = {
    grass: tileId('grass_dark'), dirt: tileId('dirt'),
    tree: tileId('tree_pine'), oak: tileId('tree_oak'),
    torch: tileId('torch'), rock: tileId('rock'),
  };
  const player = humanSprite('player');
  let t = 0;

  function frame() {
    t += 1 / 30;
    ctx.fillStyle = '#0b0e14';
    ctx.fillRect(0, 0, W, H);

    // Ground
    for (let y = 3; y < 6; y++) {
      for (let x = 0; x < W / TS + 1; x++) {
        const g = groundCanvas(y === 3 ? ids.grass : ids.dirt, x, y);
        if (g) ctx.drawImage(g, x * TS, y * TS - 8);
      }
    }
    // Treeline
    for (const [tx, kind] of [[0, 'tree'], [1, 'oak'], [7, 'tree'], [8, 'tree'], [9, 'oak']]) {
      const art = objectCanvas(ids[kind]);
      if (art) ctx.drawImage(art.canvas, tx * TS + art.ox, 3 * TS - 8 + TS - art.canvas.height);
    }
    const rock = objectCanvas(ids.rock);
    if (rock) ctx.drawImage(rock.canvas, 5 * TS + rock.ox, 4 * TS - 8 + TS - rock.canvas.height);

    // The torch, and the figure standing in its light
    const torch = objectCanvas(ids.torch);
    const tx = 4 * TS, ty = 4 * TS - 8;
    if (torch) ctx.drawImage(torch.canvas, tx + torch.ox, ty + TS - torch.canvas.height);
    const walk = player.right[Math.floor(t * 5) % 4];
    ctx.drawImage(walk, tx + 20, ty + TS - 16);

    // Warm pool of light, flickering
    const flick = 0.86 + Math.sin(t * 7.1) * 0.07 + Math.sin(t * 13.3) * 0.05;
    const grad = ctx.createRadialGradient(tx + 8, ty + 6, 2, tx + 8, ty + 6, 46 * flick);
    grad.addColorStop(0, 'rgba(255,200,120,0.55)');
    grad.addColorStop(0.5, 'rgba(255,150,70,0.20)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over';

    // Darkness everywhere the torch does not reach
    ctx.fillStyle = 'rgba(6,8,16,0.55)';
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over';

    // Embers
    for (let i = 0; i < 4; i++) {
      const p = (t * 0.5 + i * 0.25) % 1;
      const ex = tx + 8 + Math.sin((t + i) * 2.3) * 3;
      const ey = ty + 6 - p * 22;
      ctx.globalAlpha = 1 - p;
      ctx.fillStyle = i % 2 ? PAL.fire2 : PAL.fire3;
      ctx.fillRect(ex | 0, ey | 0, 1, 1);
    }
    ctx.globalAlpha = 1;
    requestAnimationFrame(frame);
  }
  frame();
}

function boot() {
  const canvas = $('screen');
  const game = new Game(canvas);
  window.game = game;                       // handy for debugging from the console

  drawTitleArt();

  if (hasSave()) {
    const s = saveSummary();
    const btn = $('btn-continue');
    btn.classList.remove('hidden');
    btn.textContent = s ? `Continue — Day ${s.day}` : 'Continue';
    btn.addEventListener('click', () => {
      game.audio.unlock();
      game.ui.showLoading('Remembering…');
      // Yield a frame so the loading state actually paints before we block.
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (!game.loadSaved()) game.newGame('');
      }));
    });
  }

  $('btn-new').addEventListener('click', () => {
    game.audio.unlock();
    game.ui.showLoading('Shaping the world…');
    requestAnimationFrame(() => requestAnimationFrame(() => {
      game.newGame($('seed-input').value);
    }));
  });

  $('btn-help').addEventListener('click', () => {
    game.audio.unlock();
    game.ui.openHelp();
  });

  // Any first touch unlocks audio; browsers require a gesture.
  const unlock = () => game.audio.unlock();
  addEventListener('pointerdown', unlock, { once: true });
  addEventListener('keydown', unlock, { once: true });

  // Save on the way out — mobile browsers only reliably fire this one.
  addEventListener('visibilitychange', () => { if (document.hidden) game.save(); });
  addEventListener('pagehide', () => game.save());
}

if (document.readyState === 'loading') addEventListener('DOMContentLoaded', boot);
else boot();
