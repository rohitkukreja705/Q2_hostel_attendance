const GAS_URL = "https://script.google.com/macros/s/AKfycbxGLHhVupOddlZrDHvqBq4n084qT1uFbHV3VPioTmQyImLt66w5QRc3lj09nwp-eh0k/exec";
const video = document.getElementById("video");
const statusText = document.getElementById("status");

// 📍 Q2 Girls Hostel Location
const HOSTEL_LAT = 23.2599;
const HOSTEL_LNG = 77.4126;
const ALLOWED_RADIUS = 10; // meters

let matcher;
let alreadyMarked = false;

function getIST() {
  return new Date(
    new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })
  );
}

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

async function startAttendance() {
  const now = getIST();

  if (now.getHours() < 21) {
    alert("Attendance allowed only between 9 PM to 10 PM IST");
    return;
  }

  statusText.innerText = "Checking location...";

  navigator.geolocation.getCurrentPosition(async pos => {
    const d = distanceMeters(
      pos.coords.latitude,
      pos.coords.longitude,
      HOSTEL_LAT,
      HOSTEL_LNG
    );

    if (d > ALLOWED_RADIUS) {
      alert("You are not at Q2 Girls Hostel location");
      statusText.innerText = "Outside hostel location";
      return;
    }

    statusText.innerText = "Loading face models...";

    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri("./models"),
      faceapi.nets.faceLandmark68Net.loadFromUri("./models"),
      faceapi.nets.faceRecognitionNet.loadFromUri("./models")
    ]);

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
      0.45
    );

    statusText.innerText = "Detecting face...";
    detectLoop();

  }, () => alert("Enable GPS to mark attendance"), { enableHighAccuracy: true });
}

async function detectLoop() {
  if (alreadyMarked) return;

  const d = await faceapi
    .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions())
    .withFaceLandmarks()
    .withFaceDescriptor();

  if (d) {
    const match = matcher.findBestMatch(d.descriptor);
    if (match.label !== "unknown") {
      submitAttendance(match.label);
      return;
    }
  }
  setTimeout(detectLoop, 2500);
}

function submitAttendance(label) {
  const [name, room] = label.split("|");
  const now = getIST();

  const status = now.getHours() >= 22 ? "Late" : "Present";

  fetch(GAS_URL, {
    method: "POST",
    body: JSON.stringify({
      type: "ATTEND",
      name,
      room,
      date: now.toLocaleDateString("en-GB"),
      time: now.toLocaleTimeString(),
      status
    })
  });

  statusText.innerText = `Attendance marked (${status})`;
  alreadyMarked = true;
  video.srcObject.getTracks().forEach(t => t.stop());
}
