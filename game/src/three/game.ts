
import * as THREE from "three";
import { CONFIG, PLAY_EASE } from "../config";
import { QUESTS, relanguageQuest } from "../sim/quests";
import { getSearchAction } from "../ui/hud-readout";
import { PHYSICS } from "../data/physics";
import {
  restFrame,
  TURN_STEPS,
  type DriveSnapshot,
  type TurnResult,
} from "../phys/drive";
import {
  framePoints, staleFrame,
  groundPoint,
  toMap,
  type TurnFrames,
  type V3,
  type VehicleFrame,
} from "../phys/frames";
import { driveSnapshotOf, type PreparedTurn } from "../phys/turn";
import { playerTrucks, playerVehicle, vehicleById } from "../sim/damage";

import { inOverdrive, isStranded, maxTurn, vehicleStats } from "../sim/stats";
import { clickOrder } from "../sim/steering";
import type { Vehicle, World } from "../sim/types";
import { grayRadius, playerSees, tileOf } from "../sim/vision";
import type { Vec } from "../sim/vec";
import { TERRAIN } from "../data/terrain";
import { isTowed, setBeacon, unhitch } from "../sim/tow";
import { inCombat } from "../sim/combat";
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
import { ShaderWarmup } from "./shader-errors";
import { Hud } from "../ui/hud";
import { hasExplorationMap } from "../sim/settings";
import { Minimap } from "../ui/minimap";
import { minimapSetting } from "../ui/minimap-setting";
import type { RadioPanel } from "../ui/radio";
import { aimActions, HoverHold, InspectPin, SLOT_KEYS, toggleBodyAim, vehicleMarks, WeaponPanel, weaponsForClick } from "../ui/weapons";
import { TRAVEL_SPEED_CODES } from "../ui/travel-speed";
import { CameraRig, KeyPan, TruckFollow } from "./render/camera";
import { addScatter } from "./render/scatter";
import { FogView } from "./render/fog";
import { Fx3D, TruckFx } from "./render/fx";
import { aimedTarget, CollisionCues, collisionSteps, scoreEventMs, gunfireSeen, hookLine, playCookOff, playCrashes, playShotFx, playUtilitySounds, posesOf, shotAimsOf, volleySeen, type CombatHost } from "./volley";
import { Labels, VehicleMarkers } from "./render/labels";
import { ObstacleViews } from "./render/obstacles";
import { CraterViews } from "./render/craters";
import { playBreak } from "./render/partDebris";
import { BreakCues, shownItems, type PartBreak } from "./breakCues";
import { PathView } from "./render/path";
import { firstTurnColor, PlanPreparation, throttleColor } from "./plan-preview";
import { RenderScope, SightLimit } from "./render/scope";
import { addSites } from "./render/sites";
import { SiteLights } from "./render/siteLights";
import { addShipDecks } from "./render/ship-decks";
import { terrainMesh } from "./render/terrain";
import { type WebGLSurface } from "./webgl";
import { FRAME_REBUILDS, type RebuildBudget } from "./render/vehicle";
import { TruckViews } from "./truck-views";
import { HoverArcsView, vehicleOrigins, WeaponRangeView } from "./render/weaponRange";
import { stormTintStyle, WeatherView } from "./render/weather";
import { stormShare } from "../sim/weather";
import { ZonesView } from "./render/zones";
import type { SoundSettings } from "../ui/sound";
import { CLOUD_SHADOWS } from "./render/cloudShadows";
import { daylightAt, enableSunShadows, lightScene, RadioLights, VehicleLights, sunLight, vehicleLampsOn } from "./render/daylight";
import { sunAt } from "../sim/sun";
import { ContactsView } from "./render/contacts";
import { CloudViews } from "./render/clouds";
import { UtilityAim } from "./utility-aim";
import { ShadeView } from "./render/shade";
import { BeaconPulseView } from "./render/beaconPulse";
import { SoundRingView } from "./render/soundRing";
import { reportError } from "./crash";
import { GameSaves, TURN_FAILED_NOTE, type Run } from "./save";
import { GameMenu } from "../ui/game-menu";
import { unstuckReason } from "../ui/unstuck-reason";
import { getUnstuck } from "../sim/unstuck";
import { confirmedEndRun, DeathScreen, deathShows } from "../ui/death";
import { MIX } from "../data/sounds";
import type { CombatMusic } from "./combat-music";
import { computeEngineGlide, EngineStrain, musicPlaceAt, SoundDirector, SoundLoops, stingOf } from "./sound";
import type { SoundPlayer } from "../audio/player";
import { cameraSetting } from "../ui/camera-setting";
import { isBrowserChord, uiRoot } from "../ui/dom";
import { subscribeInputMode, touchMode } from "../ui/input-mode";
import { installTouchTips } from "../ui/touch-tip";
import { TouchGestures, type TouchIntent } from "./touch-map";
import { touchTapAction } from "./touch-tap";
import { swallowNextClick } from "./ghost-click";
import { PickRing } from "./render/pick-ring";
import { RescueAreaView } from "./render/rescue-area";
import { PointerPicker } from "./pointer";
import { HostileSighting } from "./hostile-sighting";
import { lightTurnOf, MOVE_MS, nextSightSample, threatsIn, type Travel, turnClockOf, type Playback, type LiveVision } from "./travel";
import { heldPlayMs, PlayClock } from "./play-clock";


