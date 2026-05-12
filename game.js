"use strict";

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const overlay = document.getElementById("overlay");
const overlayKicker = document.getElementById("overlayKicker");
const overlayTitle = document.getElementById("overlayTitle");
const overlayText = document.getElementById("overlayText");
const startBtn = document.getElementById("startBtn");
const settleBtn = document.getElementById("settleBtn");

const W = canvas.width;
const H = canvas.height;
const FIRST_BOSS_HEIGHT = 3000;
const LANES = [122, 210, 298, 386];
const PLAYER_Y = 548;
const PLAYER_W = 34;
const PLAYER_H = 50;
const MAX_HEALTH = 100;
const MAX_QI = 100;
const BOSS_MAX_HP = 100;

const realms = [
  { name: "炼气", height: 0 },
  { name: "筑基", height: 500 },
  { name: "金丹", height: 1100 },
  { name: "元婴", height: 1700 },
  { name: "化神", height: 2400 },
  { name: "飞升", height: FIRST_BOSS_HEIGHT }
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
  jet: false,
  attack: false
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
    nextBossHeight: FIRST_BOSS_HEIGHT,
    bossDefeatedCount: 0,
    peachHeartCount: 0,
    stuckTimer: 0,
    manlyTimer: 0,
    attackCooldown: 0,
    autoAttackTimer: 0,
    message: "",
    messageTimer: 0,
    obstacles: [],
    items: [],
    swordQi: [],
    bossBullets: [],
    peachHazards: [],
    peachHearts: [],
    particles: [],
    boss: null,
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
  settleBtn.classList.add("hidden");
  startBtn.textContent = "开始爬梯";
  overlay.classList.add("hidden");
  cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(loop);
}

function endGame() {
  state.mode = "lose";
  overlay.classList.remove("hidden");
  settleBtn.classList.add("hidden");
  overlayKicker.textContent = "试炼失败";
  overlayTitle.textContent = titleForHeight(state.height);
  overlayText.textContent = `本次高度 ${Math.floor(state.height)} 米，境界 ${currentRealm()}，击败 Boss ${state.bossDefeatedCount} 个。调息三秒，还能再冲一把。`;
  startBtn.textContent = "再爬一次";
}

function showBossClearedChoice() {
  state.mode = "bossCleared";
  overlay.classList.remove("hidden");
  settleBtn.classList.remove("hidden");
  overlayKicker.textContent = "心魔试炼";
  overlayTitle.textContent = "美色心魔已破";
  overlayText.textContent = `当前高度 ${Math.floor(state.height)} 米，境界 ${currentRealm()}，已击败 Boss ${state.bossDefeatedCount} 个。继续飞升会进入 3000 米之后的无尽模式。`;
  startBtn.textContent = "继续飞升";
  settleBtn.textContent = "见好就收";
}

function continueAscension() {
  state.mode = "running";
  state.boss = null;
  state.nextBossHeight += FIRST_BOSS_HEIGHT;
  state.obstacleTimer = 1.2;
  state.itemTimer = 2.2;
  state.message = "心魔已破：继续飞升";
  state.messageTimer = 1.5;
  settleBtn.classList.add("hidden");
  overlay.classList.add("hidden");
  lastTime = performance.now();
  cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(loop);
}

function settleRun() {
  state.mode = "settle";
  overlay.classList.remove("hidden");
  settleBtn.classList.add("hidden");
  overlayKicker.textContent = "见好就收";
  overlayTitle.textContent = "功成身退修士";
  overlayText.textContent = `结算：高度 ${Math.floor(state.height)} 米，境界 ${currentRealm()}，击败 Boss ${state.bossDefeatedCount} 个，称号「${titleForHeight(state.height)}」。`;
  startBtn.textContent = "再爬一次";
}

function loop(now) {
  const dt = Math.min(0.033, (now - lastTime) / 1000 || 0);
  lastTime = now;

  if (state.mode === "running" || state.mode === "boss") {
    update(dt);
    draw();
    rafId = requestAnimationFrame(loop);
  } else {
    draw();
  }
}

