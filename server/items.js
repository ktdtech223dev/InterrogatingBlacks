const SABOTAGES = [
  { id: 'tick_tock', icon: '⏰', name: 'Tick Tock', desc: 'Target only gets 8 seconds to answer.', cost: 600, needsTarget: true, effect: 'reduce_timer', effectValue: 8 },
  { id: 'scramble', icon: '🔀', name: 'Mind Scramble', desc: "Target's answers shuffle every 3 seconds.", cost: 400, needsTarget: true, effect: 'shuffle_answers' },
  { id: 'double_down', icon: '💸', name: 'Double Down', desc: 'Target loses DOUBLE points if wrong.', cost: 700, needsTarget: true, effect: 'double_loss' },
  { id: 'big_mouth', icon: '💬', name: 'Big Mouth', desc: 'Trash talk message flashes on their screen.', cost: 200, needsTarget: true, effect: 'distraction',
    messages: ["You don't know this 💀", "Pick C. Always C.", "Bro is cooked 🔥", "Your time is running out...", "Imagine not knowing this 😭", "L incoming 📮", "Just guess lmaooo", "Certified dumb moment incoming"] },
  { id: 'wild_card', icon: '🎲', name: 'Wild Card', desc: 'Target gets a random different category question.', cost: 300, needsTarget: true, effect: 'category_swap' },
  { id: 'flip_script', icon: '🔄', name: 'Flip the Script', desc: 'Bets placed against this target pay in REVERSE.', cost: 900, needsTarget: true, effect: 'reverse_bets' },
  { id: 'blind', icon: '🙈', name: 'Blind', desc: 'Target cannot see the answer choices.', cost: 800, needsTarget: true, effect: 'hide_answers' }
];

const POWERUPS = [
  { id: 'double_pts', icon: '⭐', name: 'Double Points', desc: 'Your next correct answer is worth 2x.', cost: 800, needsTarget: false, effect: 'double_next' },
  { id: 'shield', icon: '🛡️', name: 'Shield', desc: 'Blocks the next sabotage used against you.', cost: 600, needsTarget: false, effect: 'block_sabotage' },
  { id: 'fifty', icon: '5️⃣0️⃣', name: '50/50', desc: 'Two wrong answers removed from your next question.', cost: 400, needsTarget: false, effect: 'fifty_fifty' },
  { id: 'time_extend', icon: '⌛', name: 'Extra Time', desc: 'Get 40 seconds instead of 20 next question.', cost: 300, needsTarget: false, effect: 'extend_timer', effectValue: 40 },
  { id: 'steal', icon: '🦹', name: 'Steal', desc: "If you're right and target is wrong, steal 25% of their points.", cost: 1000, needsTarget: true, effect: 'steal_points', effectValue: 0.25 }
];

const BROKE_BOY = [
  { id: 'please_lord', icon: '🙏', name: 'Please Lord', cost: 0, desc: 'FREE: Next correct = 3x points. Wrong = lose 2x. The question AFTER this is worth 0.', consequence: 'Next Q after = 0 points', effect: 'bb_please_lord' },
  { id: 'desperation', icon: '🤡', name: 'Desperation Move', cost: 0, desc: 'FREE: Steal 300pts from random player. But next Q is 5 seconds and -500 if wrong.', consequence: 'Next Q: 5s + -500 if wrong', effect: 'bb_desperation' },
  { id: 'slot_machine', icon: '🎰', name: 'Slot Machine', cost: 0, desc: 'FREE: Random outcome +1000 to -500. Locked out of next shop entirely.', consequence: 'Locked out of next shop', effect: 'bb_slot', outcomes: [1000, 800, 600, -200, -400, -500] },
  { id: 'nuclear', icon: '☢️', name: 'Nuclear Option', cost: 0, desc: "FREE: See everyone's selected answers. Your own answer submits randomly.", consequence: 'Your answer submits randomly', effect: 'bb_nuclear' },
  { id: 'bankruptcy', icon: '💀', name: 'Bankruptcy Deal', cost: 0, desc: 'FREE: +500 now. Everyone else +250. You take -25% point penalty all remaining Qs this board.', consequence: '-25% pts rest of board', effect: 'bb_bankruptcy' }
];

module.exports = { SABOTAGES, POWERUPS, BROKE_BOY };