const PICK_PX = 30;
const MIN_ZONE_HALF_ANGLE = Math.PI / 12;

type TurnPhase = ReturnType<UiHost["getTurnPhase"]>;

const stepMs = (step: number) => (step / PHYSICS.stepsPerSecond) * 1000;

const GUN_HEIGHT = 1.6;

export class Game {
  private world: World;
  private drive: DriveSnapshot;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly sun = sunLight();
  private readonly sky = new THREE.HemisphereLight();
  private readonly play = new PlayClock(PLAY_EASE);
  private readonly vehicleLights = new VehicleLights(this.scene);
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
  private readonly ground = new THREE.Group();
  private readonly props = new THREE.Group();
  private readonly scopes: RenderScope[];
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
  private panelOpen = false;
  readonly loops: SoundLoops;
  private readonly hostileSighting = new HostileSighting();
  private sightingToSound = false;
  private readonly engineStrain = new EngineStrain();
  private readonly trucks = new TruckViews(this.scene, this.rebuilds);
  private readonly radioLights = new RadioLights();
  private frames: Record<string, VehicleFrame> = {};
  private anim: Playback | null = null;
  private turnStart: World | null = null;
  private crashCues: CollisionCues | null = null;
  private breakCues = new BreakCues([]);
  private phase: TurnPhase = null;
  private readonly weaponRange = new WeaponRangeView(PAL.select, READY_ARC_BIT);
  private readonly hoverArcs: HoverArcsView;
  private readonly view: HTMLElement;
  private readonly markers: VehicleMarkers;
  private live: LiveVision | null = null;
  private hoverGround: Vec | null = null;
  private touchPreview: Vec | null = null;
  private readonly touch = new TouchGestures();
  private readonly picker = new PointerPicker({
    world: () => this.world,
    hit: (x, y, object) => this.rig.hitDistance(x, y, object),
    views: this.trucks.views,
    visible: (v) => this.isVehicleVisible(v),
    radiusPick: (x, y) => this.pickVehicle(x, y)?.id ?? null,
  });
  private hovered: string | null = null;
  private readonly hoverHold = new HoverHold((id) => this.setHovered(id), 400);
  private readonly pin = new InspectPin(() => this.onInspectChange(), (v) => this.isVehicleVisible(v));
  private readonly pickRing = new PickRing();
  private selected: string | null = null;
  private readonly sightLimit: SightLimit;
  readonly follow: TruckFollow;
  private planFor: World | null = null;
  private readonly plans = new PlanPreparation();
  private last = performance.now();
  private pending: ((w: World) => World | null) | null = null;

  readonly hud: Hud;
  private minimap: Minimap | null = null;
  private readonly hitCard: HitCard;
  private readonly weapons: WeaponPanel;
  readonly screens: ModalScreens;
  private readonly context: TruckContext;
  private readonly menu: GameMenu;
  private readonly death: DeathScreen;
  private readonly saves: GameSaves;