function update(dt) {
  const isBossFight = state.mode === "boss";
  const manly = state.manlyTimer > 0;
  const stuck = state.stuckTimer > 0;
  const jetting = keys.jet && (state.qi > 0 || manly);
  const input = (keys.left ? -1 : 0) + (keys.right ? 1 : 0);
  const baseMoveSpeed = manly ? 245 : stuck ? 62 : 158;
  const targetVx = input * (jetting ? baseMoveSpeed + 52 : baseMoveSpeed);

  state.vx += (targetVx - state.vx) * Math.min(1, dt * 12);
  state.x = clamp(state.x + state.vx * dt, 70, W - 70);

  if (jetting) {
    if (!manly) state.qi = clamp(state.qi - 34 * dt, 0, MAX_QI);
    spawnJet(dt);
  } else {
    state.qi = clamp(state.qi + 8 * dt, 0, MAX_QI);
  }

  if (state.slowTimer > 0) state.slowTimer -= dt;
  if (state.stuckTimer > 0) state.stuckTimer -= dt;
  if (state.manlyTimer > 0) state.manlyTimer -= dt;
  if (state.attackCooldown > 0) state.attackCooldown -= dt;
  if (state.autoAttackTimer > 0) state.autoAttackTimer -= dt;
  if (state.invincibleTimer > 0) state.invincibleTimer -= dt;
  if (state.hitFlash > 0) state.hitFlash -= dt;
  if (state.messageTimer > 0) state.messageTimer -= dt;

  const realmBonus = 1 + Math.min(0.45, state.height / 8000);
  const jetBoost = jetting ? 2.15 : 1;
  const slowFactor = state.slowTimer > 0 ? 0.55 : 1;
  const climbSpeed = isBossFight ? 0 : state.speed * realmBonus * jetBoost * slowFactor;
  state.height += climbSpeed * dt;
  state.scroll = (state.scroll + climbSpeed * dt) % 80;
  state.swordAngle += dt * (state.invincibleTimer > 0 || manly ? 7.8 : 3.8);

  if (keys.attack) fireSwordQi();
  if (manly && state.autoAttackTimer <= 0) {
    fireSwordQi(true);
    state.autoAttackTimer = 0.18;
  }

  if (isBossFight) {
    updateBossFight(dt);
  } else {
    updateSpawns(dt, climbSpeed);
    if (state.height >= state.nextBossHeight && state.bossDefeatedCount === 0) {
      enterBossFight();
    }
  }

  updateEntities(dt, climbSpeed);
  updateSwordQi(dt);
  updateParticles(dt);
  updateClouds(dt, climbSpeed);

  if (state.health <= 0) {
    state.health = 0;
    endGame();
  }
}

function updateSpawns(dt) {
  state.obstacleTimer -= dt;
  state.itemTimer -= dt;

  if (state.obstacleTimer <= 0) {
    spawnObstacle();
    const difficulty = clamp(state.height / FIRST_BOSS_HEIGHT, 0, 1);
    state.obstacleTimer = rand(0.76, 1.24) - difficulty * 0.22;
  }

  if (state.itemTimer <= 0) {
    spawnItem();
    state.itemTimer = rand(3.0, 4.8);
  }
}

function enterBossFight() {
  state.mode = "boss";
  state.height = state.nextBossHeight;
  state.vx = 0;
  state.obstacles = [];
  state.items = [];
  state.bossBullets = [];
  state.peachHazards = [];
  state.peachHearts = [];
  state.peachHeartCount = 0;
  state.stuckTimer = 0;
  state.boss = {
    name: "美色心魔",
    hp: BOSS_MAX_HP,
    x: W / 2,
    y: 154,
    pulse: 0,
    peachTimer: 1.0,
    bulletTimer: 1.55,
    heartTimer: 2.2,
    petals: makeBossPetals()
  };
  showMessage("美色心魔登场：道心要稳");
}

function makeBossPetals() {
  return Array.from({ length: 28 }, () => ({
    x: rand(34, W - 34),
    y: rand(70, 330),
    vx: rand(-18, 18),
    vy: rand(18, 55),
    size: rand(4, 9),
    spin: rand(0, Math.PI * 2)
  }));
}

