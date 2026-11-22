
import { CONTROL_STATES, MIX, SOUNDS, type Bus, type Cue, type ControlState } from "../data/sounds";
import { devEl as el } from "../ui/dom";
import { SFX_BYTES } from "../config";
import { formatSupport, loadBank, recoverBank, type Bank, type DecodeFailure } from "./bank";
import { Mixer } from "./mixer";

const BUSES: Bus[] = ["ui", "sfx", "ambient", "music"];
const sounds: Record<string, Cue> = SOUNDS;

const root = document.getElementById("board");
if (!root) throw new Error("#board element missing from sound.html");
const mixer = new Mixer(MIX);
mixer.unlockOn(window);
const options = { expectedBytes: SFX_BYTES, support: formatSupport() };
const loaded = await loadBank(mixer.ctx, sounds, options);
const { bank, failures, unreachable } = loaded;
const recovered = await recoverBank(mixer.ctx, loaded, sounds, options);
let playing: AudioBufferSourceNode | null = null;

function play(id: string, file: string): void {
  playing?.stop();
  const cue = sounds[id];
  const src = mixer.ctx.createBufferSource();
  src.buffer = bank.get(file)!;
  src.loop = cue.loop;
  const gain = mixer.ctx.createGain();
  gain.gain.value = cue.volume;
  src.connect(gain).connect(mixer.input(cue.bus));
  src.start();
  playing = src;
}

function stats(buf: AudioBuffer): string {
  const d = buf.getChannelData(0);
  let peak = 0;
  for (const x of d) peak = Math.max(peak, Math.abs(x));
  return `${buf.duration.toFixed(2)}s ${(20 * Math.log10(peak)).toFixed(1)} dB`;
}

interface Entry {
  node: HTMLElement;
  text: string;
  bus: Bus | null;
}

const entries: Entry[] = [];
const headings = new Map<Bus, HTMLElement>();
const hiddenBuses = new Set<Bus>();

function takeButton(id: string, file: string, label: string): HTMLElement {
  const stat = bank.has(file) ? stats(bank.get(file)!) : "";
  return el("button", { class: "take", title: `${file} ${stat}`, onclick: () => play(id, file) }, label);
}

function takeButtons(id: string): HTMLElement[] {
  const cue = sounds[id];
  if (!cue.files.length) return [el("span", { class: "missing" }, "no files yet")];
  return cue.files.map((f, i) => takeButton(id, f, String(i + 1)));
}

function cueText(id: string): string {
  const cue = sounds[id];
  return [id, ...cue.files, ...(cue.prompts ?? [])].join(" ").toLowerCase();
}

function cueRow(id: string): HTMLElement {
  const cue = sounds[id];
  const node = el("div", { class: "cue", title: (cue.prompts ?? []).join(" | ") }, el("b", {}, id), el("span", { class: "kind" }, cue.loop ? "loop" : ""), ...takeButtons(id));
  entries.push({ node, text: cueText(id), bus: cue.bus });
  return node;
}

function failureLine(f: DecodeFailure): string {
  const e = f.evidence;
  const outcome = recovered.has(f.file) ? "decoded later" : "stand-in";
  return `${f.file} failed to decode as ${f.kind}, ${outcome}: ${f.errors.join(", ")}, got ${e.receivedBytes ?? "no"} of ${e.expectedBytes} bytes, HTTP ${e.status ?? "none"}, context ${e.contextState}`;
}

function stateRow(type: string, state: string, entry: ControlState): HTMLElement {
  const takes = sounds[entry.cue].files.map((f, i) => takeButton(entry.cue, f, String(i + 1)));
  const node = el("div", { class: "cue" }, el("span", { class: "state" }, `${type} ${state}`), el("span", { class: "kind" }, entry.cue), ...takes);
  entries.push({ node, text: `${type} ${state} ${entry.cue}`.toLowerCase(), bus: null });
  return node;
}

const search = el("input", { type: "search", placeholder: "search cues, files, prompts  (press /)" }) as HTMLInputElement;
const count = el("span", { class: "count" });
const busButtons = BUSES.map((bus) =>
  el("button", {
    class: "bus on",
    onclick: (e: Event) => {
      if (hiddenBuses.has(bus)) hiddenBuses.delete(bus);
      else hiddenBuses.add(bus);
      (e.currentTarget as HTMLElement).classList.toggle("on", !hiddenBuses.has(bus));
      applyFilter();
    },
  }, bus),
);

function isVisible(entry: Entry, words: string[]): boolean {
  const busShown = entry.bus === null || !hiddenBuses.has(entry.bus);
  return busShown && words.every((w) => entry.text.includes(w));
}

function applyFilter(): void {
  const words = search.value.toLowerCase().split(/\s+/).filter(Boolean);
  const visible = entries.filter((entry) => isVisible(entry, words));
  const shown = new Set(visible.map((entry) => entry.bus));
  for (const entry of entries) entry.node.hidden = !visible.includes(entry);
  for (const [bus, heading] of headings) heading.hidden = !shown.has(bus);
  count.textContent = `${visible.length} shown`;
}

search.addEventListener("input", applyFilter);
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    playing?.stop();
    return;
  }
  if (e.key === "/" && document.activeElement !== search) {
    e.preventDefault();
    search.focus();
    search.select();
  }
});

root.append(el("div", { class: "toolbar" }, el("button", { onclick: () => playing?.stop() }, "stop"), search, ...busButtons, count));
for (const failure of unreachable) root.append(el("div", { class: "missing" }, `${failure.file} could not be fetched`));
for (const failure of failures) root.append(el("div", { class: "missing" }, failureLine(failure)));

root.append(el("h2", {}, "Controls by type and state"));
for (const [type, states] of Object.entries(CONTROL_STATES)) {
  for (const [state, entry] of Object.entries(states)) root.append(stateRow(type, state, entry));
}

for (const bus of BUSES) {
  const heading = el("h2", {}, `${bus}  bus volume ${MIX.busVolume[bus]}  target ${MIX.level[bus]} dB RMS`);
  headings.set(bus, heading);
  root.append(heading);
  for (const id of Object.keys(sounds).filter((id) => sounds[id].bus === bus)) root.append(cueRow(id));
}
applyFilter();
