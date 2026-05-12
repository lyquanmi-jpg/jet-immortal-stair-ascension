"use strict";

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const overlay = document.getElementById("overlay");
const overlayKicker = document.getElementById("overlayKicker");
const overlayTitle = document.getElementById("overlayTitle");
const overlayText = document.getElementById("overlayText");
const startBtn = document.getElementById("startBtn");

const W = canvas.width;
const H = canvas.height;
const TARGET_HEIGHT = 3000;
const LANES = [122, 210, 298, 386];
const PLAYER_Y = 548;
const PLAYER_W = 34;
const PLAYER_H = 50;
const MAX_HEALTH = 100;
const MAX_QI = 100;

const realms = [
  { name: "炼气", height: 0 },
  { name: "筑基", height: 500 },
  { name: "金丹", height: 1100 },
  { name: "元婴", height: 1700 },
  { name: "化神", height: 2400 },
  { name: "飞升", height: TARGET_HEIGHT }
];

const obstacleDefs = [
  { type: "rock", label: "落石", color: "#766f6a", damage: 16, slow: 0 },
  { type: "stick", label: "自拍杆", color: "#a0a7b8", damage: 10, slow: 0.45 },
  { type: "tired", label: "体力不足", color: "#c95d67", damage: 18, slow: 0.15 },
  { type: "crit", label: "台阶暴击", color: "#f0b748", damage: 12, slow: 0.75 }
];

const itemDefs = [
  { type: "gourd", label: "酒葫芦补给", color: "#d58238" },
  { type: "talisman", label: "急急如律令", color: "#ffe48b" },
  { type: "sword", label: "仙剑护体", color: "#8cecff" }
];

const keys = {
  left: false,
  right: false,
  jet: false
};

let state;
let lastTime = 0;
let rafId = 0;

function resetGame(mode = "running") {
  state = {
    mode,
    x: W / 2,
    y: PLAYER_Y,
    vx: 0,
    height: 0,
    health: MAX_HEALTH,
    qi: MAX_QI,
    scroll: 0,
    speed: 112,
    slowTimer: 0,
    invincibleTimer: 0,
    hitFlash: 0,
    obstacleTimer: 0.65,
    itemTimer: 2.4,
    message: "",
    messageTimer: 0,
    obstacles: [],
    items: [],
    particles: [],
    clouds: makeClouds(),
    stepChips: makeStepChips(),
    swordAngle: 0
  };
  lastTime = performance.now();
}

function makeClouds() {
  return Array.from({ length: 14 }, () => ({
    x: rand(20, W - 20),
    y: rand(0, H),
    w: rand(28, 78),
    speed: rand(10, 28),
    alpha: rand(0.08, 0.2)
  }));
}

function makeStepChips() {
  return Array.from({ length: 46 }, (_, i) => ({
    x: rand(72, W - 72),
    y: i * 38 + rand(-10, 10),
    w: rand(10, 26),
    shade: Math.random() > 0.5 ? "#777b82" : "#4d5159"
  }));
}

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function currentRealm() {
  let realm = realms[0].name;
  for (const item of realms) {
    if (state.height >= item.height) realm = item.name;
  }
  return realm;
}

function titleForHeight(height) {
  if (height >= 2400) return "化神期差点就飞升";
  if (height >= 1700) return "元婴期台阶克星";
  if (height >= 1100) return "金丹期喷气仙人";
  if (height >= 500) return "筑基期爬楼猛人";
  return "炼气期腿软修士";
}

function startGame() {
  resetGame("running");
  overlay.classList.add("hidden");
  cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(loop);
}

function endGame(win) {
  state.mode = win ? "win" : "lose";
  overlay.classList.remove("hidden");
  overlayKicker.textContent = win ? "飞升成功" : "试炼失败";
  overlayTitle.textContent = win ? "喷气仙人飞升成功！" : titleForHeight(state.height);
  overlayText.textContent = win
    ? `你爬到了 ${Math.floor(state.height)} 米，酒葫芦冒蓝火，仙剑自动点赞。`
    : `本次高度 ${Math.floor(state.height)} 米，境界 ${currentRealm()}。调息三秒，还能再冲一把。`;
  startBtn.textContent = "再爬一次";
}

