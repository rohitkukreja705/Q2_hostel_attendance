const video = document.getElementById("video");
const statusText = document.getElementById("status");
const GAS_URL = "https://script.google.com/macros/s/AKfycbxGLHhVupOddlZrDHvqBq4n084qT1uFbHV3VPioTmQyImLt66w5QRc3lj09nwp-eh0k/exec";

// 📍 Q2 Girls Hostel (practical center)
const HOSTEL_LAT = 23.250274224197714;
const HOSTEL_LNG = 77.49987567356052;
const ALLOWED_RADIUS = 50; // meters

let matcher;
let alreadyMarked = false;
let lastDistance = 0;
let userLat = null;
let userLng = null;

function stopCamera() {
  if (video.srcObject) {
    video.srcObject.getTracks().forEach(track => track.stop());
    video.srcObject = null;
  }
}

// ===== IST Date/Time =====
function updateDateTime() {
  const now = new Date();

  const dateFormatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    day: "2-digit", month: "2-digit", year: "numeric"
  });

  const timeFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true
  });

  document.getElementById("liveDate").innerText = dateFormatter.format(now);
  document.getElementById("liveTime").innerText = timeFormatter.format(now);
}
setInterval(updateDateTime, 1000);
updateDateTime();

// ===== GPS display =====
navigator.geolocation.getCurrentPosition(
  pos => {
    document.getElementById("liveGPS").innerText =
      `${pos.coords.latitude.toFixed(9)}, ${pos.coords.longitude.toFixed(9)}`;
  },
  () => document.getElementById("liveGPS").innerText = "📍 GPS unavailable",
  { enableHighAccuracy: true }
);

function distanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function verifyLocation(callback) {
  let count = 0, latSum = 0, lngSum = 0;

  const watcher = navigator.geolocation.watchPosition(
    pos => {
      if (pos.coords.accuracy > 250) return;

      latSum += pos.coords.latitude;
      lngSum += pos.coords.longitude;
      count++;

      if (count >= 3) {
        navigator.geolocation.clearWatch(watcher);
        userLat = (latSum / count).toFixed(9);
        userLng = (lngSum / count).toFixed(9);
        callback(parseFloat(userLat), parseFloat(userLng));
      }
    },
    () => alert("Enable GPS"),
    { enableHighAccuracy: true }
  );
}

async function getPublicIP() {
  try {
    const res = await fetch("https://api.ipify.org?format=json");
    return (await res.json()).ip;
  } catch {
    return "UNKNOWN";
  }
}

function getISTDateTime() {
  const now = new Date();
  const date = new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Kolkata",day:"2-digit",month:"2-digit",year:"numeric"}).format(now);
  const time = new Intl.DateTimeFormat("en-US",{timeZone:"Asia/Kolkata",hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:true}).format(now);
  const hour = parseInt(new Intl.DateTimeFormat("en-IN",{timeZone:"Asia/Kolkata",hour:"2-digit",hour12:false}).format(now));
  return { date, time, hour };
}

async function startAttendance() {
  const now = getISTDateTime();
  if (now.hour < 11) {
    alert("Attendance allowed only between 9 PM to 10 PM IST");
    return;
  }

  verifyLocation(async (lat, lng) => {
    lastDistance = Math.round(distanceMeters(lat, lng, HOSTEL_LAT, HOSTEL_LNG));

    if (lastDistance > ALLOWED_RADIUS) {
      alert(`Outside hostel area\nDistance: ${lastDistance} m`);
      return;
    }

    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri("./models"),
      faceapi.nets.faceLandmark68Net.loadFromUri("./models"),
      faceapi.nets.faceRecognitionNet.loadFromUri("./models")
    ]);

    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    video.srcObject = stream;

    const faces = await fetch(GAS_URL).then(r => r.json());
    matcher = new faceapi.FaceMatcher(
      faces.map(f => new faceapi.LabeledFaceDescriptors(
        f.label,
        f.descriptors.map(d => new Float32Array(d))
      )), 0.45
    );

    detectLoop();
  });
}

async function detectLoop() {
  if (alreadyMarked) return;

  const d = await faceapi.detectSingleFace(video,new faceapi.TinyFaceDetectorOptions()).withFaceLandmarks().withFaceDescriptor();
  if (!d) return setTimeout(detectLoop,2000);

  const match = matcher.findBestMatch(d.descriptor);
  if (match.label === "unknown") {
    alert("Non enrolled user detected while taking attendance.");
    return;
  }

  submitAttendance(match.label);
}

async function submitAttendance(label) {
  const [name, room] = label.split("|");
  const now = getISTDateTime();
  const status = now.hour >= 22 ? "Late" : "Present";
  const ip = await getPublicIP();

  const resp = await fetch(GAS_URL,{
    method:"POST",
    body:JSON.stringify({
      type:"ATTEND",
      name,room,
      date:now.date,
      time:now.time,
      status,
      distance:lastDistance,
      ip,
      latitude:userLat,
      longitude:userLng
    })
  }).then(r=>r.text());

  if (resp === "IP_BLOCKED") {
    alert("Connect to Hostel WiFi");
    stopCamera();
    return;
  }

  if (resp === "DUPLICATE") {
    alert("Attendance already marked.");
    stopCamera();
    alreadyMarked = true;
    return;
  }

  alert(`Attendance marked successfully\nStatus: ${status}`);
  alreadyMarked = true;
  stopCamera();
}
