
export type NoteId = 'wagonBowl' | 'wagonNose' | 'wagonRoad' | 'wagonFound' | 'greenPit' | 'glassTank' | 'burntConvoy' | 'pipeBook' | 'pipeDraw' | 'pipeOffer' | 'pipeCanal' | 'sackGate' | 'sackStore' | 'sackDrop' | 'lampsLien' | 'lampsOil' | 'countWall' | 'countGap' | 'countRelease' | 'countLog';

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
    text: 'Lena says the water at Green Pit runs clean and nobody guards it.',
  },
  glassTank: {
    title: 'A tank at Glass Flats',
    from: 'Hattie, at the Bowl well house',
    text: 'Hattie swears an Old World tank still runs out at Glass Flats, and that it rolls out at night.',
  },
  burntConvoy: {
    title: 'Burnt Convoy picked clean',
    from: 'Old Ibo, Nose radio shack',
    text: 'Old Ibo says Burnt Convoy was picked clean long ago and nothing is left there worth the fuel.',
  },
  pipeBook: {
    title: 'The pump book',
    from: 'Agnes Ondra, Pump Station',
    text: 'Agnes writes down every meter she reads, and every one is lower than last spring. The Senate made her take her meter off one pipe. She says the pipe still runs.',
  },
  pipeDraw: {
    title: 'A pipe with no meter',
    from: "Agnes's pump book",
    text: "A pipe to the Archon's terrace draws seep water every week. Agnes's book has a line for it each week and no meter reading. The seep falls week after week.",
  },
  pipeOffer: {
    title: 'Coin to lose a bundle',
    from: 'A steward in a Marr coat',
    text: "A steward of the Archon's household offered coin to lose a sealed bundle on the road. He would not say why. He said the offer stands until the Bowl.",
  },
  pipeCanal: {
    title: 'The Canal book at South Lock',
    from: 'Mirela Duarte, South Lock',
    text: "The Canal book holds the same weekly line for the Archon's pipe as the pump book. Mirela's cousin Tomas wrote a patrol report on the valve. It lies on the Archon's desk.",
  },
  sackGate: {
    title: 'Boards on the Granary gate',
    from: 'Odile Marsh, the Granary',
    text: "Odile chalks a pair of counts on the gate each night. One is the sacks paid to Kiln Camp for each armed truck. One is the tenants' share for the road patrol. The sacks leaving the store are more than both add up to.",
  },
  sackStore: {
    title: 'The store book',
    from: 'The Granary weigh house',
    text: 'Each day the same few sacks fall between the store book and the boards. The sentry log and the sacks owed to Kiln match line for line.',
  },
  sackDrop: {
    title: 'The collector and his stick',
    from: 'The Kiln drop',
    text: 'The Kiln collector notches a stick for the carters and notches it again for sacks that never left a cart. A second wagon waits behind the rocks.',
  },
  lampsLien: {
    title: 'Numbers on the lamps',
    from: 'Podfield',
    text: 'Every Podfield lamp carries a Pierce lien number in yellow paint. On one post an older number shows beneath the paint.',
  },
  lampsOil: {
    title: 'Oil for the Bowl',
    from: 'Young Tam, Podfield',
    text: 'The Bowl buys the Podfield lamp oil, and the coin goes to a Pierce clerk. The oil can Tam carries up the ladder gets lighter every week. The last lamp is dry.',
  },
  countWall: {
    title: 'Coats of paint at Old Orchard',
    from: 'The blockhouse wall',
    text: 'The Old Orchard blockhouse wall holds a number painted over a number. This morning the number is one short of the last.',
  },
  countGap: {
    title: 'An empty slot in the third row',
    from: 'Old Orchard motor pool',
    text: 'A truck is gone from the end of the third row. The chocks are still there, with a lien number stenciled on each, and the ground is swept. The gate was shut all night.',
  },
  countRelease: {
    title: 'A release paper with a Marr seal',
    from: 'The Old Orchard gate corporal',
    text: "At dusk a Pierce cart carried a truck out of Old Orchard on a paper sealed by the Archon's household. The patrol let it pass.",
  },
  countLog: {
    title: "Ilya's torn page",
    from: 'Ilya Moreno, Old Orchard',
    text: "A page from the Army's motor pool book. Every quarter the Nose owed the Army fuel, and every quarter the book is marked held.",
  },
};

export type LocalId = 'ruben' | 'hattie' | 'dag' | 'kovac' | 'lena' | 'ibo' | 'agnes' | 'odile';

export type LocalDef = { id: LocalId; name: string; role: string; town: string; quest: string };

export const LOCALS: Record<LocalId, LocalDef> = {
  ruben: { id: 'ruben', name: 'Ruben', role: 'Canal warden', town: 'bowl', quest: 'bowl_ruben' },
  hattie: { id: 'hattie', name: 'Hattie', role: 'Keeps the well house', town: 'bowl', quest: 'bowl_hattie' },
  dag: { id: 'dag', name: 'Dag', role: 'Bowl Farmers patrol', town: 'bowl', quest: 'bowl_dag' },
  kovac: { id: 'kovac', name: 'Sergeant Kovac', role: 'Dispatcher', town: 'nose', quest: 'nose_kovac' },
  lena: { id: 'lena', name: 'Lena', role: 'Mechanic', town: 'nose', quest: 'nose_lena' },
  ibo: { id: 'ibo', name: 'Old Ibo', role: 'Radio man', town: 'nose', quest: 'nose_ibo' },
  agnes: { id: 'agnes', name: 'Agnes Ondra', role: 'Keeps the pump book', town: 'pump-station', quest: 'pump_agnes' },
  odile: { id: 'odile', name: 'Odile Marsh', role: 'Granary steward', town: 'granary', quest: 'granary_odile' },
};