function updateBossFight(dt) {
  if (!state.boss) return;
  state.boss.pulse += dt * 4;
  state.boss.peachTimer -= dt;
  state.boss.bulletTimer -= dt;
  state.boss.heartTimer -= dt;

  updateBossPetals(dt);
  if (state.boss.peachTimer <= 0) {
    spawnPeachHazard();
    state.boss.peachTimer = rand(1.35, 2.1);
  }
  if (state.boss.bulletTimer <= 0) {
    spawnBossBullet();
    state.boss.bulletTimer = rand(1.0, 1.55);
  }
  if (state.boss.heartTimer <= 0) {
    spawnPeachHeart();
    state.boss.heartTimer = rand(3.0, 4.6);
  }

  updateBossHazards(dt);
  updateBossBullets(dt);
  updatePeachHearts(dt);

  if (state.boss.hp <= 0) {
    state.boss.hp = 0;
    state.bossDefeatedCount += 1;
    burst(state.boss.x, state.boss.y, "#ff9fd1", 42);
    showBossClearedChoice();
  }
}

function updateBossPetals(dt) {
  for (const p of state.boss.petals) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.spin += dt * 5;
    if (p.y > 360 || p.x < 10 || p.x > W - 10) {
      p.x = rand(34, W - 34);
      p.y = rand(40, 110);
      p.vx = rand(-18, 18);
    }
  }
}

function spawnPeachHazard() {
  const silhouette = Math.random() > 0.48;
  state.peachHazards.push({
    type: silhouette ? "silhouette" : "peachZone",
    x: rand(90, W - 90),
    y: silhouette ? 330 : rand(260, 500),
    w: silhouette ? 54 : 104,
    h: silhouette ? 94 : 58,
    life: 4.2,
    hit: false,
    phase: rand(0, Math.PI * 2)
  });
}

function spawnBossBullet() {
  const fromLeft = Math.random() > 0.5;
  const texts = ["回头看一眼", "她说她懂你", "道友别急", "桃花劫来了"];
  const text = texts[Math.floor(Math.random() * texts.length)];
  state.bossBullets.push({
    text,
    x: fromLeft ? -120 : W + 120,
    y: rand(230, 560),
    w: text.length * 16 + 24,
    h: 28,
    vx: fromLeft ? rand(112, 160) : -rand(112, 160),
    hit: false
  });
}

function spawnPeachHeart() {
  state.peachHearts.push({
    x: rand(82, W - 82),
    y: rand(235, 505),
    w: 34,
    h: 34,
    life: 6,
    bob: rand(0, Math.PI * 2)
  });
}

function updateBossHazards(dt) {
  for (const hazard of state.peachHazards) {
    hazard.life -= dt;
    hazard.phase += dt * 5;
    hazard.y += Math.sin(hazard.phase) * dt * 10;
    if (!hazard.hit && rectsOverlap(playerRect(), entityRect(hazard))) {
      hazard.hit = true;
      state.stuckTimer = 3;
      state.slowTimer = Math.max(state.slowTimer, 1);
      showMessage("桃花劫：寸步难行 3 秒");
      burst(state.x, state.y, "#ff9fd1", 18);
    }
  }
  state.peachHazards = state.peachHazards.filter((h) => h.life > 0);
}

function updateBossBullets(dt) {
  for (const bullet of state.bossBullets) {
    bullet.x += bullet.vx * dt;
    if (!bullet.hit && rectsOverlap(playerRect(), entityRect(bullet))) {
      bullet.hit = true;
      state.health = clamp(state.health - 9, 0, MAX_HEALTH);
      state.slowTimer = Math.max(state.slowTimer, 0.8);
      state.hitFlash = 0.16;
      showMessage("回头看弹幕：体力 -9");
      burst(state.x, state.y, "#ff7ebd", 12);
    }
  }
  state.bossBullets = state.bossBullets.filter((b) => b.x > -180 && b.x < W + 180 && !b.hit);
}