function loop(now) {
  const dt = Math.min(0.033, (now - lastTime) / 1000 || 0);
  lastTime = now;

  if (state.mode === "running") {
    update(dt);
    draw();
    rafId = requestAnimationFrame(loop);
  } else {
    draw();
  }
}

function update(dt) {
  const jetting = keys.jet && state.qi > 0;
  const input = (keys.left ? -1 : 0) + (keys.right ? 1 : 0);
  const targetVx = input * (jetting ? 210 : 158);

  state.vx += (targetVx - state.vx) * Math.min(1, dt * 12);
  state.x = clamp(state.x + state.vx * dt, 70, W - 70);

  if (jetting) {
    state.qi = clamp(state.qi - 34 * dt, 0, MAX_QI);
    spawnJet(dt);
  } else {
    state.qi = clamp(state.qi + 8 * dt, 0, MAX_QI);
  }

  if (state.slowTimer > 0) state.slowTimer -= dt;
  if (state.invincibleTimer > 0) state.invincibleTimer -= dt;
  if (state.hitFlash > 0) state.hitFlash -= dt;
  if (state.messageTimer > 0) state.messageTimer -= dt;

  const realmBonus = 1 + Math.min(0.45, state.height / 8000);
  const jetBoost = jetting ? 2.15 : 1;
  const slowFactor = state.slowTimer > 0 ? 0.55 : 1;
  const climbSpeed = state.speed * realmBonus * jetBoost * slowFactor;
  state.height += climbSpeed * dt;
  state.scroll = (state.scroll + climbSpeed * dt) % 80;
  state.swordAngle += dt * (state.invincibleTimer > 0 ? 7.8 : 3.8);

  updateSpawns(dt, climbSpeed);
  updateEntities(dt, climbSpeed);
  updateParticles(dt);
  updateClouds(dt, climbSpeed);

  if (state.height >= TARGET_HEIGHT) {
    state.height = TARGET_HEIGHT;
    endGame(true);
  } else if (state.health <= 0) {
    state.health = 0;
    endGame(false);
  }
}

function updateSpawns(dt) {
  state.obstacleTimer -= dt;
  state.itemTimer -= dt;

  if (state.obstacleTimer <= 0) {
    spawnObstacle();
    const difficulty = clamp(state.height / TARGET_HEIGHT, 0, 1);
    state.obstacleTimer = rand(0.76, 1.24) - difficulty * 0.22;
  }

  if (state.itemTimer <= 0) {
    spawnItem();
    state.itemTimer = rand(3.0, 4.8);
  }
}

function spawnObstacle() {
  const def = obstacleDefs[Math.floor(Math.random() * obstacleDefs.length)];
  const lane = LANES[Math.floor(Math.random() * LANES.length)];
  state.obstacles.push({
    ...def,
    x: lane + rand(-12, 12),
    y: -52,
    w: def.type === "stick" ? 48 : 42,
    h: def.type === "crit" ? 30 : 42,
    hit: false,
    bob: rand(0, Math.PI * 2)
  });
}

function spawnItem() {
  const def = itemDefs[Math.floor(Math.random() * itemDefs.length)];
  const lane = LANES[Math.floor(Math.random() * LANES.length)];
  state.items.push({
    ...def,
    x: lane,
    y: -52,
    w: 36,
    h: 38,
    bob: rand(0, Math.PI * 2)
  });
}

function updateEntities(dt, climbSpeed) {
  const fall = climbSpeed * dt * 1.14;

  for (const obstacle of state.obstacles) {
    obstacle.y += fall;
    obstacle.bob += dt * 4;
    if (!obstacle.hit && rectsOverlap(playerRect(), entityRect(obstacle))) {
      obstacle.hit = true;
      handleObstacle(obstacle);
    }
  }

  for (const item of state.items) {
    item.y += fall;
    item.bob += dt * 4;
    if (!item.hit && rectsOverlap(playerRect(), entityRect(item))) {
      item.hit = true;
      handleItem(item);
    }
  }

  state.obstacles = state.obstacles.filter((item) => item.y < H + 90 && !item.remove);
  state.items = state.items.filter((item) => item.y < H + 90 && !item.hit);
}

