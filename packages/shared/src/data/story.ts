/**
 * The whole story: 48 main missions in three chapters, the side missions and every clue.
 * Objectives read as what a person would do next. Nothing here explains the plot: players connect it.
 */
export type MapId = 'hollow' | 'valley' | 'ridge';
export interface Mission { id: string; chapter: 1 | 2 | 3; objective: string; why: string; /** One line telling the player what to actually do. */ how: string }

export const MISSIONS: Mission[] = [
  // Chapter 1: The Hollow.
  { id: 'find_light', chapter: 1, objective: 'Find a light', why: 'They wake in total darkness', how: 'Something is flickering in the dark. Walk to it and press E.' },
  { id: 'find_others', chapter: 1, objective: 'Find the others', why: 'Nobody knows who is hurt or missing', how: 'Search this chamber for any sign of them.' },
  { id: 'leave_cave', chapter: 1, objective: 'Get out of the cave', why: 'They need help and the camp is outside', how: 'Follow the passage toward the daylight.' },
  { id: 'find_camp', chapter: 1, objective: 'Find the camp', why: 'The camp has supplies and a radio', how: 'The camp stood to the east, by the river. Follow the trail downhill.' },
  { id: 'find_sharp', chapter: 1, objective: 'Find something sharp', why: 'They just saw what lives here', how: 'Flint lies on the river bank. Look for dark, glassy stones.' },
  { id: 'make_blade', chapter: 1, objective: 'Make a blade', why: "A pocketknife won't cut wood or stop an animal", how: 'Open your pack with Tab and choose Knap a blade.' },
  { id: 'make_axe', chapter: 1, objective: 'Make a hand axe', why: 'They need wood before dark', how: 'Gather a branch and fern fibre, then lash them in your pack.' },
  { id: 'prepare_night', chapter: 1, objective: 'Prepare for the night', why: 'The sun is dropping and it is getting cold', how: 'Gather for a fire, make a bow drill, and light it in the cave mouth.' },
  { id: 'survive_night', chapter: 1, objective: 'Survive until morning', why: 'Things are moving outside', how: 'Stay by the fire and keep it fed. It holds them back.' },
  { id: 'find_water', chapter: 1, objective: 'Find water', why: 'Thirst is rising after the night', how: 'Go down to the river and drink.' },
  { id: 'boil_water', chapter: 1, objective: 'Make a pot and boil water', why: 'River water makes people sick', how: 'Clay from the bank, shaped and fired, will hold water over a flame.' },
  { id: 'find_food', chapter: 1, objective: 'Find food', why: 'Hunger slows work', how: 'Set a snare, trap fish, or take from a kill before its owner comes back.' },
  { id: 'make_safe', chapter: 1, objective: 'Make the cave safe', why: 'Last night proved fire alone will not hold', how: 'Scout every way in: the mouth, and wherever that flooded passage goes.' },
  { id: 'door_materials', chapter: 1, objective: 'Gather door materials', why: 'A door needs poles, lashing, stone and clay', how: 'Fell young trees with the axe and dig the deep chamber with a stone pick.' },
  { id: 'build_door', chapter: 1, objective: 'Build the hidden door', why: 'The main mouth must close and be invisible', how: 'Frame it, lattice it, hang the counterweight, then hide it under moss and mud.' },
  { id: 'seal_tunnel', chapter: 1, objective: 'Seal the side tunnel, then survive the night', why: 'The second way in is still open', how: 'Wade into the flooded tunnel and block it before dark.' },
  // Chapter 2: The Drowned Valley.
  { id: 'follow_marks', chapter: 2, objective: 'Follow the marks', why: "Someone else was here, and it's the only lead", how: 'The arrows point west. Keep going past the edge of everything you know.' },
  { id: 'cross_river', chapter: 2, objective: 'Cross the river', why: 'The marks continue on the far bank', how: 'Nobody wades that. Build a raft: logs, rope, a pole to push with.' },
  { id: 'end_of_marks', chapter: 2, objective: 'Reach the end of the marks', why: 'The arrows get closer together', how: 'Stay with the arrows on the west bank.' },
  { id: 'search_camp', chapter: 2, objective: 'Search the camp', why: 'Anything here could help them survive', how: 'Go through the tents, the graves and whatever is left on the tables.' },
  { id: 'recover_pages', chapter: 2, objective: 'Recover the scattered pages', why: 'A journal lies torn open and pages are missing', how: 'Wind and animals have spread them around the camp.' },
  { id: 'repair_radio', chapter: 2, objective: 'Repair the field radio', why: 'A radio is the closest thing to contact with anyone', how: 'The only batteries that fit are in the flashlight. Light, or radio.' },
  { id: 'first_shard', chapter: 2, objective: 'Find the first shard', why: 'The pages say the shards might open the way back', how: 'Hold the compass. The needle twitches toward them.' },
  { id: 'forward_camp', chapter: 2, objective: 'Build a forward camp', why: 'The floodplain is too far to reach and return before dark', how: 'A fire ring, a stake barricade and a hidden place to sleep.' },
  { id: 'plain_shard', chapter: 2, objective: 'Get the floodplain shard', why: 'The compass points into the herds\' migration path', how: 'Use the herd as cover by day, or go at night when the herds sleep and the raptors do not.' },
  { id: 'find_calloway', chapter: 2, objective: 'Find out what happened to Calloway', why: 'A page says "Calloway took the high ground"', how: 'Look for a way up into the canopy.' },
  { id: 'explore_treehouse', chapter: 2, objective: 'Explore the treehouse', why: 'Someone lived up here for a long time', how: 'Walk the platforms. Read what she left.' },
  { id: 'read_knife_page', chapter: 2, objective: 'Read the page pinned with a knife', why: "It was left where it couldn't be missed", how: 'At the end of the last walkway.' },
  { id: 'widow_shard', chapter: 2, objective: "Take the shard from the Widow's den", why: 'Calloway\'s map marks it there', how: 'Go at night, when she is out hunting, and get out before she comes back.' },
  { id: 'bone_shard', chapter: 2, objective: 'Take the shard from the Bone Flats', why: "The last mark on the map is in Old Scar's feeding ground", how: 'By daylight only. Lure him off with fresh meat, or wait in hiding for him to sleep.' },
  { id: 'bring_home', chapter: 2, objective: 'Bring the shards home', why: 'Four shards are safer behind the hidden door', how: 'A long, loaded trip east, back to the cave.' },
  { id: 'find_signal', chapter: 2, objective: 'Find where the signal comes from', why: 'The radio changes when the shards are near', how: 'Keep the shards together. The radio and the compass both point west.' },
  // Chapter 3: The Second Sun.
  { id: 'follow_signal', chapter: 3, objective: 'Follow the signal', why: "It's the only voice from home", how: 'Hold the radio. It gets louder when you face the source.' },
  { id: 'cross_ash', chapter: 3, objective: 'Cross the ash fields', why: 'The ridge is on the other side', how: 'Loose ash slides under loud steps. Pitons and rope will get you up the scarp.' },
  { id: 'hot_springs', chapter: 3, objective: 'Make camp at the hot springs', why: "The slope is cold and there's nowhere else to rest", how: 'Warm water and a ledge you can defend.' },
  { id: 'climb_summit', chapter: 3, objective: 'Climb toward the summit', why: 'The voice is clearer with every step', how: 'Keep climbing with the radio in your hand.' },
  { id: 'find_source', chapter: 3, objective: 'Find the source', why: 'Something here is answering the shards', how: 'Search the scorched ground at the top.' },
  { id: 'when_rift', chapter: 3, objective: 'Work out when the rift opens', why: "Whitcombe's notes say it needs a storm, but not when", how: 'Read the notes, then watch the night sky from the summit.' },
  { id: 'find_copper', chapter: 3, objective: 'Find copper', why: 'A ring needs wire, and theirs is long gone', how: 'The veins are inside the lava tubes. So are the Pectinodon.' },
  { id: 'smelt', chapter: 3, objective: 'Build a clay furnace and smelt it', why: 'Raw copper is useless as it is', how: 'Clay and stone, then a long hot burn. At night the glow carries for kilometres.' },
  { id: 'make_wire', chapter: 3, objective: 'Make wire', why: "Copper lumps won't carry a lightning strike", how: 'Bore a stone and draw the metal through it. Slow, and loud.' },
  { id: 'raise_mast', chapter: 3, objective: 'Raise the lightning mast', why: "The storm's power has to reach the ring", how: 'Fell the tallest dead tree and haul it up with ropes.' },
  { id: 'wire_array', chapter: 3, objective: 'Wire the array', why: 'Okafor knows how the original was built', how: 'Mount the four shards in the ring and connect them to the mast.' },
  { id: 'test_array', chapter: 3, objective: 'Test it in a small storm', why: 'They get one chance with the big storm, so they must test first', how: 'Close the switch when lightning walks up the ridge.' },
  { id: 'ground_array', chapter: 3, objective: 'Ground the array', why: 'The test nearly melted it', how: 'Run a copper spike into the hot springs.' },
  { id: 'fortify', chapter: 3, objective: 'Fortify the summit', why: 'The big storm will last hours and everything will come', how: 'Barricades, a fire ring and traps. You place them.' },
  { id: 'hold_storm', chapter: 3, objective: 'Keep the array alive through the storm', why: 'It needs three strikes in a row to stay open', how: 'Repair what burns out, stay away from what comes for you.' },
  { id: 'through_rift', chapter: 3, objective: 'Get through the rift', why: "It's open, and it won't stay open", how: 'Old Scar is on the summit. Lure him, bury him or burn him, then run.' },
];

