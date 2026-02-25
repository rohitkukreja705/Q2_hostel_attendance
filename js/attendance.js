const video = document.getElementById("video");
const statusText = document.getElementById("status");
const GAS_URL = "https://script.google.com/macros/s/AKfycbxGLHhVupOddlZrDHvqBq4n084qT1uFbHV3VPioTmQyImLt66w5QRc3lj09nwp-eh0k/exec";
const HOSTEL_LAT = 23.250843464;
const HOSTEL_LNG = 77.499573455;
//const HOSTEL_LAT = 23.281280329;
//const HOSTEL_LNG = 77.468973571;
const ALLOWED_RADIUS = 30; // meters
const capturePanel = document.getElementById("capturePanel");
const countdownEl = document.getElementById("countdown");
const captureText = document.getElementById("captureText");
let matcher, alreadyMarked=false, lastDistance=0, userLat, userLng;
let currentIP = null;
const ipEl = document.getElementById("liveIP");
const loader=document.getElementById("loader");
const progressBar=document.getElementById("progressBar");
const stepIP=document.getElementById("step-ip");
const stepLocation=document.getElementById("step-location");
const stepFace=document.getElementById("step-face");
const stepSubmit=document.getElementById("step-submit");

function showLoader(){ loader.classList.remove("hidden"); progressBar.style.width="0%"; }
function hideLoader(){ loader.classList.add("hidden"); }
function setProgress(p){ progressBar.style.width=p+"%"; }

function stopCamera(){
  if(video.srcObject){ video.srcObject.getTracks().forEach(t=>t.stop()); video.srcObject=null; }
}

function updateDateTime(){
  const now=new Date();
  document.getElementById("liveDate").innerText=new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Kolkata"}).format(now);
  document.getElementById("liveTime").innerText=new Intl.DateTimeFormat("en-US",{timeZone:"Asia/Kolkata",hour:"2-digit",minute:"2-digit",second:"2-digit"}).format(now);
}
setInterval(updateDateTime,1000); updateDateTime();

const gpsEl = document.getElementById("liveGPS");

function updateGPS() {

  if (!navigator.geolocation) {
    gpsEl.innerText = "📍 GPS not supported";
    return;
  }

  gpsEl.innerText = "📍 Getting location...";

  navigator.geolocation.getCurrentPosition(
    function(position) {

      const lat = position.coords.latitude.toFixed(9);
      const lng = position.coords.longitude.toFixed(9);

      gpsEl.innerText = lat + ", " + lng;

    },
    function(error) {

      console.error("GPS Error:", error);
      gpsEl.innerText = "📍 Location blocked";

    },
    {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0
    }
  );
}

updateGPS();
showIP();
function distanceMeters(a,b,c,d){
  const R=6371000, dLat=(c-a)*Math.PI/180, dLon=(d-b)*Math.PI/180;
  const x=Math.sin(dLat/2)**2+Math.cos(a*Math.PI/180)*Math.cos(c*Math.PI/180)*Math.sin(dLon/2)**2;
  return R*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x));
}

function verifyLocation(callback){

  if(!navigator.geolocation){
    alert("GPS not supported");
    hideLoader();
    return;
  }

  let resolved = false;

  navigator.geolocation.getCurrentPosition(
    pos => {
      resolved = true;

      userLat = pos.coords.latitude.toFixed(9);
      userLng = pos.coords.longitude.toFixed(9);

      callback(parseFloat(userLat), parseFloat(userLng));
    },
    err => {
      console.warn("High accuracy failed, trying fallback");

      // fallback without strict accuracy
      navigator.geolocation.getCurrentPosition(
        pos => {
          userLat = pos.coords.latitude.toFixed(9);
          userLng = pos.coords.longitude.toFixed(9);

          callback(parseFloat(userLat), parseFloat(userLng));
        },
        () => {
          hideLoader();
          alert("Unable to get location. Enable GPS & refresh.");
        }
      );
    },
    {
      enableHighAccuracy:true,
      timeout:7000,
      maximumAge:0
    }
  );
}

async function showIP() {
  ipEl.innerText = "🌐 Getting IP...";
  try {
    const res = await fetch("https://api.ipify.org?format=json");
    const data = await res.json();

    currentIP = data.ip;   // ⭐ THIS LINE FIXES ERROR

    ipEl.innerText = "🌐 " + currentIP;
  } catch (err) {
    console.error("IP fetch error:", err);
    ipEl.innerText = "🌐 IP unavailable";
  }
}


