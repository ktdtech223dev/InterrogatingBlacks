// Solo-mode Efficiency Score formula.
// Accuracy weighted at 60%, speed at 40%, applied as a multiplier on base points.
const PAR_TIME_MS = 300000; // 5 minutes
const TOTAL_QUESTIONS_PER_BOARD = 25;

function calculateEfficiencyScore(basePoints, correctCount, totalQuestions, timeMs) {
  const total = totalQuestions || TOTAL_QUESTIONS_PER_BOARD;
  const accuracy = total > 0 ? Math.max(0, Math.min(1, (correctCount || 0) / total)) : 0;
  const timeBonus = Math.max(0, 1 - ((timeMs || 0) / PAR_TIME_MS));
  const efficiencyMultiplier = 1 + (accuracy * 0.6) + (timeBonus * 0.4);
  const finalScore = Math.round((basePoints || 0) * efficiencyMultiplier);
  return {
    finalScore,
    accuracy: Math.round(accuracy * 100),
    timeBonus: Math.round(timeBonus * 100),
    efficiencyMultiplier: Math.round(efficiencyMultiplier * 100) / 100
  };
}

module.exports = { calculateEfficiencyScore, PAR_TIME_MS, TOTAL_QUESTIONS_PER_BOARD };
