import { combatFrameMs, playedKph, playedHeading, playbackWorld, timedUiStale, shownTimedVehicles, untimedDestroyed, combatEventPoint } from './timed-display';

import * as THREE from "three";
import { CONFIG } from "../config";
import { QUESTS, relanguageQuest } from "../sim/quests";
import { getSearchAction } from "../ui/hud-readout";
import { PHYSICS } from "../data/physics";
import {
  restFrame,
  type DriveSnapshot,
  type TurnResult,
} from "../phys/drive";
import {
  staleFrame,
  groundPoint,
  toMap,
  type TurnFrames,
  type V3,
  type VehicleFrame,
} from "../phys/frames";
import { driveSnapshotOf, type PreparedTurn } from "../phys/turn";
import { isPlayerTruck, playerVehicle, vehicleById } from "../sim/damage";
import { landingScreen } from "./landing-screen";

import { inOverdrive, isStranded, vehicleStats } from "../sim/stats";
import { zoneHalfAngle, zoneSpeedOf } from "../sim/steering";
import type { Vehicle, World } from "../sim/types";
import { playerSeenPropTiles, playerSees, tileOf } from "../sim/vision";
import type { Vec } from "../sim/vec";
import { TERRAIN } from "../data/terrain";
import { isTowed, setBeacon, unhitch } from "../sim/tow";
import { inCombat } from "../sim/combat";
import { hearsHorn } from "../sim/road-horn";
import { engineOverheating } from "../sim/engine-heat";
import { Refused, hostileToPlayer, playerCanAct, setMoveOrder, waitsOnPlayer } from "../sim/world";
import { refusalText } from "../text/names";
import { TruckContext, TruckControls } from "./truck-controls";
import { PAL } from "../render/palette";
import { READY_ARC_BIT } from "./render/models";
import { timed } from "../perf";
import { HitCard } from "../ui/hitCard";
import type { UiHost } from "../ui/host";
import { ModalScreens } from "./screens";
import type { ShaderWarmup } from "./shader-errors";
import { Hud } from "../ui/hud";
import { hasExplorationMap } from "../sim/settings";
import { Minimap } from "../ui/minimap";
import { minimapSetting } from "../ui/minimap-setting";
import type { RadioPanel } from "../ui/radio";
import { aimActions, HoverHold, InspectPin, SLOT_KEYS, toggleBodyAim, vehicleMarks, WeaponPanel, mountedSelection, weaponsForClick } from "../ui/weapons";
import { TRAVEL_SPEED_CODES } from "../ui/travel-speed";
import { type CameraRig, KeyPan, TruckFollow, leadAim, type LeadAim } from "./render/camera";
import type { FogView } from "./render/fog";
import { Fx3D, TruckFx } from "./render/fx";
import { aimedTarget, CollisionCues, HornCues, hornSteps, collisionSteps, scoreEventMs, gunfireSeen, hookLine, playCookOff, playCrashes, playShotFx, playUtilitySounds, posesOf, shotAimsOf, breakEmphasis, volleySeen, type CombatHost } from "./volley";
import { Labels, VehicleMarkers } from "./render/labels";
import type { ObstacleViews } from "./render/obstacles";
import type { CraterViews } from "./render/craters";
import { playBreak } from "./render/partDebris";
import { BreakCues, shownItems, type PartBreak } from "./breakCues";
import { PathView } from "./render/path";
import { firstTurnColor, PlanPreparation, throttleColor } from "./plan-preview";
import type { RenderScope, SightLimit } from "./render/scope";
import type { CellStreamer } from "./render/streamer";import type { SiteLights } from "./render/siteLights";
import { sightAround, type FirstFrameHost, type SceneCore, type WorldViews } from "./world-views";
import { drawingRenderer } from "./webgl";
import { FramePace } from "./frame-pace";
import type { GraphicsFacts } from "./error-report";
import { FRAME_REBUILDS, type RebuildBudget } from "./render/vehicle";
import { TruckViews } from "./truck-views";
import { HoverArcsView, vehicleOrigins, WeaponRangeView } from "./render/weaponRange";
import { stormTintStyle, WeatherView } from "./render/weather";
import { stormShare } from "../sim/weather";
import { ZonesView } from "./render/zones";
import { installControlSounds, keyPress } from "../ui/control-sound";
import type { SoundSettings } from "../ui/sound";
import { CLOUD_SHADOWS } from "./render/cloudShadows";
import { CallReveal } from "./call-reveal";
import { backdropAt, daylightAt, lightScene, RadioLights, type VehicleLights, sunCasters, sunLight, vehicleLampsOn } from "./render/daylight";
import { sunAt } from "../sim/sun";
import { ContactsView } from "./render/contacts";
import { CloudViews } from "./render/clouds";
import { UtilityAim } from "./utility-aim";
import type { ShadeView } from "./render/shade";
import { BeaconPulseView } from "./render/beaconPulse";
import { SoundRingView } from "./render/soundRing";
import { reportError } from "./crash";
import type { GpuContext } from "./gpu-context";
import { GameSaves, TURN_FAILED_NOTE, type Run } from "./save";
import { GameMenu } from "../ui/game-menu";
import { TurnWait } from "./turn-wait";
import { unstuckReason } from "../ui/unstuck-reason";
import { getUnstuck } from "../sim/unstuck";
import { abandonRun, canAbandonRun } from "../sim/chaos-highway";
import { confirmEndRun, DeathScreen, deathShows } from "../ui/death";
import { MIX } from "../data/sounds";
import type { CombatMusic } from "./combat-music";
import type { MusicTracks } from "../audio/music-shelf";
import { ACCENT, computeEngineGlide, EngineStrain, musicPlaceAt, PLAIN, SoundDirector, SoundLoops, stingOf, PanelSounds, TurnCues } from "./sound";
import type { SoundPlayer } from "../audio/player";
import { cameraSetting, followRenderScale, renderScaleSetting } from "../ui/camera-setting";
import { isBrowserChord, uiRoot } from "../ui/dom";
import { subscribeInputMode, touchMode } from "../ui/input-mode";
import { installTips } from "../ui/touch-tip";
import { TouchGestures, type TouchIntent } from "./touch-map";
import { touchTapAction } from "./touch-tap";
import { swallowNextClick } from "./ghost-click";
import { PickRing } from "./render/pick-ring";
import { RescueAreaView } from "./render/rescue-area";
import { pickVehicleAt, PointerPicker, worldPadTargets, type PickScene } from "./pointer";
import type { PadWorld } from "../ui/pad/pad-input";
import { HostileSighting } from "./hostile-sighting";
import { lightTurnOf, MOVE_MS, nextSightSample, threatsIn, type Travel, turnClockOf, type Playback, type LiveVision, committedWorld } from "./travel";
import { heldPlayMs, type PlayClock, playbackFrameCapMs } from "./play-clock";


const PICK_PX = 30;

type TurnPhase = ReturnType<UiHost["getTurnPhase"]>;

const stepMs = (step: number) => (step / PHYSICS.stepsPerSecond) * 1000;

const GUN_HEIGHT = 1.6;

type KeySource = "key" | "button";

type GameKey = {
  run: () => void;
  control: (() => HTMLElement | null) | "none";
  noModal?: true;
  idle?: true;
  inventoryOk?: true;
  screen?: true;
};

