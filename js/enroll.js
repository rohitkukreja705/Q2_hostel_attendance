if (prompt("Admin Password") !== "admin123") {
  alert("Access denied");
  window.location.href = "index.html";
}

const GAS_URL = "https://script.google.com/macros/s/AKfycbxGLHhVupOddlZrDHvqBq4n084qT1uFbHV3VPioTmQyImLt66w5QRc3lj09nwp-eh0k/exec";
const video = document.getElementById("video");
const statusText = document.getElementById("status");
const captureBtn = document.querySelector("button.primary");

const MAX_CAPTURES = 5;
let descriptors = [];
let enrolling = false;

Promise.all([
  faceapi.nets.tinyFaceDetector.loadFromUri("./models"),
  faceapi.nets.faceLandmark68Net.loadFromUri("./models"),
  faceapi.nets.faceRecognitionNet.loadFromUri("./models")
]).then(startCamera);

function startCamera() {
  navigator.mediaDevices.getUserMedia({ video: true })
    .then(stream => video.srcObject = stream);
}

async function capture() {
  if (enrolling) return;              // ⛔ block extra clicks
  if (descriptors.length >= MAX_CAPTURES) return;

  const name = document.getElementById("name").value.trim();
  const room = document.getElementById("room").value.trim();

  if (!name || !room) {
    alert("Please enter Name and Room Number");
    return;
  }

  const detection = await faceapi
    .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions())
    .withFaceLandmarks()
    .withFaceDescriptor();

  if (!detection) {
    alert("Face not detected clearly. Try again.");
    return;
  }

  descriptors.push(Array.from(detection.descriptor));
  statusText.innerText = `Captured ${descriptors.length}/${MAX_CAPTURES}`;

  // ✅ When exactly 5 captures are done
  if (descriptors.length === MAX_CAPTURES) {
    enrolling = true;
    captureBtn.disabled = true;
    captureBtn.innerText = "Saving...";

    fetch(GAS_URL, {
      method: "POST",
      body: JSON.stringify({
        type: "ENROLL",
        name,
        room,
        descriptors
      })
    })
    .then(r => r.text())
    .then(resp => {
      if (resp === "DUPLICATE_ENROLL") {
        alert("⚠️ Student already enrolled (same Name & Room)");
        resetEnrollment();
        return;
      }

      statusText.innerText = "Enrollment successful ✅";
      setTimeout(() => {
        window.location.href = "index.html";
      }, 1500);
    });
  }
}

function resetEnrollment() {
  descriptors = [];
  enrolling = false;
  captureBtn.disabled = false;
  captureBtn.innerText = "Capture Face";
  statusText.innerText = "Duplicate found. Try again.";
}
