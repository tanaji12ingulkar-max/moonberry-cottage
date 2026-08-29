const audio = document.getElementById("audio");
const fileInput = document.getElementById("fileInput");
const playlistEl = document.getElementById("playlist");
const songTitle = document.getElementById("songTitle");
const songSubtitle = document.getElementById("songSubtitle");
const currentTimeEl = document.getElementById("currentTime");
const durationEl = document.getElementById("duration");
const progress = document.getElementById("progress");
const volume = document.getElementById("volume");
const playBtn = document.getElementById("playBtn");
const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");
const shuffleBtn = document.getElementById("shuffleBtn");
const repeatBtn = document.getElementById("repeatBtn");
const favBtn = document.getElementById("favBtn");
const sleepBtn = document.getElementById("sleepBtn");
const clearBtn = document.getElementById("clearBtn");
const searchInput = document.getElementById("searchInput");
const sortSelect = document.getElementById("sortSelect");
const songCount = document.getElementById("songCount");
const themeBtn = document.getElementById("themeBtn");
const nightBtn = document.getElementById("nightBtn");
const magicText = document.getElementById("magicText");
const moodText = document.getElementById("moodText");
const visualizer = document.getElementById("visualizer");

let songs = [];
let currentIndex = -1;
let shuffle = false;
let repeat = false;
let sleepTimer = null;
let db;

for(let i=0;i<24;i++){
  const bar=document.createElement("i");
  visualizer.appendChild(bar);
}

function fmt(sec){
  if(!Number.isFinite(sec)) return "0:00";
  sec=Math.max(0,Math.floor(sec));
  return Math.floor(sec/60)+":"+String(sec%60).padStart(2,"0");
}

function saveSettings(){
  localStorage.setItem("moonberrySettings",JSON.stringify({
    shuffle,repeat,volume:audio.volume,night:document.body.classList.contains("night")
  }));
}

function loadSettings(){
  try{
    const s=JSON.parse(localStorage.getItem("moonberrySettings")||"{}");
    shuffle=!!s.shuffle; repeat=!!s.repeat;
    audio.volume=typeof s.volume==="number"?s.volume:.72;
    volume.value=audio.volume;
    if(s.night) document.body.classList.add("night");
  }catch(e){audio.volume=.72}
  shuffleBtn.classList.toggle("active",shuffle);
  repeatBtn.classList.toggle("active",repeat);
}

function openDB(){
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open("MoonberryCottageDB",1);
    req.onupgradeneeded=e=>{
      const d=e.target.result;
      if(!d.objectStoreNames.contains("songs")) d.createObjectStore("songs",{keyPath:"id"});
    };
    req.onsuccess=e=>{db=e.target.result;resolve(db)};
    req.onerror=()=>reject(req.error);
  });
}

function dbAll(){
  return new Promise((resolve,reject)=>{
    const tx=db.transaction("songs","readonly");
    const req=tx.objectStore("songs").getAll();
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error);
  });
}

function dbPut(song){
  return new Promise((resolve,reject)=>{
    const tx=db.transaction("songs","readwrite");
    tx.objectStore("songs").put(song);
    tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
  });
}

function dbDelete(id){
  return new Promise((resolve,reject)=>{
    const tx=db.transaction("songs","readwrite");
    tx.objectStore("songs").delete(id);
    tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
  });
}

async function loadSongs(){
  try{
    const saved=await dbAll();
    songs=saved.map(s=>({...s,url:URL.createObjectURL(s.blob)}));
    render();
  }catch(e){
    console.warn("Storage unavailable",e);
  }
}

fileInput.addEventListener("change",async()=>{
  const files=[...fileInput.files].filter(f=>f.type.startsWith("audio/"));
  for(const file of files){
    const id=crypto.randomUUID ? crypto.randomUUID() : Date.now()+"-"+Math.random();
    const song={id,name:file.name,blob:file,added:Date.now(),favorite:false};
    songs.push({...song,url:URL.createObjectURL(file)});
    try{await dbPut(song)}catch(e){}
  }
  fileInput.value="";
  render();
  if(currentIndex<0 && songs.length) selectSong(0,false);
});