function handleObstacle(obstacle) {
  if (state.invincibleTimer > 0) {
    obstacle.remove = true;
    burst(obstacle.x, obstacle.y, "#9df0ff", 18);
    showMessage("仙剑护体：障碍碎成渣");
    return;
  }

  state.health = clamp(state.health - obstacle.damage, 0, MAX_HEALTH);
  state.slowTimer = Math.max(state.slowTimer, obstacle.slow);
  state.hitFlash = 0.25;
  burst(obstacle.x, obstacle.y, "#ff6767", 14);
  showMessage(`${obstacle.label}：体力 -${obstacle.damage}`);
}

function handleItem(item) {
  if (item.type === "gourd") {
    state.qi = clamp(state.qi + 42, 0, MAX_QI);
    showMessage("酒葫芦补给：仙气回满一点点");
    burst(item.x, item.y, "#ffd35a", 18);
  } else if (item.type === "talisman") {
    state.invincibleTimer = 3.2;
    showMessage("急急如律令：短暂无敌");
    burst(item.x, item.y, "#fff1a6", 24);
  } else {
    const cutoff = PLAYER_Y - 40;
    let cleared = 0;
    for (const obstacle of state.obstacles) {
      if (obstacle.y < cutoff) {
        obstacle.remove = true;
        cleared += 1;
        burst(obstacle.x, obstacle.y, "#8cecff", 8);
      }
    }
    showMessage(cleared ? "仙剑护体：前方清场" : "仙剑护体：剑光绕身");
    state.invincibleTimer = Math.max(state.invincibleTimer, 1.2);
  }
}

function showMessage(text) {
  state.message = text;
  state.messageTimer = 1.4;
}

function playerRect() {
  return {
    x: state.x - PLAYER_W / 2,
    y: state.y - PLAYER_H / 2,
    w: PLAYER_W,
    h: PLAYER_H
  };
}

function entityRect(entity) {
  return {
    x: entity.x - entity.w / 2,
    y: entity.y - entity.h / 2,
    w: entity.w,
    h: entity.h
  };
}

function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function spawnJet(dt) {
  const count = Math.ceil(35 * dt);
  for (let i = 0; i < count; i += 1) {
    state.particles.push({
      x: state.x + rand(-12, 12),
      y: state.y + 30 + rand(0, 12),
      vx: rand(-38, 38),
      vy: rand(120, 250),
      size: rand(3, 7),
      life: rand(0.28, 0.52),
      maxLife: 0.52,
      color: Math.random() > 0.34 ? "#85eaff" : "#eefcff"
    });
  }
}

function burst(x, y, color, count) {
  for (let i = 0; i < count; i += 1) {
    state.particles.push({
      x,
      y,
      vx: rand(-130, 130),
      vy: rand(-110, 130),
      size: rand(3, 7),
      life: rand(0.25, 0.65),
      maxLife: 0.65,
      color
    });
  }
}

function updateParticles(dt) {
  for (const p of state.particles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 90 * dt;
    p.life -= dt;
  }
  state.particles = state.particles.filter((p) => p.life > 0);
}

function updateClouds(dt, climbSpeed) {
  for (const cloud of state.clouds) {
    cloud.y += (cloud.speed + climbSpeed * 0.18) * dt;
    if (cloud.y > H + 40) {
      cloud.y = -60;
      cloud.x = rand(20, W - 20);
      cloud.w = rand(28, 78);
    }
  }
}

function draw() {
  drawBackground();
  drawGreatWall();
  drawEntities();
  drawParticles();
  drawPlayer();
  drawHud();

  if (state.hitFlash > 0) {
    ctx.fillStyle = `rgba(255, 54, 54, ${state.hitFlash * 1.2})`;
    ctx.fillRect(0, 0, W, H);
  }
}