  constructor(world: World, run: Run, container: HTMLElement, overlay: HTMLElement, player: SoundPlayer, readonly music: CombatMusic, private readonly soundSettings: SoundSettings, radio: RadioPanel, surface: WebGLSurface, private readonly travel: Travel) {
    this.renderer = new THREE.WebGLRenderer({ canvas: surface.canvas, context: surface.context, antialias: true, stencil: true });
    this.world = world;
    this.saves = new GameSaves(run, (text) => this.hud.note(this.world, text, "bad"), (text) => this.hud.note(this.world, text, "dim"));
    this.drive = driveSnapshotOf(this.world);
    setTimeout(() => this.plans.warm(this.world.terrain));

    subscribeInputMode(() => this.refreshUi());
    installTouchTips(uiRoot(), touchMode);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    enableSunShadows(this.renderer);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    container.appendChild(this.renderer.domElement);
    this.view = container;
    this.rig = new CameraRig(this.renderer.domElement);
    this.shaders = new ShaderWarmup(this.renderer, this.scene, this.rig.camera, reportError);
    this.follow = new TruckFollow(this.rig, new KeyPan(this.ignoresKey), this.renderer.domElement);

    this.scene.background = new THREE.Color(PAL.bg);
    this.renderer.domElement.classList.add("view");
    this.scene.add(this.sky, this.sun, this.sun.target, this.pickRing.mesh);

    this.sightLimit = new SightLimit(this.world.size);
    const groundScope = new RenderScope(this.ground, this.world.size, this.sightLimit, false, false);
    const propScope = new RenderScope(this.props, this.world.size, this.sightLimit, true, true);
    this.craters = new CraterViews(this.world, this.sightLimit, this.scene);
    this.scopes = [groundScope, propScope, this.craters.scope];
    const groundChunks = terrainMesh(this.world, groundScope);
    this.siteLights = new SiteLights(this.scene, addSites(this.world.terrain, propScope, this.play), { worldSize: this.world.size, maxTextureSize: this.renderer.capabilities.maxTextureSize });
    addShipDecks(this.world.terrain, propScope);
    this.obstacles = new ObstacleViews(propScope, this.world.terrain, () => this.screens.pinOutpost());
    this.obstacles.sync(this.world.obstacles, this.world.salvage, this.world.broken);
    addScatter(this.world.terrain, this.world.obstacles, propScope);
    this.fog = new FogView(this.world, groundChunks, this.sightLimit);
    this.path = new PathView(this.world.terrain);
    this.rescueAreas = new RescueAreaView(this.world.terrain);
    this.shade = new ShadeView(this.world, groundChunks, this.play);
    this.weather = new WeatherView(this.world);
    this.hoverArcs = new HoverArcsView(overlay, this.rig);
    this.scene.add(this.ground, this.props, this.shade.mesh, this.weather.root, this.zones.root, this.path.root, this.rescueAreas.root, this.weaponRange.root);
    this.scene.add(this.hoverArcs.root, this.contacts.root, this.clouds.root, this.utilityAim.root, this.soundRing.root, this.beaconPulse.root);
    this.markers = new VehicleMarkers(overlay, this.rig);
    overlay.append(this.vignette, this.stormTint);
    this.labels = new Labels(overlay);
    this.fx = new Fx3D(this.scene, overlay, this.rig, () => this.world);
    this.truckFx = new TruckFx(this.fx);
    this.controls = new TruckControls({ world: () => this.world, apply: (next) => this.apply(next), commit: (next) => { this.world = next; this.refreshUi(); }, refreshPlan: () => this.refreshPlan(), doused: () => { this.truckFx.douse(); this.hud.pushEvents(this.world); }, note: (text) => this.hud.refuse(text), revved: () => this.loops.rev(playerVehicle(this.world).chassisId) });
    this.context = new TruckContext({
      world: () => this.world,
      playing: () => this.anim !== null,
      apply: (next) => this.apply(next),
      pushEvents: () => this.hud.pushEvents(this.world),
      note: (text) => this.hud.refuse(text),
      openTrade: (id) => this.screens.trade.openWith(id),
      openTown: () => this.screens.town.open(),
      openOutpost: () => this.screens.outpost.open(),
      openDowned: (id) => this.screens.inventory.openDowned(this.world, id),
      openLoot: (id) => this.screens.inventory.openLoot(id),
    });
    this.sound = new SoundDirector(player, this.rig, music, () => player.now());
    this.loops = new SoundLoops(player, music);

    const host = this.uiHost();
    this.weapons = new WeaponPanel(host);
    this.screens = new ModalScreens(host, () => this.menu.isOpen());
    this.hud = new Hud({
      openInventory: () => this.runKey("KeyI"),
      openCharacter: () => this.runKey("KeyC"),
      openJournal: () => this.runKey("KeyJ"),
      openMap: () => this.runKey("KeyM"),
      toggleManual: () => this.runKey("KeyR"),
      toggleAutoRepair: () => this.runKey("KeyP"),
      toggleOverdrive: () => this.runKey("KeyO"),
      toggleHeadlights: () => this.runKey("KeyL"),
      headlightsOn: () => this.world.player.headlights,
      douseEngine: () => this.runKey("KeyG"),
      firstAid: () => this.runKey("KeyU"),
      unhitch: () => this.rescueCommand((w) => (w.player.state === "active" && isTowed(w) ? unhitch(w) : null)),
      setBeacon: (on) =>
        this.rescueCommand((w) =>
          playerCanAct(w) && (!on || isStranded(w, playerVehicle(w)))
            ? setBeacon(w, on)
            : null,
        ),
      endRun: () => this.rescueCommand(confirmedEndRun),
      isBusy: () => this.anim !== null,
      autoTravel: () => this.travel.isAuto(this.world),
      dialogue: { world: () => this.world, inspected: () => this.inspected(), busy: () => this.anim !== null || this.screens.quest.isOpen(), talk: (next) => this.runRescue(() => next), commit: (next) => { this.world = next; this.saves.logWorld(next); this.refreshUi(); }, log: (next) => this.hud.pushEvents(next), playHorn: (id, delayMs) => this.playHorn(id, delayMs) },
      recenter: () => this.runKey("KeyF"),
      unpin: () => this.unpin(),
      cardAction: (action) => this.context.onCard(action, this.inspected()),
      ...aimActions({ world: () => this.world, selected: () => this.selected, canAim: () => this.anim === null && playerCanAct(this.world), apply: (next) => this.applyRefusable(next) }),
    }, radio, this.renderer);
    minimapSetting().subscribe(() => this.syncMinimap());
    this.hitCard = new HitCard(this.hud.getExchangeRoot());
    this.hoverHold.watch(this.hud.getInspectionRoot());
    const saves = this.saves.menuActions(() => this.world);
    this.menu = new GameMenu({ ...saves, unstuck: { reason: () => unstuckReason(this.world, this.anim !== null, this.screens.quest.isOpen()), run: () => this.getUnstuck() } }, () => this.anim !== null, () => this.world.setup, this.hud.tipSwitch(), {
      report: () => this.hud.openFeedback(),
    }, this.soundSettings);
    this.death = new DeathScreen(saves);

    this.bindInput();
    window.addEventListener("resize", () => this.fitView());
    new ResizeObserver(() => this.fitView()).observe(container);
    this.fitView();
    this.refreshUi();
    void this.renderer.compileAsync(this.scene, this.rig.camera).then(() => requestAnimationFrame((t) => this.tick(t)), reportError);
  }

