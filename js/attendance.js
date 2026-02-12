const video = document.getElementById("video");
const statusText = document.getElementById("status");

const GAS_URL = "https://script.google.com/macros/s/AKfycbxGLHhVupOddlZrDHvqBq4n084qT1uFbHV3VPioTmQyImLt66w5QRc3lj09nwp-eh0k/exec";

// 📍 Q2 Girls Hostel (practical center)
const HOSTEL_LAT = 23.250274224197714;
const HOSTEL_LNG = 77.49987567356052;
const ALLOWED_RADIUS = 100; // meters

let matcher;
let alreadyMarked = false;
let lastDistance = 0;

// IST time
function updateDateTime() {
  const now = new Date(
    new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })
  );
  document.getElementById("liveDate").innerText =
    now.toLocaleDateString("en-GB");
  document.getElementById("liveTime").innerText =
    now.toLocaleTimeString();
}
setInterval(updateDateTime, 1000);
updateDateTime();

// Live GPS display
navigator.geolocation.getCurrentPosition(
  pos => {
    document.getElementById("liveGPS").innerText =
      `${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`;
  },
  () => {
    document.getElementById("liveGPS").innerText = "GPS unavailable";
  },
  { enableHighAccuracy: true }
);

// Distance calculation
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

// GPS averaging
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
        callback(latSum / count, lngSum / count);
      }
    },
    () => alert("Enable GPS"),
    { enableHighAccuracy: true }
  );
}

// Start attendance
async function startAttendance() {
  const now = new Date(
    new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })
  );

  if (now.getHours() < 21) {
    alert("Attendance allowed only between 9 PM to 10 PM IST");
    return;
  }

  verifyLocation(async (lat, lng) => {
    lastDistance = Math.round(
      distanceMeters(lat, lng, HOSTEL_LAT, HOSTEL_LNG)
    );

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
      faces.map(f =>
        new faceapi.LabeledFaceDescriptors(
          f.label,
          f.descriptors.map(d => new Float32Array(d))
        )
      ),
      0.45
    );

    detectLoop();
  });
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
  const now = new Date(
    new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })
  );

  const status = now.getHours() >= 22 ? "Late" : "Present";

  fetch(GAS_URL, {
    method: "POST",
    body: JSON.stringify({
      type: "ATTEND",
      name,
      room,
      date: now.toLocaleDateString("en-GB"),
      time: now.toLocaleTimeString(),
      status,
      distance: lastDistance
    })
  });

  alert(`Attendance marked successfully!\nStatus: ${status}`);
  alreadyMarked = true;
}

// Leave
function submitLeave() {
  const name = prompt("Enter your Name");
  const room = prompt("Enter Room Number");
  const reason = prompt("Reason for Leave");
  if (!name || !room || !reason) return;

  fetch(GAS_URL, {
    method: "POST",
    body: JSON.stringify({
      type: "LEAVE",
      name,
      room,
      reason,
      date: new Date().toLocaleDateString("en-GB")
    })
  });

  alert("Leave request submitted");
}

// Complaint
function submitComplaint() {
  const name = prompt("Enter your Name");
  const room = prompt("Enter Room Number");
  const complaint = prompt("Enter Complaint");
  if (!name || !room || !complaint) return;

  fetch(GAS_URL, {
    method: "POST",
    body: JSON.stringify({
      type: "COMPLAINT",
      name,
      room,
      complaint,
      date: new Date().toLocaleDateString("en-GB")
    })
  });

  alert("Complaint submitted");
}
