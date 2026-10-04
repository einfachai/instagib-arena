// Throwaway listening page: the shipped manifest is the only audio catalog.
import { BufferedSoundPlayer } from './sound-buffer-player.js';
const $ = (id) => document.getElementById(id);
const audio = new BufferedSoundPlayer();
const categoryNames = { all: 'All sounds', announcer: 'Announcer', weapon: 'Weapons & combat', movement: 'Movement', finisher: 'Finishers', medal: 'Medals', ambience: 'Map ambience', ui: 'Interface' };
const nameOverrides = { spawn: 'Back in the fight', 'codex-alone': 'All Codex users left', 'codex-attention': 'Codex needs attention', airjump: 'Double jump', walljump: 'Wall jump', 'medal-special': 'Special medal' };
let announcerName = 'Victor';
let sounds = [], category = 'all', selected = null, queue = [], queueIndex = -1, advanceTimer = null, playRequest = 0, stopped = false;
audio.volume = .75;
const icon = (name) => `<svg class="icon" aria-hidden="true"><use href="#${name}-icon"/></svg>`;
const escape = (text) => String(text).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const titleCase = (text) => text.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/-/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase()).replace(/\bXp\b/g, 'XP');
function soundName(key) {
  if (nameOverrides[key]) return nameOverrides[key];
  if (key.startsWith('step-')) return `Footstep · ${titleCase(key.slice(5).replace('containeryard', 'container yard'))}`;
  if (key.startsWith('ambience-')) return titleCase(key.slice(9).replace('containeryard', 'container yard'));
  if (key.startsWith('ui-')) return titleCase(key.slice(3).replace(/^ui(?=[A-Z])/, ''));
  if (key.startsWith('finisher-')) return titleCase(key.slice(9));
  return titleCase(key);
}
const filteredSounds = () => {
  const query = $('search').value.trim().toLowerCase();
  return sounds.filter((sound) => (category === 'all' || sound.category === category) && `${sound.name} ${sound.key} ${categoryNames[sound.category]}`.toLowerCase().includes(query));
};
function renderCategories() {
  $('categories').innerHTML = Object.entries(categoryNames).map(([key, name]) => {
    const count = key === 'all' ? sounds.length : sounds.filter((sound) => sound.category === key).length;
    return `<button type="button" class="category" data-category="${key}" aria-pressed="${category === key}"><span>${name}</span><span class="count">${count}</span></button>`;
  }).join('');
}
function renderSounds() {
  const filtered = filteredSounds();
  $('results-label').textContent = `${filtered.length} ${filtered.length === 1 ? 'recording' : 'recordings'} · ${categoryNames[category]}${category === 'announcer' ? ` · ${announcerName}, deep male voice` : ''}`;
  $('play-all').disabled = !filtered.length;
  $('sounds').innerHTML = Object.entries(categoryNames).filter(([key]) => key !== 'all').map(([key, name]) => {
    const group = filtered.filter((sound) => sound.category === key);
    if (!group.length) return '';
    return `<section class="sound-group" aria-label="${name}"><h2 class="group-heading">${name}<span>${group.length}</span></h2><div class="sound-grid">${group.map((sound) => `
      <article class="sound${selected?.id === sound.id ? ' selected' : ''}" data-id="${sound.id}">
        <div class="sound-top"><button type="button" class="play-sound" data-play="${sound.id}" aria-label="Play ${escape(sound.name)}">${icon('play')}</button><div><h3 class="sound-name">${escape(sound.name)}</h3><div class="sound-key">${escape(sound.key)}${sound.variant > 1 ? ` · take ${sound.variant}` : ''}</div></div></div>
        <div class="sound-bottom"><div class="sound-meta"><span>${sound.duration.toFixed(2)} s</span>${sound.voice_id ? `<span class="tag">${escape(announcerName.toUpperCase())} / VOICE</span>` : sound.loopable ? '<span class="tag">LOOP</span>' : ''}</div><a class="download" href="${escape(sound.url)}" download aria-label="Download ${escape(sound.name)}" title="Download MP3">${icon('download')}</a></div>
      </article>`).join('')}</div></section>`;
  }).join('') || '<div class="empty">No sounds match your search.<button class="action" id="clear-filters" type="button">Clear filters</button></div>';
  syncPlayer();
}
function syncPlayer() {
  const playing = selected && !audio.paused && !audio.ended;
  $('toggle').innerHTML = icon(playing ? 'pause' : 'play');
  $('toggle').setAttribute('aria-label', playing ? 'Pause selected sound' : 'Play selected sound');
  for (const id of ['toggle', 'stop', 'seek', 'next']) $(id).disabled = !selected;
  $('now-label').textContent = queue.length ? `Playlist · ${queueIndex + 1} / ${queue.length}` : playing ? 'Now playing' : selected ? stopped ? 'Stopped' : audio.ended ? 'Finished' : 'Paused' : 'Ready to listen';
  if (selected) {
    $('now-title').textContent = selected.name;
    $('now-detail').textContent = `${categoryNames[selected.category]} · ${selected.voice_id ? `${announcerName} · Deep male voice` : selected.loopable ? 'Loopable recording' : 'Game sound effect'}`;
  }
  document.querySelectorAll('[data-play]').forEach((button) => {
    const active = selected?.id === Number(button.dataset.play);
    button.closest('.sound').classList.toggle('selected', active);
    button.innerHTML = icon(active && playing ? 'pause' : 'play');
    button.setAttribute('aria-label', `${active && playing ? 'Pause' : 'Play'} ${sounds[Number(button.dataset.play)].name}`);
  });
  syncProgress();
}
const clock = (seconds) => seconds < 10 ? `${seconds.toFixed(2)}s` : `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
function syncProgress() {
  const duration = Number.isFinite(audio.duration) ? audio.duration : selected?.duration || 0;
  $('elapsed').textContent = clock(audio.currentTime);
  $('duration').textContent = clock(duration);
  $('seek').value = duration ? Math.round(audio.currentTime / duration * 1000) : 0;
  $('seek').setAttribute('aria-valuetext', `${audio.currentTime.toFixed(2)} of ${duration.toFixed(2)} seconds`);
}
function clearQueue() {
  clearTimeout(advanceTimer);
  advanceTimer = null;
  queue = [];
  queueIndex = -1;
}
function showError(message) { $('error').textContent = message; $('error').hidden = !message; }
async function startSound(sound, keepQueue = false) {
  const request = ++playRequest;
  if (!keepQueue) clearQueue();
  clearTimeout(advanceTimer);
  audio.pause();
  selected = sound;
  stopped = false;
  audio.src = sound.url;
  audio.loop = $('loop').checked && !queue.length;
  showError('');
  syncPlayer();
  try { await audio.play(); }
  catch (error) {
    if (request !== playRequest || error.name === 'AbortError') return;
    clearQueue();
    showError(`Could not play ${sound.name}. Try again or download the recording.`);
  }
  if (request === playRequest) syncPlayer();
}
async function togglePlayback() {
  if (!selected) return;
  clearTimeout(advanceTimer);
  if (!audio.paused) audio.pause();
  else {
    stopped = false;
    showError('');
    try { await audio.play(); }
    catch { clearQueue(); showError('Playback could not start. Try selecting the sound again.'); }
  }
  syncPlayer();
}
function stopPlayback() {
  ++playRequest;
  stopped = true;
  clearQueue();
  audio.pause();
  audio.currentTime = 0;
  syncPlayer();
}
function nextSound() {
  if (queue.length) {
    if (++queueIndex < queue.length) { void startSound(queue[queueIndex], true); return; }
    clearQueue();
    syncPlayer();
    return;
  }
  const filtered = filteredSounds();
  if (!filtered.length) return;
  const index = filtered.findIndex((sound) => sound.id === selected?.id);
  void startSound(filtered[(index + 1) % filtered.length]);
}
$('categories').addEventListener('click', (event) => {
  const button = event.target.closest('[data-category]');
  if (!button) return;
  category = button.dataset.category;
  renderCategories();
  renderSounds();
});
$('search').addEventListener('input', renderSounds);
$('sounds').addEventListener('click', (event) => {
  const button = event.target.closest('[data-play]');
  if (button) {
    const sound = sounds[Number(button.dataset.play)];
    if (selected?.id === sound.id) { clearQueue(); void togglePlayback(); }
    else void startSound(sound);
  } else if (event.target.closest('#clear-filters')) {
    category = 'all'; $('search').value = ''; renderCategories(); renderSounds(); $('search').focus();
  }
});
// Warm a recording before a pointer or keyboard user presses Play.
for (const event of ['pointerover', 'focusin']) $('sounds').addEventListener(event, (event) => {
  const button = event.target.closest('[data-play]');
  if (button) void audio.preload(sounds[Number(button.dataset.play)].url).catch(() => {});
});
$('play-all').addEventListener('click', () => {
  clearQueue();
  queue = filteredSounds();
  if (!queue.length) return;
  queueIndex = 0;
  $('loop').checked = false;
  void startSound(queue[0], true);
});
$('toggle').addEventListener('click', () => void togglePlayback());
$('stop').addEventListener('click', stopPlayback);
$('next').addEventListener('click', nextSound);
$('seek').addEventListener('input', () => { if (Number.isFinite(audio.duration)) audio.currentTime = Number($('seek').value) / 1000 * audio.duration; syncProgress(); });
$('volume').addEventListener('input', () => { audio.volume = Number($('volume').value) / 100; $('volume-value').textContent = `${$('volume').value}%`; });
$('loop').addEventListener('change', () => { clearQueue(); audio.loop = $('loop').checked; syncPlayer(); });
for (const event of ['play', 'pause', 'playing', 'loadedmetadata']) audio.addEventListener(event, syncPlayer);
audio.addEventListener('timeupdate', syncProgress);
audio.addEventListener('ended', () => { syncPlayer(); if (queue.length) advanceTimer = setTimeout(nextSound, 300); });
audio.addEventListener('error', () => { clearQueue(); if (selected) showError(`The recording for ${selected.name} could not load.`); syncPlayer(); });
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') stopPlayback();
  if (event.code === 'Space' && !event.target.closest('input, button, a, textarea, select')) { event.preventDefault(); void togglePlayback(); }
});
window.addEventListener('pagehide', () => { clearQueue(); audio.pause(); });
async function loadSounds() {
  try {
    const response = await fetch('/sounds/elevenlabs-v1/manifest.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('Manifest unavailable');
    const manifest = await response.json();
    announcerName = manifest.announcer?.display_name || 'Victor';
    $('announcer-voice').textContent = `${announcerName} · Deep male`;
    sounds = manifest.files.map((file, id) => {
      const category = file.path.split('/')[3];
      if (!categoryNames[category] || !file.path.startsWith('public/sounds/elevenlabs-v1/')) throw new Error('Unexpected sound path');
      return { ...file, id, category, name: soundName(file.key), url: file.path.replace(/^public\//, '/'), loopable: category === 'ambience' || file.key === 'rail-charge' };
    });
    // The frequently compared short cues are ready before the first click.
    const warmKeys = new Set(['rail-fire', 'jump', 'airjump', 'dash', 'boost', 'ui-uiHover', 'ui-modalOpen', 'ui-modalClose']);
    for (const sound of sounds) if (warmKeys.has(sound.key)) void audio.preload(sound.url).catch(() => {});
    $('total-count').textContent = sounds.length;
    renderCategories();
    renderSounds();
  } catch {
    $('results-label').textContent = 'Sound library unavailable';
    showError('Could not load the current sound pack. Reload the page to try again.');
  } finally { $('sounds').setAttribute('aria-busy', 'false'); }
}
void loadSounds();