/** Index of the first mission of each chapter, in mission order. */
export const CHAPTER_START = { 1: 0, 2: 16, 3: 32 } as const;
export const missionIndex = (id: string) => MISSIONS.findIndex((m) => m.id === id);

export interface Side { id: string; chapter: 1 | 2 | 3; title: string; hint: string; soloOnly?: boolean }

export const SIDES: Side[] = [
  { id: 'papers', chapter: 1, title: "Read Varga's expedition papers", hint: 'Her bag survived the jump.' },
  { id: 'compass', chapter: 1, title: 'Follow the compass', hint: 'Every needle points to the same spot in the deep chamber.' },
  { id: 'striker', chapter: 1, title: 'Pyrite fire striker', hint: 'Flint on pyrite makes sparks. Faster and quieter than the drill.' },
  { id: 'lookout', chapter: 1, title: 'Build a lookout on the ridge', hint: 'From up there you could watch what moves and when.' },
  { id: 'nest', chapter: 1, title: 'Scout the raptor nest', hint: 'Knowing the pack is survival. High risk.' },
  { id: 'medicine', chapter: 1, title: "Hale's medicine", hint: 'Bitter bark and moss. Cuts go bad fast here.' },
  { id: 'weir', chapter: 1, title: 'Fish trap', hint: 'A stone weir in the river shallows means steady food.' },
  { id: 'glasses', chapter: 1, title: 'The glasses', hint: 'Something shines at the raptor nest.', soloOnly: true },
  { id: 'tape', chapter: 1, title: 'Cassette log', hint: 'Hold the recorder and click at places that matter.' },
  { id: 'herds', chapter: 2, title: 'Track the herds', hint: 'Crossing the floodplain at the wrong time gets you trampled.' },
  { id: 'caches', chapter: 2, title: "Calloway's caches", hint: 'Twelve small marks on her map, with no explanation.' },
  { id: 'rounds', chapter: 2, title: 'The six rounds', hint: 'One cache holds six rifle cartridges from 1938.' },
  { id: 'trouble', chapter: 2, title: 'A cry from the swamp', hint: 'Someone is calling for help.' },
  { id: 'photos', chapter: 2, title: 'Photograph the animals', hint: 'Fifteen shots. Proof no one will ever believe.' },
  { id: 'garden', chapter: 2, title: "Hale's medicine garden", hint: 'Healing plants, grown near the forward camp.' },
  { id: 'weapons', chapter: 2, title: 'Better weapons', hint: 'Stone axes will not stop a Dakotaraptor.' },
  { id: 'bury', chapter: 2, title: 'Bury the 1938 dead properly', hint: 'The graves were dug up by scavengers.' },
  { id: 'nest_clear', chapter: 3, title: 'Clear the Pectinodon nest', hint: 'The copper is in their tunnels.' },
  { id: 'last_cache', chapter: 3, title: "Calloway's last cache", hint: "Her map's final mark is near the summit." },
  { id: 'remedies', chapter: 3, title: 'Hot spring remedies', hint: 'Burns and infection are everywhere on the ridge.' },
  { id: 'last_teammate', chapter: 3, title: 'The last missing teammate', hint: 'Tracks lead into the lava tubes.', soloOnly: true },
  { id: 'film', chapter: 3, title: 'The full roll of film', hint: 'Some animals only appear on the ridge.' },
];

