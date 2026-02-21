const video = document.getElementById("video");
const statusText = document.getElementById("status");
const GAS_URL = "https://script.google.com/macros/s/AKfycbxGLHhVupOddlZrDHvqBq4n084qT1uFbHV3VPioTmQyImLt66w5QRc3lj09nwp-eh0k/exec";

const HOSTEL_LAT = 23.250761280;
const HOSTEL_LNG = 77.499552907;
const ALLOWED_RADIUS = 50; // meters

let matcher, alreadyMarked=false, lastDistance=0, userLat, userLng;

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

function updateGPS() {
  if (!navigator.geolocation) {
    gpsEl.innerText = "GPS not supported";
    return;
  }

  gpsEl.innerText = "Getting location...";

  navigator.geolocation.getCurrentPosition(
    function (pos) {
      const lat = pos.coords.latitude.toFixed(9);
      const lng = pos.coords.longitude.toFixed(9);
      gpsEl.innerText = `${lat}, ${lng}`;
    },
    function (err) {
      console.error("GPS Error:", err);
      gpsEl.innerText = "Location blocked";
    },
    {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0
    }
  );
}

updateGPS();

function distanceMeters(a,b,c,d){
  const R=6371000, dLat=(c-a)*Math.PI/180, dLon=(d-b)*Math.PI/180;
  const x=Math.sin(dLat/2)**2+Math.cos(a*Math.PI/180)*Math.cos(c*Math.PI/180)*Math.sin(dLon/2)**2;
  return R*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x));
}

function verifyLocation(cb){
  let count=0, lat=0,lng=0;
  const w=navigator.geolocation.watchPosition(p=>{
    if(p.coords.accuracy>250) return;
    lat+=p.coords.latitude; lng+=p.coords.longitude; count++;
    if(count>=3){
      navigator.geolocation.clearWatch(w);
      userLat=(lat/count).toFixed(9); userLng=(lng/count).toFixed(9);
      cb(parseFloat(userLat),parseFloat(userLng));
    }
  });
}

async function getPublicIP(){
  try{ return (await fetch("https://api.ipify.org?format=json").then(r=>r.json())).ip;}
  catch{return "UNKNOWN";}
}

function getIST(){ const d=new Date(); return parseInt(new Intl.DateTimeFormat("en-IN",{timeZone:"Asia/Kolkata",hour:"2-digit",hour12:false}).format(d)); }

async function startAttendance(){
  if(getIST()<21){ alert("Attendance allowed 9PM–10PM"); return; }

  showLoader(); setProgress(15);

  const ip=await getPublicIP();
  if(ip!=="106.222.217.157"){ hideLoader(); alert("Connect to Hostel WiFi"); return;}
  stepIP.classList.add("step-done"); setProgress(35);

  verifyLocation(async(lat,lng)=>{
    lastDistance=Math.round(distanceMeters(lat,lng,HOSTEL_LAT,HOSTEL_LNG));
    if(lastDistance>ALLOWED_RADIUS){ hideLoader(); alert("Outside hostel"); return;}

    stepLocation.classList.add("step-done"); setProgress(60);

    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri("./models"),
      faceapi.nets.faceLandmark68Net.loadFromUri("./models"),
      faceapi.nets.faceRecognitionNet.loadFromUri("./models")
    ]);
    stepFace.classList.add("step-done"); setProgress(80);

    const stream=await navigator.mediaDevices.getUserMedia({video:true});
    video.srcObject=stream;

    const faces=await fetch(GAS_URL).then(r=>r.json());
    matcher=new faceapi.FaceMatcher(
      faces.map(f=>new faceapi.LabeledFaceDescriptors(f.label,f.descriptors.map(d=>new Float32Array(d)))),0.45
    );
    detectLoop();
  });
}

async function detectLoop(){
  if(alreadyMarked) return;
  const d=await faceapi.detectSingleFace(video,new faceapi.TinyFaceDetectorOptions()).withFaceLandmarks().withFaceDescriptor();
  if(!d) return setTimeout(detectLoop,2000);
  const match=matcher.findBestMatch(d.descriptor);
  if(match.label==="unknown"){ hideLoader(); alert("Non enrolled user detected."); stopCamera(); return;}
  submitAttendance(match.label);
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
