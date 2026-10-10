
export type NoteId = 'wagonBowl' | 'wagonNose' | 'wagonRoad' | 'wagonFound' | 'greenPit' | 'glassTank' | 'burntConvoy'
  | 'talkGranaryGate'
  | 'talkSeepPipe'
  | 'talkConvoyNotClean'
  | 'talkCraneBook'
  | 'talkPierceGuns'
  | 'talkGlassLean'
  | 'talkSunwardTake'
  | 'talkKilnFight'
  | 'talkOnePin'
  | 'talkArmyStarved'
  | 'talkCommitteeRent'
  | 'pipeBook' | 'pipeDraw' | 'pipeOffer' | 'pipeCanal';

export type NoteDef = { title: string; from: string; text: string };

export const NOTES: Record<NoteId, NoteDef> = {
  wagonBowl: {
    title: 'A scavenger with an Army radio',
    from: 'Hattie, at the Bowl well house',
    text: 'A scavenger came through Bowl selling a Nose Army radio. He said he pulled it off an Army wagon sitting dead in the hills north-east of Bowl. When the Farmers asked where, he left for Nose in a hurry.',
  },
  wagonNose: {
    title: 'Wagon Seven',
    from: 'Sergeant Kovac, Nose dispatch',
    text: 'The radio came off Nose Army wagon Seven, which went dark on the Pump Station run down to Bowl. Its crew walked home with raiders on their heels. The scavenger swore the wagon sits a short hop off the track. Nose never sent anyone to look.',
  },
  wagonRoad: {
    title: 'A dead Army wagon in a hollow',
    from: 'A driver on the radio',
    text: 'A driver saw a dead Army wagon lying in a hollow, closer to the Bowl north road than to the Pump Station track, south of an old farm with a water tower.',
  },
  wagonFound: {
    title: 'Wagon Seven written off',
    from: 'Sergeant Kovac, Nose dispatch',
    text: 'Kovac heard wagon Seven was found and searched. The Army wrote it off long ago, and he does not ask for anything back.',
  },
  greenPit: {
    title: 'Clean water at Green Pit',
    from: 'Lena, Nose mechanic',
    text: 'Lena says the pump outpost at Green Pit sells clean water from deep rock, by the can.',
  },
  glassTank: {
    title: 'A tank at Glass Flats',
    from: 'Hattie, at the Bowl well house',
    text: 'Hattie swears an Old World tank still runs out at Glass Flats, and that it rolls out at night.',
  },
  burntConvoy: {
    title: 'Burnt Convoy picked clean',
    from: 'Old Ibo, Nose radio shack',
    text: 'Old Ibo says the Burnt Convoy was picked clean long ago and the stretch is not worth the fuel.',
  },
  talkGranaryGate: {
    title: 'The same grain paid out twice',
    from: 'Jory Baptiste, at Bowl',
    text: 'Jory says the Granary pays Kiln a sack for each armed truck, and the road patrol is paid from the tenants\' share. He says both are paid from the same grain.',
  },
  talkSeepPipe: {
    title: 'A pipe to the top terraces',
    from: 'Jory Baptiste, at Bowl',
    text: 'Jory says a pipe runs from the Pump Station up to the top terraces, and no meter may read it. He has not seen it. He has seen how green their kitchen gardens are in a dry year.',
  },
  talkConvoyNotClean: {
    title: 'Burnt Convoy is not picked clean',
    from: 'Sefa Krol, at the Salvage Yard',
    text: 'Sefa says the families still pick the old Burnt Convoy stretch every week and the road leaves more. She says Ibo tells drivers it is picked clean so they stay away.',
  },
  talkCraneBook: {
    title: 'A book in the crane office',
    from: 'Sefa Krol, at the Salvage Yard',
    text: 'Sefa says her families took a book of names and sums off a Pierce office truck and sold it to the Salvage Yard. She will not say what it holds. She says the crane office door is shut now.',
  },
  talkPierceGuns: {
    title: 'Pierce sold the guns and the paper',
    from: 'Sefa Krol, at the Salvage Yard',
    text: 'Sefa has heard from a pair of drivers that Pierce sold the Old Army\'s guns north to Scrapjaw, then made every driver buy a gun to get paper. Each driver swears the other lied.',
  },
  talkGlassLean: {
    title: 'Glass that leans one way',
    from: 'Hattie, at the Bowl well house',
    text: 'Hattie says Pim Arslan the lens cutter swears every ripple in the glass at Glass Flats leans one way, toward the Fallen Sun. Her cousin says it points at heaven.',
  },
  talkSunwardTake: {
    title: 'Strangers in the crater',
    from: 'Hattie, at the Bowl well house',
    text: 'Hattie says the Sunward take strangers into the crater and they do not come out. She also says folk come out green at the edges and quiet. She has never followed one in.',
  },
  talkKilnFight: {
    title: 'Kiln lets hard fighters go',
    from: 'Dag, Bowl Farmers patrol',
    text: 'Dag says Kiln riders often let a truck go if it fights hard, and strip one that fights soft. He tells drivers to know which they are.',
  },
  talkOnePin: {
    title: 'The one-pin swivel',
    from: 'Lena, Nose mechanic',
    text: 'Lena says the line\'s steel copy of the Brann swivel has one pin, and on a bend it can slide and swing the gun into the cab.',
  },
  talkArmyStarved: {
    title: 'The Old Army and its hunger',
    from: 'Old Ibo, Nose radio shack',
    text: 'Old Ibo says the Old Army ended hungry, and that Commander Lind read a list of unpaid promises on his last calls. He has heard it said the Army was starved on purpose. He says whoever says so wants a seat in the hall.',
  },
  talkCommitteeRent: {
    title: 'Who pays for Old Orchard\'s tools',
    from: 'Old Ibo, Nose radio shack',
    text: 'Old Ibo says the Guild\'s trust rents Old Orchard\'s machine tools to Nose, and command pays the Guild. He will not repeat what he hears on the air about who pays command.',
  },
  pipeBook: {
    title: 'The pump book',
    from: 'Agnes Ondra, Pump Station',
    text: 'Less water comes up out of the floor every season, and less again reaches the meters Agnes reads. The rest goes up a pipe to the top terrace. The Senate made her take its meter off, and the pipe still runs.',
  },
  pipeDraw: {
    title: 'A pipe with no meter',
    from: "Agnes's copy of the pump book",
    text: "Agnes's copy has the sums her own book doesn't: what goes up the top pipe each season. Run forward, they dry the metered pipes by next autumn.",
  },
  pipeOffer: {
    title: 'Coin to lose a bundle',
    from: 'Aurel Brede, steward to the household',
    text: "The steward of the Archon's household offered coin to lose Agnes's copy on the road. He said the patrol at the Bowl gate opens sealed bundles when he sends word. He said the offer stands until the Bowl.",
  },
  pipeCanal: {
    title: 'The Canal book in Bowl',
    from: 'Mirela Duarte, Bowl lock house',
    text: "Mirela's count at the lock agrees with Agnes's canal meter, season by season. Mirela means to read both books on the Senate floor and win back the canal families' lock share.",
  },
};

