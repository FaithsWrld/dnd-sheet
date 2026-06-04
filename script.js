/* ============================================================
   D&D CHARACTER SHEET — script.js
   ============================================================ */

// ── Constants ────────────────────────────────────────────────

const CLASSES = {
  Tank:     { emoji:'🛡️', role:'Absorbs damage', priority:['STR','CON'], hint:'Put your two highest rolls into STR and CON. You are the wall between your party and death.' },
  Striker:  { emoji:'⚔️', role:'Deals damage',   priority:['STR','DEX'], hint:'Pick one weapon style — STR for heavy weapons, DEX for finesse. Dump everything into your choice.' },
  Wildcard: { emoji:'🃏', role:'Chaos agent',    priority:['DEX','CHA'], hint:'DEX keeps you alive, CHA gets you out of trouble. Lean into both — unpredictability is your weapon.' },
  Mage:     { emoji:'🔮', role:'Spellcaster',    priority:['INT','WIS'], hint:'Your power lives in INT or WIS. Put your highest roll there. Low HP means stay behind your Tank.' },
  Bard:     { emoji:'🎵', role:'Face & support', priority:['CHA','DEX'], hint:'CHA is everything. You talk, charm, and bluff your way through. DEX keeps you alive when words fail.' },
};

const ALIGNMENTS = [
  'Lawful Good','Neutral Good','Chaotic Good',
  'Lawful Neutral','True Neutral','Chaotic Neutral',
  'Lawful Evil','Neutral Evil','Chaotic Evil',
];

const SKILLS = [
  ['Acrobatics','DEX'],['Animal Handling','WIS'],['Arcana','INT'],
  ['Athletics','STR'],['Deception','CHA'],['History','INT'],
  ['Insight','WIS'],['Intimidation','CHA'],['Investigation','INT'],
  ['Medicine','WIS'],['Nature','INT'],['Perception','WIS'],
  ['Performance','CHA'],['Persuasion','CHA'],['Religion','INT'],
  ['Sleight of Hand','DEX'],['Stealth','DEX'],['Survival','WIS'],
];

const ABILITY_MAP = { STR:'str', DEX:'dex', CON:'con', INT:'int', WIS:'wis', CHA:'cha' };

const DICE = [
  { sides:4,  icon:'◆', label:'D4'  },
  { sides:6,  icon:'⬡', label:'D6'  },
  { sides:8,  icon:'◈', label:'D8'  },
  { sides:10, icon:'⬟', label:'D10' },
  { sides:12, icon:'⬠', label:'D12' },
  { sides:20, icon:'⬡', label:'D20' },
  { sides:100,icon:'◉', label:'D100'},
];

// ── State ────────────────────────────────────────────────────

let state = {
  wizardDone: false,
  wizardStep: 0,
  selectedClass: '',
  selectedAlign: '',
  charName:'', playerName:'', race:'', background:'', level:1,
  str:10, dex:10, con:10, int:10, wis:10, cha:10,
  hpMax:0, hpCurrent:0, hpTemp:0, hitDice:'1d8',
  ac:'', initiative:'', speed:'30ft', profBonus:'+2',
  deathSucc:[false,false,false], deathFail:[false,false,false],
  skills:{},
  attacks: Array(5).fill(null).map(()=>({name:'',bonus:'',damage:''})),
  armor:'', shield:'', inventory:'',
  features:'', actions:'',
  personality:'', bond:'', ideal:'', flaw:'',
  proficiencies:'',
  rollHistory:[],
  hpLog:[],
};

let autoSaveTimer = null;

// ── Utility ──────────────────────────────────────────────────

function getMod(score) {
  const m = Math.floor(((parseInt(score) || 10) - 10) / 2);
  return (m >= 0 ? '+' : '') + m;
}
function getModNum(score) {
  return Math.floor(((parseInt(score) || 10) - 10) / 2);
}
function getProfNum() {
  return parseInt((state.profBonus||'+2').replace('+','')) || 2;
}