function drawBackground() {
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, "#151c32");
  sky.addColorStop(0.58, "#1f2430");
  sky.addColorStop(1, "#10121a");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = "#24293a";
  for (let i = 0; i < 7; i += 1) {
    const x = i * 82 - 30;
    ctx.fillRect(x, 110 + i % 2 * 28, 92, H);
    ctx.fillStyle = i % 2 ? "#202535" : "#252b3c";
  }

  for (const cloud of state.clouds) {
    ctx.globalAlpha = cloud.alpha;
    drawPixelCloud(cloud.x, cloud.y, cloud.w);
    ctx.globalAlpha = 1;
  }
}

function drawGreatWall() {
  const left = 58;
  const right = W - 58;
  ctx.fillStyle = "#343943";
  ctx.fillRect(left, 0, right - left, H);
  ctx.fillStyle = "#272b34";
  ctx.fillRect(left - 28, 0, 26, H);
  ctx.fillRect(right + 2, 0, 26, H);

  for (let y = -80 + state.scroll; y < H + 80; y += 80) {
    ctx.fillStyle = "#555a64";
    ctx.fillRect(left, y, right - left, 36);
    ctx.fillStyle = "#676c75";
    ctx.fillRect(left + 8, y + 4, right - left - 16, 8);
    ctx.fillStyle = "#2a2e36";
    ctx.fillRect(left, y + 34, right - left, 5);
    ctx.fillStyle = "#454a53";
    for (let x = left + 18; x < right - 16; x += 58) {
      ctx.fillRect(x, y + 16, 34, 4);
    }
  }

  for (const chip of state.stepChips) {
    const y = (chip.y + state.scroll * 1.5) % (H + 50) - 25;
    ctx.fillStyle = chip.shade;
    ctx.fillRect(chip.x, y, chip.w, 4);
  }

  ctx.fillStyle = "#575d68";
  for (let y = -40 + (state.scroll % 56); y < H + 56; y += 56) {
    ctx.fillRect(28, y, 28, 18);
    ctx.fillRect(W - 56, y + 22, 28, 18);
  }
}

function drawPixelCloud(x, y, w) {
  ctx.fillStyle = "#e7edf8";
  const h = w * 0.34;
  ctx.fillRect(x - w / 2, y, w, h);
  ctx.fillRect(x - w * 0.32, y - h * 0.55, w * 0.34, h);
  ctx.fillRect(x + w * 0.05, y - h * 0.75, w * 0.32, h * 1.1);
}

function drawEntities() {
  for (const obstacle of state.obstacles) drawObstacle(obstacle);
  for (const item of state.items) drawItem(item);
}

function drawObstacle(o) {
  const y = o.y + Math.sin(o.bob) * 2;
  ctx.save();
  ctx.translate(Math.round(o.x), Math.round(y));

  if (o.type === "rock") {
    ctx.fillStyle = "#403b38";
    ctx.fillRect(-18, -14, 36, 30);
    ctx.fillStyle = o.color;
    ctx.fillRect(-14, -20, 28, 30);
    ctx.fillStyle = "#9c958c";
    ctx.fillRect(-8, -15, 10, 6);
  } else if (o.type === "stick") {
    ctx.fillStyle = "#232832";
    ctx.fillRect(-3, -22, 6, 46);
    ctx.fillStyle = o.color;
    ctx.fillRect(-24, -28, 34, 16);
    ctx.fillStyle = "#6ae1ff";
    ctx.fillRect(-19, -24, 16, 8);
    ctx.fillStyle = "#f1d4ad";
    ctx.fillRect(8, 14, 16, 10);
  } else if (o.type === "tired") {
    ctx.fillStyle = o.color;
    ctx.fillRect(-20, -18, 40, 32);
    ctx.fillStyle = "#fff0d8";
    ctx.fillRect(-14, -12, 28, 6);
    ctx.fillRect(-10, 2, 20, 6);
  } else {
    ctx.fillStyle = "#4b3220";
    ctx.fillRect(-24, -12, 48, 24);
    ctx.fillStyle = o.color;
    ctx.fillRect(-18, -18, 36, 10);
    ctx.fillStyle = "#fff1b2";
    ctx.fillRect(-6, -21, 12, 5);
  }

  drawTinyLabel(o.label, 0, 28);
  ctx.restore();
}