export class Game {
  private world: World;
  private drive: DriveSnapshot;
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  private readonly sun = sunLight();
  private readonly sky = new THREE.HemisphereLight();
  private readonly play: PlayClock;
  private readonly vehicleLights: VehicleLights;
  private readonly siteLights: SiteLights;
  private readonly vignette = Object.assign(document.createElement("div"), {
    className: "vignette",
  });
  private readonly stormTint = Object.assign(document.createElement("div"), {
    className: "storm-tint",
  });
  readonly rig: CameraRig;
  private readonly shaders: ShaderWarmup;
  private readonly rebuilds: RebuildBudget = { take: () => FRAME_REBUILDS.take(), ready: (root) => this.shaders.ready(root) };
  private readonly ground: THREE.Group;
  private readonly props: THREE.Group;
  private readonly scopes: RenderScope[];
  readonly streamer: CellStreamer;
  private readonly obstacles: ObstacleViews;
  private readonly craters: CraterViews;
  private readonly fog: FogView;
  private readonly lastSeen = new Map<string, number>();
  private readonly shade: ShadeView;
  uiStale = false;
  private readonly weather: WeatherView;
  private readonly labels: Labels;
  private readonly zones = new ZonesView();
  private readonly contacts = new ContactsView();
  private readonly clouds = new CloudViews();
  private readonly utilityAim = new UtilityAim({ world: () => this.world, apply: (next) => this.apply(next), note: (text) => this.hud.refuse(text) });
  private readonly soundRing = new SoundRingView();
  private readonly beaconPulse = new BeaconPulseView();
  private readonly path: PathView;
  private readonly rescueAreas: RescueAreaView;
  private readonly fx: Fx3D;
  private readonly truckFx: TruckFx;
  private readonly controls: TruckControls;
  readonly sound: SoundDirector;
  private panels = new PanelSounds();
  private turnCues = new TurnCues();
  readonly loops: SoundLoops;
  private readonly hostileSighting = new HostileSighting();
  private sightingToSound = false;
  private readonly engineStrain = new EngineStrain();
  private readonly trucks: TruckViews;
  private readonly radioLights = new RadioLights();
  private readonly reveal = new CallReveal();
  private playbackEnded = false;
  private frames: Record<string, VehicleFrame> = {};
  private anim: Playback | null = null;
  private beforeIndex: { anim: Playback; byId: Map<string, Vehicle> } | null = null;
  private turnStart: World | null = null;
  private crashCues: CollisionCues | null = null;
  private hornCues: HornCues | null = null;
  private breakCues = new BreakCues([]);
  private phase: TurnPhase = null;
  private readonly weaponRange = new WeaponRangeView(PAL.select, READY_ARC_BIT);
  private readonly hoverArcs: HoverArcsView;
  private readonly markers: VehicleMarkers;
  private live: LiveVision | null = null;
  private hoverGround: Vec | null = null;
  private touchPreview: Vec | null = null;
  private readonly touch = new TouchGestures();
  private readonly picker: PointerPicker;
  private hovered: string | null = null;
  private readonly hoverHold = new HoverHold((id) => this.setHovered(id), 400);
  private readonly pin = new InspectPin(() => this.onInspectChange(), (v) => this.isVehicleVisible(v));
  private readonly pickRing = new PickRing();
  private selected: readonly string[] = [];
  private readonly sightLimit: SightLimit;
  readonly follow: TruckFollow;
  private planFor: World | null = null;
  private readonly plans = new PlanPreparation();
  private last = performance.now();
  private framesSeen = 0;
  readonly pace = new FramePace();
  private readonly turnWait = new TurnWait(() => this.travel.isPlaying(this.anim));
  private pressedDuringTurn = false;

  readonly hud: Hud;
  private minimap: Minimap | null = null;
  private minimapPainted = false;
  private readonly minimapWanted = (): boolean => this.minimapPainted && minimapSetting().on() && hasExplorationMap(this.world);
  private readonly hitCard: HitCard;
  private readonly weapons: WeaponPanel;
  readonly screens: ModalScreens;
  private readonly context: TruckContext;
  private readonly menu: GameMenu;
  private readonly death: DeathScreen;
  private readonly saves: GameSaves;

  warmPlans(): void {
    this.plans.warm(this.world);
  }

  constructor(world: World, run: Run, private readonly view: HTMLElement, overlay: HTMLElement, player: SoundPlayer, readonly music: CombatMusic, private readonly soundSettings: SoundSettings, radio: RadioPanel, core: SceneCore, readonly gpu: GpuContext, private readonly travel: Travel, tracks: MusicTracks, views: WorldViews) {
    ({ renderer: this.renderer, scene: this.scene, rig: this.rig, shaders: this.shaders, ground: this.ground, props: this.props, play: this.play, vehicleLights: this.vehicleLights } = core);
    this.trucks = new TruckViews(this.scene, this.rebuilds);
    this.picker = new PointerPicker({ world: () => this.world, hit: (x, y, object) => this.rig.hitDistance(x, y, object), views: this.trucks.views, visible: (v) => this.isVehicleVisible(v), radiusPick: (x, y) => this.pickVehicle(x, y)?.id ?? null });
    this.travel.onTurnWait = (ms, at) => this.pace.noteTurnWait(ms, at);
    this.gpu.onRestored(() => this.screens.inventory.render());
    this.world = world;
    this.saves = new GameSaves(run, (text) => this.hud.note(this.world, text, "bad", "attention"), (text) => this.hud.note(this.world, text, "dim", "info"));
    this.drive = driveSnapshotOf(this.world);
    subscribeInputMode(() => this.refreshUi());
    installTips(uiRoot(), touchMode, [overlay]);
    followRenderScale(this.renderer, () => window.devicePixelRatio, () => this.fitView());
    this.follow = new TruckFollow(this.rig, new KeyPan(this.ignoresKey), this.renderer.domElement);
    this.scene.add(this.sky, this.sun, this.sun.target, this.pickRing.mesh);

    ({ sightLimit: this.sightLimit, scopes: this.scopes, craters: this.craters, siteLights: this.siteLights, obstacles: this.obstacles, fog: this.fog, shade: this.shade, streamer: this.streamer } = views);
    this.path = new PathView(this.world.terrain);
    this.rescueAreas = new RescueAreaView(this.world.terrain);
    this.weather = new WeatherView(this.world);
    this.hoverArcs = new HoverArcsView(overlay, this.rig);
    this.scene.add(this.ground, this.props, this.shade.mesh, this.weather.root, this.zones.root, this.path.root, this.rescueAreas.root, this.weaponRange.root);
    this.shaders.drawWavesFrom(() => this.clouds.pulseWaves());
    this.scene.add(this.hoverArcs.root, this.contacts.root, this.clouds.root, this.utilityAim.root, this.soundRing.root, this.beaconPulse.root);
    this.markers = new VehicleMarkers(overlay, this.rig);
    overlay.append(this.vignette, this.stormTint);
    this.labels = new Labels(overlay);
    this.fx = new Fx3D(this.scene, overlay, this.rig, () => this.world, (layer) => this.shaders.drawInkLayerThrough(layer));
    this.truckFx = new TruckFx(this.fx);
    this.controls = new TruckControls({ world: () => this.world, apply: (next) => this.apply(next), commit: (next) => { this.world = next; this.refreshUi(); }, refreshPlan: () => this.refreshPlan(), doused: () => { this.truckFx.douse(); this.sound.ui("engine-douse"); this.hud.pushEvents(this.world); }, note: (text) => this.hud.refuse(text), revved: () => this.loops.rev(playerVehicle(this.world).chassisId) });
    this.context = new TruckContext({
      world: () => this.world,
      playing: () => this.anim !== null,
      whenTurnEnds: (action, key) => this.whenTurnEnds(action, key),
      apply: (next) => this.apply(next),
      pushEvents: () => this.hud.pushEvents(this.world),
      note: (text) => this.hud.refuse(text),
      openTrade: (id) => this.screens.trade.openWith(id),
      openTown: () => this.screens.town.open(),
      openOutpost: () => this.screens.outpost.open(),
      openDowned: (id) => this.screens.inventory.openDowned(this.world, id),
      openLoot: (id) => this.screens.inventory.openLoot(id),
      openLookedOver: (id) => this.screens.inventory.openLookedOver(this.world, id),
    });
    this.sound = new SoundDirector(player, this.rig, music, () => player.now(), Math.random);
    installControlSounds(document, (cue) => this.sound.ui(cue));
    this.loops = new SoundLoops(player, music, tracks, Math.random);
    const host = this.uiHost();
    this.weapons = new WeaponPanel(host);
    this.screens = new ModalScreens(host, () => this.hud.sideMoved(this.screens.journal.root));
    this.hud = new Hud({
      openMenu: () => this.menu.toggle(),
      openInventory: () => this.runKey("KeyI", "button"),
      openCharacter: () => this.runKey("KeyC", "button"),
      openJournal: () => this.runKey("KeyJ", "button"),
      openMap: () => this.runKey("KeyM", "button"),
      toggleManual: () => this.runKey("KeyR", "button"),
      toggleOverdrive: () => this.runKey("KeyO", "button"),
      toggleHeadlights: () => this.runKey("KeyL", "button"),
      headlightsOn: () => this.world.player.headlights,
      douseEngine: () => this.runKey("KeyG", "button"),
      firstAid: () => this.runKey("KeyU", "button"),
      unhitch: () => this.rescueCommand((w) => (w.player.state === "active" && isTowed(w) ? unhitch(w) : null)),
      setBeacon: (on) =>
        this.rescueCommand((w) =>
          playerCanAct(w) && (!on || isStranded(w, playerVehicle(w)))
            ? setBeacon(w, on)
            : null,
        ),
      endRun: () => this.endRun(),
      autoTravel: () => this.travel.isAuto(this.world),
      dialogue: { world: () => this.world, inspected: () => this.inspected(), busy: () => this.anim !== null || this.sceneBusy(), sceneBusy: () => this.sceneBusy(), whenTurnEnds: (action, key) => this.whenTurnEnds(action, key), menuOpen: () => this.menu.isOpen(), talk: (next) => this.runRescue(() => next), commit: (next) => { this.world = next; this.saves.logWorld(next); this.refreshUi(); }, log: (next) => this.hud.pushEvents(next), playHorn: (id, delayMs) => this.playHorn(id, delayMs) },
      recenter: () => this.runKey("KeyF", "button"),
      unpin: () => this.unpin(),
      cardAction: (action) => this.context.onCard(action, this.inspected()),
      ...aimActions({ world: () => this.world, selected: () => this.selected, canAim: () => playerCanAct(this.world), apply: (next) => this.whenTurnEnds(() => this.applyRefusable(next)) }),
    }, radio, this.weapons.deck, this.renderer, this.gpu);
    minimapSetting().subscribe(() => this.syncMinimap());
    this.hitCard = new HitCard(this.hud.getExchangeRoot());
    this.hoverHold.watch(this.hud.getInspectionRoot());
    const saves = this.saves.menuActions(() => committedWorld(this.world, this.anim));
    this.menu = new GameMenu(this.hud.systemKey("menu"), { ...saves, unstuck: { reason: () => unstuckReason(this.world, this.screens.quest.isOpen()), run: () => this.whenTurnEnds(() => this.getUnstuckIfAllowed()) } }, () => this.world.setup, this.hud.tipSwitch(), this.hud.feedbackLinks(), this.soundSettings);
    this.death = new DeathScreen(saves);

    this.bindInput();
    window.addEventListener("resize", () => this.fitView());
    new ResizeObserver(() => this.fitView()).observe(view);
    this.fitView();
    this.refreshUi();
  }