function updatePeachHearts(dt) {
  for (const heart of state.peachHearts) {
    heart.life -= dt;
    heart.bob += dt * 5;
    if (!heart.hit && rectsOverlap(playerRect(), entityRect(heart))) {
      heart.hit = true;
      state.peachHeartCount += 1;
      state.qi = clamp(state.qi + 20, 0, MAX_QI);
      burst(heart.x, heart.y, "#ffd35a", 18);
      if (state.peachHeartCount >= 3) {
        state.peachHeartCount = 0;
        state.stuckTimer = 0;
        state.slowTimer = 0;
        state.manlyTimer = 3;
        showMessage("真男人状态：剑气自动开火");
      } else {
        showMessage(`桃子的爱心鼓励：${state.peachHeartCount}/3`);
      }
    }
  }
  state.peachHearts = state.peachHearts.filter((h) => h.life > 0 && !h.hit);
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

function fireSwordQi(force = false) {
  if (state.mode !== "running" && state.mode !== "boss") return;
  if (state.attackCooldown > 0 && !force) return;
  const manly = state.manlyTimer > 0;
  if (!manly && state.qi < 14) {
    if (force) return;
    showMessage("仙气不足：剑气憋回去了");
    state.attackCooldown = 0.35;
    return;
  }
  if (!manly) state.qi = clamp(state.qi - 14, 0, MAX_QI);

  const angle = state.swordAngle;
  const side = Math.cos(angle) * 24;
  state.swordQi.push({
    x: state.x + side,
    y: state.y - 34,
    vx: Math.cos(angle) * 42,
    vy: -360,
    w: manly ? 22 : 16,
    h: manly ? 46 : 34,
    damage: manly ? 12 : 5,
    life: 1.4,
    color: manly ? "#ffd35a" : "#85eaff",
    hit: false
  });
  state.attackCooldown = manly ? 0.16 : 0.42;
}

function updateSwordQi(dt) {
  for (const qi of state.swordQi) {
    qi.x += qi.vx * dt;
    qi.y += qi.vy * dt;
    qi.life -= dt;

    for (const obstacle of state.obstacles) {
      if (!obstacle.remove && rectsOverlap(entityRect(qi), entityRect(obstacle))) {
        obstacle.remove = true;
        qi.hit = true;
        burst(obstacle.x, obstacle.y, qi.color, 10);
      }
    }

    if (state.boss && state.mode === "boss" && rectsOverlap(entityRect(qi), bossRect())) {
      qi.hit = true;
      state.boss.hp = clamp(state.boss.hp - qi.damage, 0, BOSS_MAX_HP);
      burst(qi.x, qi.y, qi.color, 10);
      showMessage(`剑气破妄：心魔 -${qi.damage}`);
    }
  }
  state.swordQi = state.swordQi.filter((qi) => qi.life > 0 && qi.y > -80 && !qi.hit);
}

function bossRect() {
  return {
    x: state.boss.x - 82,
    y: state.boss.y - 68,
    w: 164,
    h: 126
  };
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
  if (state.mode === "boss" || state.mode === "bossCleared") drawBoss();
  drawEntities();
  drawBossAttacks();
  drawSwordQi();
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

function drawBoss() {
  if (!state.boss) return;
  const boss = state.boss;
  const pulse = Math.sin(boss.pulse) * 7;

  ctx.save();
  ctx.globalAlpha = 0.36;
  drawPinkCloud(boss.x, boss.y + 32, 220 + pulse);
  ctx.globalAlpha = 1;

  for (const p of boss.petals) {
    ctx.save();
    ctx.translate(Math.round(p.x), Math.round(p.y));
    ctx.rotate(p.spin);
    ctx.fillStyle = "#ffb3d5";
    ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
    ctx.fillStyle = "#ffe2ef";
    ctx.fillRect(0, -p.size / 2, p.size, p.size);
    ctx.restore();
  }

  ctx.translate(Math.round(boss.x), Math.round(boss.y));
  ctx.fillStyle = "#f06aa8";
  ctx.fillRect(-70, -36, 140, 78);
  ctx.fillStyle = "#ff9fd1";
  ctx.fillRect(-92, -14, 184, 48);
  ctx.fillRect(-48, -66, 96, 44);
  ctx.fillStyle = "#ffcae5";
  ctx.fillRect(-58, -24, 116, 16);
  ctx.fillStyle = "#4c2137";
  ctx.fillRect(-35, -5, 18, 18);
  ctx.fillRect(17, -5, 18, 18);
  ctx.fillStyle = "#2b1020";
  ctx.fillRect(-22, 24, 44, 8);
  ctx.fillStyle = "#ffd35a";
  ctx.fillRect(-7, -78, 14, 18);
  drawTinyLabel("美色心魔", 0, 68);
  ctx.restore();

  drawBossHp();
}

function drawBossHp() {
  const ratio = state.boss ? state.boss.hp / BOSS_MAX_HP : 0;
  ctx.fillStyle = "rgba(28, 9, 22, 0.78)";
  ctx.fillRect(76, 102, W - 152, 24);
  ctx.fillStyle = "#ff5ba8";
  ctx.fillRect(80, 106, Math.round((W - 160) * ratio), 16);
  ctx.strokeStyle = "#ffd35a";
  ctx.strokeRect(79.5, 105.5, W - 159, 17);
  ctx.fillStyle = "#fff2c8";
  ctx.font = "bold 13px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(`美色心魔 HP ${Math.ceil(state.boss.hp)}/100`, W / 2, 121);
}

function drawPinkCloud(x, y, w) {
  const h = w * 0.34;
  ctx.fillStyle = "#ff7ebd";
  ctx.fillRect(x - w / 2, y, w, h);
  ctx.fillStyle = "#ffb3d5";
  ctx.fillRect(x - w * 0.32, y - h * 0.55, w * 0.34, h);
  ctx.fillRect(x + w * 0.05, y - h * 0.75, w * 0.32, h * 1.1);
}

function drawBossAttacks() {
  for (const hazard of state.peachHazards) drawPeachHazard(hazard);
  for (const bullet of state.bossBullets) drawBossBullet(bullet);
  for (const heart of state.peachHearts) drawPeachHeart(heart);
}

function drawPeachHazard(hazard) {
  ctx.save();
  ctx.translate(Math.round(hazard.x), Math.round(hazard.y));
  ctx.globalAlpha = clamp(hazard.life / 4.2, 0.25, 0.85);
  if (hazard.type === "silhouette") {
    ctx.fillStyle = "#2b1020";
    ctx.fillRect(-14, -36, 28, 26);
    ctx.fillRect(-22, -10, 44, 46);
    ctx.fillStyle = "#ff9fd1";
    ctx.fillRect(-30, -18, 60, 10);
    ctx.fillRect(-18, 36, 12, 28);
    ctx.fillRect(6, 36, 12, 28);
    drawTinyLabel("美女剪影", 0, 82);
  } else {
    ctx.fillStyle = "#ff7ebd";
    ctx.fillRect(-52, -22, 104, 44);
    ctx.fillStyle = "#ffc1dd";
    ctx.fillRect(-34, -14, 68, 12);
    ctx.fillStyle = "#ff5ba8";
    ctx.fillRect(-14, 7, 28, 10);
    drawTinyLabel("桃花劫", 0, 46);
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawBossBullet(bullet) {
  ctx.save();
  ctx.translate(Math.round(bullet.x), Math.round(bullet.y));
  ctx.fillStyle = "rgba(255, 105, 170, 0.85)";
  ctx.fillRect(-bullet.w / 2, -14, bullet.w, bullet.h);
  ctx.strokeStyle = "#ffd6eb";
  ctx.strokeRect(-bullet.w / 2 + 0.5, -13.5, bullet.w - 1, bullet.h - 1);
  ctx.fillStyle = "#fff6c8";
  ctx.font = "bold 15px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(bullet.text, 0, 5);
  ctx.restore();
}

function drawPeachHeart(heart) {
  const y = heart.y + Math.sin(heart.bob) * 5;
  ctx.save();
  ctx.translate(Math.round(heart.x), Math.round(y));
  ctx.fillStyle = "#ff8fbd";
  ctx.fillRect(-15, -7, 30, 24);
  ctx.fillRect(-10, -16, 12, 12);
  ctx.fillRect(2, -16, 12, 12);
  ctx.fillStyle = "#ffd35a";
  ctx.fillRect(-5, 1, 10, 8);
  drawTinyLabel("桃心", 0, 35);
  ctx.restore();
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

function drawSwordQi() {
  for (const qi of state.swordQi) {
    ctx.save();
    ctx.translate(Math.round(qi.x), Math.round(qi.y));
    ctx.fillStyle = qi.color;
    ctx.fillRect(-qi.w / 2, -qi.h / 2, qi.w, qi.h);
    ctx.fillStyle = "#eaffff";
    ctx.fillRect(-3, -qi.h / 2 - 8, 6, qi.h + 8);
    ctx.fillStyle = "#ffd35a";
    ctx.fillRect(-qi.w / 2 - 6, qi.h / 2 - 10, qi.w + 12, 6);
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = "#85eaff";
    ctx.fillRect(-qi.w, -qi.h / 2 + 4, qi.w * 2, 8);
    ctx.globalAlpha = 1;
    ctx.restore();
  }
}

function drawPlayer() {
  const x = Math.round(state.x);
  const y = Math.round(state.y);
  const invincible = state.invincibleTimer > 0;
  const manly = state.manlyTimer > 0;

  drawSword(x, y, invincible || manly);

  ctx.save();
  ctx.translate(x, y);

  if (manly) {
    ctx.globalAlpha = 0.38 + Math.sin(performance.now() / 70) * 0.1;
    ctx.fillStyle = "#ffd35a";
    ctx.fillRect(-34, -60, 68, 108);
    ctx.fillStyle = "#85eaff";
    ctx.fillRect(-24, -50, 48, 88);
    ctx.globalAlpha = 1;
  }

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

  if (keys.jet && (state.qi > 0 || manly)) {
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
  ctx.fillText(`高度 ${Math.floor(state.height)} 米`, 28, 40);
  ctx.textAlign = "right";
  ctx.fillText(currentRealm(), W - 28, 40);

  drawBar(28, 54, 190, 14, state.health / MAX_HEALTH, "#ff5d68", "体力");
  drawBar(262, 54, 164, 14, state.qi / MAX_QI, "#74dbff", "仙气");

  if (state.mode === "boss") {
    ctx.textAlign = "left";
    ctx.font = "bold 12px sans-serif";
    ctx.fillStyle = "#ffc1dd";
    ctx.fillText(`桃心 ${state.peachHeartCount}/3`, 28, 91);
    if (state.stuckTimer > 0) ctx.fillText(`寸步难行 ${state.stuckTimer.toFixed(1)}s`, 120, 91);
    if (state.manlyTimer > 0) {
      ctx.fillStyle = "#ffd35a";
      ctx.fillText(`真男人 ${state.manlyTimer.toFixed(1)}s`, 262, 91);
    }
  }

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
    if (event.code === "KeyJ") {
      keys.attack = true;
      event.preventDefault();
    }
    if (event.code === "Space") {
      keys.jet = true;
      event.preventDefault();
    }
    if ((event.code === "Enter" || event.code === "Space") && state.mode !== "running" && state.mode !== "boss") {
      event.preventDefault();
      if (state.mode === "bossCleared") continueAscension();
      else startGame();
    }
  });

  window.addEventListener("keyup", (event) => {
    if (event.code === "ArrowLeft") keys.left = false;
    if (event.code === "ArrowRight") keys.right = false;
    if (event.code === "Space") keys.jet = false;
    if (event.code === "KeyJ") keys.attack = false;
  });
}

function bindTouchControls() {
  const buttons = document.querySelectorAll(".touch-btn");
  const setAction = (button, isDown) => {
    const action = button.dataset.action;
    keys[action] = isDown;
    button.classList.toggle("is-down", isDown);
    if (action === "attack" && isDown) fireSwordQi();
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

startBtn.addEventListener("click", () => {
  if (state.mode === "bossCleared") continueAscension();
  else startGame();
});
settleBtn.addEventListener("click", settleRun);
bindKeys();
bindTouchControls();
resetGame("menu");
draw();