function drawItem(item) {
  const y = item.y + Math.sin(item.bob) * 4;
  ctx.save();
  ctx.translate(Math.round(item.x), Math.round(y));

  if (item.type === "gourd") {
    ctx.fillStyle = "#7b3e18";
    ctx.fillRect(-10, -21, 20, 10);
    ctx.fillStyle = item.color;
    ctx.fillRect(-16, -12, 32, 30);
    ctx.fillStyle = "#f4c16a";
    ctx.fillRect(-8, -5, 16, 8);
  } else if (item.type === "talisman") {
    ctx.fillStyle = item.color;
    ctx.fillRect(-14, -22, 28, 42);
    ctx.fillStyle = "#c34a32";
    ctx.fillRect(-8, -14, 16, 4);
    ctx.fillRect(-4, -6, 8, 18);
  } else {
    ctx.fillStyle = "#dffcff";
    ctx.fillRect(-3, -26, 6, 40);
    ctx.fillStyle = item.color;
    ctx.fillRect(-10, -19, 20, 8);
    ctx.fillStyle = "#ffc84e";
    ctx.fillRect(-6, 12, 12, 10);
  }

  ctx.globalAlpha = 0.45;
  ctx.fillStyle = item.color;
  ctx.fillRect(-24, -28, 48, 4);
  ctx.fillRect(-24, 24, 48, 4);
  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawTinyLabel(text, x, y) {
  ctx.font = "10px sans-serif";
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(0, 0, 0, 0.58)";
  ctx.fillRect(x - text.length * 5 - 3, y - 10, text.length * 10 + 6, 14);
  ctx.fillStyle = "#f5ecd4";
  ctx.fillText(text, x, y);
}

function drawParticles() {
  for (const p of state.particles) {
    const alpha = clamp(p.life / p.maxLife, 0, 1);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = p.color;
    ctx.fillRect(Math.round(p.x), Math.round(p.y), Math.round(p.size), Math.round(p.size));
    ctx.globalAlpha = 1;
  }
}

function drawPlayer() {
  const x = Math.round(state.x);
  const y = Math.round(state.y);
  const invincible = state.invincibleTimer > 0;

  drawSword(x, y, invincible);

  ctx.save();
  ctx.translate(x, y);

  ctx.fillStyle = "#6a371a";
  ctx.fillRect(-25, 2, 20, 32);
  ctx.fillStyle = "#d98637";
  ctx.fillRect(-28, 8, 26, 24);
  ctx.fillStyle = "#ffe08a";
  ctx.fillRect(-20, 14, 10, 6);

  ctx.fillStyle = "#24212a";
  ctx.fillRect(-15, -20, 30, 32);
  ctx.fillStyle = "#58b7cf";
  ctx.fillRect(-11, -14, 22, 26);
  ctx.fillStyle = "#f0c8a0";
  ctx.fillRect(-12, -38, 24, 20);
  ctx.fillStyle = "#1c1a20";
  ctx.fillRect(-15, -44, 30, 10);
  ctx.fillStyle = "#ffd35a";
  ctx.fillRect(-5, -50, 10, 8);
  ctx.fillStyle = "#23252d";
  ctx.fillRect(-8, -32, 4, 4);
  ctx.fillRect(5, -32, 4, 4);

  ctx.fillStyle = "#1d2028";
  ctx.fillRect(-17, 10, 10, 26);
  ctx.fillRect(7, 10, 10, 26);
  ctx.fillStyle = "#f0c8a0";
  ctx.fillRect(-26, -14, 12, 22);
  ctx.fillRect(14, -14, 12, 22);

  if (keys.jet && state.qi > 0) {
    ctx.fillStyle = "#eaffff";
    ctx.fillRect(-8, 36, 16, 10);
    ctx.fillStyle = "#85eaff";
    ctx.fillRect(-13, 44, 26, 18);
    ctx.fillStyle = "#2b8cc6";
    ctx.fillRect(-7, 59, 14, 12);
  }

  if (invincible) {
    ctx.globalAlpha = 0.35 + Math.sin(performance.now() / 80) * 0.12;
    ctx.fillStyle = "#fff2a0";
    ctx.fillRect(-28, -54, 56, 94);
    ctx.globalAlpha = 1;
  }

  ctx.restore();
}

function drawSword(x, y, invincible) {
  const angle = state.swordAngle;
  const sx = x + Math.cos(angle) * 44;
  const sy = y - 18 + Math.sin(angle) * 22;
  ctx.save();
  ctx.translate(Math.round(sx), Math.round(sy));
  ctx.rotate(angle + Math.PI / 4);
  ctx.globalAlpha = invincible ? 0.75 : 0.36;
  ctx.fillStyle = "#8cecff";
  ctx.fillRect(-6, -30, 12, 62);
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#e8fdff";
  ctx.fillRect(-2, -28, 4, 44);
  ctx.fillStyle = "#80eaff";
  ctx.fillRect(-7, 10, 14, 6);
  ctx.fillStyle = "#ffd35a";
  ctx.fillRect(-4, 16, 8, 12);
  ctx.restore();
}

function drawHud() {
  ctx.fillStyle = "rgba(9, 10, 16, 0.66)";
  ctx.fillRect(14, 12, W - 28, 82);
  ctx.strokeStyle = "rgba(255, 211, 90, 0.55)";
  ctx.lineWidth = 2;
  ctx.strokeRect(14.5, 12.5, W - 29, 82);

  ctx.fillStyle = "#ffd35a";
  ctx.font = "bold 20px sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(`高度 ${Math.floor(state.height)} / ${TARGET_HEIGHT}`, 28, 40);
  ctx.textAlign = "right";
  ctx.fillText(currentRealm(), W - 28, 40);

  drawBar(28, 54, 190, 14, state.health / MAX_HEALTH, "#ff5d68", "体力");
  drawBar(262, 54, 164, 14, state.qi / MAX_QI, "#74dbff", "仙气");

  if (state.messageTimer > 0) {
    ctx.textAlign = "center";
    ctx.font = "bold 18px sans-serif";
    ctx.fillStyle = "#fff6c4";
    ctx.fillText(state.message, W / 2, 126);
  }
}

function drawBar(x, y, w, h, ratio, color, label) {
  ctx.fillStyle = "#151721";
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, Math.round(w * clamp(ratio, 0, 1)), h);
  ctx.strokeStyle = "#e9dfba";
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  ctx.fillStyle = "#f5ecd4";
  ctx.font = "bold 11px sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(label, x, y + 28);
}

