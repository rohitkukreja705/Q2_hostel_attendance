if (prompt("Admin Password") !== "admin123") {
  alert("Access denied");
  window.location.href = "index.html";
}
const video=document.getElementById("video");
const statusText=document.getElementById("status");
const GAS_URL = "https://script.google.com/macros/s/AKfycbxGLHhVupOddlZrDHvqBq4n084qT1uFbHV3VPioTmQyImLt66w5QRc3lj09nwp-eh0k/exec";
let desc=[];

Promise.all([
 faceapi.nets.tinyFaceDetector.loadFromUri("./models"),
 faceapi.nets.faceLandmark68Net.loadFromUri("./models"),
 faceapi.nets.faceRecognitionNet.loadFromUri("./models")
]).then(()=>navigator.mediaDevices.getUserMedia({video:true}).then(s=>video.srcObject=s));

async function capture(){
 const name=document.getElementById("name").value.trim();
 const room=document.getElementById("room").value.trim();
 if(!name||!room) return alert("Enter details");

 const d=await faceapi.detectSingleFace(video,new faceapi.TinyFaceDetectorOptions()).withFaceLandmarks().withFaceDescriptor();
 if(!d) return alert("Face not detected");

 desc.push(Array.from(d.descriptor));
 statusText.innerText=`Captured ${desc.length}/5`;

 if(desc.length===5){
   const resp=await fetch(GAS_URL,{method:"POST",body:JSON.stringify({type:"ENROLL",name,room,descriptors:desc})}).then(r=>r.text());
   if(resp==="DUPLICATE_ENROLL") return alert("Already enrolled");
   alert("User enrolled successfully");
   window.location.href="index.html";
 }
}
