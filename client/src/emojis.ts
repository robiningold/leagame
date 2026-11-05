// ca. 200 gängige Emojis, nach Kategorien
const split = (s: string) => Array.from(new Intl.Segmenter('de', { granularity: 'grapheme' }).segment(s.replace(/\s+/g, ''))).map((x) => x.segment);

export const EMOJI_CATEGORIES: { name: string; icon: string; emojis: string[] }[] = [
  { name: 'Gesichter', icon: '😀', emojis: split('😀😂🥹😍🥰😘😎🤓🥳😴🤔🤫🤭😱😭😡🤯🥶🥵🤢🤮🤠😇😈👻💀🤖👽🤡💩') },
  { name: 'Menschen', icon: '🧑', emojis: split('👶🧒👦👧🧑👨👩👴👵👮👷💂🕵️👩‍⚕️👨‍🍳👩‍🎓👨‍🚀👸🤴🦸🦹🧙🧛🧟🧜🧚💃🕺🏃🏊🚴🧘👰🤰👫👪') },
  { name: 'Gesten', icon: '👍', emojis: split('👍👎👏🙌🙏🤝✌️🤞👌🤘👋💪👀👂👃👄🧠❤️💔💯') },
  { name: 'Tiere', icon: '🐶', emojis: split('🐶🐱🐭🐰🦊🐻🐼🐨🐯🦁🐮🐷🐸🐵🐔🐧🐦🦆🦉🐴🦄🐝🦋🐌🐞🐢🐍🦖🐙🦈🐬🐳🐠🦀🐘🦒🐊🐑') },
  { name: 'Natur', icon: '🌳', emojis: split('🌳🌲🌴🌵🌷🌹🌻🍀🍁🍄🌍🌙⭐☀️⛅🌧️⛈️❄️☃️🔥💧🌊🌈⚡🌋🏔️') },
  { name: 'Essen', icon: '🍕', emojis: split('🍎🍌🍇🍓🍉🍒🍑🍍🥑🥕🌽🌶️🍞🧀🥨🍔🍟🍕🌭🌮🍝🍣🍦🍩🍪🎂🍰🍫🍿☕🍺🍷🍾🧃') },
  { name: 'Aktivität', icon: '⚽', emojis: split('⚽🏀🏈🎾🏐🎱🏓⛷️🏂🏋️🤿🎣🎯🎮🎲🧩🎨🎬🎤🎧🎸🎹🥁🎻🏆🥇🎪🎭') },
  { name: 'Reisen', icon: '🚗', emojis: split('🚗🚕🚌🚑🚒🚓🏎️🚲🛵🚂🚆✈️🚀🛸🚁⛵🚢⚓🗽🗼🏰🏯🎡🎢🏠🏥🏫⛪🏝️🗺️') },
  { name: 'Dinge', icon: '💡', emojis: split('⌚📱💻📷📺⏰💡🔦🕯️💰💎🔧🔨⚙️🧲🔫💣🔪🛡️🔮💊💉🧸🎈🎁🎀🪄📚✏️📌✂️🔑🚪🛏️🚽🛁👑👓👗👠🎩') },
  { name: 'Symbole', icon: '❓', emojis: split('❓❗➕➖✖️➗🔁⬆️⬇️⬅️➡️🔄❌✅⭕🚫⚠️💤💬💭🎵💥✨🔴🟢🔵🟡⚫⚪') },
];