function filteredSongs(){
  let list=songs.filter(s=>s.name.toLowerCase().includes(searchInput.value.toLowerCase()));
  if(sortSelect.value==="az") list.sort((a,b)=>a.name.localeCompare(b.name));
  if(sortSelect.value==="favorites") list=list.filter(s=>s.favorite);
  return list;
}

function render(){
  const list=filteredSongs();
  songCount.textContent=songs.length+" song"+(songs.length===1?"":"s");
  playlistEl.innerHTML="";
  if(!list.length){
    playlistEl.innerHTML='<div class="empty">✦ no songs found in this little meadow ✦</div>';
    return;
  }
  list.forEach(song=>{
    const realIndex=songs.findIndex(x=>x.id===song.id);
    const row=document.createElement("div");
    row.className="song-row"+(realIndex===currentIndex?" active":"");
    row.innerHTML=`
      <button class="song-action fav" title="Favorite">${song.favorite?"♥":"♡"}</button>
      <div class="song-meta">
        <div class="song-name">${escapeHtml(song.name)}</div>
        <div class="song-sub">moonberry attic • local song</div>
      </div>
      <button class="song-action playmini" title="Play">▶</button>
      <button class="song-action remove" title="Remove">×</button>`;
    row.addEventListener("click",e=>{
      if(e.target.closest(".fav")||e.target.closest(".remove")||e.target.closest(".playmini")) return;
      selectSong(realIndex,true);
    });
    row.querySelector(".playmini").onclick=()=>selectSong(realIndex,true);
    row.querySelector(".remove").onclick=async()=>{
      const wasCurrent=realIndex===currentIndex;
      URL.revokeObjectURL(song.url);
      await dbDelete(song.id);
      songs.splice(realIndex,1);
      if(wasCurrent){audio.pause();audio.removeAttribute("src");currentIndex=-1;resetInfo()}
      else if(realIndex<currentIndex) currentIndex--;
      render();
    };
    row.querySelector(".fav").onclick=async()=>{
      song.favorite=!song.favorite;
      const saved={id:song.id,name:song.name,blob:song.blob,added:song.added,favorite:song.favorite};
      await dbPut(saved);render();
    };
    let timer;
    row.addEventListener("touchstart",()=>timer=setTimeout(()=>selectSong(realIndex,true),550),{passive:true});
    row.addEventListener("touchend",()=>clearTimeout(timer),{passive:true});
    playlistEl.appendChild(row);
  });
}

function escapeHtml(str){
  return str.replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
}

function selectSong(index,autoPlay=true){
  if(!songs[index]) return;
  currentIndex=index;
  audio.src=songs[index].url;
  audio.load();
  songTitle.textContent=songs[index].name;
  songSubtitle.textContent=songs[index].favorite?"♡ a favorite from your fairy garden":"♪ playing from your local attic";
  favBtn.textContent=songs[index].favorite?"♥ favorite":"♡ favorite";
  render();
  if(autoPlay) audio.play().catch(()=>{});
}

function resetInfo(){
  songTitle.textContent="welcome to your tiny fairy cottage ♡";
  songSubtitle.textContent="choose a song and let the moonlight play";
  currentTimeEl.textContent="0:00";durationEl.textContent="0:00";progress.value=0;
  favBtn.textContent="♡ favorite";
}

playBtn.onclick=()=>{
  if(!audio.src && songs.length){selectSong(0,true);return}
  if(audio.paused) audio.play().catch(()=>{}); else audio.pause();
};
prevBtn.onclick=()=>{
  if(!songs.length)return;
  let i=currentIndex<=0?songs.length-1:currentIndex-1;
  selectSong(i,true);
};
nextBtn.onclick=()=>nextSong();

