const video = document.getElementById("video");
const statusText = document.getElementById("status");
const GAS_URL = "https://script.google.com/macros/s/AKfycbxGLHhVupOddlZrDHvqBq4n084qT1uFbHV3VPioTmQyImLt66w5QRc3lj09nwp-eh0k/exec";
const ipEl = document.getElementById("liveIP");
const HOSTEL_LAT = 23.250761280;
const HOSTEL_LNG = 77.499552907;
const ALLOWED_RADIUS = 50; // meters
// ===== ELEMENTS =====
const capturePanel = document.getElementById("capturePanel");
const countdownEl = document.getElementById("countdown");
const captureText = document.getElementById("captureText");

const ipEl = document.getElementById("liveIP");
const gpsEl = document.getElementById("liveGPS");

const loader = document.getElementById("loader");
const progressBar = document.getElementById("progressBar");

const stepIP = document.getElementById("step-ip");
const stepLocation = document.getElementById("step-location");
const stepFace = document.getElementById("step-face");
const stepSubmit = document.getElementById("step-submit");

let matcher;
let alreadyMarked = false;
let lastDistance = 0;
let userLat = null;
let userLng = null;
let currentIP = null;

// ================= LOADER =================
function showLoader(){ loader.classList.remove("hidden"); progressBar.style.width="0%"; }
function hideLoader(){ loader.classList.add("hidden"); }
function setProgress(p){ progressBar.style.width=p+"%"; }

// ================= CAMERA =================
function stopCamera(){
  if(video.srcObject){
    video.srcObject.getTracks().forEach(t=>t.stop());
    video.srcObject=null;
  }
}

// ================= DATE TIME =================
function updateDateTime(){
  const now=new Date();
  document.getElementById("liveDate").innerText =
    new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Kolkata"}).format(now);

  document.getElementById("liveTime").innerText =
    new Intl.DateTimeFormat("en-US",{timeZone:"Asia/Kolkata",
      hour:"2-digit",minute:"2-digit",second:"2-digit"}).format(now);
}
setInterval(updateDateTime,1000);
updateDateTime();

// ================= GPS =================
function updateGPS(){
  if(!navigator.geolocation){
    gpsEl.innerText="📍 GPS not supported";
    return;
  }

  gpsEl.innerText="📍 Getting location...";

  navigator.geolocation.getCurrentPosition(
    pos=>{
      userLat = pos.coords.latitude.toFixed(9);
      userLng = pos.coords.longitude.toFixed(9);
      gpsEl.innerText = `${userLat}, ${userLng}`;
    },
    ()=> gpsEl.innerText="📍 Location blocked",
    {enableHighAccuracy:true}
  );
}
updateGPS();

// ================= IP =================
async function showIP(){
  ipEl.innerText="🌐 Getting IP...";
  try{
    const res = await fetch("https://api.ipify.org?format=json");
    const data = await res.json();
    currentIP = data.ip;
    ipEl.innerText = "🌐 " + currentIP;
  }catch{
    ipEl.innerText="🌐 IP unavailable";
  }
}
showIP();

// ================= UTIL =================
function distanceMeters(a,b,c,d){
  const R=6371000;
  const dLat=(c-a)*Math.PI/180;
  const dLon=(d-b)*Math.PI/180;
  const x=Math.sin(dLat/2)**2 +
    Math.cos(a*Math.PI/180)*Math.cos(c*Math.PI/180)*Math.sin(dLon/2)**2;
  return R*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x));
}

function getISTHour(){
  return parseInt(new Intl.DateTimeFormat("en-IN",
    {timeZone:"Asia/Kolkata",hour:"2-digit",hour12:false}).format(new Date()));
}