  private uiHost(): UiHost {
    return {
      world: () => this.displayWorld(),
      apply: (next) => this.applyCommand(next),
      announce: (next) => {
        this.applyCommand(next);
        this.hud.pushEvents(next);
        const sting = stingOf(next.events, playerVehicle(next).id);
        if (sting) this.sound.ui(sting);
      },
      selectedWeapon: () => this.selected,
      selectWeapon: (id) => { if (this.anim || this.modalOpen()) return; this.selected = id; this.refreshUi(); },
      selectedUtility: () => this.utilityAim.selectedId,
      selectUtility: (id) => this.selectUtility(id),
      pressTurn: () => this.pressTurn(),
      releaseTurn: () => this.releaseTurn(),
      runKey: (code) => this.runKey(code),
      searchStock: (id) => this.searchFromLoot(id),
      autoTravel: () => this.travel.isAuto(this.world), travelSpeedIndex: () => this.travel.getSpeedIndex(), travelPlaySpeed: () => (this.travel.isAuto(this.world) ? this.travel.getSpeed(performance.now(), CONFIG.travelFastSpeed) : null), stepTravelSpeed: (delta) => this.travel.stepSpeed(delta),
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
    this.refreshUi();
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

  private displayWorld(): World {
    return this.anim && !this.anim.impacts ? this.anim.before : this.world;
  }

  private refreshUi(): void {
    this.uiStale = false;
    this.menu.refresh();
    const me = playerVehicle(this.world);
    if (this.selected && !vehicleStats(this.world, me).weapons.some((mw) => mw.part.id === this.selected)) this.selected = null;
    if (!this.anim) {
      timed("fog", () => this.fog.update(this.world));
      this.shade.update(this.world);
    }
    this.syncMinimap();
    timed("minimap", () => this.minimap?.update(this.displayWorld()));
    if (!this.anim || this.anim.impacts)
      this.obstacles.sync(this.world.obstacles, this.world.salvage, this.world.broken);
    this.craters.sync(this.world);
    this.hud.renderTop(this.displayWorld());
    this.hud.markCombat(inCombat(this.world, playerVehicle(this.world)));
    this.hud.renderRescue(this.displayWorld());
    if (!this.anim && deathShows(this.world)) this.death.show(this.world);
    this.weapons.render();
    this.screens.render();
    const { action, count, index } = this.context.shown();
    this.hud.renderAction(action, count, index, this.displayWorld(), () => this.runKey("KeyE"), (step) => this.runKey(step === 1 ? "ArrowRight" : "ArrowLeft"));
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
    this.hud.showInfo(w, v, v ? hostileToPlayer(w, v) : false);
    this.hitCard.render(w, v ? v.id : null);
  }

  private placeHitCard(): void {
    const f = this.frames[this.inspected() ?? ""];
    if (this.anim !== null || this.modalOpen() || !f)
      return this.hitCard.hide();
    this.hitCard.show();
  }

  private orderPoint(): V3 | null {
    const order = playerVehicle(this.anim ? this.anim.before : this.world).order;
    return order === null || order.kind === "brake" ? null : groundPoint(this.world.terrain, order.dest);
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
      if (e.code === "Space" && !this.modalOpen()) {
        e.preventDefault();
        if (!e.repeat) this.pressTurn();
      }
      this.runKey(e.code);
    });
  }

  private pressTurn(): void {
    if (this.death.isShown() || this.modalOpen()) return;
    if (this.travel.pressTurn(this.travel.isPlaying(this.anim), this.world)) this.endTurn();
  }

  private releaseTurn(): void {
    this.travel.release(performance.now());
  }

  private searchFromLoot(stockId: string): void {
    const action = getSearchAction(this.world, this.world.salvage.find((s) => s.id === stockId)!);
    this.screens.inventory.close();
    this.context.searchStock(stockId, action.combat);
  }

  private runKey(code: string): void {
    const key = this.keys[code];
    if (!key || (key.noModal && (key.inventoryOk ? this.blockingModalOpen() : this.modalOpen())) || (key.idle && this.travel.isPlaying(this.anim))) return;
    if (key.inventoryOk && this.screens.inventory.isOpen()) this.screens.inventory.close();
    key.run();
  }

