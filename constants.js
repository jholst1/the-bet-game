(function(){
/* Constants + helpers */
window.BG = window.BG || {};
BG.consts = BG.consts || {};
// ── Constants ─────────────────────────────────────────────────
const SIPS = 14;
const LIKELIHOOD_OPTIONS = ["Very Unlikely", "Unlikely", "Neutral", "Likely", "Very Likely"];
const ODDS_MAP = { "Very Unlikely": 2.5, "Unlikely": 1.5, "Neutral": 1, "Likely": 0.9, "Very Likely": 0.6 };

function genCode(n=5) { return Math.random().toString(36).substring(2,2+n).toUpperCase(); }
function sipsToDrinks(sips) {
  const abs=Math.abs(sips), sign=sips<0?"-":"", d=Math.floor(abs/SIPS), r=abs%SIPS;
  if(d&&r) return `${sign}${d} drink${d>1?"s":""}+${r} sip${r!==1?"s":""}`;
  if(d) return `${sign}${d} drink${d>1?"s":""}`;
  return `${sign}${r} sip${r!==1?"s":""}`;
}
function computeOdds(betId, bets, votes, players) {
  const bet=bets.find(b=>b.id===betId); if(!bet) return 1;
  const voters=players.filter(p=>p.group===bet.group); if(!voters.length) return 1;
  const total=voters.reduce((s,p)=>s+(ODDS_MAP[(votes[p.name]||{})[betId]]||1),0);
  return Math.round((total/voters.length)*100)/100;
}



BG.consts.SIPS=SIPS;
BG.consts.LIKELIHOOD_OPTIONS=LIKELIHOOD_OPTIONS;
BG.consts.ODDS_MAP=ODDS_MAP;
BG.consts.genCode=genCode;
BG.consts.sipsToDrinks=sipsToDrinks;
BG.consts.computeOdds=computeOdds;

})();
