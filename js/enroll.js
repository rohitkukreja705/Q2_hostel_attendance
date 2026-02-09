if (prompt("Admin Password") !== "admin123") {
  alert("Access denied");
  window.location.href = "index.html";
}
const video = document.getElementById("video");
const statusText = document.getElementById("status");
const captureBtn = document.querySelector(".primary");

const GAS_URL = "https://script.google.com/macros/s/AKfycbxGLHhVupOddlZrDHvqBq4n084qT1uFbHV3VPioTmQyImLt66w5QRc3lj09nwp-eh0k/exec";
const MAX = 5;

let descriptors = [];
let saving = false;

Promise.all([
  faceapi.nets.tinyFaceDetector.loadFromUri("./models"),
  faceapi.nets.faceLandmark68Net.loadFromUri("./models"),
  faceapi.nets.faceRecognitionNet.loadFromUri("./models")
]).then(() =>
  navigator.mediaDevices.getUserMedia({ video: true })
    .then(s => video.srcObject = s)
);

async function capture() {
  if (saving || descriptors.length >= MAX) return;

  const name = document.getElementById("name").value.trim();
  const room = document.getElementById("room").value.trim();
  if (!name || !room) return alert("Enter Name and Room Number");

  const d = await faceapi
    .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions())
    .withFaceLandmarks()
    .withFaceDescriptor();

  if (!d) return alert("Face not detected");

  descriptors.push(Array.from(d.descriptor));
  statusText.innerText = `Captured ${descriptors.length}/${MAX}`;

  if (descriptors.length === MAX) {
    saving = true;
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
        alert("Student already enrolled");
        location.reload();
        return;
      }
      statusText.innerText = "Enrollment successful";
      setTimeout(() => window.location.href = "index.html", 1500);
    });
  }
}