export interface Clue { id: string; title: string; body: string; line?: string }

const C = (id: string, title: string, body: string, line?: string): Clue => ({ id, title, body, line });

const list: Clue[] = [
  // The opening.
  C('array', 'The Kessler Array', 'Crushed and fused into solid limestone, as if the cave had grown around it overnight. The serial plate reads KESSLER ARRAY MK II. The coil housing is still warm.', 'That was bolted to the floor.'),
  C('papers', "Varga's expedition papers", 'Contract, Meridian Geophysical Institute, June 1969. Survey of magnetic anomaly, Garfield County, Montana. Funded in full by A. Whitcombe, Whitcombe Industries. Equipment supplied by sponsor.'),
  C('recorder', 'Cassette, field log', '"July twenty-fourth. Thunderheads over the ridge. June says the array is stable at sixty percent. We will run the full test tonight whether Hale likes it or not. Field readings are... odd. Every compass in camp agrees with every other compass, and all of them are wrong."'),
  C('compass', 'The compass', 'The needle does not point north. It points back into the rock, toward the deep chamber, and it will not settle.'),
  C('radio', 'Transistor radio', 'Static on every band from 530 to 1600. No KBLG. No Bismarck. No aircraft. Nothing at all, anywhere.'),
  C('dragmarks', 'Marks in the silt', 'Two parallel furrows lead from where someone lay toward the passage. Heels. Whoever it was did not walk.', 'Someone was dragged.'),
  C('footprint', 'A footprint', 'Three toes. Big as a bathtub. Water is still seeping into it.', 'That is still filling.'),
  C('noriver', 'Where the camp stood', 'Tents, the generator, the truck: this is where they were. There is a river here now, and it looks like it has always been here.', 'This is where the camp was.'),
  C('fire', 'First fire', 'Fire keeps them at the edge of the light. It also shows them exactly where the light is.'),
  C('crate', 'Survey crate', 'Meridian stencil on the lid. Inside, a pocketknife, a lighter with a dry wick and a Polaroid camera with one full pack of film. Fifteen shots.'),
  // Chapter 1, the rest.
  C('sick', 'River water', 'Cramps inside the hour. Hale was right. Nothing from that river goes down without boiling.'),
  C('crystal', 'The dark crystal', 'Set into the wall of the deep chamber where every needle points, a fragment of something black and glassy. It is warm. It hums in the teeth when you hold it.', 'It hums.'),
  C('pyrite', 'Pyrite', 'Struck against flint, it throws fat orange sparks. No bow, no sawing, no noise worth the name.'),
  C('bark', 'Bitter bark', 'Numbs the tongue. Packed with wet moss, it keeps a cut from going bad. Hale has seen worse things work in the Highlands.'),
  C('lookout', 'From the lookout', 'The whole valley is laid out. By day something enormous works the tree line by the river. By night, small shapes leave the bowl in the northwest, always by the same three paths.'),
  C('nest', 'The raptor nest', 'Scraped hollows, shell and old bone. Five adults at least, maybe more. Three worn paths lead out, and one of them points straight at the cave.', 'Five of them. At least.'),
  C('glasses', 'Horn-rimmed glasses', 'June always pushed these up with a knuckle. Cracked across the left lens, and lying in a raptor scrape with nothing around them.', 'Those are June\'s.'),
  C('tags', 'Dog tags', "HALE, MARCUS T. The chain is snapped. They were lying in a raptor scrape with nothing around them.", 'Those are Hale\'s.'),
  C('old_canteen', 'Rusted canteen', 'US Army pattern, 1936. Rust has gone all the way through. Nobody has been down this tunnel in a very long time, and somebody has.'),
  C('spectacles', 'Round spectacles', 'Wire frames, one lens missing, the other crazed by age. Somebody would have been nearly blind without these.'),
  C('scratched', 'Scratched into the rock', 'Behind the moss, cut deep with something hard: "A.W. 1938. DON\'T TRUST HIM."', 'Nineteen thirty-eight.'),
  C('tape_array', 'Cassette: the array', '"The housing is cold now. June would want a number for it. I do not have a number."'),
  C('tape_print', 'Cassette: the print', '"Three digits, deep heel, stride I would put at five metres. I have seen this foot. It was in a museum, and it was stone."'),
  C('tape_deep', 'Cassette: the deep chamber', '"Banded iridium-rich clay, the same seam we cored at Hell Creek. Except here it is not above the fossils. It has not been laid down yet."'),
  C('tape_nest', 'Cassette: the nest', '"Whispering. Five adults. I would give a year of my life for ten minutes with a notebook and a rifle, in that order."'),
  C('tape_ridge', 'Cassette: the ridge', '"No contrails. No fence lines. No Big Dipper, either. Not the one I know."'),
  C('marks', 'The arrows', 'The raptors stripped the ferns off bare rock beside the door. Under them, old arrows cut into the stone, all pointing west, each one marked A.W.', 'A.W.'),
  // Chapter 2.
  C('camp1938', 'The collapsed camp', 'Rotted canvas on rotted poles. Bolt-action rifles racked and rusted solid. Someone here kept very good order for a very long time, and then stopped.'),
  C('roster', 'Typed roster', 'WHITCOMBE EXPEDITION, MAY 1938. A. Whitcombe, leader. R. Calloway, surveyor. T. Lindqvist, geologist. H. Booker, engineer. J. Maddox, cook. E. Sayre, medical.', 'Six names.'),
  C('graves', 'Four grave markers', 'Lindqvist. Booker. Maddox. Sayre. Four boards, cut with care. Nobody carved one for Whitcombe, or for Calloway.', 'Four graves.'),
  C('rifles', 'The rifle rack', 'Springfields, 1903 pattern. Not one round left in the crates. Whatever they fired at, they fired at it until there was nothing left to fire.'),
  C('field_radio', 'The 1938 field radio', 'A valve set in a teak case. The dry batteries have burst. The bay would take two D cells.'),
  C('page_1', 'Page, first', '"Day 3. The Stone took us as Mr. W. said it would, and left the mountain behind. Booker laughed until he was sick. We are the first."'),
  C('page_2', 'Page, second', '"Day 41. W. says the Stone was never whole. It broke in the jump. There are shards out in the valley and the needle will find them. Without them there is no way home."'),
  C('page_3', 'Page, third', '"Day 112. Maddox went to the river for water. We found his boots."'),
  C('page_4', 'Page, fourth', '"Day 190. Four shards, W. thinks, in the marsh, on the plain, in the den and on the flats. Lindqvist has sketched where. He will not go himself."'),
  C('page_5', 'Page, fifth', '"Day 300. Sayre\'s leg has gone bad and there is nothing for it. W. has stopped sitting with us at night. He works on the coil and does not talk."'),
  C('page_6', 'Page, sixth', '"Day 402. Calloway took the high ground with the last of the rope. She says the ground is for things that eat. I should have gone with her."'),
  C('page_7', 'Page, seventh', '"Day 455. Booker gone in the night. W. says he walked. Nobody walks here at night."'),
  C('page_8', 'Page, eighth', '"Day 460. W. has the shards he needs, he says. He will not say how many he has. I do not like how he looks at the radio."'),
  C('radio_tone', 'The tone', 'It works. A faint slow pulse from somewhere west, under the static. It is not natural, and it is not the Morse code of any year you know.', 'That is not static.'),
  C('shard_1', 'First shard', 'A splinter of the same black glass as the crystal from the deep chamber, warm through the cloth.', 'Same stone.'),
  C('shard_2', 'Second shard', 'Half buried in trampled mud. When it comes near the first one, both grow warmer and the compass swings.'),
  C('shard_3', 'Third shard', 'It was lying in the Widow\'s scrape among bones that are not all animal.'),
  C('shard_4', 'Fourth shard', 'Under a rib cage the size of a tent. All four together, the compass needle spins without stopping.'),
  C('tally', 'The tallies', 'Scratched into a trunk, in fives. Then into the next trunk, and the next. More than eleven thousand days, and the hand gets worse.'),
  C('traps', 'Working traps', 'Rope snares, re-tied in plant fibre, some of it not very old. They still work. She was very good at this.'),
  C('calloway_map', "Calloway's map", 'A survey sheet covered edge to edge in fine pencil. The last two shards. A den, marked with a drawing of a scarred head. A dry lake. Twelve small marks with no key.', 'She mapped all of it.'),
  C('green_lights', 'Drawings of green lights', 'Page after page of curtains of light over the mountains, dated by her own count, with the compass bearing beside each one. She knew they mattered.'),
  C('knife_page', 'The page pinned with a knife', 'In a neat hand, dated 1939: "I have one shard, and the rift will carry one man. I am going home. I have sealed it behind me so nothing follows. A.W." And under it, pressed hard into the paper in another hand: "He left us here."', 'He left us.'),
  C('same_man', 'The same man', 'A. Whitcombe, 1938, on a roster. A. Whitcombe, 1969, on a contract.', "It's the same name."),
  C('signal_voice', 'The voice', '"This is Abel Whitcombe. It\'s 1969. If you can hear me, bring them to the ridge."'),
  C('both_docs', 'Both halves', 'The man who paid for the survey and the man who left his team here are one person, and he is speaking from your own year.', "It's the same man."),
  C('calloway_weapons', 'Calloway on weapons', '"Stone axes are for wood. Char a spear point, plait a sling, pack green fronds round an ember for smoke, and smear on mud so they cannot smell you. A rifle is for the day you are willing to bring everything."'),
  C('herds', 'The herds', 'Watched from the bank: they leave the marsh at first light, cross the plain by noon and lie down at dusk in the east. It keeps to the hour.'),
  C('locket', 'The locket', 'Dug up from under the Sayre marker. Inside, a tiny photograph: six people on a dig in 1938, and behind them a younger man you have seen in a boardroom portrait. Handwriting on the back: "All six. Montana."'),
  C('rescue', 'What they said', '"I don\'t know how long. There was water and then there was a light. I heard the others. Please, not back there."'),
  C('cache_1', 'Cache: the first mark', '"If you found this you can read. Good. Dry tinder keeps in a sealed gourd."'),
  C('cache_2', 'Cache: the second mark', '"Year 3. Eat the small things. The big things are not for you."'),
  C('cache_3', 'Cache: the third mark', '"Year 6. Everything hunts by the nose. Mud works. So does standing still longer than you think you can."'),
  C('cache_4', 'Cache: the fourth mark', '"Year 8. I found the rifle crates W. buried. Six rounds, dry as the day they were packed. He hid them from us."'),
  C('cache_5', 'Cache: the fifth mark', '"Year 11. A scarred female has started following me. She does not hurry. I have been calling her the Widow."'),
  C('cache_6', 'Cache: the sixth mark', '"Year 14. I have stopped talking aloud. It frightened me when I noticed."'),
  C('cache_7', 'Cache: the seventh mark', '"Year 17. The herds change route before the lights come. I think they feel the same thing the needle feels."'),
  C('cache_8', 'Cache: the eighth mark', '"Year 20. Bitter bark, moss, and for a burn, the yellow mud from the hot ground in the west."'),
  C('cache_9', 'Cache: the ninth mark', '"Year 23. I dug up what he left in his tent. Blueprints of a machine. He meant to come back for the shards, or send someone."'),
  C('cache_10', 'Cache: the tenth mark', '"Year 26. There is a new star in the west, low, and it does not move with the others. I have started counting it."'),
  C('cache_11', 'Cache: the eleventh mark', '"Year 29. If it is what I think it is, there is no need for anyone to worry about getting old."'),
  C('cache_12', 'Cache: the twelfth mark', '"Year 30. I am going up the ridge to see his ring. Follow if you can read this. Bring the shards. Do not trust the voice."'),
  // Chapter 3.
  C('ring', 'The ring of stones', 'Carved basalt uprights in a circle twenty paces wide, each cut with the same bracket that held the shards.'),
  C('coil', 'The 1939 coil', 'Hand-wound copper on a timber former, with a maker\'s stamp: WHITCOMBE, 1939. Half of it has been melted to slag.'),
  C('scorch', 'Scorched rock', 'Glass where stone should be. Something here burned hotter than any volcano, once, in one instant.'),
  C('wnotes', "Whitcombe's notes", '"The stones must be wired in a ring and fed the storm. Three strikes in succession. A lesser storm will open it for a heartbeat and no more. It will not come by the calendar. Watch the lights."'),
  C('aurora', 'Green lights', 'Curtains of green over the summit, the same bearing as her drawings, and the compass in your hand is swinging in time with them.', 'That is what she drew.'),
  C('star_day', 'The new star', 'Bright enough to cast a shadow now, and it does not set. You do the arithmetic and then you stop doing the arithmetic.'),
  C('fate', 'In the lava tube', 'A survivor\'s jacket, a Meridian badge, and what the Pectinodon left. There is nothing here to bring back.', 'No.'),
  C('last_note', "Calloway's last note", '"Thirty years. I have seen the ring. It will carry more than one if you are not afraid of it. W. lied about that too. Take the proof home. Make them read it."'),
  C('hot_remedy', 'Hot spring remedy', 'Yellow sulphur mud packed with bark and moss. It burns, and then the fever breaks.'),
  C('test_fired', 'The first strike', 'For one second the air in the ring stood open like a door, and there was a work light on the far side of it. Then the coil melted and everything on the ridge turned to look.'),
  C('ending_home', 'Home', 'The cave, in July 1969. Work lights, armed men, and an old man holding out his hand.'),
  C('ending_closed', 'Closed forever', 'A dark cave and an empty camp. On a folding table, a newspaper: "INDUSTRIALIST ABEL WHITCOMBE MISSING."'),
];