  paintMinimap(): void {
    this.minimapPainted = true;
    this.syncMinimap();
    this.minimap?.update(this.displayWorld());
  }

  private uiHost(): UiHost {
    return {
      world: () => this.displayWorld(),
      menuOpen: () => this.menu.isOpen(),
      apply: (next) => this.applyCommand(next),
      announce: (next) => {
        this.applyCommand(next);
        this.hud.pushEvents(next);
        const sting = stingOf(next.events, playerVehicle(next).id);
        if (sting) this.sound.ui(sting);
      },
      selectedWeapons: () => this.selected,
      selectWeapons: (ids) => this.whenTurnEnds(() => { if (this.modalOpen()) return; this.selected = ids; this.refreshUi(); }),
      selectedUtility: () => this.utilityAim.selectedId,
      selectUtility: (id) => this.selectUtility(id),
      pressTurn: () => this.pressTurn("button"),
      releaseTurn: () => this.releaseTurn(),
      runKey: (code) => this.runKey(code, "button"),
      whenTurnEnds: (action, key) => this.whenTurnEnds(action, key),
      searchStock: (id) => this.searchFromLoot(id),
      autoTravel: () => this.travel.isAuto(this.world), travelSpeedIndex: () => this.travel.getSpeedIndex(), travelPlaySpeed: () => (this.travel.isAuto(this.world) || this.anim !== null ? this.travel.getSpeed() : null), stepTravelSpeed: (delta) => this.travel.stepSpeed(delta),
      getTurnPhase: () => this.phase,
      garageRenders: () => this.hud.garage,
    };
  }

  debugScreenOf(x: number, y: number): { x: number; y: number } {
    return this.rig.screenOf(groundPoint(this.world.terrain, { x, y }));
  }

  debugOwnTruckHit(x: number, y: number): boolean {
    return this.rig.hitDistance(x, y, this.trucks.views.get(playerVehicle(this.world).id)?.root ?? null) !== null;
  }

  debugView(x: number, y: number, zoom: number): void {
    this.follow.release();
    this.rig.setZoom(zoom);
    this.rig.follow(groundPoint(this.world.terrain, { x, y }));
    this.rig.tick(Number.POSITIVE_INFINITY);
    this.rig.follow(null);
  }

  get state(): World { return this.world; }
  logTexts(): string[] { return this.hud.logTexts(); }
  graphicsFacts(): GraphicsFacts {
    const renderer = drawingRenderer();
    if (renderer === null) throw new Error('The game has no drawing renderer to report');
    const drawn = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    return { renderer, drawn: { width: drawn.x, height: drawn.y }, renderScale: renderScaleSetting().scale(), frames: this.pace.summary(), timeline: this.pace.timeline(performance.now()) };
  }

  get busy(): boolean { return this.anim !== null; }

  private applyCommand(next: World): void {
    if (this.anim && !this.anim.impacts) throw new Error("UI command while a turn plays");
    if (this.saves.changeMapIfMoved(next)) return;
    this.apply(next);
    this.saves.afterCommand(next);
  }

  openFullShop(): void {
    if (this.anim) return;
    this.screens.closeAll(null);
    this.screens.fullShop.open();
  }

  relanguageQuest(): void {
    if (this.world.player.quests.live) this.apply(relanguageQuest(this.world, QUESTS));
  }

  apply(next: World): void {
    this.travel.pause();
    this.world = next;
    this.saves.logWorld(next);
    if (this.anim && !this.anim.impacts) return this.refreshUi();
    this.hud.logHeld(next, this.reveal.settle(next));
    this.refreshUi();
  }

  private callShown(): boolean {
    return this.world.player.call !== null && this.anim === null && !this.reveal.holding();
  }

  private fitView(): void {
    const width = this.view.clientWidth;
    const height = this.view.clientHeight;
    if (!Number.isFinite(width) || !Number.isFinite(height)) throw new Error(`View size must be finite, got ${width}x${height}`);
    if (!(width > 0 && height > 0)) return;
    this.renderer.setSize(width, height);
    this.rig.resize();
    this.path.setDrawSize(width, height);
    this.weaponRange.setDrawSize(width, height);
    this.hoverArcs.setDrawSize(width, height);
  }

  private modalOpen(): boolean {
    return this.screens.inventory.isOpen() || this.blockingModalOpen();
  }

  private blockingModalOpen(): boolean {
    return this.screens.blockingOpen() || this.world.player.call !== null || this.menu.isOpen();
  }

  private turnRefused(): boolean {
    return this.blockingModalOpen() || this.screens.inventoryTime.refuses(this.world);
  }

  private displayWorld(): World {
    return playbackWorld(this.world, this.anim);
  }

  private refreshUi(): void {
    this.uiStale = false;
    this.menu.refresh();
    const me = playerVehicle(this.world);
    this.selected = mountedSelection(vehicleStats(this.world, me).weapons, this.selected);
    if (!this.anim) {
      timed("fog", () => this.fog.update(this.world, playerSeenPropTiles(this.world)));
      this.shade.update(this.world);
    }
    this.syncMinimap();
    timed("minimap", () => this.minimap?.update(this.displayWorld()));
    if (!this.anim || this.anim.impacts) this.obstacles.sync(this.world.obstacles, this.world.salvage, this.world.broken);
    this.craters.sync(this.world);
    this.hud.renderTop(this.displayWorld(), this.world);
    this.hud.renderRescue(this.displayWorld(), this.callShown());
    if (!this.anim && deathShows(this.world)) this.death.show(this.world);
    this.weapons.render();
    this.screens.render();
    const { action, count, index, status } = this.context.shown();
    this.hud.renderAction(action, count, index, this.displayWorld(), () => this.runKey("KeyE", "button"), (step) => this.runKey(step === 1 ? "ArrowRight" : "ArrowLeft", "button"), status);
    this.refreshInfo();
    this.refreshTargetMarkers();
  }

