import test from 'node:test';
import assert from 'node:assert/strict';
import { Combat, type Controls } from '../src/game/combat.ts';

const none: Controls = { move: 0, run: false, guard: false, punch: false, kick: false, dash: false };
function advance(game: Combat, seconds: number, input = none) {
  for (let t = 0; t < seconds; t += 1 / 60) game.update(1 / 60, input);
}
function ready(distance = 1) {
  const game = new Combat();
  game.mode = 'dummy';
  game.start();
  game.fighters[0].x = 0;
  game.fighters[1].x = distance;
  return game;
}

test('one punch damages only once during its active window', () => {
  const game = ready();
  game.update(1 / 60, { ...none, punch: true });
  advance(game, 0.75);
  assert.equal(game.fighters[1].hp, 92);
});
test('out of range attacks miss', () => {
  const game = ready(2.5);
  game.update(1 / 60, { ...none, kick: true });
  advance(game, 1);
  assert.equal(game.fighters[1].hp, 100);
});
test('guard reduces damage when defender faces the attack', () => {
  const game = ready();
  game.fighters[1].guard = true;
  game.update(1 / 60, { ...none, punch: true });
  advance(game, 0.5);
  assert.equal(game.fighters[1].hp, 98.4);
});
test('pause freezes timer, movement and attacks', () => {
  const game = ready();
  game.pause();
  const initialX = game.fighters[0].x;
  advance(game, 1, { ...none, move: 1, punch: true });
  assert.equal(game.remaining, 60);
  assert.equal(game.fighters[0].x, initialX);
  assert.equal(game.fighters[1].hp, 100);
});
test('restart clears damage, attacks, timer and result', () => {
  const game = ready();
  game.update(0.02, { ...none, kick: true });
  game.fighters[1].hp = 0;
  game.update(0.02, none);
  game.start();
  assert.equal(game.fighters[1].hp, 100);
  assert.equal(game.fighters[0].attack, null);
  assert.equal(game.remaining, 60);
  assert.equal(game.result, null);
});
test('movement cannot overlap the opponent or leave the stage', () => {
  const game = ready(1);
  advance(game, 3, { ...none, move: 1, run: true });
  assert.ok(game.fighters[1].x - game.fighters[0].x >= 0.67 - 1e-6);
  advance(game, 10, { ...none, move: -1, run: true });
  assert.ok(game.fighters[0].x >= -4.8);
});
test('dummy mode never attacks', () => {
  const game = ready();
  advance(game, 10);
  assert.equal(game.fighters[0].hp, 100);
});
test('ended round rejects further inputs', () => {
  const game = ready();
  game.fighters[1].hp = 0;
  game.update(0.02, none);
  advance(game, 1, { ...none, move: 1, kick: true });
  assert.equal(game.phase, 'ended');
  assert.equal(game.fighters[0].attack, null);
});