function el(id) { return document.getElementById(id); }
function showToast(msg) {
  const t = el('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2400);
}

// ── Auto-save ─────────────────────────────────────────────────

function scheduleSave() {
  const dot = el('autosaveDot');
  if (dot) dot.className = 'autosave-dot saving';
  clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(() => {
    localStorage.setItem('dnd_sheet_v2', JSON.stringify(state));
    if (dot) dot.className = 'autosave-dot saved';
    setTimeout(() => { if(dot) dot.className = 'autosave-dot'; }, 1500);
  }, 800);
}

function loadSaved() {
  try {
    const raw = localStorage.getItem('dnd_sheet_v2');
    if (!raw) return false;
    const saved = JSON.parse(raw);
    Object.assign(state, saved);
    return true;
  } catch(e) { return false; }
}

// ── Export / Import ───────────────────────────────────────────

function exportJSON() {
  const name = state.charName || 'character';
  const blob = new Blob([JSON.stringify(state, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `${name.replace(/\s/g,'_')}_sheet.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Sheet exported!');
}

function importJSON() {
  const input = document.createElement('input');
  input.type = 'file'; input.accept = '.json';
  input.onchange = e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const data = JSON.parse(ev.target.result);
        Object.assign(state, data);
        localStorage.setItem('dnd_sheet_v2', JSON.stringify(state));
        renderAll();
        showToast('Sheet imported!');
      } catch { showToast('Invalid file'); }
    };
    reader.readAsText(file);
  };
  input.click();
}

// ── Tabs ──────────────────────────────────────────────────────

function switchTab(name) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === 'tab_' + name));
}

// ── Wizard ────────────────────────────────────────────────────

const WIZARD_STEPS = ['class','identity','stats','done'];

function initWizard() {
  renderWizardSteps();
  showWizardStep(state.wizardStep);
}

function renderWizardSteps() {
  const wrap = el('wizardStepDots');
  if (!wrap) return;
  wrap.innerHTML = WIZARD_STEPS.map((s,i) => {
    const cls = i < state.wizardStep ? 'done' : i === state.wizardStep ? 'current' : '';
    const line = i < WIZARD_STEPS.length-1 ? `<div class="step-line ${i < state.wizardStep ? 'done':''}"></div>` : '';
    return `<div class="wizard-step-dot"><div class="step-num ${cls}">${i+1}</div>${line}</div>`;
  }).join('');
}

function showWizardStep(step) {
  state.wizardStep = step;
  renderWizardSteps();
  document.querySelectorAll('.wstep').forEach(s => s.style.display='none');
  const cur = el('wstep_' + WIZARD_STEPS[step]);
  if (cur) cur.style.display='block';
}

function wizardNext() {
  if (state.wizardStep === 0 && !state.selectedClass) { showToast('Pick a class first!'); return; }
  if (state.wizardStep === 1 && !state.charName.trim()) { showToast('Give your character a name!'); return; }
  if (state.wizardStep < WIZARD_STEPS.length - 1) showWizardStep(state.wizardStep + 1);
  if (state.wizardStep === WIZARD_STEPS.length - 1) finishWizard();
}
function wizardBack() {
  if (state.wizardStep > 0) showWizardStep(state.wizardStep - 1);
}

function finishWizard() {
  state.wizardDone = true;
  scheduleSave();
  const ww = el('wizardWrap');
  const sw = el('sheetWrap');
  ww.style.opacity = '0';
  ww.style.transform = 'translateY(-12px)';
  setTimeout(() => {
    ww.classList.remove('active');
    ww.style.opacity = '';
    ww.style.transform = '';
    sw.classList.add('active');
    sw.style.opacity = '0';
    sw.style.transform = 'translateY(12px)';
    renderAll();
    requestAnimationFrame(() => {
      sw.style.transition = 'opacity 0.35s ease, transform 0.35s ease';
      sw.style.opacity = '1';
      sw.style.transform = 'translateY(0)';
      setTimeout(() => { sw.style.transition = ''; sw.style.transform = ''; }, 400);
    });
  }, 250);
  showToast('Character created! ⚔');
}

function resetWizard() {
  if (!confirm('Start over? This will clear your sheet.')) return;
  // Reset state
  state = {
    wizardDone:false, wizardStep:0, selectedClass:'', selectedAlign:'',
    charName:'', playerName:'', race:'', background:'', level:1,
    str:10, dex:10, con:10, int:10, wis:10, cha:10,
    hpMax:0, hpCurrent:0, hpTemp:0, hitDice:'1d8',
    ac:'', initiative:'', speed:'30ft', profBonus:'+2',
    deathSucc:[false,false,false], deathFail:[false,false,false],
    skills:{}, attacks:Array(5).fill(null).map(()=>({name:'',bonus:'',damage:''})),
    armor:'', shield:'', inventory:'', features:'', actions:'',
    personality:'', bond:'', ideal:'', flaw:'', proficiencies:'',
    rollHistory:[], hpLog:[],
  };
  localStorage.removeItem('dnd_sheet_v2');

  // Reset wizard form inputs manually
  const wName = el('w_charName'); if (wName) wName.value = '';
  const wPName = el('w_playerName'); if (wPName) wPName.value = '';
  const wRace = el('w_race'); if (wRace) wRace.value = '';
  const wBg = el('w_background'); if (wBg) wBg.value = '';
  const wLvl = el('w_level'); if (wLvl) wLvl.value = 1;
  const hint = el('classHint');
  if (hint) hint.textContent = 'Select a class to see stat recommendations.';

  // Reset all toggle buttons
  document.querySelectorAll('.class-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.align-btn').forEach(b => b.classList.remove('active'));

  // Reset wizard ability inputs
  ['STR','DEX','CON','INT','WIS','CHA'].forEach(ab => {
    const inp = el('ab_' + ab);
    if (inp) inp.value = 10;
    const mod = el('mod_' + ab);
    if (mod) mod.textContent = '+0';
    const pri = el('priority_' + ab);
    if (pri) pri.textContent = '';
  });

  // Swap views with animation
  const sw = el('sheetWrap');
  const ww = el('wizardWrap');
  sw.style.opacity = '0';
  setTimeout(() => {
    sw.classList.remove('active');
    sw.style.opacity = '';
    switchTab('character');
    ww.classList.add('active');
    // Force wizard to step 0 cleanly
    state.wizardStep = 0;
    document.querySelectorAll('.wstep').forEach(s => { s.style.display = 'none'; });
    renderWizardSteps();
    const firstStep = el('wstep_class');
    if (firstStep) firstStep.style.display = 'block';
  }, 200);

  showToast('Sheet cleared — start fresh!');
}

// ── Class select ──────────────────────────────────────────────

function selectClass(cls) {
  state.selectedClass = cls;
  document.querySelectorAll('.class-btn').forEach(b => b.classList.toggle('active', b.dataset.cls === cls));
  const hint = el('classHint');
  if (hint && CLASSES[cls]) hint.textContent = CLASSES[cls].hint;
  renderAbilityPriorities();
  scheduleSave();
}

function renderAbilityPriorities() {
  const c = CLASSES[state.selectedClass];
  ['STR','DEX','CON','INT','WIS','CHA'].forEach(ab => {
    const pEl = el('priority_' + ab);
    if (!pEl) return;
    pEl.textContent = c && c.priority.includes(ab) ? '★ Priority' : '';
  });
}

// ── Alignment ─────────────────────────────────────────────────

function selectAlign(val) {
  state.selectedAlign = val;
  document.querySelectorAll('.align-btn').forEach(b => b.classList.toggle('active', b.dataset.align === val));
  scheduleSave();
}

// ── Ability scores ────────────────────────────────────────────

function updateAbility(ab, val) {
  state[ab.toLowerCase()] = parseInt(val) || 10;
  const modEl = el('mod_' + ab);
  if (modEl) modEl.textContent = getMod(state[ab.toLowerCase()]);
  renderSkills();
  scheduleSave();
}

// ── Skills ────────────────────────────────────────────────────

function renderSkills() {
  const grid = el('skillsGrid');
  if (!grid) return;
  const prof = getProfNum();
  grid.innerHTML = SKILLS.map(([name, ab]) => {
    const score = state[ABILITY_MAP[ab]] || 10;
    const mod = getModNum(score);
    const id = 'skill_' + name.replace(/\s+/g,'');
    const isProficient = state.skills[name] || false;
    const total = mod + (isProficient ? prof : 0);
    const totalStr = (total >= 0 ? '+' : '') + total;
    return `<div class="skill-row">
      <input type="checkbox" id="${id}" ${isProficient?'checked':''} onchange="toggleSkill('${name}',this.checked)" aria-label="${name} proficiency"/>
      <span class="sk-name">${name}</span>
      <span class="sk-ab">${ab}</span>
      <span class="sk-val">${totalStr}</span>
    </div>`;
  }).join('');
}

function toggleSkill(name, val) {
  state.skills[name] = val;
  renderSkills();
  scheduleSave();
}

// ── HP Tracker ────────────────────────────────────────────────

function renderHPBar() {
  const bar = el('hpBar');
  const disp = el('hpDisplay');
  if (!bar || !disp) return;
  const max = parseInt(state.hpMax) || 1;
  const cur = Math.max(0, parseInt(state.hpCurrent) || 0);
  const pct = Math.min(100, (cur / max) * 100);
  bar.style.width = pct + '%';
  bar.style.background = pct > 60 ? '#27ae60' : pct > 25 ? '#e67e22' : '#c0392b';
  bar.classList.toggle('danger', pct <= 25 && pct > 0);
  disp.innerHTML = `${cur} <span>/ ${state.hpMax||'?'}</span>`;
}

function applyDamage() {
  const amt = parseInt(el('hpChange').value) || 0;
  if (!amt) return;
  const prev = parseInt(state.hpCurrent) || 0;
  state.hpCurrent = Math.max(0, prev - amt);
  el('hpChange').value = '';
  addHpLog(`Took ${amt} damage`, 'dmg');
  renderHPBar();
  scheduleSave();
  if (state.hpCurrent === 0) showToast('⚠ Down! Roll death saves.');
}

function applyHeal() {
  const amt = parseInt(el('hpChange').value) || 0;
  if (!amt) return;
  const prev = parseInt(state.hpCurrent) || 0;
  const max = parseInt(state.hpMax) || 999;
  state.hpCurrent = Math.min(max, prev + amt);
  el('hpChange').value = '';
  addHpLog(`Healed ${amt} HP`, 'heal');
  renderHPBar();
  scheduleSave();
}

function resetHP() {
  state.hpCurrent = state.hpMax;
  addHpLog('Reset to full HP', 'heal');
  renderHPBar();
  scheduleSave();
}

function addHpLog(msg, type) {
  state.hpLog.unshift({ msg, type, time: new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) });
  if (state.hpLog.length > 20) state.hpLog.pop();
  renderHPLog();
}

function renderHPLog() {
  const log = el('hpLog');
  if (!log) return;
  log.innerHTML = state.hpLog.map(e =>
    `<div class="hp-log-entry ${e.type}">${e.time} — ${e.msg}</div>`
  ).join('') || '<div style="color:var(--muted);font-style:italic;">No activity yet</div>';
}

// ── Death Saves ───────────────────────────────────────────────

function toggleSave(type, idx) {
  if (type === 'succ') state.deathSucc[idx] = !state.deathSucc[idx];
  else state.deathFail[idx] = !state.deathFail[idx];
  renderDeathSaves();
  scheduleSave();
}

function renderDeathSaves() {
  ['succ','fail'].forEach(type => {
    const arr = type === 'succ' ? state.deathSucc : state.deathFail;
    for (let i=0; i<3; i++) {
      const c = el(`save_${type}_${i}`);
      if (c) c.classList.toggle('filled', arr[i]);
    }
  });
}

// ── Attacks ───────────────────────────────────────────────────

function updateAttack(idx, field, val) {
  state.attacks[idx][field] = val;
  scheduleSave();
}

// ── Dice Roller ───────────────────────────────────────────────

function rollDie(sides, label) {
  const result = Math.floor(Math.random() * sides) + 1;
  const isCrit = sides === 20 && result === 20;
  const isFail = sides === 20 && result === 1;

  // Animate the button
  const btns = document.querySelectorAll(`[data-sides="${sides}"]`);
  btns.forEach(b => {
    b.classList.add('rolling');
    setTimeout(() => b.classList.remove('rolling'), 500);
  });

  // Show spinning numbers then reveal
  const numEl = el('rollNumber');
  const nameEl = el('rollDieName');
  const tagEl = el('rollLabel');
  if (!numEl) return;

  nameEl.textContent = label || `D${sides}`;
  numEl.className = 'roll-number';
  tagEl.textContent = '';

  let spins = 0;
  const spinInterval = setInterval(() => {
    numEl.textContent = Math.floor(Math.random() * sides) + 1;
    spins++;
    if (spins >= 8) {
      clearInterval(spinInterval);
      numEl.textContent = result;
      numEl.classList.add('popped');
      setTimeout(() => numEl.classList.remove('popped'), 500);
      if (isCrit) { numEl.classList.add('crit'); tagEl.textContent = '✦ CRITICAL HIT'; }
      else if (isFail) { numEl.classList.add('fail'); tagEl.textContent = '✦ CRITICAL FAIL'; }
    }
  }, 60);

  // Log it
  const entry = { sides, result, label: label||`D${sides}`, isCrit, isFail, time: new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}) };
  state.rollHistory.unshift(entry);
  if (state.rollHistory.length > 30) state.rollHistory.pop();
  setTimeout(() => renderRollHistory(), 520);
  scheduleSave();
}

function rollMulti() {
  const count = parseInt(el('multiCount').value) || 1;
  const sides = parseInt(el('multiSides').value) || 6;
  const mod = parseInt(el('multiMod').value) || 0;
  let total = 0;
  const rolls = [];
  for (let i=0; i<Math.min(count,20); i++) {
    const r = Math.floor(Math.random() * sides) + 1;
    rolls.push(r);
    total += r;
  }
  total += mod;
  const label = `${count}d${sides}${mod!==0?(mod>0?'+'+mod:mod):''}`;
  const numEl = el('rollNumber');
  const nameEl = el('rollDieName');
  const tagEl = el('rollLabel');
  if (!numEl) return;
  nameEl.textContent = label;
  numEl.className = 'roll-number';
  numEl.textContent = total;
  tagEl.textContent = `Rolls: [${rolls.join(', ')}]${mod!==0?' + mod '+mod:''}`;
  const entry = { sides, result:total, label, isCrit:false, isFail:false, time:new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}), multi:true };
  state.rollHistory.unshift(entry);
  if (state.rollHistory.length > 30) state.rollHistory.pop();
  renderRollHistory();
  scheduleSave();
}

function clearRollHistory() {
  state.rollHistory = [];
  renderRollHistory();
}

function renderRollHistory() {
  const log = el('rollLog');
  if (!log) return;
  if (!state.rollHistory.length) {
    log.innerHTML = '<div style="color:var(--muted);font-style:italic;font-size:13px;padding:8px">No rolls yet — click a die!</div>';
    return;
  }
  log.innerHTML = state.rollHistory.map(e => {
    const cls = e.isCrit ? 'crit' : e.isFail ? 'fail' : '';
    const tag = e.isCrit ? ' ✦ CRIT' : e.isFail ? ' ✦ FAIL' : '';
    return `<div class="roll-entry ${cls}">
      <span class="re-dice">${e.time} · ${e.label}</span>
      <span>
        <span class="re-val">${e.result}</span>
        <span class="re-tag">${tag}</span>
      </span>
    </div>`;
  }).join('');
}

// ── Bind field ────────────────────────────────────────────────

function bindField(id, key, transform) {
  const input = el(id);
  if (!input) return;
  const val = state[key];
  if (input.type === 'checkbox') input.checked = !!val;
  else input.value = val !== undefined ? val : '';
  input.addEventListener('input', () => {
    const v = transform ? transform(input.value) : input.value;
    state[key] = v;
    scheduleSave();
  });
  input.addEventListener('change', () => {
    const v = transform ? transform(input.value) : input.value;
    state[key] = v;
    scheduleSave();
  });
}

// ── renderAll ─────────────────────────────────────────────────

function renderAll() {
  // Header summary
  const sumEl = el('sheetSummary');
  if (sumEl) {
    const c = CLASSES[state.selectedClass];
    sumEl.textContent = state.charName
      ? `${state.charName} · ${state.selectedClass || '?'} · Level ${state.level}`
      : 'Your Character';
  }

  // Identity fields
  bindField('f_charName','charName');
  bindField('f_playerName','playerName');
  bindField('f_race','race');
  bindField('f_background','background');
  bindField('f_level','level', v => parseInt(v)||1);

  // Alignment
  document.querySelectorAll('.align-btn').forEach(b => b.classList.toggle('active', b.dataset.align === state.selectedAlign));

  // Class badge
  const badge = el('classBadge');
  if (badge) {
    const c = CLASSES[state.selectedClass];
    badge.textContent = c ? `${c.emoji} ${state.selectedClass}` : '— No Class —';
  }

  // Abilities
  ['STR','DEX','CON','INT','WIS','CHA'].forEach(ab => {
    const key = ab.toLowerCase();
    const inp = el('ab_' + ab);
    const modEl = el('mod_' + ab);
    if (inp) inp.value = state[key];
    if (modEl) modEl.textContent = getMod(state[key]);
  });
  renderAbilityPriorities();

  // Combat
  bindField('f_hpMax','hpMax', v => parseInt(v)||0);
  bindField('f_hpCurrent','hpCurrent', v => parseInt(v)||0);
  bindField('f_hpTemp','hpTemp', v => parseInt(v)||0);
  bindField('f_hitDice','hitDice');
  bindField('f_ac','ac');
  bindField('f_initiative','initiative');
  bindField('f_speed','speed');
  bindField('f_profBonus','profBonus');
  renderHPBar();
  renderHPLog();
  renderDeathSaves();

  // Skills
  renderSkills();

  // Attacks
  for (let i=0; i<5; i++) {
    ['name','bonus','damage'].forEach(f => {
      const inp = el(`atk_${f}_${i}`);
      if (inp) {
        inp.value = state.attacks[i][f];
        inp.oninput = () => updateAttack(i, f, inp.value);
      }
    });
  }

  // Gear & text areas
  bindField('f_armor','armor');
  bindField('f_shield','shield');
  bindField('f_inventory','inventory');
  bindField('f_features','features');
  bindField('f_actions','actions');
  bindField('f_personality','personality');
  bindField('f_bond','bond');
  bindField('f_ideal','ideal');
  bindField('f_flaw','flaw');
  bindField('f_proficiencies','proficiencies');

  // Dice history
  renderRollHistory();
}

// ── Boot ──────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  const hasSave = loadSaved();

  if (hasSave && state.wizardDone) {
    el('wizardWrap').classList.remove('active');
    el('sheetWrap').classList.add('active');
    renderAll();
    showToast('Welcome back, ' + (state.charName||'adventurer') + '!');
  } else {
    el('wizardWrap').classList.add('active');
    initWizard();
  }

  // Keyboard shortcut: Enter to advance wizard
  document.addEventListener('keydown', e => {
    if (e.key === 'Enter' && el('wizardWrap').classList.contains('active')) {
      wizardNext();
    }
  });
});