// ================= START ATTENDANCE =================
async function startAttendance(){

  if(getISTHour()<21){
    alert("Attendance allowed 9PM–10PM");
    return;
  }

  showLoader();
  setProgress(15);

  if(!currentIP) await showIP();

  // 🔹 PREFIX CHECK (matches Apps Script)
  if(!currentIP.startsWith("106.222.")){
    hideLoader();
    alert("Connect to Hostel WiFi");
    return;
  }

  stepIP.classList.add("step-done");
  setProgress(35);

  if(!userLat || !userLng){
    updateGPS();
    await new Promise(r=>setTimeout(r,2000));
  }

  lastDistance = Math.round(distanceMeters(userLat,userLng,HOSTEL_LAT,HOSTEL_LNG));

  if(lastDistance > ALLOWED_RADIUS){
    hideLoader();
    alert(`Outside hostel area\nDistance: ${lastDistance} m`);
    return;
  }

  stepLocation.classList.add("step-done");
  setProgress(60);

  await Promise.all([
    faceapi.nets.tinyFaceDetector.loadFromUri("./models"),
    faceapi.nets.faceLandmark68Net.loadFromUri("./models"),
    faceapi.nets.faceRecognitionNet.loadFromUri("./models")
  ]);

  stepFace.classList.add("step-done");
  setProgress(80);

  const stream = await navigator.mediaDevices.getUserMedia({video:true});
  video.srcObject = stream;
  await video.play();

  const faces = await fetch(GAS_URL).then(r=>r.json());

  matcher = new faceapi.FaceMatcher(
    faces.map(f=> new faceapi.LabeledFaceDescriptors(
      f.label, f.descriptors.map(d=>new Float32Array(d))
    )),
    0.6
  );

  hideLoader();
  startCaptureSequence();
}

// ================= COUNTDOWN =================
function startCaptureSequence(){
  capturePanel.classList.remove("hidden");
  captureText.innerText="Look straight at camera";

  let t=5;
  countdownEl.innerText=t;

  const timer=setInterval(()=>{
    t--;
    countdownEl.innerText=t;

    if(t===0){
      clearInterval(timer);
      capturePanel.classList.add("hidden");
      detectAndSubmit();
    }
  },1000);
}

// ================= FACE DETECT =================
async function detectAndSubmit(){

  let attempts=0;
  let bestMatch=null;

  while(attempts<5){
    const d = await faceapi.detectSingleFace(
      video,
      new faceapi.TinyFaceDetectorOptions({inputSize:320,scoreThreshold:0.5})
    ).withFaceLandmarks().withFaceDescriptor();

    if(d){
      bestMatch = matcher.findBestMatch(d.descriptor);
      if(bestMatch.label!=="unknown") break;
    }

    attempts++;
    await new Promise(r=>setTimeout(r,600));
  }

  if(!bestMatch || bestMatch.label==="unknown"){
    alert("Face not recognized. Try again.");
    stopCamera();
    return;
  }

  submitAttendance(bestMatch.label);
}

// ================= SUBMIT =================
async function submitAttendance(label){

  if(alreadyMarked) return;
  alreadyMarked=true;

  const [name,room]=label.split("|");
  const status = getISTHour()>=22 ? "Late":"Present";

  stepSubmit.classList.add("step-done");
  setProgress(100);

  const resp = await fetch(GAS_URL,{
    method:"POST",
    body:JSON.stringify({
      type:"ATTEND",
      name,
      room,
      date:new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Kolkata"}).format(new Date()),
      time:new Intl.DateTimeFormat("en-US",{timeZone:"Asia/Kolkata",hour:"2-digit",minute:"2-digit"}).format(new Date()),
      status,
      distance:lastDistance,
      ip:currentIP,
      latitude:userLat,
      longitude:userLng
    })
  }).then(r=>r.text());

  hideLoader();

  if(resp==="DUPLICATE"){
    alert("Attendance already marked.");
    stopCamera();
    return;
  }

  if(resp==="IP_BLOCKED"){
    alert("Network not allowed.");
    stopCamera();
    return;
  }

  alert(`Attendance marked\nStatus: ${status}`);
  statusText.innerText="✅ Attendance Marked";
  stopCamera();
}