function bindKeys() {
  window.addEventListener("keydown", (event) => {
    if (event.code === "ArrowLeft") keys.left = true;
    if (event.code === "ArrowRight") keys.right = true;
    if (event.code === "Space") {
      keys.jet = true;
      event.preventDefault();
    }
    if ((event.code === "Enter" || event.code === "Space") && state.mode !== "running") {
      event.preventDefault();
      startGame();
    }
  });

  window.addEventListener("keyup", (event) => {
    if (event.code === "ArrowLeft") keys.left = false;
    if (event.code === "ArrowRight") keys.right = false;
    if (event.code === "Space") keys.jet = false;
  });
}

function bindTouchControls() {
  const buttons = document.querySelectorAll(".touch-btn");
  const setAction = (button, isDown) => {
    const action = button.dataset.action;
    keys[action] = isDown;
    button.classList.toggle("is-down", isDown);
  };

  for (const button of buttons) {
    button.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      button.setPointerCapture(event.pointerId);
      setAction(button, true);
    });
    button.addEventListener("pointerup", () => setAction(button, false));
    button.addEventListener("pointercancel", () => setAction(button, false));
    button.addEventListener("pointerleave", () => setAction(button, false));
  }
}

startBtn.addEventListener("click", startGame);
bindKeys();
bindTouchControls();
resetGame("menu");
draw();
