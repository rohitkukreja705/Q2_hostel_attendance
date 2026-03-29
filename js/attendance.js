const video = document.getElementById("video");
const statusText = document.getElementById("status");

const GAS_URL = "https://script.google.com/macros/s/AKfycbxGLHhVupOddlZrDHvqBq4n084qT1uFbHV3VPioTmQyImLt66w5QRc3lj09nwp-eh0k/exec";

const HOSTEL_LAT = 23.250843464;
const HOSTEL_LNG = 77.499573455;
//const HOSTEL_LAT = 23.281280329;
//const HOSTEL_LNG = 77.468973571;
const ALLOWED_RADIUS = 50;

let matcher, lastDistance = 0, userLat, userLng;
let currentIP = null;

// ===== GET IP ON LOAD =====
async function showIP() {
  try {
    const res = await fetch("https://api.ipify.org?format=json");
    const data = await res.json();
    currentIP = data.ip;
    document.getElementById("liveIP").innerText = "🌐 " + currentIP;
  } catch {
    document.getElementById("liveIP").innerText = "🌐 IP unavailable";
  }
}
showIP();

// ===== DISTANCE =====
function distanceMeters(a, b, c, d) {
  const R = 6371000;
  const dLat = (c - a) * Math.PI / 180;
  const dLon = (d - b) * Math.PI / 180;

  const x = Math.sin(dLat / 2) ** 2 +
    Math.cos(a * Math.PI / 180) *
    Math.cos(c * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;

  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

// ===== GET IST TIME =====
function getISTTime() {
  const now = new Date();

  const hour = parseInt(new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    hour12: false
  }).format(now));

  const minute = parseInt(new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    minute: "2-digit"
  }).format(now));

  return { hour, minute };
}

// ===== START ATTENDANCE =====
async function startAttendance() {

  const time = getISTTime();

  // ⏱️ SAME AS BACKEND
  if (time.hour < 21 || (time.hour === 21 && time.minute < 30)) {
    alert("Attendance starts at 09:30 PM");
    return;
  }

  if (time.hour === 22 && time.minute > 30) {
    alert("Attendance closed after 10:40 PM");
    return;
  }

  // 🌐 IP CHECK
  const allowedPrefixes = ["106.222.", "223.229."];
  const isAllowed = allowedPrefixes.some(prefix =>
    currentIP && currentIP.startsWith(prefix)
  );

  if (!isAllowed) {
    alert("Connect to Hostel WiFi");
    return;
  }

  // 📍 LOCATION
  navigator.geolocation.getCurrentPosition(async (pos) => {

    userLat = pos.coords.latitude;
    userLng = pos.coords.longitude;

    lastDistance = Math.round(
      distanceMeters(userLat, userLng, HOSTEL_LAT, HOSTEL_LNG)
    );

    if (lastDistance > ALLOWED_RADIUS) {
      alert("Outside hostel range");
      return;
    }

    // 🤖 LOAD MODELS
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri("./models"),
      faceapi.nets.faceLandmark68Net.loadFromUri("./models"),
      faceapi.nets.faceRecognitionNet.loadFromUri("./models")
    ]);

    // 🎥 CAMERA
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    video.srcObject = stream;

    const faces = await fetch(GAS_URL).then(r => r.json());

    matcher = new faceapi.FaceMatcher(
      faces.map(f =>
        new faceapi.LabeledFaceDescriptors(
          f.label,
          f.descriptors.map(d => new Float32Array(d))
        )
      ),
      0.6
    );

    detectAndSubmit();

  }, () => {
    alert("Enable GPS");
  });
}

// ===== FACE DETECTION =====
async function detectAndSubmit() {

  const detection = await faceapi
    .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions())
    .withFaceLandmarks()
    .withFaceDescriptor();

  if (!detection) {
    alert("Face not detected");
    return;
  }

  const bestMatch = matcher.findBestMatch(detection.descriptor);

  if (bestMatch.label === "unknown") {
    alert("Face not recognized");
    return;
  }

  submitAttendance(bestMatch.label);
}

// ===== SUBMIT =====
async function submitAttendance(label) {

  const [name, room] = label.split("|");

  const time = getISTTime();
  let status = (time.minute <= 35) ? "Present" : "Late";

  const payload = {
    type: "ATTEND",
    name,
    room,
    date: new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata" }).format(new Date()), // ✅ FIXED
    time: new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      hour: "2-digit",
      minute: "2-digit"
    }).format(new Date()),
    status,
    distance: lastDistance,
    ip: currentIP, // ✅ FIXED (no double fetch)
    latitude: userLat,
    longitude: userLng
  };

  const resp = await fetch(GAS_URL, {
    method: "POST",
    body: JSON.stringify(payload)
  }).then(r => r.text());

  if (resp === "DUPLICATE") {
    alert("⚠️ Already marked today");
    return;
  }

  if (resp === "IP_BLOCKED") {
    alert("🚫 Connect to hostel WiFi");
    return;
  }

  alert("✅ Attendance marked (" + status + ")");
}