  private cycleContext(step: 1 | -1): void {
    this.context.cycle(step);
    this.refreshUi();
  }

  private refreshInfo(): void {
    const w = this.displayWorld();
    const v = w.vehicles.find((x) => x.id === this.inspected() && playerSees(w, x.pos)) ?? null;
    this.hud.showInfo(w, v, v ? hostileToPlayer(w, v) : false, v !== null && this.pin.id === v.id);
    this.hitCard.render(w, v ? v.id : null, this.selected);
  }

  private placeHitCard(): void {
    const f = this.frames[this.inspected() ?? ""];
    if (this.anim !== null || this.modalOpen() || !f)
      return this.hitCard.hide();
    this.hitCard.show();
  }

  private cameraAim(at: number | null): LeadAim {
    const order = playerVehicle(this.anim ? this.anim.before : this.world).order;
    const onOrder = order !== null && order.kind !== "brake";
    const heading = playedHeading(this.anim?.result.frames[playerVehicle(this.world).id], at);
    return leadAim(cameraSetting().mode() === "auto", onOrder, heading);
  }

  private refreshTargetMarkers(): void {
    this.markers.refresh(vehicleMarks(this.displayWorld(), this.inspected()));
  }

  private readonly ignoresKey = (e: KeyboardEvent): boolean => isBrowserChord(e) || this.isEditingControl();

  private isEditingControl(): boolean {
    return document.activeElement?.matches("input, select, textarea") ?? false;
  }