  private readonly keys: Record<string, { run: () => void; noModal?: true; idle?: true; inventoryOk?: true }> = {
    KeyF: { run: () => this.follow.recenter() },
    KeyV: { run: () => cameraSetting().toggle() },
    KeyQ: { run: () => this.weapons.toggleAuto(), noModal: true },
    KeyX: { run: () => this.weapons.toggleVisible(), noModal: true },
    ...Object.fromEntries(Object.entries(TRAVEL_SPEED_CODES).map(([code, delta]) => [code, { run: () => this.weapons.stepTravelSpeed(delta), noModal: true as const }])),
    Digit0: { run: () => this.weapons.selectWeapon(null), noModal: true },
    ...Object.fromEntries(Array.from({ length: SLOT_KEYS }, (_, i) => [`Digit${i + 1}`, { run: () => this.weapons.pressKey(i + 1), noModal: true as const, idle: true as const }])),
    KeyE: { run: () => this.context.use(), noModal: true, inventoryOk: true },
    ArrowLeft: { run: () => this.cycleContext(-1), noModal: true, idle: true },
    ArrowRight: { run: () => this.cycleContext(1), noModal: true, idle: true },
    KeyR: { run: () => this.controls.toggleManual(), noModal: true, idle: true },
    KeyP: { run: () => this.controls.toggleAutoRepair(), noModal: true, idle: true },
    KeyO: { run: () => this.controls.toggleOverdrive(), noModal: true, idle: true },
    KeyG: { run: () => this.controls.douseEngine(), noModal: true, idle: true },
    KeyU: { run: () => this.controls.firstAid(), noModal: true, idle: true },
    KeyL: { run: () => this.controls.toggleHeadlights(), noModal: true },
    KeyN: { run: () => this.context.onCard('mark', this.inspected()), noModal: true, idle: true },
    KeyB: { run: () => this.context.onCard('lookOver', this.inspected()), noModal: true, idle: true },
    KeyC: { run: () => !this.anim && this.screens.toggleCharacter("skills"), idle: true },
    KeyM: { run: () => !this.anim && hasExplorationMap(this.world) && this.screens.toggleCharacter("map"), idle: true },
    KeyJ: { run: () => !this.anim && this.screens.toggle(this.screens.journal), idle: true },
    KeyI: { run: () => !this.anim && this.screens.toggle(this.screens.inventory), idle: true },
    Escape: { run: () => { if (this.screens.town.isOpen()) this.screens.town.back(); else if (this.modalOpen()) this.screens.closeAll(null); else this.unpin(); this.selectUtility(null); } },
  };

  unpin(): void {
    this.pin.clear();
  }

  private selectUtility(id: string | null): void {
    if (this.anim || (id !== null && this.modalOpen())) return;
    this.utilityAim.select(id);
    this.refreshUi();
  }

  private updateStopCue(): void {
    if (this.picker.updateCue(this.canClick())) this.renderer.domElement.style.cursor = this.picker.stopCue ? "pointer" : "";
  }