export const CLUES: Record<string, Clue> = Object.fromEntries(list.map((c) => [c.id, c]));

/** Fifteen shots, fifteen subjects. Twelve are animals of the valley, three are found only on the ridge. */
export const PHOTO_SUBJECTS = ['trex', 'raptor', 'pectinodon', 'pachy', 'triceratops', 'ankylosaurus', 'edmontosaurus', 'croc', 'pterosaur', 'dakotaraptor', 'widow', 'didelphodon', 'thescelosaurus', 'array_site', 'ring_site'] as const;
export const FILM = 15;
export const CACHES = 12;
export const PAGES = 8;
export const CHAPTER3_LIMIT_DAYS = 7;
/** The rock arrives this many days after the limit. Brutal conditions fill the gap. */
export const IMPACT_GRACE_DAYS = 2;

export type EndingId = 'home' | 'closed' | 'last_one' | 'record' | 'too_late';
export const ENDINGS: Record<EndingId, { title: string; body: string }> = {
  home: { title: 'Home', body: 'July 1969. The cave, the work lights, the men with rifles, and an old man holding out his hand for the shards. He has waited thirty years for this, and sixty-six million before that.' },
  closed: { title: 'Closed forever', body: 'The Heartstone mount is broken and nothing will ever follow you through. The papers say Abel Whitcombe walked into a cave in Montana and never came out.' },
  last_one: { title: 'The last one', body: 'Somebody had to hold it open. The others are in 1969. You watched the star fill the sky.' },
  record: { title: 'The record', body: 'Fifteen photographs. Twelve caches. One locket with six faces in it. You walked out of the cave with all of it, and now someone is going to have to read it. Whitcombe knows you are home. He still has men.' },
  too_late: { title: 'Too late', body: 'The seventh day came and went, and then the second sun came down. Sixty-six million years later someone will find a thin grey layer of clay, and think about it.' },
};
