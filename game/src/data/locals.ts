
export type NoteId = 'wagonBowl' | 'wagonNose' | 'wagonRoad' | 'wagonFound' | 'greenPit' | 'glassTank' | 'burntConvoy'
  | 'talkGranaryGate'
  | 'talkSeepPipe'
  | 'talkConvoyNotClean'
  | 'talkCraneBook'
  | 'talkPierceGuns'
  | 'talkSunwardNumber'
  | 'talkWestTowns'
  | 'talkClerkWest'
  | 'talkGlassLean'
  | 'talkSunwardTake'
  | 'talkKilnFight'
  | 'talkOnePin'
  | 'talkArmyStarved'
  | 'talkCommitteeRent'
  | 'pinAsk'
  | 'pinStamp'
  | 'pinRoster'
  | 'pinBoots'
  | 'bendOffers'
  | 'bendKaplan'
  | 'bendAsh'
  | 'bendRise'
  | 'cratesAsk'
  | 'cratesLid'
  | 'cratesTally'
  | 'cratesFiles'
  | 'cratesCopy'
  | 'pipeBook' | 'pipeDraw' | 'pipeOffer' | 'pipeCanal' | 'sackGate' | 'sackStore' | 'sackDrop' | 'lampsLien' | 'lampsOil' | 'countWall' | 'countGap' | 'countRelease' | 'countLog'
  | 'sackBeam'
  | 'courierVesna'
  | 'courierLetter'
  | 'courierRider'
  | 'courierKarl'
  | 'namesReading'
  | 'namesDrunk'
  | 'namesBook'
  | 'namesLetter'
  | 'hooksSoldier'
  | 'hooksSheet'
  | 'hooksDrop';

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
    text: 'Old Ibo says Burnt Convoy was picked clean long ago and nothing is left there worth the fuel.',
  },
  talkGranaryGate: {
    title: 'The counts on the Granary gate',
    from: 'Jory Baptiste, at Bowl',
    text: 'Jory says Odile Marsh writes counts on the Granary gate: the sacks paid to Kiln for each armed truck, and the tenants\' share for the road patrol. He says both are paid from the same grain.',
  },
  talkSeepPipe: {
    title: 'A pipe to the top terraces',
    from: 'Jory Baptiste, at Bowl',
    text: 'Jory says a pipe runs from the seep up to the top terraces, and no meter may read it. He has not seen it. He has seen how green their kitchen gardens are in a dry year.',
  },
  talkConvoyNotClean: {
    title: 'Burnt Convoy is not picked clean',
    from: 'Sefa Krol, at the Salvage Yard',
    text: 'Sefa says the families pick Burnt Convoy every week and the road leaves more. She says Ibo tells drivers it is picked clean so they stay away.',
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
  talkSunwardNumber: {
    title: 'The number at the rim',
    from: 'Ines Abend, at Nose',
    text: 'Ines believes the number the Sunward chant at the rim is where the radio count stops. It is larger than this year\'s count. She does not know how they came to it.',
  },
  talkWestTowns: {
    title: 'Western towns with no guns',
    from: 'A Bowl patrol driver, at the Granary',
    text: 'A patrol driver says convoy drivers tell of towns past the canyon whose trucks carry no guns, because a guard paid by every town keeps the roads. Lusa Fenwick brought the tale back. The driver has not been west.',
  },
  talkClerkWest: {
    title: 'The clerk who went west',
    from: 'A Bureau clerk, at Nose',
    text: 'A Bureau clerk says the corridor holds that a Pierce clerk sold the roads of insured trucks to robbers, and was sent west and told to stay. The clerk says the Bureau case is closed.',
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
    text: 'Lena says the line\'s steel copy of the Brann swivel has one pin, and on a bend it can slide and swing the gun into the cab. She says the Salvage Yard bores a second for a fee.',
  },
  talkArmyStarved: {
    title: 'The Old Army and its hunger',
    from: 'Old Ibo, Nose radio shack',
    text: 'Old Ibo says the Old Army ended hungry, and that Commander Lind read a list of unpaid promises on his last calls. He has heard it said the Army was starved on purpose. He says whoever says so wants a seat in the hall.',
  },
  talkCommitteeRent: {
    title: 'Who pays for Old Orchard\'s tools',
    from: 'Old Ibo, Nose radio shack',
    text: 'Old Ibo says the Guild\'s trust rents Old Orchard\'s machine tools to Nose, and command pays the Guild. He says to ask at the Pierce office who pays command. He will not repeat what he hears on the air.',
  },
  pinAsk: {
    title: 'The swivel from Emil Kessel\'s wreck',
    from: 'Mara Kessel, Salvage Yard post',
    text: 'Mara Kessel wants the gun mount from her brother Emil\'s wreck on the north road. The wreck was stripped before she got there. She does not say why she wants the mount, only that it carries one pin.',
  },
  pinStamp: {
    title: 'How to know a Nose ring',
    from: 'Otto Brann, Salvage Yard',
    text: 'Otto Brann says a Nose swivel ring carries the gate stamp on its flat and a single pin hole. A Brann ring has a small mark and a second pin. Emil Kessel asked Otto about a second pin the winter before he died.',
  },
  pinRoster: {
    title: 'The roster, copied twice',
    from: 'The crane office, Salvage Yard',
    text: 'A drawer in the Administrator\'s crane office holds Captain Silver\'s patrol roster. It is copied twice in one small hand, and the copy bears the name M. Kessel.',
  },
  pinBoots: {
    title: 'Boots under the tracks',
    from: 'The north bend',
    text: 'Round Emil Kessel\'s wreck the boot prints of soldiers lie under the tracks of the cab that cut the ring. The soldiers came first, looked at the ring and left it.',
  },
  bendOffers: {
    title: 'Silver wants the bend cleared',
    from: 'Captain Silver, Salvage Yard post',
    text: 'Captain Silver says a man at the north bend stops his Nose drivers and tells them their mounts are bad. Silver wants him gone, and he pays for it.',
  },
  bendKaplan: {
    title: 'Kiln wants the bend cleared',
    from: 'A Kiln rider, for Kaplan',
    text: 'Kaplan of Kiln Camp sent a rider to say the man at the north bend slows the road. Ain wants him gone. Kaplan would rather he left alive, and he pays for it.',
  },
  bendAsh: {
    title: 'The man at the north bend',
    from: 'Ash Kerimov, north bend',
    text: 'Ash Kerimov rode for Scrapjaw once. He sits at the north bend where Emil Kessel died and asks every driver to show the pins of their swivel. He pays for a second pin when a driver cannot.',
  },
  bendRise: {
    title: 'A crate above the narrow corner',
    from: 'The rise above the north bend',
    text: 'At dusk a Nose cart left a crate of greased Army rifles in the rocks above the narrow corner of the north bend. A bundle of new Kiln red cloth lay on the lid.',
  },
  cratesAsk: {
    title: 'Hook crates and wheel crates',
    from: 'Constance Pierce, Nose office',
    text: 'Constance Pierce says the old Pierce yard crated the Old Army\'s stripped guns. Wheel crates went to a crossroads dealer. Hook crates went north. She wants to know who ordered the hook crates.',
  },
  cratesLid: {
    title: 'A lid with a hook and a Brann mark',
    from: 'Otto Brann, Salvage Yard',
    text: 'Otto Brann strapped the hook crates for the yard and signed each strap. He kept a lid. It has a hook burned in and chalk on its edge that reads north gate, by L.',
  },
  cratesTally: {
    title: 'The crane book',
    from: 'Sully Okafor, Salvage Yard',
    text: 'The old yard tally in the crane office lists hook crates leaving by the north gate, week after week. Each line ends with a sealed order and one initial, L.',
  },
  cratesFiles: {
    title: 'Dell Marr\'s last page',
    from: 'The Pierce filing room, Nose',
    text: 'The Pierce filing room keeps the crate manifests in Dell Marr\'s hand. His last line ends mid-word, and the pages after it were cut out with a blade.',
  },
  cratesCopy: {
    title: 'Mara Kessel\'s old case',
    from: 'Sully Okafor, crane office',
    text: 'The second copy of Mara Kessel\'s Bureau case lies in a drawer of the crane office. Each insured truck was filed at the Nose office in the morning and stopped on the road that night. The clerk who filed them was sent west by order of the underwriting floor, with the initial L beside the line.',
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
    title: 'The Canal book in Bowl',
    from: 'Mirela Duarte, Bowl lock house',
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
  sackBeam: {
    title: 'A filed poise on the Granary beam',
    from: 'The Granary weigh house',
    text: 'The poise weight on the weighing block is a hand lighter than its stamp. Bright file marks run along its edge. Nobody says who held the file.',
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
  courierVesna: {
    title: 'A new rider on the south bend',
    from: 'Vesna Hale, Guild courier',
    text: 'Vesna says Kiln riders take the trucks that run alone. A new rider holds the south bend this season, and his truck carries a Brann swivel.',
  },
  courierLetter: {
    title: 'A letter for Kiln Camp',
    from: 'Tamsin Roe, Guild courier',
    text: 'Tamsin carries a thick letter capped with a Burnt Convoy tin seal. It is addressed to Karl Vosk, care of Kiln Camp.',
  },
  courierRider: {
    title: 'The new rider asked about the bag',
    from: 'Haulers at the Green Pit tables',
    text: 'The new Kiln rider sat at Green Pit last week with his rifle left on his truck. He asked what the courier bag carries. He had never seen the Guild stripe.',
  },
  courierKarl: {
    title: 'The rider read his letter',
    from: 'The south bend',
    text: 'The rider on the south bend wears an Army coat with red thread at the cuff. He read the Burnt Convoy letter on his fender and asked Tamsin to tell Sefa that he eats and he rides.',
  },
  namesReading: {
    title: 'The Reading of Names',
    from: 'Lusa Fenwick, at the Bowl well',
    text: 'Lusa reads the names of the dead at Canyon Bridge once a year: Hal Sorensen, Jens Vosk, Brother Anselm, Wendell Ondra and Emil Kessel. Drivers answer each name from their cabs.',
  },
  namesDrunk: {
    title: 'Who shot Hal Sorensen',
    from: 'A drunk man at the Canyon Bridge toll hut',
    text: 'A drunk man says Karl Vosk, the younger Vosk, shot Hal Sorensen below the bridge. He says Jens only held the wheel. He kept a spent Old Army brass from the road.',
  },
  namesBook: {
    title: 'Dario Feld\'s book',
    from: 'Lusa Fenwick, at Canyon Bridge',
    text: 'The old convoy master wrote that on the day before Hal was shot, a pair of men in Army coats watched the trucks from the rise below the bridge. The younger had red thread at his cuff.',
  },
  namesLetter: {
    title: 'Hal\'s last letter',
    from: 'Lusa Fenwick, at Canyon Bridge',
    text: 'Hal wrote that a stranger offered him a rifle for grain. He would not pay for a thing he did not ask for.',
  },
  hooksSoldier: {
    title: 'A Nose soldier at the hooks',
    from: 'Pim Arslan, at the Salvage Yard stalls',
    text: 'A Nose soldier from Silver\'s post sits by the hooks at Green Pit and writes. Hadiza Okon wants to know what he writes and who reads it.',
  },
  hooksSheet: {
    title: 'What the soldier writes',
    from: 'The hooks at Green Pit',
    text: 'The soldier writes a stamp, wheel or hook, and the face that hung each rifle. Yard crews sit beside Kiln riders on every line.',
  },
  hooksDrop: {
    title: 'Where the sheet goes',
    from: 'Silver\'s post, inside the Salvage Yard',
    text: 'The soldier hands his sheet to a clerk at Silver\'s post. The clerk pins it by the captain\'s door, and a second hand inks a line under it: Yard crews drink with raiders.',
  },
};

export type LocalId = 'ruben' | 'hattie' | 'dag' | 'kovac' | 'lena' | 'ibo' | 'jory' | 'bo' | 'sefa' | 'ines' | 'granaryDriver' | 'bureauClerk' | 'pin_mara' | 'bend_silver' | 'crates_constance' | 'agnes' | 'odile' | 'courierTamsin' | 'namesLusa' | 'hooksPim';

export type LocalDef = { id: LocalId; name: string; role: string; town: string; quest: string };

export const LOCALS: Record<LocalId, LocalDef> = {
  ruben: { id: 'ruben', name: 'Ruben', role: 'Canal warden', town: 'bowl', quest: 'bowl_ruben' },
  hattie: { id: 'hattie', name: 'Hattie', role: 'Keeps the well house', town: 'bowl', quest: 'bowl_hattie' },
  dag: { id: 'dag', name: 'Dag', role: 'Bowl Farmers patrol', town: 'bowl', quest: 'bowl_dag' },
  kovac: { id: 'kovac', name: 'Sergeant Kovac', role: 'Dispatcher', town: 'nose', quest: 'nose_kovac' },
  lena: { id: 'lena', name: 'Lena', role: 'Mechanic', town: 'nose', quest: 'nose_lena' },
  ibo: { id: 'ibo', name: 'Old Ibo', role: 'Radio man', town: 'nose', quest: 'nose_ibo' },
  jory: { id: 'jory', name: 'Jory Baptiste', role: 'Speaks for the tenants', town: 'bowl', quest: 'bowl_jory' },
  bo: { id: 'bo', name: 'Bo Lindqvist', role: 'Granary truck driver', town: 'bowl', quest: 'bowl_bo' },
  sefa: { id: 'sefa', name: 'Sefa Krol', role: 'Trades for the Burnt Convoy families', town: 'salvage-yard', quest: 'yard_sefa' },
  ines: { id: 'ines', name: 'Ines Abend', role: 'Lunar Society', town: 'nose', quest: 'nose_ines' },
  granaryDriver: { id: 'granaryDriver', name: 'Patrol driver', role: 'Bowl road patrol', town: 'granary', quest: 'granary_driver' },
  bureauClerk: { id: 'bureauClerk', name: 'Bureau clerk', role: 'Order Bureau records', town: 'nose', quest: 'nose_clerk' },
  pin_mara: { id: 'pin_mara', name: 'Mara Kessel', role: 'Post officer', town: 'salvage-yard', quest: 'yard_mara' },
  bend_silver: { id: 'bend_silver', name: 'Captain Silver', role: 'Commands the Nose post', town: 'salvage-yard', quest: 'yard_silver' },
  crates_constance: { id: 'crates_constance', name: 'Constance Pierce', role: 'Head underwriter', town: 'nose', quest: 'nose_constance' },
  agnes: { id: 'agnes', name: 'Agnes Ondra', role: 'Keeps the pump book', town: 'pump-station', quest: 'pump_agnes' },
  odile: { id: 'odile', name: 'Odile Marsh', role: 'Granary steward', town: 'granary', quest: 'granary_odile' },
  courierTamsin: { id: 'courierTamsin', name: 'Tamsin Roe', role: 'Guild courier', town: 'nose', quest: 'nose_courier' },
  namesLusa: { id: 'namesLusa', name: 'Lusa Fenwick', role: 'Reads the names', town: 'bowl', quest: 'bowl_names' },
  hooksPim: { id: 'hooksPim', name: 'Pim Arslan', role: 'Glass cutter', town: 'salvage-yard', quest: 'salvage_hooks' },
};
