// Original, procedural MATE / TWO score. No streaming or audio-file boundary.
// Every voice has a finite attack/release envelope, including the loop seam.
const CHORDS = [
  [50,57,62,65,69], [46,53,58,62,65],
  [53,60,65,69,72], [48,55,60,64,67],
  [43,50,55,58,62], [50,57,62,65,69],
  [46,53,58,62,65], [45,52,57,61,64]
];
const MELODY = [
  [[0,74,2],[3,77,1],[5,76,1],[6,74,2]],
  [[0,72,2],[3,74,1],[5,70,1],[6,69,2]],
  [[0,69,2],[2,72,2],[5,74,1],[6,76,2]],
  [[0,79,2],[3,76,1],[5,74,1],[6,72,2]],
  [[0,74,2],[3,77,1],[5,79,1],[6,77,2]],
  [[0,76,2],[3,74,1],[5,72,1],[6,69,2]],
  [[0,70,2],[3,72,1],[5,74,1],[6,77,2]],
  [[0,76,2],[2,73,2],[5,69,1],[6,73,2]],
  [[0,74,2],[2,77,1],[4,81,2],[7,79,1]],
  [[0,77,2],[3,74,1],[5,72,1],[6,70,2]],
  [[0,72,2],[2,76,2],[5,79,1],[6,77,2]],
  [[0,76,2],[3,74,1],[5,72,1],[6,67,2]],
  [[0,70,2],[3,74,1],[5,77,1],[6,79,2]],
  [[0,81,2],[3,77,1],[5,76,1],[6,74,2]],
  [[0,77,2],[2,74,2],[5,72,1],[6,70,2]],
  [[0,73,2],[3,76,1],[5,74,1],[6,74,2]]
];
const midi = n=>440*Math.pow(2,(n-69)/12);
const limited = (n,min,max)=>Math.min(max,Math.max(min,n));
export class Soundscape {
  constructor(){
    this.context=null;this.master=null;this.musicBus=null;this.effectsBus=null;
    this.musicOn=false;this.effectsOn=true;this.musicTimer=null;this.nextTime=0;this.step=0;
    this.tempo=112;this.stepSeconds=60/this.tempo/2;this.noiseBuffer=null;
    this.voices=new Set();this.visibilityHandler=()=>this.handleVisibility();
    if(typeof document!=='undefined')document.addEventListener('visibilitychange',this.visibilityHandler);
  }
  createContext(){
    if(this.context)return this.context;
    const Audio=window.AudioContext||window.webkitAudioContext;
    if(!Audio)return null;
    const ctx=new Audio({latencyHint:'interactive'});
    const compressor=ctx.createDynamicsCompressor();
    compressor.threshold.value=-13;compressor.knee.value=12;
    compressor.ratio.value=3;compressor.attack.value=.006;compressor.release.value=.24;
    const master=ctx.createGain();master.gain.value=.78;
    const music=ctx.createGain();music.gain.value=0;
    const effects=ctx.createGain();effects.gain.value=this.effectsOn?.62:0;
    music.connect(master);effects.connect(master);master.connect(compressor);compressor.connect(ctx.destination);
    this.context=ctx;this.master=master;this.musicBus=music;this.effectsBus=effects;
    return ctx;
  }
  async unlock(){
    try{
      const ctx=this.createContext();
      if(!ctx)return false;
      if(ctx.state!=='running')await ctx.resume();
      if(this.musicOn){
        if(this.musicBus && !document.hidden && this.musicBus.gain.value<.10)this.fade(this.musicBus.gain,.27,.55);
        this.startScheduler();
      }
      return ctx.state==='running';
    }catch{return false;}
  }
  fade(param,to,seconds=.16){
    if(!this.context)return;
    const at=this.context.currentTime;
    param.cancelScheduledValues(at);
    param.setValueAtTime(param.value,at);
    param.linearRampToValueAtTime(to,at+seconds);
  }
  setMusic(on){
    this.musicOn=!!on;
    if(!on){
      if(this.musicBus)this.fade(this.musicBus.gain,0,.30);
      this.stopScheduler();
    }else{
      this.unlock().then(ok=>{
        if(!ok||!this.musicOn||document.hidden)return;
        this.fade(this.musicBus.gain,.27,.65);
        this.startScheduler();
      });
    }
  }
  setEffects(on){
    this.effectsOn=!!on;
    if(this.effectsBus)this.fade(this.effectsBus.gain,this.effectsOn?.62:0,.11);
    if(on)this.unlock();
  }
  handleVisibility(){
    if(document.hidden){
      if(this.musicBus)this.fade(this.musicBus.gain,0,.09);
      this.stopScheduler();
    }else if(this.musicOn){
      this.unlock().then(ok=>{
        if(!ok||!this.musicOn||document.hidden)return;
        this.fade(this.musicBus.gain,.27,.4);
        this.startScheduler();
      });
    }
  }
  stopScheduler(){
    if(this.musicTimer!==null)clearInterval(this.musicTimer);
    this.musicTimer=null;
  }
  startScheduler(){
    if(!this.context||this.context.state!=='running'||!this.musicOn||document.hidden)return;
    if(this.musicTimer!==null)return;
    this.nextTime=this.context.currentTime+.08;
    this.musicTimer=setInterval(()=>this.scheduleAhead(),65);
    this.scheduleAhead();
  }
  scheduleAhead(){
    const ctx=this.context;
    if(!ctx||ctx.state!=='running'||!this.musicOn||document.hidden)return;
    // Guard for tab suspension; never fast-forward hundreds of notes on resume.
    if(this.nextTime<ctx.currentTime-.04)this.nextTime=ctx.currentTime+.07;
    const horizon=ctx.currentTime+.35;
    while(this.nextTime<horizon){
      this.scheduleStep(this.step,this.nextTime);
      this.step=(this.step+1)%(16*8);
      this.nextTime+=this.stepSeconds;
    }
  }
  note(note,when,length,volume,kind,bus=this.musicBus){
    const ctx=this.context;if(!ctx||!bus)return;
    const duration=Math.max(.06,length);
    const attack=kind==='pad'?.22:kind==='lead'?.035:kind==='bass'?.018:.009;
    const release=kind==='pad'?.31:kind==='lead'?.24:kind==='bass'?.17:.12;
    const end=when+duration+release;
    const gain=ctx.createGain();
    gain.gain.setValueAtTime(0,when);
    gain.gain.linearRampToValueAtTime(Math.max(.00005,volume),when+attack);
    gain.gain.setValueAtTime(Math.max(.00005,volume),when+duration);
    gain.gain.exponentialRampToValueAtTime(.00003,end);
    const filter=ctx.createBiquadFilter();filter.type='lowpass';
    filter.frequency.value=kind==='lead'?1450:kind==='pad'?920:kind==='bass'?580:1700;
    filter.Q.value=.5;
    filter.connect(gain);gain.connect(bus);
    const base=midi(note);
    const parts=kind==='pad'?[[1,.54,'triangle'],[2,.21,'sine'],[3,.11,'sine']]:
      kind==='lead'?[[1,.66,'triangle'],[2,.18,'sine'],[3,.08,'sine']]:
      kind==='bass'?[[1,.72,'sine'],[2,.16,'triangle']]:[[1,.82,'sine'],[2,.19,'sine']];
    parts.forEach(([harmonic,mix,type],i)=>{
      const osc=ctx.createOscillator(),sub=ctx.createGain();
      osc.type=type;osc.frequency.setValueAtTime(base*harmonic,when);
      sub.gain.value=mix;
      osc.connect(sub);sub.connect(filter);osc.start(when);osc.stop(end+.03);
      osc.onended=()=>{
        osc.disconnect();sub.disconnect();
        if(i===parts.length-1){filter.disconnect();gain.disconnect();}
      };
    });
  }
  scheduleStep(step,time){
    const bar=Math.floor(step/8),index=step%8;
    const chord=CHORDS[Math.floor(bar/2)],barNote=chord[0];
    const eighth=this.stepSeconds;
    if(index===0){
      this.note(barNote-12,time,eighth*3.35,.096,'bass');
      for(const n of chord.slice(2,5))this.note(n,time,eighth*7.05,.036,'pad');
    }
    if(index===4)this.note(barNote-12,time,eighth*2.8,.068,'bass');
    const arp=[chord[1],chord[2],chord[3],chord[2],chord[4],chord[3],chord[2],chord[1]];
    this.note(arp[index]+12,time,eighth*.7,.022,'pluck');
    for(const [at,pitch,steps] of MELODY[bar]){
      if(at===index)this.note(pitch,time,eighth*steps*.84,.11,'lead');
    }
    if(index===0||index===4)this.note(barNote-24,time,.11,.04,'bass');
  }
  // Effects share the same context but a different bus, so BGM volume is independent.
  effect(kind){
    if(!this.effectsOn)return;
    const ctx=this.context;
    if(!ctx||ctx.state!=='running')return;
    const now=ctx.currentTime+.006;
    const play=(pitch,delay,dur,level='soft')=>{
      this.note(pitch,now+delay,dur,level==='accent'?.19:.09,'pluck',this.effectsBus);
    };
    switch(kind){
      case 'select': play(76,0,.055);break;
      case 'move': play(62,0,.075);play(74,.052,.055);break;
      case 'black': play(51,0,.12);play(58,.10,.1);break;
      case 'rewind': play(74,0,.09);play(67,.075,.13);break;
      case 'key': play(74,0,.13);play(77,.13,.15);play(81,.28,.2,'accent');break;
      case 'mate':
      case 'victory': play(74,0,.09);play(81,.08,.20);play(86,.22,.28,'accent');this.shards(now+.045,.19);break;
      case 'capture': this.shards(now,.26);play(55,.01,.11,'accent');break;
      case 'error': play(57,0,.13);play(53,.12,.16);break;
      default: play(64,0,.07);
    }
  }
  shards(when,duration){
    const ctx=this.context;if(!ctx||!this.effectsBus)return;
    if(!this.noiseBuffer){
      const length=Math.ceil(ctx.sampleRate*.33),buffer=ctx.createBuffer(1,length,ctx.sampleRate),data=buffer.getChannelData(0);
      // Deterministic noise with smoothly rounded first/last samples.
      let state=812913;
      for(let i=0;i<length;i++){
        state=(Math.imul(state,1664525)+1013904223)>>>0;
        data[i]=((state/4294967296)*2-1);
      }
      this.noiseBuffer=buffer;
    }
    const source=ctx.createBufferSource();source.buffer=this.noiseBuffer;
    const filter=ctx.createBiquadFilter();filter.type='bandpass';filter.frequency.value=1900;filter.Q.value=.65;
    const gain=ctx.createGain();
    gain.gain.setValueAtTime(.0001,when);
    gain.gain.linearRampToValueAtTime(.14,when+.012);
    gain.gain.exponentialRampToValueAtTime(.0001,when+duration);
    source.connect(filter);filter.connect(gain);gain.connect(this.effectsBus);
    source.start(when);source.stop(when+duration+.015);
    source.onended=()=>{source.disconnect();filter.disconnect();gain.disconnect();};
  }
  status(){return {musicOn:this.musicOn,effectsOn:this.effectsOn,ready:!!this.context&&this.context.state==='running',scheduler:this.musicTimer!==null};}
}