  private canClick(): boolean {
    return !this.anim && !this.modalOpen() && playerCanAct(this.world);
  }

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
    const point = this.canClick() && this.utilityAim.pointPending();
    if (this.modalOpen() || action.kind !== "ground" || point) return this.touchTap(x, y);
    const p = this.rig.groundUnder(x, y, this.ground);
    if (this.canClick() && p) this.apply(setMoveOrder(this.world, clickOrder(this.world.terrain, p, true, playerVehicle(this.world))));
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
      utilityPoint: this.canClick() && this.utilityAim.pointPending(),
      pickRadius: PICK_PX,
    });
    if (tap.kind !== "preview") this.touchPreview = null;
    switch (tap.kind) {
      case "pin":
        swallowNextClick();
        return this.pinVehicle(tap.id);
      case "aim":
        return this.aimVehicle(tap.id);
      case "preview":
        this.touchPreview = { x, y };
        this.hoverGround = tap.at;
        return;
      case "place":
        this.hoverGround = null;
        this.utilityAim.click(tap.at);
        return;
      case "click":
        return this.onLeftClick(x, y, false);
    }
  }

  private onLeftClick(x: number, y: number, stop: boolean): void {
    if (this.modalOpen()) return;
    const action = this.picker.action(x, y);
    if (action.kind === "vehicle") return this.clickVehicle(action.id);
    if (!this.canClick()) return;
    switch (action.kind) {
      case "stop":
        return this.apply(setMoveOrder(this.world, { kind: "brake" }));
      case "own":
        return;
      case "ground": {
        const p = this.rig.groundUnder(x, y, this.ground);
        if (p) this.apply(setMoveOrder(this.world, clickOrder(this.world.terrain, p, stop, playerVehicle(this.world))));
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
    if (this.anim || this.modalOpen() || !playerCanAct(this.world)) return false;
    return this.utilityAim.click(this.rig.groundUnder(e.clientX, e.clientY, this.ground));
  }

  private clickVehicle(id: string): void {
    this.pinVehicle(id);
    this.aimVehicle(id);
  }

  private pinVehicle(id: string): void {
    this.pin.click(id);
  }

  private aimVehicle(id: string): void {
    if (this.selected === null || !this.canClick()) return;
    this.applyRefusable(() => toggleBodyAim(this.world, weaponsForClick(this.world, this.selected!), vehicleById(this.world, id)));
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
    if (playerTrucks(this.world).some((truck) => truck.id === v.id)) return true;
    const f = this.frames[v.id];
    if (this.live && f) return this.live.visible.has(tileOf(this.world, toMap(f.pos)));
    return playerSees(this.world, v.pos);
  }

  private pickVehicle(cx: number, cy: number): Vehicle | null {
    let best: Vehicle | null = null;
    let bestD = PICK_PX;
    for (const v of this.world.vehicles) {
      const f = this.frames[v.id];
      if (!f || !this.isVehicleVisible(v)) continue;
      const d = Math.min(...framePoints(f).map((p) => {
        const s = this.rig.screenOf(p);
        return Math.hypot(s.x - cx, s.y - cy);
      }));
      if (d < bestD) {
        best = v;
        bestD = d;
      }
    }
    return best;
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
    if (this.travel.isPlaying(this.anim) || this.modalOpen() || this.world.player.state === "dead") return;
    this.travel.request(this.world, this.drive);
  }

  private updateTravel(): void {
    const threats = threatsIn(this.world).filter((v) => this.isVehicleVisible(v)).map((v) => v.id);
    const { sighted } = this.hostileSighting.observe(this.world.turn, threats);
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
    this.hud.note(this.world, TURN_FAILED_NOTE, "bad");
    reportError(err);
    this.refreshUi();
  }

  private tryBeginTurn(now: number, wasPlaying: boolean): "began" | "none" | "failed" {
    try {
      const held = this.holdsTime();
      const prepared = this.anim ? null : this.travel.takeReady(this.world, this.drive, now, held);
      if (prepared) this.beginTurn(prepared, now, this.travel.getRemainder(wasPlaying));
      return prepared ? "began" : "none";
    } catch (err) {
      this.failTurn(err);
      return "failed";
    }
  }

  private beginTurn(prepared: PreparedTurn, now: number, elapsed: number): void {
    if (this.world.player.quests.live) throw new Error("A turn began under an open scene");
    const { world: played, playback, towed } = this.travel.beginPlayback(this.world, prepared, elapsed, this.frames);
    const world = relanguageQuest(played, QUESTS);
    if (this.saves.changeMapIfMoved(world)) return;
    this.world = world;
    this.saves.logWorld(world);
    this.updateLoops();
    this.anim = playback;
    this.turnStart = playback.before;
    this.saves.beginTurn();
    this.live = { visible: new Set(this.world.player.visible), explored: playback.before.player.explored.slice(), sight: prepared.sight, shown: -1 };
    const seen = (id: string) => this.eventPoint(id) !== null;
    playback.combat = gunfireSeen(this.world.events, seen);
    playback.volley = volleySeen(this.world.events, seen);
    const timed = collisionSteps(world.events, playback.result);
    this.crashCues = new CollisionCues(timed);
    playback.shotAims = shotAimsOf(world.events);
    this.breakCues = new BreakCues(world.events);
    playback.impactAtMs = Math.max(MOVE_MS, playShotFx(this.combatHost(playback.elapsed), this.breakCues));
    playUtilitySounds(this.combatHost(), "start");
    this.sound.timeScoreEvents(world.events, world.player.vehicleId, (e) => scoreEventMs(e, timed, TURN_STEPS, playback.impactAtMs));
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
    timed("fog", () => this.fog.update(this.combatFogWorld()));
    playCrashes(this.combatHost(), this.crashCues, null);
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
      if (e.t !== "destroyed") continue;
      const p = this.eventPoint(e.vehicle);
      if (p) this.fx.explode(p);
    }
    this.playImpactSounds();
    this.hud.pushEvents(this.world);
    const searched = this.world.events.find((e) => e.t === "searched");
    if (searched) this.screens.inventory.openLoot(searched.stock);
    this.uiStale = true;
    for (const b of this.breakCues.rest()) this.playBreak(b);
  }

  private finishPlayback(): void {
    this.anim = null;
    this.sound.clearScoreEvents();
    this.crashCues = null;
    this.breakCues = new BreakCues([]);
    this.phase = null;
    this.saves.afterTurn(this.world);
    const pending = this.pending;
    this.pending = null;
    if (pending) this.runRescue(pending);
    this.hud.flushHorn();
    this.shade.update(this.world);
    this.uiStale = true;
  }

  private getUnstuck(): void {
    this.screens.closeAll(null);
    this.runRescue(getUnstuck);
    this.endTurn();
  }

  private rescueCommand(fn: (w: World) => World | null): void {
    if (this.modalOpen()) return;
    if (this.anim) {
      this.pending = fn;
      return;
    }
    this.runRescue(fn);
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

  private playImpactSounds(): void {
    for (const e of this.world.events) {
      const p = e.t === "destroyed" && this.eventPoint(e.vehicle);
      if (p) this.sound.at("explosion", p, 0);
    }
    const sting = stingOf(this.world.events, playerVehicle(this.world).id);
    if (sting) this.sound.ui(sting);
  }

  private playDriveSound(result: Pick<TurnResult, "frames">): void {
    const me = playerVehicle(this.world);
    const frames = result.frames[me.id];
    const g = computeEngineGlide(frames, MOVE_MS / 1000, MIX, inOverdrive(this.world, me));
    const strain = this.engineStrain.next(this.world.turn, engineOverheating(this.world));
    const running = g && !isStranded(this.world, me) ? g : null;
    this.loops.drive(running, me.chassisId, strain);
    if (running) this.sound.engineStrain(strain);
    if (g?.brake) this.sound.at("air-brake", frames[0].pos, 0);
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
    const open = this.modalOpen();
    if (open !== this.panelOpen) this.sound.ui(open ? (this.world.player.call ? "radio" : "ui-open") : "ui-close");
    this.panelOpen = open;
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

  private eventPoint(id: string): V3 | null {
    const v =
      this.world.vehicles.find((x) => x.id === id) ??
      this.world.removed.find((x) => x.id === id);
    const f = this.frames[id] ?? (v ? restFrame(this.world, v) : null);
    if (!v || !f || !this.canShowCombatVehicle(v)) return null;
    return { x: f.pos.x, y: f.pos.y + GUN_HEIGHT, z: f.pos.z };
  }

  private combatHost(startMs = 0): CombatHost {
    const frames = this.anim?.result.frames ?? {};
    const poses = posesOf(this.world, frames, { moveMs: MOVE_MS, stepMs: stepMs(1), gunHeight: GUN_HEIGHT }, (v) => this.canShowCombatVehicle(v));
    return { world: this.world, fx: this.fx, sound: this.sound, eventPoint: (id) => this.eventPoint(id), onBurst: (p) => this.craters.reveal(p), views: this.trucks.views, breakPart: (b) => this.playBreak(b), poses, startMs, lineHooked: (shooter, weapon) => hookLine(this.world, this.anim, shooter, weapon) };
  }

  private playBreak(b: PartBreak): void {
    if (this.eventPoint(b.vehicle) === null) return;
    if (!this.turnStart) throw new Error(`Part ${b.part} of ${b.vehicle} broke before any turn played`);
    const p = playBreak(this.world, this.turnStart, this.obstacles.parts, this.fx, this.trucks.views.get(b.vehicle), b);
    if (p) this.sound.at("part-broken", p, 0);
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
    if (plan) this.path.set(plan.turns, firstTurnColor(playerVehicle(this.world)), plan.course, plan.waypoint);
  }

  private flushUi(began: string, phase: TurnPhase): void {
    if (this.uiStale && began !== "began" && this.phase === phase) this.refreshUi();
  }

  private advanceTurn(now: number, dt: number): { at: number | null; playMs: number } {
    const held = this.holdsTime();
    if (held) this.travel.pause();
    const speed = this.travel.getSpeed(now, CONFIG.travelFastSpeed);
    const playMs = this.tickWorldClock(heldPlayMs(dt, this.play.isHeld(), CONFIG.playbackFrameMs), speed, now);
    const wasPlaying = this.anim !== null;
    const phase = this.phase;
    this.travel.tickCreep(playMs);
    let at = this.animStep(now, speed, playMs);
    this.updateLiveVision(at);
    this.updateTravel();
    const began = this.tryBeginTurn(now, wasPlaying);
    if (began === "failed") return { at, playMs };
    if (began === "began") {
      at = this.animStep(now, speed, 0);
      this.updateTravel();
    }
    this.settleLateStop(now);
    this.travel.prepareNext(this.world, this.anim, now, this.drive);
    this.flushUi(began, phase);
    return { at, playMs };
  }

  private holdsTime(): boolean {
    return this.timeHeld() || waitsOnPlayer(this.world);
  }

  private timeHeld(): boolean {
    return this.screens.inventory.isOpen() || this.screens.blockingOpen() || this.menu.isOpen() || this.isEditingControl() || document.hidden;
  }

  private tickWorldClock(realMs: number, speed: number, now: number): number {
    const wanted = (this.anim !== null && !this.anim.moved) || this.travel.timeWanted(this.world, now);
    this.play.coast(realMs, wanted, wanted ? speed : 1);
    return this.play.frameMs();
  }

  private tick(now: number): void {
    if (!import.meta.env.DEV) requestAnimationFrame((t) => this.tick(t));
    this.frame(now);
    if (import.meta.env.DEV) requestAnimationFrame((t) => this.tick(t));
  }

  private frame(now: number): void {
    const dt = now - this.last;
    this.last = now;
    this.touchIntent(this.touch.tick(now));
    this.play.beginFrame(this.timeHeld());
    const { at, playMs } = timed("turn-frame", () => {
      const turn = this.advanceTurn(now, dt);
      this.shade.advance();
      return turn;
    });
    const playDt = playMs / 1000;
    const step = at === null ? null : Math.floor(at);
    this.syncVehicles(at, playDt);
    this.obstacles.play(this.anim, step, this.world, this.frames, playDt);
    if (step !== null) playCrashes(this.combatHost(), this.crashCues, step);
    this.drawOverlays();
    const truck = this.frames[playerVehicle(this.world).id].pos;
    const sightRadius = grayRadius(this.world) * PHYSICS.metersPerTile;
    this.sightLimit.set(truck, sightRadius);
    this.rig.leash(truck, sightRadius);
    this.follow.update(truck, cameraSetting().mode() === "auto" ? this.orderPoint() : null, dt, playMs);
    this.hud.showRecenter(!this.follow.isFollowing());
    const daylight = daylightAt(lightTurnOf(this.world, this.anim));
    lightScene(this.sun, this.sky, truck, daylight);
    this.craters.graffiti.light(daylight.sunIntensity);
    this.fx.light({ sun: this.sun, sky: this.sky });
    CLOUD_SHADOWS.sync(this.world, lightTurnOf(this.world, this.anim), this.play.frameMs());
    this.vehicleLights.sync(this.world, this.frames, lightTurnOf(this.world, this.anim), (pos) => this.sightLimit.reaches(pos), truck);
    this.siteLights.sync(!sunAt(this.world.turn), lightTurnOf(this.world, this.anim), this.rig.camera, (pos) => this.sightLimit.reaches(pos), this.rig.focus(), now, this.world);
    Object.assign(this.stormTint.style, stormTintStyle(stormShare(playerVehicle(this.world))));
    this.fx.tick(this.play.frameMs(), dt, this.world);
    this.playPanelSounds();
    this.updateLoops();
    this.weather.sync(this.world, turnClockOf(this.anim));
    this.weather.advance(this.play.frameMs());
    this.labels.update(this.world, this.rig, this.sightLimit);
    for (const scope of this.scopes) scope.update(this.rig.camera);
    this.shaders.render(this.timeHeld());
    this.hud.stepPortraits(this.travel.isPlaying(this.anim));
    this.refreshPlan();
    this.showPlan();
  }

  private syncMinimap(): void {
    const on = minimapSetting().on() && hasExplorationMap(this.world);
    if (on && !this.minimap) {
      this.minimap = new Minimap(() => this.openMap());
    } else if (!on && this.minimap) {
      this.minimap.dispose();
      this.minimap = null;
    }
  }

  private openMap(): void {
    if (this.anim) return;
    this.screens.openCharacter("map");
  }

  private updateLiveVision(step: number | null): void {
    const live = this.live;
    const f = this.frames[playerVehicle(this.world).id];
    if (!live || step === null || !f) return;
    const k = nextSightSample(live, step);
    if (k === null) return;
    const at = toMap(f.pos);
    const player = { ...this.world.player, visible: live.sight.tiles[k], explored: live.explored };
    timed("fog", () => this.fog.updateSight({ ...this.world, player }));
    timed("minimap", () => this.minimap?.update({ ...this.world, player }, { pos: at, heading: playerVehicle(this.world).heading }));
  }

  private animStep(now: number, speed: number, ms: number): number | null {
    const a = this.anim;
    if (!a) return null;
    const elapsed = (a.elapsed += ms);
    this.sound.playDueScoreEvents(elapsed, speed);
    if (elapsed < MOVE_MS)
      return (elapsed / 1000) * PHYSICS.stepsPerSecond - 1;
    if (!a.moved) this.finishMovement(a, now);
    if (elapsed < a.impactAtMs && this.play.isMoving()) return null;
    if (!a.impacts) this.landImpacts(a);
    this.travel.finishClock(elapsed, Math.min(elapsed, a.impactAtMs));
    this.finishPlayback();
    return null;
  }

  private syncVehicles(at: number | null, playDt: number): void {
    const frames: TurnFrames | null = at === null || !this.anim ? null : this.anim.result.frames;
    const landed = !this.anim || this.anim.impacts;
    const glass = daylightAt(lightTurnOf(this.world, this.anim)).glass;
    const now = performance.now();
    this.radioLights.note(this.world, now);
    const shown = [...this.world.vehicles, ...(landed ? [] : this.world.removed)];
    const hidden: Vehicle[] = [];
    for (const [i, v] of shown.entries()) {
      this.pin.note(v, i < this.world.vehicles.length);
      const f = this.shownFrame(v, this.travel.playedFrame(v, this.anim, at));
      this.frames[v.id] = f;
      const seen = landed ? this.isVehicleVisible(v) : this.canShowCombatVehicle(v);
      if (seen) this.lastSeen.set(v.id, this.world.turn);
      const look = this.lookOf(v, f, seen);
      if (!look) {
        hidden.push(v);
        continue;
      }
      const before = !landed && this.anim!.before.vehicles.find((x) => x.id === v.id);
      const display = before ? { ...v, items: shownItems(before.items, v.items, this.breakCues.shown(v.id)) } : v;
      const view = this.trucks.viewOf(v.id, display, seen, this.world.player.paint);
      if (!view) continue;
      view.lamps(vehicleLampsOn(this.world, v, lightTurnOf(this.world, this.anim)));
      view.radio(this.radioLights.lit(v.id, now));
      view.outline(look === "dark");
      view.windows(glass);
      view.pose(f, playDt);
      view.aim((partId) => this.turretAim(v.id, (before || v).weaponOrders, f, partId));
      this.truckFx.emit(this.world, display, f, frames !== null, playDt, seen);
    }
    this.pin.settle();
    this.trucks.park(this.world, hidden);
    this.trucks.prune();
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
    const sel = s.weapons.filter((m) => m.part.id === this.selected);
    this.weaponRange.set(this.world.terrain, vehicleOrigins(me), sel);
    if (!me.direct) this.zones.hideBands();
    else this.zones.update(this.world.terrain, me.pos, me.heading, me.speed, Math.max(MIN_ZONE_HALF_ANGLE, maxTurn(s, me.speed) / 2));
    const hover = this.hoverGround;
    const color = hover ? throttleColor(me, hover) : PAL.plan;
    this.zones.hover(this.world.terrain, hover, color);
  }
}
