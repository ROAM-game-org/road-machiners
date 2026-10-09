
export type NoteId = 'wagonBowl' | 'wagonNose' | 'wagonRoad' | 'wagonFound' | 'greenPit' | 'glassTank' | 'burntConvoy'
  | 'pinAsk'
  | 'pinStamp'
  | 'pinRoster'
  | 'bendOffers'
  | 'bendKaplan'
  | 'bendAsh'
  | 'cratesAsk'
  | 'cratesLid'
  | 'cratesTally'
  | 'cratesFiles';

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
  pinAsk: {
    title: 'The swivel from Emil Kessel\'s wreck',
    from: 'Mara Kessel, Salvage Yard post',
    text: 'Mara Kessel wants the gun mount from her brother Emil\'s wreck on the north road. The wreck was stripped before she got there. She does not say why she wants the mount, only that it carries one pin.',
  },
  pinStamp: {
    title: 'How to know a Nose ring',
    from: 'Otto Brann, Ridge Wrecks',
    text: 'Otto Brann says a Nose swivel ring carries the gate stamp on its flat and a single pin hole. A Brann ring has a small mark and a second pin. Emil Kessel asked Otto about a second pin the winter before he died.',
  },
  pinRoster: {
    title: 'The roster, copied twice',
    from: 'The crane office, Salvage Yard',
    text: 'A drawer in the Administrator\'s crane office holds Captain Silver\'s patrol roster. It is copied twice in one small hand, and the copy bears the name M. Kessel.',
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
  cratesAsk: {
    title: 'Hook crates and wheel crates',
    from: 'Constance Pierce, Nose office',
    text: 'Constance Pierce says the old Pierce yard crated the Old Army\'s stripped guns. Wheel crates went to a crossroads dealer. Hook crates went north. She wants to know who ordered the hook crates.',
  },
  cratesLid: {
    title: 'A lid with a hook and a Brann mark',
    from: 'Otto Brann, Ridge Wrecks',
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
};

export type LocalId = 'ruben' | 'hattie' | 'dag' | 'kovac' | 'lena' | 'ibo' | 'pin_mara' | 'bend_silver' | 'crates_constance';

export type LocalDef = { id: LocalId; name: string; role: string; town: string; quest: string };

export const LOCALS: Record<LocalId, LocalDef> = {
  ruben: { id: 'ruben', name: 'Ruben', role: 'Canal warden', town: 'bowl', quest: 'bowl_ruben' },
  hattie: { id: 'hattie', name: 'Hattie', role: 'Keeps the well house', town: 'bowl', quest: 'bowl_hattie' },
  dag: { id: 'dag', name: 'Dag', role: 'Bowl Farmers patrol', town: 'bowl', quest: 'bowl_dag' },
  kovac: { id: 'kovac', name: 'Sergeant Kovac', role: 'Dispatcher', town: 'nose', quest: 'nose_kovac' },
  lena: { id: 'lena', name: 'Lena', role: 'Mechanic', town: 'nose', quest: 'nose_lena' },
  ibo: { id: 'ibo', name: 'Old Ibo', role: 'Radio man', town: 'nose', quest: 'nose_ibo' },
  pin_mara: { id: 'pin_mara', name: 'Mara Kessel', role: 'Post officer', town: 'salvage-yard', quest: 'yard_mara' },
  bend_silver: { id: 'bend_silver', name: 'Captain Silver', role: 'Commands the Nose post', town: 'salvage-yard', quest: 'yard_silver' },
  crates_constance: { id: 'crates_constance', name: 'Constance Pierce', role: 'Head underwriter', town: 'nose', quest: 'nose_constance' },
};
