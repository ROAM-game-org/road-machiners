
export type NoteId = 'wagonBowl' | 'wagonNose' | 'wagonRoad' | 'wagonDag' | 'wagonFound' | 'wagonPin' | 'greenPit' | 'glassTank' | 'burntConvoy'
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
    text: 'The radio came off Nose Army wagon Seven, which ran water drums from the Pump Station to Bowl and went dark on the bend in the Bowl north road. Its crew reported raiders and the cannon lost over the edge, and command wrote it off. The scavenger said the cannon is still on the wagon. Kovac did not pay to hear more.',
  },
  wagonRoad: {
    title: 'A dead Army wagon in a hollow',
    from: 'A driver on the radio',
    text: 'A driver saw a dead Army wagon lying in a hollow north-east of Bowl, east of the Bowl north road and south of the Pump Station turn-off. Old tracks with chain marks cross the hollow.',
  },
  wagonDag: {
    title: 'Where wagon Seven lies',
    from: 'Dag, Bowl Farmers patrol',
    text: 'Dag says wagon Seven lies in a hollow below the bend in the Bowl north road, south of the Pump Station turn-off. He warns not to take anything from it up to Nose.',
  },
  wagonPin: {
    title: 'The pin from wagon Seven',
    from: 'The hollow off the Bowl north road',
    text: 'The gun mount on wagon Seven had a seat for one locking pin. The pin snapped, and its stub came out of the ring. The Army mechanics at Nose fit those mounts.',
  },
  wagonFound: {
    title: 'Wagon Seven written off',
    from: 'Sergeant Kovac, Nose dispatch',
    text: 'Kovac says wagon Seven is written off by order, and what is left on it is the finder\'s. He logs what he sees at Lena\'s bench.',
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
    title: 'A tanker to the top terraces',
    from: 'Jory Baptiste, at Bowl',
    text: "Jory says the household's tanker fills up at the Pump Station every week, and its loads go in nobody's book. He has not seen it unload. He has seen how green their kitchen gardens are in a dry year.",
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
    text: "The pump brings up less every season, and Bowl's trucks get less too. Every hose at the pump has a meter except the household tanker's, and every truck that fills goes in Agnes's book by name, yours too. The Senate ordered the tanker's meter off in autumn, and the gap in the book has grown every week since. The big dial counts the week's whole total, and you read it. Your name is beside the number.",
  },
  pipeDraw: {
    title: 'A tanker in no book',
    from: "Agnes's copy of the pump book",
    text: "Agnes's copy matches her book, down to your name beside this week's dial. On the last page she ran the numbers forward as a guess: if the pump keeps falling and the tanker keeps growing, Bowl's trucks get almost nothing by next autumn.",
  },
  pipeOffer: {
    title: 'Money to lose the copy',
    from: 'Aurel Brede, steward to the household',
    text: "The household's steward offered money to lose Agnes's copy on the road. He said the patrol at the Bowl gate will open it if he sends word. His offer stands until Bowl.",
  },
  pipeCanal: {
    title: "Mirela's book in Bowl",
    from: 'Mirela Duarte, Bowl lock house',
    text: "Every barrel Agnes loaded onto Bowl's trucks reached Mirela's trough, so Agnes's hose column is honest. The dial is the other half, and you read it. Mirela will read every number to the Senate and try to win back the canal families' job of sharing out the trough.",
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

export const TERMS: Record<string, string> = {
  bowl: 'A farm town cut in terraces down the inside of an old crater. Canals carry the water to the fields, and the well house sells it by the bucket.',
  nose: 'The town up the north road, built around a wreck on a mountain. Its soldiers keep the order, and its workshop line builds the basin\'s engines and guns.',
  pierce: 'The outfit that bets on trucks coming home. It insures a truck only with a gun on it, and pays the family when the truck does not come back.',
  granary: 'Where Bowl keeps its grain. Bowl pays its patrols from the grain count, and its farmers pay their debts in sorghum.',
  glass_flats: 'A glass desert out east, off the south road. Drivers wear dark lenses cut from its glass against the glare, and a field of old escape pods lies at its edge.',
  fallen_sun: 'The crater where the ship came down, before anyone now living was born. People in the basin still count the years from it.',
  sunward: 'Believers who worship whatever lies in the crater of the Fallen Sun. They keep others away from it.',
  senate: 'The council of Bowl\'s citizens, and it decides for the whole town. Only citizens sit in it, and it is known for slow, long arguments.',
  farmers: 'Bowl\'s own road patrol. It guards the roads near Bowl\'s walls and nothing past them.',
  pump_station: 'A pumpworks out on the flat. Its pumps lift water from deep rock, and water trucks carry it to Bowl\'s canals.',
  committee: 'The Central Committee governs Nose. It plans the town\'s work and rations its food and water.',
  salvage_yard: 'A yard of stacked wrecks under a crane, where towed trucks end up. Its repair crews sell hull pieces and the Old Army\'s stripped guns.',
  kiln: 'Kiln Camp, the raider camp in the south. Its riders take a fee from haulers who pay, and strip trucks that neither pay nor fight.',
  scrapjaw: 'Scrapjaw Camp, a raider camp far up north. Like Kiln in the south, it takes what it needs from the roads.',
  old_army: 'The army that stood between Nose and Bowl after their war and kept the roads. It is gone now, and its trucks still stand where they stopped.',
  guild: 'The Guidestar Guild carries messages across the basin, by courier and by radio relay, for a fee. It serves every side.',
  old_world: 'The world before it fell apart. Its roads, canals and ruins are still here, and nobody can build like them now.',
};