async function getPublicIP(){
  try{ return (await fetch("https://api.ipify.org?format=json").then(r=>r.json())).ip;}
  catch{return "UNKNOWN";}
}

function getIST(){ const d=new Date(); return parseInt(new Intl.DateTimeFormat("en-IN",{timeZone:"Asia/Kolkata",hour:"2-digit",hour12:false}).format(d)); }

async function startAttendance(){
  if(getIST()<7){ alert("Attendance allowed 9PM–10PM"); return; }

  showLoader(); setProgress(15);

  const ip=await getPublicIP();
    // 🔹 PREFIX CHECK (matches Apps Script)
  const allowedPrefixes = ["106.222.","223.229."];
  const isAllowed = allowedPrefixes.some(prefix =>
	  currentIP && currentIP.startsWith(prefix)
	);
	
	if(!isAllowed){
	  hideLoader();
	  alert("Connect to Hostel WiFi");
	  return;
	}

  stepIP.classList.add("step-done");
  setProgress(35);
  verifyLocation(async(lat,lng)=>{
    lastDistance=Math.round(distanceMeters(lat,lng,HOSTEL_LAT,HOSTEL_LNG));
    if(lastDistance>ALLOWED_RADIUS){ hideLoader(); alert("Outside hostel"); return;}

    stepLocation.classList.add("step-done"); setProgress(60);

    await Promise.all([
  faceapi.nets.tinyFaceDetector.loadFromUri("./models"),
  faceapi.nets.faceLandmark68Net.loadFromUri("./models"),
  faceapi.nets.faceRecognitionNet.loadFromUri("./models")
	]).catch(err => {
	  hideLoader();
	  alert("Face models failed to load. Check /models folder.");
	  console.error(err);
	});
	// await Promise.all([...])
    alert("Models loaded");
    stepFace.classList.add("step-done"); setProgress(80);
	hideLoader(); 
    const stream=await navigator.mediaDevices.getUserMedia({video:true});
    video.srcObject=stream;
    hideLoader();
    const faces=await fetch(GAS_URL).then(r=>r.json());
    matcher=new faceapi.FaceMatcher(
      faces.map(f=>new faceapi.LabeledFaceDescriptors(f.label,f.descriptors.map(d=>new Float32Array(d)))),0.6
    );
    startCaptureSequence();
  });
}

function startCaptureSequence() {
  hideLoader();
  capturePanel.classList.remove("hidden");
  captureText.innerText = "Look straight at camera";

  let timeLeft = 5;
  countdownEl.innerText = timeLeft;

  const timer = setInterval(() => {
    timeLeft--;
    countdownEl.innerText = timeLeft;

    if (timeLeft === 0) {
      clearInterval(timer);
      capturePanel.classList.add("hidden");
      detectAndSubmit();
    }
  }, 1000);
}

async function detectAndSubmit() {

  let attempts = 0;
  let bestMatch = null;

  while (attempts < 5) {

    const detection = await faceapi.detectSingleFace(
	  video,
	  new faceapi.TinyFaceDetectorOptions({
		inputSize: 320,
		scoreThreshold: 0.5
	  })
	).withFaceLandmarks().withFaceDescriptor();

    if (detection) {
      bestMatch = matcher.findBestMatch(detection.descriptor);
      if (bestMatch.label !== "unknown") break;
    }

    attempts++;
    await new Promise(r => setTimeout(r, 600));
  }

  if (!bestMatch || bestMatch.label === "unknown") {
    alert("Face not recognized. Please try again in good lighting.");
    stopCamera();
    return;
  }

  submitAttendance(bestMatch.label);
}

async function submitAttendance(label){
  const [name,room]=label.split("|");
  const status=getIST()>=22?"Late":"Present";
  const ip=await getPublicIP();
  stepSubmit.classList.add("step-done"); setProgress(100);

  const resp=await fetch(GAS_URL,{method:"POST",body:JSON.stringify({
    type:"ATTEND",name,room,date:new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Kolkata"}).format(new Date()),
    time:new Intl.DateTimeFormat("en-US",{timeZone:"Asia/Kolkata",hour:"2-digit",minute:"2-digit"}).format(new Date()),
    status,distance:lastDistance,ip,latitude:userLat,longitude:userLng
  })}).then(r=>r.text());

  hideLoader();

  if(resp==="DUPLICATE"){ alert("Attendance already marked."); stopCamera(); return;}
  if(resp==="IP_BLOCKED"){ alert("Connect to Hostel WiFi"); stopCamera(); return;}

  alert(`Attendance marked\nStatus: ${status}`);
  stopCamera();
}