export const NOTE_IDS = Object.keys(NOTES) as NoteId[];

export type LocalId = 'ruben' | 'hattie' | 'dag' | 'kovac' | 'lena' | 'ibo' | 'jory' | 'sefa' | 'agnes';

export type LocalDef = { id: LocalId; name: string; role: string; town: string; quest: string };

export const LOCALS: Record<LocalId, LocalDef> = {
  ruben: { id: 'ruben', name: 'Ruben', role: 'Canal warden', town: 'bowl', quest: 'bowl_ruben' },
  hattie: { id: 'hattie', name: 'Hattie', role: 'Keeps the well house', town: 'bowl', quest: 'bowl_hattie' },
  dag: { id: 'dag', name: 'Dag', role: 'Bowl Farmers patrol', town: 'bowl', quest: 'bowl_dag' },
  kovac: { id: 'kovac', name: 'Sergeant Kovac', role: 'Dispatcher', town: 'nose', quest: 'nose_kovac' },
  lena: { id: 'lena', name: 'Lena', role: 'Mechanic', town: 'nose', quest: 'nose_lena' },
  ibo: { id: 'ibo', name: 'Old Ibo', role: 'Radio man', town: 'nose', quest: 'nose_ibo' },
  jory: { id: 'jory', name: 'Jory Baptiste', role: 'Speaks for the tenants', town: 'bowl', quest: 'bowl_jory' },
  sefa: { id: 'sefa', name: 'Sefa Krol', role: 'Trades for the Burnt Convoy families', town: 'salvage-yard', quest: 'yard_sefa' },
  agnes: { id: 'agnes', name: 'Agnes Ondra', role: 'Keeps the pump book', town: 'pump-station', quest: 'pump_agnes' },
};