  private bindInput(): void {
    const canvas = this.renderer.domElement;
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    canvas.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "touch") return this.touchDown(e);
      if (e.button === 0 && !this.clickUtility(e)) this.onLeftClick(e.clientX, e.clientY, e.shiftKey);
    });
    canvas.addEventListener("pointermove", (e) => e.pointerType === "touch" && this.touchMove(e));
    canvas.addEventListener("pointerup", (e) => e.pointerType === "touch" && this.touchUp(e));
    canvas.addEventListener("pointercancel", (e) => e.pointerType === "touch" && this.touchCancel(e));
    window.addEventListener("pointermove", (e) => {
      if (e.pointerType === "touch") return;
      this.picker.moveTo(e.target === canvas ? e : null);
      if (e.target === canvas) this.onHover(e);
    });
    canvas.addEventListener("pointerleave", () => this.picker.moveTo(null));
    canvas.addEventListener("wheel", (e) => this.rig.zoomBy(e.deltaY), { passive: true });
    window.addEventListener("keyup", (e) => {
      if (e.code === "Space") this.releaseTurn();
    });
    window.addEventListener("blur", () => this.travel.pause());
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) this.travel.pause();
    });
    window.addEventListener("keydown", (e) => {
      if (this.ignoresKey(e) || this.death.isShown()) return;
      if (e.code === "Space" && !this.turnRefused()) {
        e.preventDefault();
        if (!e.repeat) this.pressTurn("key");
      }
      if (e.code === "Escape" && e.repeat) return;
      this.runKey(e.code, "key");
    });
  }

  private releaseTurn(): void {
    const now = performance.now();
    const tapped = this.pressedDuringTurn && !this.travel.isFast(now);
    this.pressedDuringTurn = false;
    this.travel.release(now);
    if (tapped) this.whenTurnEnds(() => this.tapTurnKey(), "turn");
  }

  private tapTurnKey(): void {
    this.pressTurn("button");
    this.releaseTurn();
  }

  private pressTurn(from: KeySource): void {
    if (this.death.isShown() || this.turnRefused()) return;
    if (from === "key") keyPress(this.weapons.playKey());
    this.screens.inventoryTime.press();
    const playing = this.travel.isPlaying(this.anim);
    const stopsAuto = this.travel.isAuto(this.world);
    if (this.travel.pressTurn(playing, this.world)) this.endTurn();
    this.pressedDuringTurn = playing && !stopsAuto;
  }

  private searchFromLoot(stockId: string): void {
    const action = getSearchAction(this.world, this.world.salvage.find((s) => s.id === stockId)!);
    this.screens.inventory.close();
    this.context.searchStock(stockId, action.combat);
  }

  private runKey(code: string, from: KeySource): void {
    const key = this.keys[code];
    if (!key || (key.screen && this.menu.isOpen()) || (key.noModal && (key.inventoryOk ? this.blockingModalOpen() : this.modalOpen()))) return;
    if (key.idle && this.travel.isPlaying(this.anim)) return this.turnWait.defer(() => this.runKey(code, from));
    if (key.inventoryOk && this.screens.inventory.isOpen()) this.screens.inventory.close();
    try {
      if (from === "key" && key.control !== "none") keyPress(key.control());
    } finally {
      key.run();
    }
  }

  private readonly keys: Record<string, GameKey> = {
    KeyF: { run: () => this.follow.recenter(), control: () => this.hud.recenterKey() },
    KeyV: { run: () => cameraSetting().toggle(), control: () => this.menu.cameraKey() },
    KeyQ: { run: () => this.weapons.toggleAuto(), control: () => this.weapons.autoKey(), noModal: true },
    ...Object.fromEntries(Object.entries(TRAVEL_SPEED_CODES).map(([code, delta]) => [code, { run: () => this.weapons.stepTravelSpeed(delta), control: () => this.weapons.speedKnob(), noModal: true as const }])),
    Digit0: { run: () => this.weapons.toggleAll(), control: () => this.weapons.allKey(), noModal: true },
    ...Object.fromEntries(Array.from({ length: SLOT_KEYS }, (_, i) => [`Digit${i + 1}`, { run: () => this.weapons.pressKey(i + 1), control: () => this.weapons.slotControl(i + 1), noModal: true as const, idle: true as const }])),
    KeyE: { run: () => this.context.use(), control: () => this.hud.actionKey(), noModal: true, inventoryOk: true, idle: true },
    ArrowLeft: { run: () => this.cycleContext(-1), control: () => this.hud.cycleKey(-1), noModal: true, idle: true },
    ArrowRight: { run: () => this.cycleContext(1), control: () => this.hud.cycleKey(1), noModal: true, idle: true },
    KeyR: { run: () => this.controls.toggleManual(), control: () => this.hud.manualSwitch(), noModal: true, idle: true },
    KeyP: { run: () => this.controls.toggleAutoRepair(), control: "none", noModal: true, idle: true },
    KeyO: { run: () => this.controls.toggleOverdrive(), control: () => this.hud.overdriveSwitch(), noModal: true, idle: true },
    KeyG: { run: () => this.controls.douseEngine(), control: () => this.hud.coolKey(), noModal: true, idle: true },
    KeyU: { run: () => this.controls.firstAid(), control: "none", noModal: true, idle: true },
    KeyL: { run: () => this.controls.toggleHeadlights(), control: () => this.hud.lightsSwitch(), noModal: true },
    KeyN: { run: () => this.context.onCard('mark', this.inspected()), control: () => this.hud.cardKey("N"), noModal: true, idle: true },
    KeyB: { run: () => this.context.onCard('lookOver', this.inspected()), control: () => this.hud.cardKey("B"), noModal: true, idle: true },
    KeyC: { run: () => this.screens.toggleCharacter("skills"), control: () => this.hud.systemKey("character"), idle: true, screen: true },
    KeyM: { run: () => hasExplorationMap(this.world) && this.screens.toggleCharacter("map"), control: () => this.hud.systemKey("map"), idle: true, screen: true },
    KeyJ: { run: () => (this.screens.journal.sideForm() ? this.screens.toggle(this.screens.journal) : this.whenTurnEnds(() => this.screens.toggle(this.screens.journal))), control: () => this.hud.systemKey("journal"), screen: true },
    KeyI: { run: () => (this.screens.inventory.isOpen() ? this.screens.toggle(this.screens.inventory) : this.whenTurnEnds(() => this.screens.toggle(this.screens.inventory))), control: () => this.hud.systemKey("car"), screen: true },
    Escape: { run: () => this.escape(), control: () => this.escapeControl() },
  };

  private escapeControl(): HTMLElement | null {
    if (this.screens.town.isOpen()) return this.screens.town.backKey();
    if (this.modalOpen() || this.screens.journal.isOpen()) return this.screens.closeKey();
    if (this.pin.id !== null || this.utilityAim.selectedId !== null) return null;
    return this.hud.systemKey("menu");
  }

  private escape(): void {
    if (this.screens.town.isOpen()) this.screens.town.back();
    else if (this.modalOpen() || this.screens.journal.isOpen()) this.screens.closeAll(null);
    else if (this.pin.id !== null || this.utilityAim.selectedId !== null) this.unpin();
    else return this.menu.open();
    this.selectUtility(null);
  }

  unpin(): void {
    this.pin.clear();
  }

  private selectUtility(id: string | null): void {
    this.whenTurnEnds(() => {
      if (id !== null && this.modalOpen()) return;
      this.utilityAim.select(id);
      this.refreshUi();
    });
  }

  private updateStopCue(): void {
    if (this.picker.updateCue(this.canClick())) this.renderer.domElement.style.cursor = this.picker.stopCue ? "pointer" : "";
  }

  private canClick(): boolean { return !this.anim && this.canOrder(); }

  private canOrder(): boolean { return !this.modalOpen() && playerCanAct(this.world); }

  private touchDown(e: PointerEvent): void {
    this.touchIntent(this.touch.down(e.pointerId, e.clientX, e.clientY, performance.now()));
    this.touchGhost();
  }

  private touchMove(e: PointerEvent): void {
    this.touchIntent(this.touch.move(e.pointerId, e.clientX, e.clientY));
    this.touchGhost();
  }

  private touchUp(e: PointerEvent): void {
    this.touchIntent(this.touch.up(e.pointerId));
    if (this.touchPreview === null) this.hoverGround = null;
  }

  private touchCancel(e: PointerEvent): void {
    this.touch.cancel(e.pointerId);
    if (this.touchPreview === null) this.hoverGround = null;
  }

  private touchGhost(): void {
    const finger = this.touch.holding();
    if (finger) this.hoverGround = this.groundFor(finger.x, finger.y);
  }

  private touchIntent(intent: TouchIntent | null): void {
    if (!intent) return;
    switch (intent.kind) {
      case "pan":
        return this.follow.pan(intent.dx, intent.dy);
      case "zoom":
        return this.rig.zoomByFactor(intent.factor);
      case "tap":
        return this.touchTap(intent.x, intent.y);
      case "hold":
        return this.touchHold(intent.x, intent.y);
    }
  }

  private touchHold(x: number, y: number): void {
    const action = this.picker.action(x, y);
    const point = this.canOrder() && this.utilityAim.pointPending();
    if (this.modalOpen() || action.kind !== "ground" || point) return this.touchTap(x, y);
    const p = this.rig.groundUnder(x, y, this.ground);
    if (this.canOrder() && p) this.controls.order(p, true);
  }

  private touchTap(x: number, y: number): void {
    if (this.modalOpen()) return;
    const ground = this.rig.groundUnder(x, y, this.ground);
    const tap = touchTapAction({
      pinnedId: this.pin.id,
      previewScreen: this.touchPreview,
      previewAt: this.hoverGround,
      tapScreen: { x, y },
      hit: this.picker.action(x, y),
      ground,
      utilityPoint: this.canOrder() && this.utilityAim.pointPending(),
      pickRadius: PICK_PX,
    });
    if (tap.kind !== "preview") this.touchPreview = null;
    switch (tap.kind) {
      case "pin":
        swallowNextClick();
        return this.pin.click(tap.id);
      case "aim":
        return this.aimVehicle(tap.id);
      case "preview":
        this.touchPreview = { x, y };
        this.hoverGround = tap.at;
        return;
      case "place":
        this.hoverGround = null;
        this.whenTurnEnds(() => this.utilityAim.click(tap.at));
        return;
      case "click":
        return this.onLeftClick(x, y, false);
    }
  }

  private onLeftClick(x: number, y: number, stop: boolean): void {
    if (this.modalOpen()) return;
    const action = this.picker.action(x, y);
    if (action.kind === "vehicle") return this.clickVehicle(action.id);
    if (!this.canOrder()) return;
    switch (action.kind) {
      case "stop":
        return this.apply(setMoveOrder(this.world, { kind: "brake" }));
      case "own":
        return;
      case "ground": {
        const p = this.rig.groundUnder(x, y, this.ground);
        if (p) this.controls.order(p, stop);
        return;
      }
      default:
        throw new Error(`Unknown pointer action ${JSON.stringify(action)}`);
    }
  }

  private inspected(): string | null { return this.pin.id ?? this.hovered; }

  private onInspectChange(): void {
    this.refreshInfo();
    this.refreshTargetMarkers();
  }

  private clickUtility(e: MouseEvent): boolean {
    if (this.modalOpen() || !playerCanAct(this.world)) return false;
    const at = this.rig.groundUnder(e.clientX, e.clientY, this.ground);
    if (!this.travel.isPlaying(this.anim)) return this.utilityAim.click(at);
    if (!this.utilityAim.pointPending()) return false;
    this.turnWait.defer(() => this.utilityAim.click(at));
    return true;
  }

  private clickVehicle(id: string): void {
    this.pin.click(id);
    this.aimVehicle(id);
  }

  private aimVehicle(id: string): void {
    if (this.selected.length === 0 || !this.canOrder()) return;
    this.whenTurnEnds(() => this.aimVehicleNow(id));
  }

  private aimVehicleNow(id: string): void {
    if (this.selected.length === 0 || !this.canOrder()) return;
    const target = vehicleById(this.world, id);
    if (isPlayerTruck(this.world, target)) return;
    this.applyRefusable(() => toggleBodyAim(this.world, weaponsForClick(this.world, this.selected), target));
  }

  private applyRefusable(next: () => World): void {
    try {
      this.apply(next());
    } catch (err) {
      if (!(err instanceof Refused)) throw err;
      this.hud.refuse(refusalText(this.world, err.refusal));
    }
  }

  private canShowCombatVehicle(v: Vehicle): boolean {
    return this.isVehicleVisible(v) || this.world.events.some((e) => e.t === "shot" && e.shooter === this.world.player.vehicleId && e.target === v.id);
  }

  private lingers(v: Vehicle): boolean {
    const seen = this.lastSeen.get(v.id);
    return seen !== undefined && this.world.turn - seen <= TERRAIN.vision.lingerTurns;
  }

  private isVehicleVisible(v: Vehicle): boolean {
    if (isPlayerTruck(this.world, v)) return true;
    const f = this.frames[v.id];
    if (this.live && f) return this.live.visible.has(tileOf(this.world, toMap(f.pos)));
    return playerSees(this.world, v.pos);
  }

  private pickScene(): PickScene {
    return { world: this.world, frames: this.frames, screenOf: (p) => this.rig.screenOf(p), visible: (v) => this.isVehicleVisible(v) };
  }

  private pickVehicle(cx: number, cy: number): Vehicle | null { return pickVehicleAt(this.pickScene(), cx, cy, PICK_PX); }

  padWorld(): PadWorld {
    return { open: () => !this.modalOpen() && !this.death.isShown(), targets: () => worldPadTargets(this.pickScene(), { width: window.innerWidth, height: window.innerHeight }), surface: this.renderer.domElement };
  }

  private groundFor(x: number, y: number): Vec | null {
    const id = this.pickVehicle(x, y)?.id ?? null;
    return id || this.picker.overOwn(x, y) || this.modalOpen() ? null : this.rig.groundUnder(x, y, this.ground);
  }

  private onHover(e: MouseEvent): void {
    const id = this.pickVehicle(e.clientX, e.clientY)?.id ?? null;
    this.hoverGround = this.groundFor(e.clientX, e.clientY);
    this.hoverHold.move(id, this.hovered);
  }

  private setHovered(id: string | null): void {
    if (id === this.hovered) return;
    this.hovered = id;
    if (this.pin.id === null) this.onInspectChange();
  }

  endTurn(): void {
    if (this.travel.isPlaying(this.anim) || this.turnRefused() || this.world.player.state === "dead") return;
    this.travel.request(this.world, this.drive);
  }

  private updateTravel(): void {
    const threats = threatsIn(this.world).filter((v) => this.isVehicleVisible(v)).map((v) => v.id);
    const { sighted } = this.hostileSighting.observe(this.world.turn, threats);
    this.screens.inventoryTime.closeOn(this.world, sighted || this.blockingModalOpen());
    this.sightingToSound ||= sighted;
    this.follow.noteDanger(threats.length > 0);
    this.travel.updateWorld(this.world, sighted);
  }

  holdSaves(): void {
    this.saves.noteError();
  }

  private failTurn(err: unknown): void {
    this.travel.abandon(this.world);
    this.saves.noteError();
    this.hud.note(this.world, TURN_FAILED_NOTE, "bad", "attention");
    reportError(err);
    this.refreshUi();
  }

  private tryBeginTurn(now: number, wasPlaying: boolean): "began" | "none" | "failed" {
    try {
      const held = this.holdsTime();
      const prepared = this.anim ? null : timed("take-ready", () => this.travel.takeReady(this.world, this.drive, now, held));
      if (prepared) this.beginTurn(prepared, now, this.travel.getRemainder(wasPlaying));
      return prepared ? "began" : "none";
    } catch (err) {
      this.failTurn(err);
      return "failed";
    }
  }

  private beginTurn(prepared: PreparedTurn, now: number, elapsed: number): void {
    if (this.world.player.quests.live) throw new Error("A turn began under an open scene");
    const { world: played, playback, towed } = timed("begin-playback", () => this.travel.beginPlayback(this.world, prepared, elapsed, this.frames));
    const world = timed("relanguage-quest", () => relanguageQuest(played, QUESTS));
    if (this.saves.changeMapIfMoved(world)) return;
    this.world = world;
    timed("log-world", () => this.saves.logWorld(world));
    this.updateLoops();
    this.anim = playback;
    this.turnStart = playback.before;
    this.saves.beginTurn();
    this.live = { visible: new Set(this.world.player.visible), explored: playback.before.player.explored.slice(), sight: prepared.sight, shown: -1 };
    const seen = (id: string) => this.eventPoint(id) !== null;
    playback.combat = gunfireSeen(this.world.events, seen);
    playback.volley = volleySeen(this.world.events, seen);
    const collisions = collisionSteps(world.events, playback.result);
    this.crashCues = new CollisionCues(collisions);
    this.hornCues = new HornCues(this.heardRoadHorns(world));
    playback.shotAims = shotAimsOf(world.events);
    this.breakCues = new BreakCues(world.events);
    playback.impactAtMs = Math.max(MOVE_MS, playShotFx(this.combatHost(playback.elapsed), this.breakCues));
    playUtilitySounds(this.combatHost(), "start");
    this.sound.timeScoreEvents(world.events, world.player.vehicleId, (e) => scoreEventMs(e, collisions, playback.impactAtMs));
    if (!towed) this.playDriveSound(playback.result);
    this.phase = "moving";
    this.path.clear();
    this.uiStale = true;
  }

  private finishMovement(a: Playback, now: number): void {
    a.moved = true;
    this.drive = a.result.next;
    for (const [id, fs] of Object.entries(a.result.frames))
      this.frames[id] = fs[fs.length - 1];
    const stopped = this.travel.stopAt(a, this.world, this.frames, now, a.elapsed - MOVE_MS);
    if (stopped) this.commitStop(stopped);
    this.live = null;
    this.phase = a.combat ? "firing" : "results";
    timed("fog", () => this.fog.update(this.combatFogWorld(), playerSeenPropTiles(this.world)));
    playCrashes(this.combatHost(), this.crashCues, null);
    this.playRoadHorns(null);
    playUtilitySounds(this.combatHost(), "end");
    this.weapons.render();
  }

  private commitStop(stopped: { world: World; drive: DriveSnapshot; leftMs: number }): void {
    [this.world, this.drive] = [stopped.world, stopped.drive];
    this.saves.logWorld(stopped.world);
    this.play.stopWithin(stopped.leftMs);
  }

  private settleLateStop(now: number): void {
    if (this.anim !== null) return;
    const stopped = this.travel.settleStop(this.world, this.frames, now);
    if (!stopped) return;
    if (!this.play.isMoving()) throw new Error("A late travel stop needs the world clock to move");
    this.commitStop(stopped);
  }

  private landImpacts(a: Playback): void {
    a.impacts = true;
    this.phase = "results";
    this.craters.revealAll(this.world.turn);
    for (const e of this.world.events) {
      if (!untimedDestroyed(this.world, e)) continue;
      const p = this.eventPoint(e.vehicle);
      if (p) this.fx.explode(p);
    }
    this.playImpactSounds();
    this.hud.pushEvents(this.world, this.reveal.landed(this.world));
    this.openLandingScreen();
    this.uiStale = true;
    for (const b of this.breakCues.rest()) this.playBreak(b, null);
  }

  private openLandingScreen(): void {
    const screen = landingScreen(this.world);
    if (screen?.kind === "loot") this.screens.inventory.openLoot(screen.id);
    if (screen?.kind === "look") this.screens.inventory.openLookedOver(this.world, screen.id);
  }

  private finishPlayback(): void {
    this.anim = null;
    this.playbackEnded = true;
    this.sound.clearScoreEvents();
    this.crashCues = null;
    this.breakCues = new BreakCues([]);
    this.phase = null;
    this.saves.afterTurn(this.world);
    this.hud.flushHorn();
    this.turnWait.release();
    this.shade.update(this.world);
    this.uiStale = true;
  }

  private getUnstuckIfAllowed(): void {
    if (unstuckReason(this.world, this.screens.quest.isOpen())) return;
    this.getUnstuck();
  }

  private getUnstuck(): void {
    this.screens.closeAll(null);
    this.runRescue(getUnstuck);
    this.endTurn();
  }

  private endRun(): void {
    if (this.modalOpen()) return;
    confirmEndRun(this.world).then((yes) => {
      if (yes) this.rescueCommand((w) => (canAbandonRun(w) ? abandonRun(w) : null));
    }, reportError);
  }

  private rescueCommand(fn: (w: World) => World | null): void {
    if (this.modalOpen()) return;
    this.whenTurnEnds(() => {
      if (this.modalOpen()) return;
      this.runRescue(fn);
    });
  }

  private sceneBusy(): boolean {
    return this.screens.quest.isOpen() || (this.world.player.call !== null && !this.callShown());
  }

  whenTurnEnds(action: () => void, key?: string): void {
    if (this.travel.isPlaying(this.anim)) this.turnWait.defer(action, key);
    else action();
  }

  private runRescue(fn: (w: World) => World | null): void {
    const next = fn(this.world);
    if (!next) return this.refreshUi();
    this.apply(next);
    this.hud.pushEvents(this.world);
  }

  private playHorn(id: string, delayMs: number): void {
    const v = vehicleById(this.world, id), f = this.frames[v.id] ?? restFrame(this.world, v);
    this.sound.honk({ x: f.pos.x, y: f.pos.y + GUN_HEIGHT, z: f.pos.z }, delayMs, v.chassisId);
  }

  private heardRoadHorns(world: World) {
    const me = playerVehicle(world);
    const hears = (e: { vehicle: string }): boolean => {
      const honker = world.vehicles.find((v) => v.id === e.vehicle);
      return !!honker && hearsHorn(me, honker);
    };
    return hornSteps(world.events, hears, Math.random);
  }

  private playRoadHorns(step: number | null): void {
    for (const e of this.hornCues?.due(step) ?? []) {
      if (!this.world.vehicles.some((v) => v.id === e.vehicle)) continue;
      const v = vehicleById(this.world, e.vehicle), f = this.frames[v.id] ?? restFrame(this.world, v);
      this.sound.honk({ x: f.pos.x, y: f.pos.y + GUN_HEIGHT, z: f.pos.z }, 0, v.chassisId, `${e.cause} ${e.vehicle}`);
    }
  }

  private playImpactSounds(): void {
    for (const e of this.world.events) {
      const p = untimedDestroyed(this.world, e) && this.eventPoint(e.vehicle);
      if (p) this.sound.event("explosion", p, 0, 1, ACCENT);
    }
    for (const cue of this.turnCues.after(this.world)) this.sound.ui(cue);
  }

  private playDriveSound(result: Pick<TurnResult, "frames">): void {
    const me = playerVehicle(this.world);
    const frames = result.frames[me.id];
    const g = computeEngineGlide(frames, MOVE_MS / 1000, MIX, inOverdrive(this.world, me));
    const strain = this.engineStrain.next(this.world.turn, engineOverheating(this.world));
    const running = g && !isStranded(this.world, me) ? g : null;
    this.loops.drive(running, me.chassisId, strain);
    if (running) this.sound.engineStrain(strain);
    if (g?.brake) this.sound.event("air-brake", frames[0].pos, 0, 1, PLAIN);
  }

  private updateLoops(): void {
    const me = playerVehicle(this.world);
    const at = this.frames[me.id] ? toMap(this.frames[me.id].pos) : me.pos;
    this.loops.update({ stormShare: stormShare(me), inCombat: inCombat(this.world, me), inQuest: this.screens.quest.isOpen(), place: musicPlaceAt(this.world.terrain, at) });
    this.loops.engineAt(turnClockOf(this.anim)?.progress ?? 1);
    if (this.sightingToSound) this.sound.scoreEvent("sighted", 0);
    this.sightingToSound = false;
  }

  private playPanelSounds(): void {
    const call = this.callShown();
    const cue = this.panels.change(this.screens.inventory.isOpen() || this.screens.blockingOpen() || call || this.menu.isOpen(), call);
    if (cue) this.sound.ui(cue);
  }

  private combatFogWorld(): World {
    const visible = new Set(this.world.player.visible);
    for (const v of [...this.world.vehicles, ...this.world.removed]) {
      if (this.canShowCombatVehicle(v)) visible.add(tileOf(this.world, v.pos));
    }
    return {
      ...this.world,
      player: {
        ...this.world.player,
        visible: [...visible].sort((a, b) => a - b),
      },
    };
  }

  private eventPoint = (id: string): V3 | null => combatEventPoint(this.world, this.frames, id, GUN_HEIGHT, v => this.canShowCombatVehicle(v));

  private combatHost(startMs = 0): CombatHost {
    const frames = this.anim?.result.frames ?? {};
    const poses = posesOf(this.world, frames, { moveMs: MOVE_MS, stepMs: stepMs(1), gunHeight: GUN_HEIGHT }, (v) => this.canShowCombatVehicle(v));
    return { world: this.world, fx: this.fx, sound: this.sound, eventPoint: (id) => this.eventPoint(id), onBurst: (p) => this.craters.reveal(p), views: this.trucks.views, breakPart: (b, shooter) => this.playBreak(b, shooter), poses, startMs, lineHooked: (shooter, weapon) => hookLine(this.world, this.anim, shooter, weapon) };
  }

  private playBreak(b: PartBreak, shooter: string | null): void {
    if (this.eventPoint(b.vehicle) === null) return;
    if (!this.turnStart) throw new Error(`Part ${b.part} of ${b.vehicle} broke before any turn played`);
    const p = playBreak(this.world, this.turnStart, this.obstacles.parts, this.fx, this.trucks.views.get(b.vehicle), b);
    if (p) this.sound.event("part-broken", p, 0, 1, breakEmphasis(this.world, b.vehicle, shooter));
    playCookOff(this.combatHost(), b);
  }

  private refreshPlan(): void {
    if (this.travel.isAdvancing(this.anim, this.last) || this.planFor === this.world) return;
    this.planFor = this.world;
    if (!playerCanAct(this.world)) return this.path.clear();
    const me = playerVehicle(this.world);
    if (!me.order && me.speed === 0) return this.path.clear();
    this.plans.request(this.world, this.drive, me.id);
  }

  private showPlan(): void {
    const plan = this.plans.take(this.world);
    if (plan) this.path.set(plan.turns, firstTurnColor(this.world, playerVehicle(this.world)), plan.course, plan.waypoint);
  }

  private revealDueCall(): void {
    const now = performance.now();
    if (this.playbackEnded) this.reveal.ended(now);
    this.playbackEnded = false;
    const due = this.reveal.due(now);
    if (!due) return;
    this.hud.logHeld(this.world, due);
    this.uiStale = true;
  }

  private flushUi(began: string, phase: TurnPhase): void {
    if (this.uiStale && began !== "began" && this.phase === phase) this.refreshUi();
  }

  private advanceTurn(now: number, dt: number): { at: number | null; playMs: number; combatMs: number } {
    const held = this.holdsTime();
    if (held) this.travel.pause();
    const speed = this.travel.paceSpeed(this.world, now, held ? 0 : dt, CONFIG.travelFastSpeed);
    const clock = this.tickWorldClock(heldPlayMs(dt, this.play.isHeld(), playbackFrameCapMs(speed, CONFIG.playbackHitchMs, MOVE_MS)), speed, now);
    const wasPlaying = this.anim !== null;
    const phase = this.phase;
    this.revealDueCall();
    this.travel.tickCreep(clock.playMs);
    let at = this.animStep(now, speed, clock.playMs);
    this.updateLiveVision(at);
    this.updateTravel();
    const began = this.tryBeginTurn(now, wasPlaying);
    if (began === "failed") return { at, ...clock };
    if (began === "began") {
      clock.combatMs = 0;
      at = this.animStep(now, speed, 0);
      this.updateTravel();
    }
    this.settleLateStop(now);
    if (!this.travel.isPlaying(this.anim)) this.turnWait.release();
    if (began !== "began") this.travel.prepareNext(this.world, this.anim, now, this.drive);
    timed("flush-ui", () => this.flushUi(began, phase));
    return { at, ...clock };
  }

  private holdsTime(): boolean {
    return this.timeHeld() || waitsOnPlayer(this.world);
  }

  private timeHeld(): boolean {
    return this.screens.inventoryTime.holds() || this.screens.blockingOpen() || this.menu.isOpen() || this.isEditingControl() || document.hidden || this.gpu.lost();
  }

  private tickWorldClock(realMs: number, speed: number, now: number): { playMs: number; combatMs: number } {
    const wanted = (this.anim !== null && !this.anim.moved) || this.travel.timeWanted(this.world, now);
    this.play.coast(realMs, wanted, wanted ? speed : 1);
    return { playMs: this.play.frameMs(), combatMs: combatFrameMs(this.anim, this.play.frameMs(), MOVE_MS) };
  }

  private tick(now: number): void {
    if (!import.meta.env.DEV) requestAnimationFrame((t) => this.tick(t));
    this.frame(now);
    this.drawFrame();
    if (import.meta.env.DEV) requestAnimationFrame((t) => this.tick(t));
  }

  private showPlayedSpeed(at: number | null): void {
    this.hud.showSpeed(playedKph(this.anim?.result.frames[playerVehicle(this.world).id], at));
  }

  private drawFrame(): void {
    this.shaders.render(this.timeHeld());
    this.hud.stepPortraits(this.travel.isPlaying(this.anim), this.screens.inventory.isOpen());
    this.refreshPlan();
    this.showPlan();
  }

  private frame(now: number): void {
    this.fx.beginFrame();
    now = Math.max(now, this.last);
    const dt = now - this.last;
    this.last = now;
    if (this.framesSeen++ > 0) this.pace.note(dt, now, this.renderer.info.programs?.length ?? 0);
    this.rig.readPlace();
    this.touchIntent(this.touch.tick(now));
    this.play.beginFrame(this.timeHeld());
    const { at, playMs, combatMs } = timed("turn-frame", () => {
      const turn = this.advanceTurn(now, dt);
      this.shade.advance();
      return turn;
    });
    const playDt = playMs / 1000;
    const step = at === null ? null : Math.floor(at);
    this.syncVehicles(at, playDt);
    this.obstacles.play(this.anim, step, this.world, this.frames, playDt);
    if (step !== null) {
      playCrashes(this.combatHost(), this.crashCues, step);
      this.playRoadHorns(step);
    }
    this.showPlayedSpeed(at);
    const truck = this.frames[playerVehicle(this.world).id].pos;
    const sightRadius = sightAround(this.sightLimit, this.streamer, this.world, truck);
    this.rig.leash(truck, sightRadius);
    this.follow.update(truck, this.cameraAim(at), dt, playMs);
    this.drawOverlays();
    this.hud.showRecenter(!this.follow.isFollowing());
    const daylight = daylightAt(lightTurnOf(this.world, this.anim));
    lightScene(this.sun, this.sky, this.rig.focus(), daylight, this.rig.groundReach(), daylightAt(this.world.turn));    this.scene.background = this.sightLimit.fadeTo(backdropAt(daylight));
    this.craters.graffiti.light(daylight.sunIntensity);
    this.fx.light({ sun: this.sun, sky: this.sky });
    CLOUD_SHADOWS.sync(this.world, lightTurnOf(this.world, this.anim), this.play.frameMs());
    this.vehicleLights.sync(this.world, this.frames, lightTurnOf(this.world, this.anim), (pos) => this.sightLimit.reaches(pos), truck);
    this.siteLights.sync(!sunAt(this.world.turn), lightTurnOf(this.world, this.anim), this.rig.camera, (pos) => this.sightLimit.reaches(pos), this.rig.focus(), now, this.world);
    Object.assign(this.stormTint.style, stormTintStyle(stormShare(playerVehicle(this.world))));
    this.fx.tick(this.play.frameMs(), dt, this.world, combatMs);
    this.playPanelSounds();
    this.updateLoops();
    this.weather.sync(this.world, turnClockOf(this.anim));
    this.weather.advance(this.play.frameMs());
    this.labels.update(this.world, this.rig, this.sightLimit);
    for (const scope of this.scopes) scope.update(this.rig.camera, sunCasters(this.sun));
  }

  firstFrame(): FirstFrameHost {
    return { upload: (texture) => this.renderer.initTexture(texture), compile: () => void this.renderer.compile(this.scene, this.rig.camera), fillGroundCache: () => { this.frame((this.last = performance.now())); this.shaders.fillGroundCache(); }, drawFirstFrame: () => this.tick((this.last = performance.now())) };
  }

  private syncMinimap(): void {
    const on = this.minimapWanted();
    if (on && !this.minimap) {
      this.minimap = new Minimap(() => this.openMap());
    } else if (!on && this.minimap) {
      this.minimap.dispose();
      this.minimap = null;
    }
  }

  private openMap(): void {
    this.whenTurnEnds(() => this.screens.openCharacter("map"));
  }

  private updateLiveVision(step: number | null): void {
    const live = this.live;
    const f = this.frames[playerVehicle(this.world).id];
    if (!live || step === null || !f) return;
    const k = nextSightSample(live, step);
    if (k === null) return;
    const at = toMap(f.pos);
    const player = { ...this.world.player, visible: live.sight.tiles[k], explored: live.explored };
    timed("fog", () => this.fog.updateSight({ ...this.world, player }, live.sight.props[k]));
    timed("minimap", () => this.minimap?.update({ ...this.world, player }, { pos: at, heading: playerVehicle(this.world).heading }));
  }

  private animStep(now: number, speed: number, ms: number): number | null {
    const a = this.anim;
    if (!a) return null;
    const elapsed = (a.elapsed += ms);
    this.uiStale = timedUiStale(this.world, elapsed, ms, this.uiStale);
    this.sound.playDueScoreEvents(elapsed, speed);
    if (elapsed < MOVE_MS)
      return (elapsed / 1000) * PHYSICS.stepsPerSecond - 1;
    if (!a.moved) timed("finish-movement", () => this.finishMovement(a, now));
    if (elapsed < a.impactAtMs && this.play.isMoving()) return null;
    if (!a.impacts) timed("land-impacts", () => this.landImpacts(a));
    this.travel.finishClock(elapsed, Math.min(elapsed, a.impactAtMs));
    timed("finish-playback", () => this.finishPlayback());
    return null;
  }

  private syncVehicles(at: number | null, playDt: number): void {
    const frames: TurnFrames | null = at === null || !this.anim ? null : this.anim.result.frames;
    const landed = !this.anim || this.anim.impacts;
    const glass = daylightAt(lightTurnOf(this.world, this.anim)).glass;
    const now = performance.now();
    this.radioLights.note(this.world, now, this.callShown());
    const shown = shownTimedVehicles(this.world, landed, this.anim);
    const hidden: Vehicle[] = [];
    for (const [i, v] of shown.entries()) {
      this.pin.note(v, i < this.world.vehicles.length);
      const f = this.shownFrame(v, this.travel.playedFrame(v, this.anim, at));
      this.frames[v.id] = f;
      const seen = landed ? this.isVehicleVisible(v) : this.canShowCombatVehicle(v);
      if (seen) this.lastSeen.set(v.id, this.world.turn);
      const look = this.lookOf(v, f, seen);
      if (!look) { hidden.push(v); continue; }
      const before = !landed && this.beforeTruck(v.id);
      const display = before ? { ...v, items: shownItems(before.items, v.items, this.breakCues.shown(v.id)) } : v;
      const view = this.trucks.viewOf(v.id, display, seen, this.world.player.paint);
      if (!view) continue;
      view.lamps(vehicleLampsOn(this.world, v, lightTurnOf(this.world, this.anim)));
      view.radio(this.radioLights.lit(v.id, now));
      view.outline(look === "dark");
      view.windows(glass);
      view.pose(f, playDt);
      view.aim((partId) => this.turretAim(v.id, (before || v).weaponOrders, f, partId));
      this.truckFx.emit(this.world, display, f, this.travel.trucksRoll(frames !== null), playDt, seen);
    }
    this.pin.settle();
    this.trucks.park(this.world, hidden);
    this.trucks.prune(now, this.world.events);
  }

  private beforeTruck(id: string): Vehicle | undefined {
    const anim = this.anim!;
    if (this.beforeIndex?.anim !== anim) this.beforeIndex = { anim, byId: new Map(anim.before.vehicles.map((x) => [x.id, x])) };
    return this.beforeIndex.byId.get(id);
  }

  private shownFrame(v: Vehicle, played: VehicleFrame | null | undefined): VehicleFrame {
    const kept = this.frames[v.id];
    return played ?? (kept && !staleFrame(kept, v, this.anim !== null) ? kept : restFrame(this.world, v));
  }

  private lookOf(v: Vehicle, f: VehicleFrame, seen: boolean): "full" | "dark" | null {
    if (seen || this.lingers(v)) return "full";
    return vehicleLampsOn(this.world, v, lightTurnOf(this.world, this.anim)) && this.sightLimit.reaches(f.pos) ? "dark" : null;
  }

  private turretAim(vehicleId: string, orders: Vehicle["weaponOrders"], f: VehicleFrame, partId: string): number | null {
    const target = this.frames[aimedTarget(this.anim?.shotAims, vehicleId, orders, partId) ?? ""];
    return target
      ? Math.atan2(target.pos.z - f.pos.z, target.pos.x - f.pos.x)
      : null;
  }

  private drawOverlays(): void {
    this.updateStopCue();
    const hide =
      this.travel.isAdvancing(this.anim, this.last) || this.modalOpen();
    const steer = !hide && playerCanAct(this.world);
    this.zones.root.visible = steer;
    this.path.show(steer, this.displayWorld(), this.modalOpen());
    this.rescueAreas.show(this.world, { width: window.innerWidth, height: window.innerHeight });
    this.weaponRange.root.visible = false;
    this.hoverArcs.follow(this.displayWorld(), this.inspected(), this.frames, this.modalOpen());
    this.markers.place(this.frames, hide, this.modalOpen());
    this.placeHitCard();
    this.pickRing.follow(this.world, this.hovered, this.frames, hide);
    this.contacts.update(this.world.terrain, this.world.player.contacts, playerVehicle(this.world).pos, this.world.turn, performance.now());
    this.clouds.update(this.world, this.trucks.views, this.play.nowMs(), turnClockOf(this.anim), this.rig.camera, this.fx.cards);
    this.utilityAim.draw(this.world, this.world.terrain, this.hoverGround, !steer);
    const meFrame = this.frames[playerVehicle(this.world).id];
    const listener = meFrame ? toMap(meFrame.pos) : playerVehicle(this.world).pos;
    this.soundRing.update(this.world.terrain, this.world.player.contacts, listener, this.world.turn, performance.now());
    this.beaconPulse.update(this.world.terrain, this.world.player.beacon, listener, performance.now());
    if (hide) return;
    const me = playerVehicle(this.world);
    const s = vehicleStats(this.world, me);
    const sel = s.weapons.filter((m) => this.selected.includes(m.part.id));
    this.weaponRange.set(this.world.terrain, vehicleOrigins(me), sel);
    this.zones.update(this.world.terrain, me.pos, me.heading, zoneSpeedOf(me), zoneHalfAngle(s, me.speed));
    const hover = this.hoverGround;
    const color = hover ? throttleColor(this.world, me, hover) : PAL.plan;
    this.zones.hover(this.world.terrain, hover, color);
  }
}