function nextSong(){
  if(!songs.length)return;
  let i;
  if(shuffle && songs.length>1){
    do{i=Math.floor(Math.random()*songs.length)}while(i===currentIndex);
  }else i=(currentIndex+1)%songs.length;
  selectSong(i,true);
}

shuffleBtn.onclick=()=>{
  shuffle=!shuffle;shuffleBtn.classList.toggle("active",shuffle);saveSettings();
};
repeatBtn.onclick=()=>{
  repeat=!repeat;repeatBtn.classList.toggle("active",repeat);saveSettings();
};

audio.addEventListener("play",()=>{
  playBtn.textContent="❚❚";
  magicText.textContent="the fairy lights are dancing ♡";
});
audio.addEventListener("pause",()=>{
  playBtn.textContent="▶";
  magicText.textContent="the cottage is resting ✧";
});
audio.addEventListener("loadedmetadata",()=>{
  durationEl.textContent=fmt(audio.duration);
});
audio.addEventListener("timeupdate",()=>{
  currentTimeEl.textContent=fmt(audio.currentTime);
  progress.value=audio.duration?(audio.currentTime/audio.duration)*100:0;
});
audio.addEventListener("ended",()=>{
  if(repeat){audio.currentTime=0;audio.play();}else nextSong();
});
progress.addEventListener("input",()=>{
  if(audio.duration) audio.currentTime=(progress.value/100)*audio.duration;
});
volume.addEventListener("input",()=>{
  audio.volume=Number(volume.value);saveSettings();
});

favBtn.onclick=async()=>{
  if(currentIndex<0)return;
  songs[currentIndex].favorite=!songs[currentIndex].favorite;
  const s=songs[currentIndex];
  await dbPut({id:s.id,name:s.name,blob:s.blob,added:s.added,favorite:s.favorite});
  favBtn.textContent=s.favorite?"♥ favorite":"♡ favorite";render();
};

sleepBtn.onclick=()=>{
  if(sleepTimer){clearTimeout(sleepTimer);sleepTimer=null;sleepBtn.textContent="🌙 sleep timer";return}
  const mins=prompt("How many minutes until the cottage sleeps?","30");
  const n=Number(mins);
  if(!n||n<1)return;
  sleepBtn.textContent=`🌙 sleeps in ${n}m`;
  sleepTimer=setTimeout(()=>{audio.pause();sleepTimer=null;sleepBtn.textContent="🌙 sleep timer";},n*60000);
};

clearBtn.onclick=async()=>{
  if(!songs.length)return;
  if(!confirm("Remove every song from the enchanted playlist? Your original files will not be deleted."))return;
  for(const s of songs){URL.revokeObjectURL(s.url);await dbDelete(s.id)}
  songs=[];currentIndex=-1;audio.pause();audio.removeAttribute("src");resetInfo();render();
};

searchInput.addEventListener("input",render);
sortSelect.addEventListener("change",render);

const themes=[
  ["#eadcf3","#b99bd0","midnight meadow"],
  ["#f8dfc9","#d69ab4","rose fairy garden"],
  ["#dcefdc","#8eb69b","mossy mushroom woods"],
  ["#dce9fa","#8ba8d1","starlight lake"]
];
let themeIndex=0;
themeBtn.onclick=()=>{
  themeIndex=(themeIndex+1)%themes.length;
  document.documentElement.style.setProperty("--bg1",themes[themeIndex][0]);
  document.documentElement.style.setProperty("--bg2",themes[themeIndex][1]);
  moodText.textContent=themes[themeIndex][2];
};
nightBtn.onclick=()=>{
  document.body.classList.toggle("night");
  saveSettings();
};

setInterval(()=>{
  document.querySelectorAll(".visualizer i").forEach(b=>{
    b.style.height=(6+Math.random()*22)+"px";
  });
},120);

(async()=>{
  loadSettings();
  try{await openDB();await loadSongs()}catch(e){console.warn(e)}
})();
