
export type NoteId = 'wagonBowl' | 'wagonNose' | 'wagonRoad' | 'wagonFound' | 'greenPit' | 'glassTank' | 'burntConvoy'
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

export type LocalId = 'ruben' | 'hattie' | 'dag' | 'kovac' | 'lena' | 'ibo' | 'courierTamsin' | 'namesLusa' | 'hooksPim';

export type LocalDef = { id: LocalId; name: string; role: string; town: string; quest: string };

export const LOCALS: Record<LocalId, LocalDef> = {
  ruben: { id: 'ruben', name: 'Ruben', role: 'Canal warden', town: 'bowl', quest: 'bowl_ruben' },
  hattie: { id: 'hattie', name: 'Hattie', role: 'Keeps the well house', town: 'bowl', quest: 'bowl_hattie' },
  dag: { id: 'dag', name: 'Dag', role: 'Bowl Farmers patrol', town: 'bowl', quest: 'bowl_dag' },
  kovac: { id: 'kovac', name: 'Sergeant Kovac', role: 'Dispatcher', town: 'nose', quest: 'nose_kovac' },
  lena: { id: 'lena', name: 'Lena', role: 'Mechanic', town: 'nose', quest: 'nose_lena' },
  ibo: { id: 'ibo', name: 'Old Ibo', role: 'Radio man', town: 'nose', quest: 'nose_ibo' },
  courierTamsin: { id: 'courierTamsin', name: 'Tamsin Roe', role: 'Guild courier', town: 'nose', quest: 'nose_courier' },
  namesLusa: { id: 'namesLusa', name: 'Lusa Fenwick', role: 'Reads the names', town: 'bowl', quest: 'bowl_names' },
  hooksPim: { id: 'hooksPim', name: 'Pim Arslan', role: 'Glass cutter', town: 'salvage-yard', quest: 'salvage_hooks' },
};
