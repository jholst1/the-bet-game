(function(){
window.BG = window.BG || {};
BG.phases = BG.phases || {};
const { h, useState, useEffect, useRef, useCallback } = BG.core;
const { Btn, Card, Inp, Sel } = BG.ui;
const { VerifyPopup, GuessPopup, RulesPopup } = BG.popups;
const { SIPS, LIKELIHOOD_OPTIONS, ODDS_MAP, genCode, sipsToDrinks, computeOdds } = BG.consts;
const { saveRoom, subscribeRoom, loadRoom } = BG.fb;

function EndPhase({room,myName}) {
  const drinkTotals = room.drinkTotals || {};
  const giveTotals  = room.giveTotals  || {};
  const players = (room.players || []).map(p => p.name);

  const rows = players
    .map(name => ({
      name,
      give:  giveTotals[name]  || 0,
      drink: drinkTotals[name] || 0,
    }))
    .sort((a,b) => (b.drink - a.drink) || (b.give - a.give));

  const myGive  = giveTotals[myName]  || 0;
  const myDrink = drinkTotals[myName] || 0;

  const isHost = room.hostName === myName;

  // --- slide state + swipe ---
  const [slide,setSlide] = useState(0);
  const touchRef = useRef({x:0,y:0, t:0});

  const clampSlide = (s) => Math.max(0, Math.min(3, s));
  const go = (s) => setSlide(clampSlide(s));
  const next = () => setSlide(s => clampSlide(s+1));
  const prev = () => setSlide(s => clampSlide(s-1));

  const onTouchStart = (e) => {
    const t = e.touches && e.touches[0];
    if(!t) return;
    touchRef.current = {x:t.clientX, y:t.clientY, t: Date.now()};
  };
  const onTouchEnd = (e) => {
    const t = e.changedTouches && e.changedTouches[0];
    if(!t) return;
    const dx = t.clientX - touchRef.current.x;
    const dy = t.clientY - touchRef.current.y;
    if(Math.abs(dx) < 45) return;
    if(Math.abs(dx) < Math.abs(dy)) return;
    if(dx < 0) next(); else prev();
  };

  // --- slide 2: leaders (during-game + end-of-game totals) ---
const computeAllTimeTotals = () => {
  const allGive = {};
  const allDrink = {};
  (room.players || []).forEach(p => { allGive[p.name] = 0; allDrink[p.name] = 0; });

  const wagersByPlayer = room.wagers || {};
  const oddsMap = room.oddsMap || {};

  // helper: apply "bet hit" (verified) outcomes
  const applyVerified = (betId) => {
    const odds = oddsMap[betId] || 1;

    (room.players || []).forEach(p => {
      const w = Number((wagersByPlayer[p.name] || {})[betId] || 0);
      if (!w) return;

      if (w > 0) {
        // long hit -> hand out wager*odds (during game)
        allGive[p.name] += Math.round(w * odds);
      } else {
        // short hit -> drink abs(w) (during game)
        allDrink[p.name] += Math.abs(w);
      }
    });
  };

  // helper: apply "bet didn't hit" (expired) outcomes
  const applyExpired = (betId) => {
    (room.players || []).forEach(p => {
      const w = Number((wagersByPlayer[p.name] || {})[betId] || 0);
      if (!w) return;

      if (w > 0) {
        // long didn't hit -> drink wager (end)
        allDrink[p.name] += Math.abs(w);
      } else {
        // short didn't hit -> hand out abs(w) (end)
        allGive[p.name] += Math.abs(w);
      }
    });
  };

  (room.verifiedBets || []).forEach(applyVerified);
  (room.expiredBets || []).forEach(applyExpired);

  return { allGive, allDrink };
};

const { allGive, allDrink } = computeAllTimeTotals();

const leaderRows = players.map(name => ({
  name,
  give: allGive[name] || 0,
  drink: allDrink[name] || 0
}));

const topGive  = [...leaderRows].sort((a,b)=>b.give-a.give).slice(0,2);
const topDrink = [...leaderRows].sort((a,b)=>b.drink-a.drink).slice(0,2);

  // --- slide 3: top invested/shorted bets ---
  const allBets = (room.bets||[]).filter(b=>b.locked);
  const wagersByPlayer = room.wagers || {};
  const betStats = allBets.map(b=>{
    const ws = (room.players||[]).map(p => Number((wagersByPlayer[p.name]||{})[b.id] || 0));
    const totalAbs = ws.reduce((s,x)=>s+Math.abs(x),0);
    const longAbs  = ws.filter(x=>x>0).reduce((s,x)=>s+Math.abs(x),0);
    const shortAbs = ws.filter(x=>x<0).reduce((s,x)=>s+Math.abs(x),0);
    return { bet:b, totalAbs, longAbs, shortAbs };
  }).filter(x=>x.totalAbs>0);

  const topInvested = [...betStats].sort((a,b)=>b.totalAbs-a.totalAbs).slice(0,3);

  // --- slide 4: all bets list ---
  const groupA = allBets.filter(b=>b.group==="A");
  const groupB = allBets.filter(b=>b.group==="B");
  const verifiedSet = new Set(room.verifiedBets||[]);
  const expiredSet  = new Set(room.expiredBets||[]);

  const betStatus = (id) => verifiedSet.has(id) ? "✅ hit" : (expiredSet.has(id) ? "⏳ didn’t hit" : "•");

  const playAgain = async () => {
    const latest = await loadRoom(room.code);
    if(!latest) return;

    const reset = {
      ...latest,
      phase: "lobby",
      bets: [],
      votes: {},
      wagers: {},
      oddsMap: {},
      activeBets: [],
      verifiedBets: [],
      expiredBets: [],
      drinkTotals: {},
      giveTotals: {},
      timerEnd: null,
      lastGuessResult: null,
      lastVerifiedBet: null
    };

    await saveRoom(latest.code, reset);
  };

  const Dot = ({i}) => h("button",{
    className:`pill ${slide===i?"pill-active":""}`,
    onClick:()=>go(i),
    style:{padding:"0.35rem 0.65rem"}
  }, i+1);

  const SlideWrap = ({children}) => h("div",{onTouchStart,onTouchEnd}, children);

  const SlideNav = () => h("div",{className:"flex items-center justify-center gap2", style:{marginTop:"0.25rem"}},
    h(Btn,{onClick:prev,color:"gray",sm:true,disabled:slide===0},"←"),
    h(Dot,{i:0}), h(Dot,{i:1}), h(Dot,{i:2}), h(Dot,{i:3}),
    h(Btn,{onClick:next,color:"gray",sm:true,disabled:slide===3},"→")
  );

  const Slide1 = () => h("div",{},
    h("div",{className:"text-center"},
      h("div",{className:"text-5xl mb2"},"🏁"),
      h("h2",{className:"font-black text-3xl",style:{margin:0}},"Game Over!"),
      h("p",{className:"muted",style:{marginTop:".5rem"}},`Your totals: Drink ${myDrink}, Hand out ${myGive}`)
    ),
    h(Card,{},
      h("p",{className:"font-black mb2"},"Final Totals"),
      h("div",{className:"flex flex-col gap2"},
        ...rows.map(r =>
          h("div",{key:r.name,className:"row-between"},
            h("div",null,r.name),
            h("div",{className:"row",style:{gap:"1rem"}},
              h("span",{className:"c-yellow font-bold"},`Hand out: ${r.give}`),
              h("span",{className:"c-red font-bold"},`Drink: ${r.drink}`)
            )
          )
        )
      )
    ),
    isHost && h(Btn,{onClick:playAgain,color:"green",full:true},"Play again"),
    h(Btn,{onClick:()=>location.reload(),color:"gray",full:true},"Exit to home")
  );

  const Slide2 = () => h("div",{},
    h("div",{className:"text-center"},
      h("div",{className:"text-5xl mb2"},"🏆"),
      h("h2",{className:"font-black text-3xl",style:{margin:0}},"Leaders"),
      h("p",{className:"muted",style:{marginTop:".5rem"}},"Most handouts + most drinks")
    ),
    h(Card,{className:"card-yellow"},
      h("p",{className:"font-black mb2 c-yellow"},"Top handouts"),
      topGive.length===0
        ? h("p",{className:"muted"},"No handouts yet.")
        : h("div",{className:"flex flex-col gap2"},
            ...topGive.map((r,idx)=>h("div",{key:r.name,className:"row-between"},
              h("div",{className:"row gap2"}, h("span",{className:"font-black"}, idx===0?"🥇":"🥈"), h("span",null,r.name)),
              h("span",{className:"c-yellow font-black"}, `${r.give}`)
            ))
          )
    ),
    h(Card,{className:"card-red"},
      h("p",{className:"font-black mb2 c-red"},"Top drinkers"),
      topDrink.length===0
        ? h("p",{className:"muted"},"No drinks yet.")
        : h("div",{className:"flex flex-col gap2"},
            ...topDrink.map((r,idx)=>h("div",{key:r.name,className:"row-between"},
              h("div",{className:"row gap2"}, h("span",{className:"font-black"}, idx===0?"🥇":"🥈"), h("span",null,r.name)),
              h("span",{className:"c-red font-black"}, `${r.drink}`)
            ))
          )
    )
  );

  const Slide3 = () => h("div",{},
    h("div",{className:"text-center"},
      h("div",{className:"text-5xl mb2"},"📊"),
      h("h2",{className:"font-black text-3xl",style:{margin:0}},"Most invested bets"),
      h("p",{className:"muted",style:{marginTop:".5rem"}},"Top 3 by total wager (long + short)")
    ),
    topInvested.length===0
      ? h(Card,{}, h("p",{className:"muted"},"No wagers found."))
      : h("div",{className:"flex flex-col gap3"},
          ...topInvested.map((x,idx)=>h(Card,{key:x.bet.id, className:"card-orange"},
            h("div",{className:"row-between mb1"},
              h("p",{className:"font-black",style:{margin:0}}, `${idx+1}. ${x.bet.target}`),
              h("span",{className:"c-yellow font-black"}, `Total: ${x.totalAbs}`)
            ),
            h("p",{className:"muted text-sm",style:{margin:"0 0 0.5rem"}}, x.bet.text),
            h("div",{className:"row-between"},
              h("span",{className:"c-green font-bold text-sm"}, `Long: ${x.longAbs}`),
              h("span",{className:"c-orange font-bold text-sm"}, `Short: ${x.shortAbs}`)
            )
          ))
        )
  );

  const BetList = ({title, bets, badgeClass}) => h(Card,{},
    h("div",{className:"row-between mb2"},
      h("p",{className:"font-black",style:{margin:0}}, title),
      h("span",{className:`badge ${badgeClass}`}, badgeClass==="badge-a"?"🔵 A":"🔴 B")
    ),
    bets.length===0
      ? h("p",{className:"muted"},"No bets.")
      : h("div",{style:{maxHeight:"60vh", overflowY:"auto", paddingRight:"0.25rem"}},
          ...bets.map(b=>h("div",{key:b.id, className:"bet-row"},
            h("div",{style:{flex:1}},
              h("div",{className:"row-between"},
                h("span",{className:"c-indigo font-semibold"}, `${b.target}`),
                h("span",{className:"muted text-xs"}, betStatus(b.id))
              ),
              h("div",{className:"text-sm"}, b.text),
              h("div",{className:"muted text-xs mt1"}, `by ${b.author}`)
            )
          ))
        )
  );

  const Slide4 = () => h("div",{},
    h("div",{className:"text-center"},
      h("div",{className:"text-5xl mb2"},"🧾"),
      h("h2",{className:"font-black text-3xl",style:{margin:0}},"All bets"),
      h("p",{className:"muted",style:{marginTop:".5rem"}},"Scrollable list of both teams")
    ),
    h(BetList,{title:"Group A bets", bets:groupA, badgeClass:"badge-a"}),
    h(BetList,{title:"Group B bets", bets:groupB, badgeClass:"badge-b"})
  );

  const slides = [h(Slide1,null), h(Slide2,null), h(Slide3,null), h(Slide4,null)];

  return h("div",{className:"col"},
    h(SlideNav,null),
    h(SlideWrap,null, slides[slide]),
    h("p",{className:"muted text-xs text-center"},"Tip: swipe left/right to change slides")
  );
}

BG.phases.EndPhase = EndPhase;

})();
