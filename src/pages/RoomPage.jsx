// // Import hooks
// import { useEffect, useCallback, useRef, useReducer, useMemo } from "react";

// // Import router
// import { useParams } from "react-router-dom";

// // Import Files
// import { useSocket } from "../providers/Socket";
// import { usePeer } from "../providers/Peer";
// import { initialState, roomReducer } from "../providers/roomReducer";
// import RealTimeClock from "../components/RealTimeClock";
// import CallTime from "../components/CallTime";

// // Import React-Icons
// import {
//   Mic,
//   MicOff,
//   Camera,
//   CameraOff,
//   Volume2,
//   Share2,
//   CircleAlert,
//   Clock,
//   Circle,
//   Headphones,
//   PhoneOff,
//   MessageSquareText,
//   MessageSquareOff,
//   X,
//   Users,
//   Ear,
// } from "lucide-react";

// // import toast to display Notification
// import toast, { Toaster } from "react-hot-toast";

// // RoomPage Component
// const RoomPage = () => {
//   // Socket Destruction
//   const { socket } = useSocket();
//   const { peer, createOffer, createAnswer, setRemoteAns, sendStream, setRemoteSocketId } = usePeer();

//   // RoomID
//   const { roomId } = useParams();

//   // Enhanced initialState - SIMPLIFIED
//   const enhancedInitialState = useMemo(() => ({
//     ...initialState,
//     echoCancellationEnabled: true,
//     noiseSuppressionEnabled: true,
//     audioDevices: [],
//     selectedAudioDevice: null,
//     audioProcessingActive: true,
//     // Add speaker mode flag
//     speakerMode: false
//   }), []);

//   // useReducer
//   const [state, dispatch] = useReducer(roomReducer, enhancedInitialState);

//   // useRef
//   const pendingIncomingCall = useRef(null);
//   const myVideoRef = useRef();
//   const remoteVideoRef = useRef();
//   const remoteStreamRef = useRef(null);
//   const remoteSocketIdRef = useRef(null);
//   // Remove complex audio processing refs
//   const localAudioRef = useRef(null);
//   const audioDevicesCache = useRef([]);

//   // totalUsers
//   const totalUsers = useMemo(() => (state.remoteName ? 2 : 1), [state.remoteName]);

//   // ------------------ Helper Functions ------------------
//   const getCallDurationText = () => {
//     if (!state.callStartTime) return "0 seconds";

//     const now = Date.now();
//     const elapsed = now - state.callStartTime;

//     const hours = Math.floor(elapsed / (1000 * 60 * 60));
//     const minutes = Math.floor((elapsed % (1000 * 60 * 60)) / (1000 * 60));
//     const seconds = Math.floor((elapsed % (1000 * 60)) / 1000);

//     let durationText = "";
//     if (hours > 0) {
//       durationText += `${hours} hour${hours > 1 ? "s" : ""}`;
//       if (minutes > 0) durationText += ` ${minutes} minute${minutes > 1 ? "s" : ""}`;
//     } else if (minutes > 0) {
//       durationText += `${minutes} minute${minutes > 1 ? "s" : ""}`;
//       if (seconds > 0 && minutes < 5) durationText += ` ${seconds} second${seconds > 1 ? "s" : ""}`;
//     } else {
//       durationText += `${seconds} second${seconds > 1 ? "s" : ""}`;
//     }

//     return durationText.trim();
//   };

//   // ------------------ SIMPLIFIED Audio Device Management ------------------
//   const listAudioDevices = useCallback(async () => {
//     try {
//       // First get permission by accessing media
//       await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      
//       const devices = await navigator.mediaDevices.enumerateDevices();
//       const audioInputDevices = devices.filter(d => d.kind === 'audioinput');
      
//       console.log("🎤 Available audio devices:", audioInputDevices);
//       dispatch({ type: "SET_AUDIO_DEVICES", payload: audioInputDevices });
//       audioDevicesCache.current = audioInputDevices;
      
//       return audioInputDevices;
//     } catch (err) {
//       console.warn("Could not list audio devices:", err);
//       return [];
//     }
//   }, []);

//   // ------------------ SIMPLIFIED Incoming Call ------------------
//   const handleIncomingCall = useCallback(
//     async ({ from, offer, fromName }) => {
//       dispatch({ type: "SET_REMOTE_EMAIL", payload: from });
//       dispatch({ type: "SET_REMOTE_NAME", payload: fromName });
      
//       remoteSocketIdRef.current = from;
//       if (setRemoteSocketId) {
//         setRemoteSocketId(from);
//       }
//       console.log("📲 Incoming call from:", from);

//       if (!state.streamReady) {
//         pendingIncomingCall.current = { from, offer, fromName };
//         console.log("⏳ Stream not ready, incoming call pending...");
//         return;
//       }

//       try {
//         console.log("📝 Creating answer for:", from);
//         const answer = await createAnswer(offer);
//         socket.emit("call-accepted", { 
//           to: from, 
//           ans: answer 
//         });
//         console.log("📨 Answer sent to:", from);
//       } catch (err) {
//         console.error("❌ Error creating answer:", err);
//       }
//     },
//     [createAnswer, socket, state.streamReady, setRemoteSocketId],
//   );

//   // ------------------ New User Joined ------------------
//   const handleNewUserJoined = useCallback(
//     async ({ emailId, name, socketId }) => {
//       dispatch({ type: "SET_REMOTE_EMAIL", payload: emailId });
//       dispatch({ type: "SET_REMOTE_NAME", payload: name });
      
//       remoteSocketIdRef.current = socketId;
//       if (setRemoteSocketId) {
//         setRemoteSocketId(socketId);
//       }
//       console.log("✅ Remote socket ID stored:", socketId);

//       if (!state.streamReady) {
//         pendingIncomingCall.current = { fromEmail: emailId, fromName: name, socketId };
//         console.log("⏳ Stream not ready, call pending...");
//         return;
//       }

//       try {
//         console.log("📞 Creating offer for:", emailId);
//         const offer = await createOffer();
//         socket.emit("call-user", { 
//           emailId, 
//           offer,
//           socketId: socketId
//         });
//         console.log("📨 Offer sent to:", emailId);
//       } catch (err) {
//         console.error("❌ Error creating offer:", err);
//       }
//     },
//     [createOffer, socket, state.streamReady, setRemoteSocketId],
//   );

//   // ------------------ Call Accepted ------------------
//   const handleCallAccepted = useCallback(
//     async ({ ans }) => {
//       try {
//         console.log("✅ Setting remote answer");
//         await setRemoteAns(ans);
//         console.log("✅ Remote answer set successfully");
//       } catch (err) {
//         console.error("❌ Error setting remote answer:", err);
//       }
//     },
//     [setRemoteAns],
//   );

//   // ------------------ SIMPLIFIED Local Media ------------------
//   const getUserMediaStream = useCallback(async () => {
//     try {
//       console.log("🎥 Requesting camera and microphone access...");
      
//       // SIMPLIFIED constraints - Echo aur noise issues ke liye
//       const constraints = {
//         video: { 
//           width: { ideal: 640 }, // Lower resolution for better performance
//           height: { ideal: 480 },
//           frameRate: { ideal: 24 },
//           facingMode: "user"
//         },
//         audio: { 
//           // SIMPLIFIED - Let browser handle defaults
//           echoCancellation: true,
//           noiseSuppression: true,
//           autoGainControl: true,
//           // Remove strict constraints causing OverconstrainedError
//         }
//       };

//       const stream = await navigator.mediaDevices.getUserMedia(constraints);

//       console.log("✅ Media devices accessed successfully");
//       dispatch({ type: "SET_MY_STREAM", payload: stream });
      
//       if (myVideoRef.current) {
//         myVideoRef.current.srcObject = stream;
//         console.log("✅ Local video stream attached");
//       }
      
//       await sendStream(stream);
//       dispatch({ type: "SET_STREAM_READY", payload: true });
//       console.log("✅ Stream ready for WebRTC");

//       // List audio devices after getting permission
//       listAudioDevices();

//       // Handle pending incoming call automatically
//       if (pendingIncomingCall.current) {
//         console.log("🔄 Processing pending incoming call...");
//         handleIncomingCall(pendingIncomingCall.current);
//         pendingIncomingCall.current = null;
//       }
//     } catch (err) {
//       console.error("❌ Error accessing media devices:", err);
      
//       // SIMPLIFIED fallback
//       try {
//         console.log("🔄 Trying basic fallback constraints...");
//         const fallbackStream = await navigator.mediaDevices.getUserMedia({
//           video: true,
//           audio: true // Most basic
//         });
        
//         dispatch({ type: "SET_MY_STREAM", payload: fallbackStream });
//         await sendStream(fallbackStream);
//         dispatch({ type: "SET_STREAM_READY", payload: true });
        
//         listAudioDevices();
//       } catch (fallbackErr) {
//         console.error("Fallback also failed:", fallbackErr);
//         toast.error("Please allow camera and microphone access");
//       }
//     }
//   }, [sendStream, handleIncomingCall, listAudioDevices]);

//   // Initial call to getUserMediaStream
//   useEffect(() => {
//     getUserMediaStream();
//   }, [getUserMediaStream]);

//   // ------------------ SIMPLIFIED Audio Processing ------------------
//   useEffect(() => {
//     if (!state.myStream) return;

//     // Apply echo cancellation to audio tracks
//     const applyAudioSettings = () => {
//       const audioTracks = state.myStream.getAudioTracks();
//       audioTracks.forEach(track => {
//         try {
//           track.applyConstraints({
//             echoCancellation: state.echoCancellationEnabled,
//             noiseSuppression: state.noiseSuppressionEnabled,
//             autoGainControl: true
//           });
//         } catch (err) {
//           console.warn("Could not apply audio settings:", err);
//         }
//       });
//     };

//     applyAudioSettings();
//   }, [state.myStream, state.echoCancellationEnabled, state.noiseSuppressionEnabled]);

//   // ------------------ ICE Candidates ------------------
//   useEffect(() => {
//     if (!socket || !peer) return;

//     const handleIncomingIceCandidate = ({ candidate, from }) => {
//       console.log("📥 Received ICE candidate from:", from, candidate);
//       if (candidate && peer.remoteDescription) {
//         peer.addIceCandidate(new RTCIceCandidate(candidate)).catch(err => {
//           console.error("❌ Error adding ICE candidate:", err);
//         });
//       }
//     };

//     const handleLocalIceCandidate = (event) => {
//       if (event.candidate && remoteSocketIdRef.current && socket) {
//         console.log("📤 Sending ICE candidate to:", remoteSocketIdRef.current, event.candidate);
//         socket.emit("ice-candidate", {
//           to: remoteSocketIdRef.current,
//           candidate: event.candidate,
//         });
//       }
//     };

//     socket.on("ice-candidate", handleIncomingIceCandidate);
//     peer.onicecandidate = handleLocalIceCandidate;

//     peer.oniceconnectionstatechange = () => {
//       console.log("❄️ ICE Connection State:", peer.iceConnectionState);
//       if (peer.iceConnectionState === "failed") {
//         console.log("🔄 ICE failed, trying to restart...");
//         try {
//           peer.restartIce();
//         } catch (err) {
//           console.error("❌ Failed to restart ICE:", err);
//         }
//       }
//     };

//     return () => {
//       socket.off("ice-candidate", handleIncomingIceCandidate);
//       if (peer) {
//         peer.onicecandidate = null;
//         peer.oniceconnectionstatechange = null;
//       }
//     };
//   }, [socket, peer]);

//   // ------------------ Remote Track ------------------
//   useEffect(() => {
//     let playTimeout;

//     const handleTrackEvent = (event) => {
//       if (event.streams && event.streams[0]) {
//         remoteStreamRef.current = event.streams[0];

//         if (remoteVideoRef.current) {
//           remoteVideoRef.current.srcObject = remoteStreamRef.current;

//           clearTimeout(playTimeout);
//           playTimeout = setTimeout(() => {
//             if (remoteVideoRef.current.paused) {
//               remoteVideoRef.current.play().catch((err) => {
//                 if (err.name !== "AbortError") console.error("❌ Error playing remote video:", err);
//               });
//             }
//           }, 50);
//         }
//       }
//     };

//     peer.addEventListener("track", handleTrackEvent);
//     return () => {
//       peer.removeEventListener("track", handleTrackEvent);
//       clearTimeout(playTimeout);
//     };
//   }, [peer]);

//   // If remote video is not received yet, retry connecting after 1 second
//   useEffect(() => {
//     if (!remoteStreamRef.current && state.remoteEmail && state.streamReady) {
//       console.log("🔄 Retrying connection to remote user...");
//       const retry = setTimeout(() => {
//         handleNewUserJoined({ 
//           emailId: state.remoteEmail, 
//           name: state.remoteName,
//           socketId: remoteSocketIdRef.current 
//         });
//       }, 1000);
//       return () => clearTimeout(retry);
//     }
//   }, [state.remoteEmail, state.remoteName, state.streamReady, handleNewUserJoined]);

//   // Start call timer when remote video becomes ready
//   useEffect(() => {
//     if (state.remoteVideoReady && !state.isCallActive) {
//       dispatch({ type: "START_CALL" });
//       console.log("⏱️ Call timer started");
//     }
//   }, [state.remoteVideoReady, state.isCallActive]);

//   // Attach my own camera stream to my video element
//   useEffect(() => {
//     if (myVideoRef.current && state.myStream) {
//       myVideoRef.current.srcObject = state.myStream;
//     }
//   }, [state.myStream]);

//   // Attach remote user's video stream to remote video element
//   useEffect(() => {
//     if (remoteVideoRef.current && remoteStreamRef.current) {
//       remoteVideoRef.current.srcObject = remoteStreamRef.current;
//     }
//   }, [remoteStreamRef.current]);

//   //  -------------------Copy Meeting Link---------------------------------
//   const copyMeetingLink = async () => {
//     const link = `${window.location.origin}/room/${roomId}`;
    
//     const message = `📹 Join my video meeting on MeetNow\n\n🔑 Room ID: ${roomId}\n🔗 Link: ${link}\n🌐 Live on: ${window.location.origin}`;

//     try {
//       await navigator.clipboard.writeText(message);
//       toast.success("Meeting link copied!", { 
//         icon: "🔗",
//         autoClose: 500 
//       });
//     } catch {
//       const textArea = document.createElement("textarea");
//       textArea.value = message;
//       document.body.appendChild(textArea);
//       textArea.select();
//       document.execCommand("copy");
//       document.body.removeChild(textArea);
//       toast.success("Meeting link copied!", { 
//         icon: "🔗",
//         autoClose: 500 
//       });
//     }
//   };

//   // ------------------ Leave Room ------------------
//   const leaveRoom = () => {
//     const callDuration = getCallDurationText();

//     if (state.isCallActive) {
//       toast.success(`Call ended. Duration: ${callDuration}`, {
//         duration: 5000,
//         icon: "📞",
//         style: {
//           background: "#1e293b",
//           color: "#fff",
//           padding: "16px",
//           borderRadius: "8px",
//         },
//       });
//     } else {
//       toast.success("Left the room", { 
//         icon: "👋",
//         autoClose: 500 
//       });
//     }

//     // Stop all local tracks
//     if (state.myStream) {
//       state.myStream.getTracks().forEach((track) => track.stop());
//       console.log("🛑 Local media tracks stopped");
//     }

//     // Reset remote video
//     if (remoteVideoRef.current) {
//       if (remoteVideoRef.current.srcObject) {
//         remoteVideoRef.current.srcObject.getTracks().forEach((t) => t.stop());
//       }
//       remoteVideoRef.current.srcObject = null;
//     }

//     // Reset local video
//     if (myVideoRef.current) {
//       myVideoRef.current.srcObject = null;
//     }

//     // Reset peer connection
//     if (peer) {
//       peer.close();
//       console.log("🛑 Peer connection closed");
//     }

//     // Reset call timer
//     dispatch({ type: "END_CALL" });

//     // Notify server you left
//     if (socket && roomId) {
//       socket.emit("leave-room", { roomId });
//       console.log("📤 Leave room notification sent");
//     }

//     // Redirect after a short delay to allow toast to show
//     setTimeout(() => {
//       window.location.href = "/";
//     }, 1000);
//   };

//   // ------------------ Socket Events ------------------
//   useEffect(() => {
//     if (!socket) return;

//     console.log("🔌 Socket connected, setting up listeners...");

//     socket.on("joined-room", () => {
//       dispatch({ type: "SET_HAS_JOINED_ROOM", payload: true });
//       console.log("✅ Joined room successfully");
//     });

//     socket.on("user-joined", handleNewUserJoined);
    
//     socket.on("incoming-call", handleIncomingCall);
    
//     socket.on("call-accepted", handleCallAccepted);
    
//     socket.on("chat-message", (data) => {
//       dispatch({ type: "ADD_MESSAGE", payload: data });

//       if (data.from !== socket.id) {
//         toast.custom(
//           (t) => (
//             <div className="bg-green-800 shadow-2xl text-white p-4 rounded-xl flex items-center gap-2 z-50">
//               <MessageSquareText className="w-5 h-5" />
//               <span>
//                 {data.senderName || "Guest"}: {data.text}
//               </span>
//             </div>
//           ),
//           { duration: 3000 },
//         );
//       }
//     });

//     socket.on("user-left", ({ socketId }) => {
//       pendingIncomingCall.current = null;
//       remoteSocketIdRef.current = null;
//       console.log("🚪 User left:", socketId);

//       if (remoteVideoRef.current && remoteVideoRef.current.srcObject) {
//         remoteVideoRef.current.srcObject.getTracks().forEach((t) => t.stop());
//         remoteVideoRef.current.srcObject = null;
//       }

//       remoteStreamRef.current = null;

//       if (state.isCallActive) {
//         const callDuration = getCallDurationText();
//         toast.custom(
//           (t) => (
//             <div className="bg-blue-900 w-72 shadow-2xl text-white p-4 font-sans rounded-xl flex flex-col">
//               <div className="flex items-center gap-2">
//                 <CircleAlert className="w-5 h-5 text-yellow-400" />
//                 <span className="font-semibold">User Disconnected</span>
//               </div>
//               <div className="mt-2 text-sm opacity-90">
//                 Call duration: <span className="font-bold">{callDuration}</span>
//               </div>
//             </div>
//           ),
//           { duration: 5000 },
//         );
//       }

//       dispatch({ type: "SET_REMOTE_NAME", payload: null });
//       dispatch({ type: "SET_REMOTE_EMAIL", payload: null });
//       dispatch({ type: "SET_REMOTE_CAMERA", payload: false });
//       dispatch({ type: "SET_REMOTEVIDEOREADY", payload: false });
//       dispatch({ type: "END_CALL" });
//     });

//     socket.on("connect_error", (error) => {
//       console.error("❌ Socket connection error:", error);
//       toast.error("Connection error. Please refresh.");
//     });

//     return () => {
//       console.log("🧹 Cleaning up socket listeners...");
//       socket.off("joined-room");
//       socket.off("user-joined", handleNewUserJoined);
//       socket.off("incoming-call", handleIncomingCall);
//       socket.off("call-accepted", handleCallAccepted);
//       socket.off("chat-message");
//       socket.off("user-left");
//       socket.off("connect_error");
//     };
//   }, [socket, handleNewUserJoined, handleIncomingCall, handleCallAccepted, state.isCallActive]);

//   // ------------------ Camera Toggle Listener ------------------
//   useEffect(() => {
//     if (!socket) return;

//     const handleCameraToggle = ({ cameraOn }) => {
//       console.log("Remote Camera on:", cameraOn);
//       dispatch({ type: "SET_REMOTE_CAMERA", payload: cameraOn });
//     };

//     socket.on("camera-toggle", handleCameraToggle);

//     return () => socket.off("camera-toggle", handleCameraToggle);
//   }, [socket]);

//   // ------------------ SIMPLIFIED Controls ------------------

//   const toggleCamera = () => {
//     if (!state.myStream) return;

//     const newCameraState = !state.cameraOn;
//     state.myStream.getVideoTracks().forEach((track) => (track.enabled = newCameraState));
//     dispatch({ type: "TOGGLE_CAMERA" });

//     socket.emit("camera-toggle", {
//       cameraOn: newCameraState,
//       roomId,
//     });

//     toast(newCameraState ? "Camera ON" : "Camera OFF", {
//       icon: newCameraState ? "📹" : "📵",
//     });
//   };

//   const toggleMic = () => {
//     if (!state.myStream) return;
    
//     const newMicState = !state.micOn;
//     state.myStream.getAudioTracks().forEach((t) => {
//       t.enabled = newMicState;
//     });
    
//     dispatch({ type: "TOGGLE_MIC" });
    
//     toast(newMicState ? "Mic ON" : "Mic OFF", {
//       icon: newMicState ? "🎤" : "🔇",
//     });
//   };

//   // SIMPLIFIED Speaker/Headphone toggle - ECHO FIX
//   const toggleHandfree = useCallback(async () => {
//     if (!remoteVideoRef.current || !state.myStream) return;

//     const newSpeakerMode = !state.speakerMode;
    
//     if (newSpeakerMode) {
//       // Switch to speaker mode - MUTE MIC TO PREVENT ECHO
//       try {
//         const micTracks = state.myStream.getAudioTracks();
//         micTracks.forEach(track => {
//           track.enabled = false; // Mute microphone
//         });
        
//         // Try to use system default speaker
//         if (remoteVideoRef.current.setSinkId) {
//           try {
//             await remoteVideoRef.current.setSinkId('');
//           } catch (err) {
//             console.log("Could not set sink ID, using default");
//           }
//         }
        
//         dispatch({ type: "SET_SPEAKER_MODE", payload: true });
//         toast("🔊 Speaker Mode: ON (Microphone muted to prevent echo)", { 
//           duration: 3000 
//         });
//       } catch (err) {
//         console.error("Failed to switch to speaker:", err);
//       }
//     } else {
//       // Switch to headphone mode - UNMUTE MIC
//       try {
//         const micTracks = state.myStream.getAudioTracks();
//         micTracks.forEach(track => {
//           track.enabled = true; // Unmute microphone
//         });
        
//         dispatch({ type: "SET_SPEAKER_MODE", payload: false });
//         toast("🎧 Headphone Mode: ON", { duration: 2000 });
//       } catch (err) {
//         console.error("Failed to switch to headphones:", err);
//       }
//     }
//   }, [state.myStream, state.speakerMode]);

//   // SIMPLIFIED Echo Cancellation Toggle
//   const toggleEchoCancellation = async () => {
//     if (!state.myStream) return;
    
//     const newEchoState = !state.echoCancellationEnabled;
//     const audioTracks = state.myStream.getAudioTracks();
    
//     for (const track of audioTracks) {
//       try {
//         // SIMPLIFIED - Only set echoCancellation
//         await track.applyConstraints({
//           echoCancellation: newEchoState
//         });
//       } catch (err) {
//         console.log("Could not toggle echo cancellation, continuing anyway");
//       }
//     }
    
//     dispatch({ type: "TOGGLE_ECHO_CANCELLATION" });
//     toast(newEchoState ? "Echo Cancellation: ON" : "Echo Cancellation: OFF", {
//       icon: newEchoState ? "✅" : "❌"
//     });
//   };

//   // SIMPLIFIED Noise Suppression Toggle
//   const toggleNoiseSuppression = async () => {
//     if (!state.myStream) return;
    
//     const newNoiseState = !state.noiseSuppressionEnabled;
//     const audioTracks = state.myStream.getAudioTracks();
    
//     for (const track of audioTracks) {
//       try {
//         await track.applyConstraints({
//           noiseSuppression: newNoiseState
//         });
//       } catch (err) {
//         console.log("Could not toggle noise suppression");
//       }
//     }
    
//     dispatch({ type: "TOGGLE_NOISE_SUPPRESSION" });
//     toast(newNoiseState ? "Noise Suppression: ON" : "Noise Suppression: OFF", {
//       icon: newNoiseState ? "🔇" : "🔊"
//     });
//   };

//   // SIMPLIFIED Audio Device Selection - NO OVERCONSTRAINED ERROR
//   const selectAudioDevice = useCallback(async (deviceId) => {
//     if (!state.myStream || !deviceId) return;
    
//     try {
//       console.log("🎤 Switching to audio device:", deviceId);
      
//       // Get current video track
//       const videoTrack = state.myStream.getVideoTracks()[0];
      
//       // SIMPLIFIED constraints - no strict requirements
//       const constraints = {
//         video: videoTrack ? {
//           deviceId: videoTrack.getSettings().deviceId
//         } : false,
//         audio: {
//           deviceId: { exact: deviceId },
//           // Remove strict constraints to avoid OverconstrainedError
//           echoCancellation: true,
//           noiseSuppression: true
//         }
//       };

//       const newStream = await navigator.mediaDevices.getUserMedia(constraints);
      
//       // Stop old tracks
//       state.myStream.getTracks().forEach(track => track.stop());
      
//       // Update state and peer
//       dispatch({ type: "SET_MY_STREAM", payload: newStream });
//       dispatch({ type: "SELECT_AUDIO_DEVICE", payload: deviceId });
      
//       // Update local video
//       if (myVideoRef.current) {
//         myVideoRef.current.srcObject = newStream;
//       }
      
//       // Update peer connection
//       if (sendStream) {
//         await sendStream(newStream);
//       }
      
//       toast.success("Audio device changed successfully");
      
//     } catch (err) {
//       console.error("Failed to switch audio device:", err);
      
//       // Try even simpler approach
//       try {
//         const simpleStream = await navigator.mediaDevices.getUserMedia({
//           video: false,
//           audio: { deviceId: { exact: deviceId } }
//         });
        
//         // Get only the audio track
//         const newAudioTrack = simpleStream.getAudioTracks()[0];
        
//         // Replace audio track in existing stream
//         const oldAudioTrack = state.myStream.getAudioTracks()[0];
//         if (oldAudioTrack) {
//           state.myStream.removeTrack(oldAudioTrack);
//         }
//         state.myStream.addTrack(newAudioTrack);
        
//         // Stop the simple stream video track if any
//         simpleStream.getVideoTracks().forEach(t => t.stop());
        
//         dispatch({ type: "SELECT_AUDIO_DEVICE", payload: deviceId });
        
//         if (sendStream) {
//           await sendStream(state.myStream);
//         }
        
//         toast.success("Audio device changed (simplified)");
//       } catch (simpleErr) {
//         console.error("Simplified approach also failed:", simpleErr);
//         toast.error("Could not change audio device. Please try a different device.");
//       }
//     }
//   }, [state.myStream, sendStream]);

//   //  ----------------- Chat Handle ---------------------
//   const handleChat = () => {
//     dispatch({ type: "SET_CHATCLOSE", payload: !state.chatClose });
//   };

//   //  ----------------- handle Swipped---------------------
//   const handleSwipped = () => {
//     dispatch({ type: "SET_IsSWAPPED", payload: !state.isSwapped });
//   };

//   //  ----------------- handleRemoteVideoRead ---------------------
//   const handleRemoteVideoReady = () => {
//     dispatch({ type: "SET_REMOTEVIDEOREADY", payload: true });

//     if (!state.isCallActive) {
//       dispatch({ type: "START_CALL" });
//     }
    
//     console.log("✅ Remote video ready, call started");
//   };

//   // ------------------ Chat ------------------
//   const sendMessage = () => {
//     if (!state.messageText.trim()) return;

//     socket.emit("chat-message", { roomId, from: socket.id, text: state.messageText });

//     dispatch({
//       type: "ADD_MESSAGE",
//       payload: {
//         from: socket.id,
//         text: state.messageText,
//         timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
//       },
//     });

//     dispatch({ type: "SET_MESSAGE_TEXT", payload: "" });
//   };

//   // ------------------ Chat Message Listener ------------------
//   useEffect(() => {
//     if (!socket) return;

//     const handleChatMessage = (data) => {
//       if (data.from !== socket.id && !state.remoteName && data.senderName) {
//         dispatch({ type: "SET_REMOTE_NAME", payload: data.senderName });
//       }
//       dispatch({ type: "ADD_MESSAGE", payload: data });

//       if (data.from !== socket.id) {
//         toast.custom(
//           (t) => (
//             <div className="fixed top-4 right-4 bg-green-800 shadow-xl text-white p-4 rounded-xl flex items-center gap-3 z-50 max-w-xs">
//               <MessageSquareText className="w-5 h-5" />
//               <div>
//                 <div className="font-semibold">{data.senderName || "Guest"}</div>
//                 <div className="text-sm">{data.text}</div>
//               </div>
//             </div>
//           ),
//           { duration: 3000 },
//         );
//       }
//     };

//     socket.on("chat-message", handleChatMessage);
//     return () => socket.off("chat-message", handleChatMessage);
//   }, [socket, state.remoteName]);

//   // Process pending call when stream ready
//   useEffect(() => {
//     if (pendingIncomingCall.current && state.streamReady) {
//       console.log("🔄 Processing pending call now that stream is ready");
//       handleIncomingCall(pendingIncomingCall.current);
//       pendingIncomingCall.current = null;
//     }
//   }, [state.streamReady, handleIncomingCall]);

//   // SavedName Display MyName (You)
//   useEffect(() => {
//     const savedData = localStorage.getItem("userData");
//     if (savedData) {
//       const { name: savedName } = JSON.parse(savedData);
//       dispatch({ type: "SET_MY_NAME", payload: savedName });
//       console.log("👤 User name loaded:", savedName);
//     }
//   }, []);

//   // UI/UX Design - Simplified
//   return (
//     <div className="min-h-screen text-white flex bg-gradient-to-br from-gray-900 via-black to-blue-900">
//       {/* Header Inside Status & Clock */}
//       <header className="fixed h-18 sm:h-16 flex items-center justify-between bg-[#000000] text-white shadow-2xl w-full p-2 sm:px-4">
//         <div className="sm:flex items-center sm:space-x-4">
//           {!remoteStreamRef.current || !state.remoteVideoReady ? (
//             <span className="flex items-center font-sans font-semibold text-lg rounded-full">
//               <Circle className="bg-[#ff403f] text-[#ff403f] w-3.5 h-3.5 rounded-full mr-1" />{" "}
//               Disconnected
//             </span>
//           ) : (
//             <span className="flex items-center font-sans font-semibold px-3 py-1 text-lg rounded-full">
//               <Circle className="bg-[#4ab22e] text-[#4ab22e] w-4 h-4 rounded-full mr-1" /> Connected
//             </span>
//           )}

//           {/* Room ID display */}
//           <div className="flex items-center space-x-4 mt-1 sm:mt-0">
//             <span className="rounded-md text-lg font-bold">
//               Room: <span className="text-blue-500"> {roomId}</span>
//             </span>

//             {/* call Duration */}
//             {state.remoteName && (
//               <span className="p-0.5 sm:px-2 rounded-md font-sans font-semibold text-white text-lg">
//                 {state.isCallActive ? <CallTime state={state} dispatch={dispatch} /> : "00:00"}
//               </span>
//             )}
//           </div>
//         </div>

//         <div className="sm:flex sm:items-center sm:space-x-3 my-auto">
//           <span className="flex items-center space-x-4 bg-gray-800 p-0.5 sm:px-2 rounded-md font-sans">
//             <Users className="w-5 h-5 mr-1 text-green-500" /> {totalUsers} online
//           </span>
//           <span className="flex items-center mt-1 sm:mt-0">
//             <Clock className="w-5 h-5 my-1 mr-1 text-amber-500 font-bold" /> <RealTimeClock />
//           </span>
//         </div>
//       </header>

//       {/* Video Capture */}
//       <div className="relative w-screen py-2 mt-17 sm:mt-14">
//         {/* REMOTE VIDEO */}
//         <div
//           onClick={handleSwipped}
//           className={`absolute transition-all duration-300 rounded-md bg-[#0d1321]
//       ${state.isSwapped ? "top-4 right-4 w-56 sm:w-56 h-36 z-20 shadow-2xl" : "top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 inset-0 w-full xl:max-w-4xl h-[95%] z-10"}
//     `}
//         >
//           <video
//             ref={remoteVideoRef}
//             autoPlay
//             playsInline
//             onCanPlay={handleRemoteVideoReady}
//             className={`w-full h-full object-cover shadow-2xl rounded-md bg-[#0d1321] ${state.remoteCameraOn ? "block" : "hidden"} `}
//           />

//           {(remoteStreamRef.current || state.remoteEmail) && (
//             <span className="absolute top-2 left-2 z-40 font-sans font-semibold bg-green-700 px-3 py-1 text-sm rounded-full">
//               {state.remoteName}
//             </span>
//           )}

//           {/* Overlay when camera is off */}
//           {!state.remoteCameraOn && state.remoteName && (
//             <div className="absolute inset-0 flex items-center justify-center z-40">
//               <span className="flex items-center justify-center w-18 h-18 rounded-full bg-blue-700 text-white text-4xl sm:text-5xl font-semibold shadow-lg">
//                 {state.remoteName ? state.remoteName.charAt(0).toUpperCase() : ""}
//               </span>
//             </div>
//           )}

//           {/* status */}
//           {!state.remoteVideoReady && (
//             <span className="absolute top-4 left-2 z-40 font-sans font-semibold bg-[#931cfb] px-3 py-1 text-sm rounded-full">
//               Waiting for participants...
//             </span>
//           )}

//           {/* Waiting */}
//           {!state.remoteVideoReady && !state.isSwapped && (
//             <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-40 font-sans text-lg text-center">
//               <CircleAlert className="text-center mx-auto my-2 w-10 h-10 text-yellow-600" />
//               Share the meeting Link to invite others
//             </span>
//           )}
//         </div>

//         {/* MY VIDEO */}
//         <div
//           onClick={handleSwipped}
//           className={`absolute transition-all duration-300 rounded-md bg-[#0d1321]
//       ${state.isSwapped ? "top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 inset-0 w-full xl:max-w-4xl h-[95%] z-10" : "top-4 right-4 w-56 sm:w-56 h-36 z-20 shadow-2xl bg-gray-800"}
//     `}
//         >
//           <video
//             ref={myVideoRef}
//             autoPlay
//             playsInline
//             muted
//             className={`w-full h-full rounded-md object-cover shadow-2xl bg-[#0d1321] ${state.cameraOn ? "block" : "hidden"} `}
//           />

//           {/* Local Video User A Name */}
//           <span className="absolute top-2 left-2 z-40 font-sans font-semibold bg-green-700 px-3 py-1 text-sm rounded-full">
//             {state.myName}
//           </span>

//           {!state.cameraOn && (
//             <div className="absolute inset-0 flex items-center justify-center z-40">
//               <span className="flex items-center justify-center w-18 h-18 rounded-full bg-blue-700 text-white text-4xl sm:text-5xl font-semibold shadow-lg">
//                 {state.myName.charAt(0).toUpperCase()}
//               </span>
//             </div>
//           )}
//         </div>
//       </div>

//       {/* Chat Content */}
//       {state.chatClose && (
//         <div className="absolute top-0 right-0 h-full w-80 sm:96 bg-gray-900/95 backdrop-blur-xl border-l border-gray-800 z-50 flex flex-col">
//           <div className="p-4 border-b border-gray-800 flex justify-between items-center">
//             <h3 className="text-lg font-semibold">Chat</h3>
//             <button
//               onClick={handleChat}
//               className="p-2 hover:bg-gray-800 rounded-full transition-colors"
//             >
//               <X size={20} />
//             </button>
//           </div>

//           <div className="flex-1 p-4 overflow-y-auto space-y-4">
//             {state.messages.map((msg, idx) => {
//               const isMe = msg.from === socket?.id;
//               return (
//                 <div key={idx} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
//                   <div
//                     className={`max-w-[70%] rounded-2xl px-4 py-2 ${isMe ? "bg-gradient-to-r from-blue-600 to-indigo-600" : "bg-gray-800"}`}
//                   >
//                     <div className="text-xs opacity-75 mb-1">
//                       {isMe ? state.myName : state.remoteName} • {msg.timestamp || "Just now"}
//                     </div>
//                     <div className="text-sm">{msg.text}</div>
//                   </div>
//                 </div>
//               );
//             })}
//           </div>

//           <div className="p-4 border-t border-gray-800">
//             <div className="flex gap-2">
//               <input
//                 type="text"
//                 value={state.messageText}
//                 onChange={(e) => dispatch({ type: "SET_MESSAGE_TEXT", payload: e.target.value })}
//                 onKeyPress={(e) => e.key === "Enter" && sendMessage()}
//                 placeholder="Type a message..."
//                 className="flex-1 bg-gray-800 rounded-full px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500"
//               />
//               <button
//                 onClick={sendMessage}
//                 className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 px-6 rounded-full font-medium transition-all duration-300"
//               >
//                 Send
//               </button>
//             </div>
//           </div>
//         </div>
//       )}

//       {/* Leave when display message */}
//       <Toaster position="top-right" reverseOrder={false} />

//       {/* SIMPLIFIED BOTTOM CONTROL BAR */}
//       <div className="fixed flex flex-wrap w-full max-w-92 sm:max-w-md justify-center place-items-center gap-2.5 sm:gap-4 bottom-6 left-1/2 z-10 -translate-x-1/2 bg-[#0b1018] backdrop-blur-lg sm:px-2 py-3 rounded-xl shadow-lg">
//         <div
//           onClick={toggleCamera}
//           className={`p-3 rounded-full ${state.cameraOn ? 'bg-gray-900' : 'bg-[#364355]'} hover:bg-[#2e4361] cursor-pointer`}
//           title="Toggle Camera"
//         >
//           {state.cameraOn ? <Camera /> : <CameraOff />}
//         </div>

//         <div
//           onClick={toggleMic}
//           className={`p-3 rounded-full ${state.micOn ? 'bg-gray-900' : 'bg-[#364355]'} hover:bg-[#2e4361] cursor-pointer`}
//           title="Toggle Microphone"
//         >
//           {state.micOn ? <Mic /> : <MicOff />}
//         </div>

//         <div
//           onClick={toggleHandfree}
//           className={`p-3 rounded-full ${state.speakerMode ? 'bg-green-700' : 'bg-[#364355]'} hover:bg-[#2e4361] cursor-pointer`}
//           title={state.speakerMode ? "Speaker Mode" : "Headphone Mode"}
//         >
//           {state.speakerMode ? <Volume2 /> : <Headphones />}
//         </div>

//         {/* Audio Controls */}
//         <div
//           onClick={toggleEchoCancellation}
//           className={`p-3 rounded-full ${state.echoCancellationEnabled ? 'bg-green-700' : 'bg-[#364355]'} hover:bg-[#2e4361] cursor-pointer`}
//           title="Toggle Echo Cancellation"
//         >
//           <Ear className="w-5 h-5" />
//         </div>

//         <div
//           onClick={toggleNoiseSuppression}
//           className={`p-3 rounded-full ${state.noiseSuppressionEnabled ? 'bg-green-700' : 'bg-[#364355]'} hover:bg-[#2e4361] cursor-pointer`}
//           title="Toggle Noise Suppression"
//         >
//           <Mic className="w-5 h-5" />
//         </div>

//         <div
//           onClick={handleChat}
//           className={`p-3 rounded-full ${state.chatClose ? 'bg-gray-900' : 'bg-[#364355]'} hover:bg-[#2e4361] cursor-pointer`}
//           title="Toggle Chat"
//         >
//           {state.chatClose ? <MessageSquareText /> : <MessageSquareOff />}
//         </div>

//         <div
//           onClick={copyMeetingLink}
//           className="p-3 rounded-full bg-[#009776] hover:bg-[#048166] cursor-pointer"
//           title="Share Meeting Link"
//         >
//           <Share2 className="w-5 h-5" />
//         </div>
        
//         <div
//           onClick={leaveRoom}
//           className="p-3 rounded-full bg-[#ea002e] hover:bg-[#c7082e] cursor-pointer"
//           title="Leave Call"
//         >
//           <PhoneOff className="w-5 h-5" />
//         </div>
//       </div>

//       {/* Audio Device Selection - Conditional */}
//       {state.audioDevices.length > 1 && (
//         <div className="fixed bottom-28 right-4 bg-gray-800 p-2 rounded-lg shadow-lg z-50">
//           <div className="text-xs mb-1 text-gray-400">Audio Device:</div>
//           <select
//             onChange={(e) => selectAudioDevice(e.target.value)}
//             value={state.selectedAudioDevice || ''}
//             className="bg-gray-700 text-white p-1 rounded text-xs w-40"
//           >
//             <option value="">Default</option>
//             {state.audioDevices.map((device) => (
//               <option key={device.deviceId} value={device.deviceId}>
//                 {device.label || `Device ${device.deviceId.slice(0, 5)}`}
//               </option>
//             ))}
//           </select>
//         </div>
//       )}

//       {/* Echo Prevention Tip */}
//       {state.speakerMode && (
//         <div className="fixed top-20 left-1/2 transform -translate-x-1/2 bg-yellow-900 text-white px-4 py-2 rounded-lg shadow-lg z-50 text-sm">
//           🔊 Speaker Mode: Microphone muted to prevent echo
//         </div>
//       )}
//     </div>
//   );
// };

// export default RoomPage;



// Import hooks
import { useEffect, useCallback, useRef, useReducer, useMemo, useState } from "react";

// Import router
import { useParams } from "react-router-dom";

// Import Files
import { useSocket } from "../providers/Socket";
import { usePeer } from "../providers/Peer";
import { initialState, roomReducer } from "../providers/roomReducer";
import RealTimeClock from "../components/RealTimeClock";
import CallTime from "../components/CallTime";

// Import React-Icons
import {
  Mic,
  MicOff,
  Camera,
  CameraOff,
  Volume2,
  Share2,
  CircleAlert,
  Clock,
  Circle,
  Headphones,
  PhoneOff,
  MessageSquareText,
  MessageSquareOff,
  X,
  Users,
  Ear,
  Smartphone,
} from "lucide-react";

// import toast to display Notification
import toast, { Toaster } from "react-hot-toast";

// RoomPage Component
const RoomPage = () => {
  // Socket Destruction
  const { socket } = useSocket();
  const { peer, createOffer, createAnswer, setRemoteAns, sendStream, setRemoteSocketId } = usePeer();

  // RoomID
  const { roomId } = useParams();

  // Enhanced initialState
  const enhancedInitialState = useMemo(() => ({
    ...initialState,
    echoCancellationEnabled: true,
    noiseSuppressionEnabled: true,
    audioDevices: [],
    selectedAudioDevice: null,
    speakerMode: false,
    isMobileDevice: false,
    connectionState: "disconnected"
  }), []);

  const [state, dispatch] = useReducer(roomReducer, enhancedInitialState);

  // useRef
  const pendingIncomingCall = useRef(null);
  const myVideoRef = useRef();
  const remoteVideoRef = useRef();
  const remoteStreamRef = useRef(null);
  const remoteSocketIdRef = useRef(null);
  const isSettingRemoteAnswer = useRef(false);
  const connectionAttempts = useRef(0);
  const audioContextRef = useRef(null);
  const echoCancellationRef = useRef(true);
  const isUsingHeadphonesRef = useRef(false);

  // Detect mobile device
  useEffect(() => {
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    dispatch({ type: "SET_IS_MOBILE", payload: isMobile });
    console.log("📱 Device type:", isMobile ? "Mobile" : "Desktop");
  }, []);

  // totalUsers
  const totalUsers = useMemo(() => (state.remoteName ? 2 : 1), [state.remoteName]);

  // ------------------ Helper Functions ------------------
  const getCallDurationText = () => {
    if (!state.callStartTime) return "0 seconds";

    const now = Date.now();
    const elapsed = now - state.callStartTime;

    const hours = Math.floor(elapsed / (1000 * 60 * 60));
    const minutes = Math.floor((elapsed % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((elapsed % (1000 * 60)) / 1000);

    let durationText = "";
    if (hours > 0) {
      durationText += `${hours} hour${hours > 1 ? "s" : ""}`;
      if (minutes > 0) durationText += ` ${minutes} minute${minutes > 1 ? "s" : ""}`;
    } else if (minutes > 0) {
      durationText += `${minutes} minute${minutes > 1 ? "s" : ""}`;
      if (seconds > 0 && minutes < 5) durationText += ` ${seconds} second${seconds > 1 ? "s" : ""}`;
    } else {
      durationText += `${seconds} second${seconds > 1 ? "s" : ""}`;
    }

    return durationText.trim();
  };

  // ------------------ Camera Controls ------------------
  const toggleCamera = () => {
    if (!state.myStream) return;

    const newCameraState = !state.cameraOn;

    // enable / disable camera track
    state.myStream.getVideoTracks().forEach((track) => (track.enabled = newCameraState));

    // update my own state
    dispatch({ type: "TOGGLE_CAMERA" });

    // send ONLY to other user in room
    socket.emit("camera-toggle", {
      cameraOn: newCameraState,
      roomId,
    });

    toast(newCameraState ? "Camera ON" : "Camera OFF", {
      icon: newCameraState ? "📹" : "📵",
    });
  };

  // Camera Toggle Listener
  useEffect(() => {
    if (!socket) return;

    const handleCameraToggle = ({ cameraOn }) => {
      console.log("Remote Camera on:", cameraOn);
      dispatch({ type: "SET_REMOTE_CAMERA", payload: cameraOn });
    };

    socket.on("camera-toggle", handleCameraToggle);

    return () => socket.off("camera-toggle", handleCameraToggle);
  }, [socket]);

  // ------------------ FIXED: Incoming Call ------------------
  const handleIncomingCall = useCallback(
    async ({ from, offer, fromName }) => {
      console.log("📲 Incoming call received from:", from);
      
      // Only proceed if we're not already connected
      if (state.connectionState === "connected" || state.connectionState === "connecting") {
        console.log("⚠️ Already connected/connecting, ignoring duplicate call");
        return;
      }

      dispatch({ type: "SET_REMOTE_EMAIL", payload: from });
      dispatch({ type: "SET_REMOTE_NAME", payload: fromName });
      dispatch({ type: "SET_CONNECTION_STATE", payload: "connecting" });
      
      remoteSocketIdRef.current = from;
      if (setRemoteSocketId) {
        setRemoteSocketId(from);
      }

      if (!state.streamReady) {
        pendingIncomingCall.current = { from, offer, fromName };
        console.log("⏳ Stream not ready, incoming call pending...");
        return;
      }

      try {
        console.log("📝 Creating answer for:", from);
        const answer = await createAnswer(offer);
        socket.emit("call-accepted", { 
          to: from, 
          ans: answer 
        });
        console.log("📨 Answer sent to:", from);
      } catch (err) {
        console.error("❌ Error creating answer:", err);
        dispatch({ type: "SET_CONNECTION_STATE", payload: "failed" });
      }
    },
    [createAnswer, socket, state.streamReady, state.connectionState, setRemoteSocketId],
  );

  // ------------------ New User Joined ------------------
  const handleNewUserJoined = useCallback(
    async ({ emailId, name, socketId }) => {
      console.log("👤 New user joined:", name);
      
      // Only proceed if we're not already connected
      if (state.connectionState === "connected" || state.connectionState === "connecting") {
        console.log("⚠️ Already connected/connecting, ignoring duplicate join");
        return;
      }

      dispatch({ type: "SET_REMOTE_EMAIL", payload: emailId });
      dispatch({ type: "SET_REMOTE_NAME", payload: name });
      dispatch({ type: "SET_CONNECTION_STATE", payload: "connecting" });
      
      remoteSocketIdRef.current = socketId;
      if (setRemoteSocketId) {
        setRemoteSocketId(socketId);
      }

      if (!state.streamReady) {
        pendingIncomingCall.current = { fromEmail: emailId, fromName: name, socketId };
        console.log("⏳ Stream not ready, call pending...");
        return;
      }

      try {
        console.log("📞 Creating offer for:", emailId);
        const offer = await createOffer();
        socket.emit("call-user", { 
          emailId, 
          offer,
          socketId: socketId
        });
        console.log("📨 Offer sent to:", emailId);
      } catch (err) {
        console.error("❌ Error creating offer:", err);
        dispatch({ type: "SET_CONNECTION_STATE", payload: "failed" });
      }
    },
    [createOffer, socket, state.streamReady, state.connectionState, setRemoteSocketId],
  );

  // ------------------ FIXED: Call Accepted ------------------
  const handleCallAccepted = useCallback(
    async ({ ans }) => {
      // Prevent multiple simultaneous calls to setRemoteAns
      if (isSettingRemoteAnswer.current) {
        console.log("⚠️ Already setting remote answer, skipping...");
        return;
      }

      if (peer.signalingState === "stable") {
        console.log("⚠️ Peer already in stable state, ignoring duplicate answer");
        return;
      }

      isSettingRemoteAnswer.current = true;
      console.log("✅ Setting remote answer, peer state:", peer.signalingState);

      try {
        await setRemoteAns(ans);
        console.log("✅ Remote answer set successfully");
        dispatch({ type: "SET_CONNECTION_STATE", payload: "connected" });
        
        // Apply echo cancellation for cross-device calls
        if (state.isMobileDevice) {
          setTimeout(() => {
            applyEnhancedEchoCancellation();
          }, 1000);
        }
      } catch (err) {
        console.error("❌ Error setting remote answer:", err);
        // Don't change state on error, let reconnection logic handle it
      } finally {
        isSettingRemoteAnswer.current = false;
      }
    },
    [setRemoteAns, peer, state.isMobileDevice],
  );

  // ------------------ Enhanced Echo Cancellation for Cross-Device ------------------
  const applyEnhancedEchoCancellation = useCallback(() => {
    if (!state.myStream) return;

    const audioTracks = state.myStream.getAudioTracks();
    audioTracks.forEach(track => {
      try {
        // Enhanced constraints for cross-device calls
        const constraints = {
          echoCancellation: { ideal: true },
          noiseSuppression: { ideal: true },
          autoGainControl: { ideal: true },
          // Mobile-specific optimizations
          ...(state.isMobileDevice && {
            googEchoCancellation: true,
            googNoiseSuppression: true,
            googAutoGainControl: true,
            googHighpassFilter: true
          })
        };

        track.applyConstraints(constraints).then(() => {
          console.log("✅ Enhanced echo cancellation applied for", state.isMobileDevice ? "mobile" : "desktop");
        }).catch(err => {
          console.warn("Could not apply enhanced constraints:", err);
        });
      } catch (err) {
        console.warn("Error applying echo cancellation:", err);
      }
    });
  }, [state.myStream, state.isMobileDevice]);

  // ------------------ Local Media with Echo Prevention ------------------
  const getUserMediaStream = useCallback(async () => {
    try {
      console.log("🎥 Requesting camera and microphone access...");
      
      // Different constraints for mobile vs desktop
      const constraints = state.isMobileDevice ? {
        // Mobile - optimized for battery and performance
        video: { 
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 24 },
          facingMode: "user"
        },
        audio: { 
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          // Mobile-specific optimizations
          googEchoCancellation: true,
          googNoiseSuppression: true,
          googAutoGainControl: true
        }
      } : {
        // Desktop - higher quality
        video: { 
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 },
          facingMode: "user"
        },
        audio: { 
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1, // Mono for better echo cancellation
          sampleRate: 16000 // Optimized for voice
        }
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);

      console.log("✅ Media devices accessed successfully for", state.isMobileDevice ? "mobile" : "desktop");
      dispatch({ type: "SET_MY_STREAM", payload: stream });
      
      if (myVideoRef.current) {
        myVideoRef.current.srcObject = stream;
      }
      
      // Apply echo cancellation immediately
      applyEnhancedEchoCancellation();
      
      await sendStream(stream);
      dispatch({ type: "SET_STREAM_READY", payload: true });
      console.log("✅ Stream ready for WebRTC");

      // Handle pending incoming call automatically
      if (pendingIncomingCall.current) {
        console.log("🔄 Processing pending incoming call...");
        setTimeout(() => {
          handleIncomingCall(pendingIncomingCall.current);
          pendingIncomingCall.current = null;
        }, 500); // Small delay to ensure stream is ready
      }
    } catch (err) {
      console.error("❌ Error accessing media devices:", err);
      
      // Fallback to basic constraints
      try {
        console.log("🔄 Trying basic fallback constraints...");
        const fallbackStream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true
        });
        
        dispatch({ type: "SET_MY_STREAM", payload: fallbackStream });
        await sendStream(fallbackStream);
        dispatch({ type: "SET_STREAM_READY", payload: true });
        
        // Apply basic echo cancellation
        const audioTracks = fallbackStream.getAudioTracks();
        audioTracks.forEach(track => {
          track.applyConstraints({
            echoCancellation: true,
            noiseSuppression: true
          });
        });
      } catch (fallbackErr) {
        toast.error("Please allow camera and microphone access");
      }
    }
  }, [sendStream, handleIncomingCall, state.isMobileDevice, applyEnhancedEchoCancellation]);

  // Initial call to getUserMediaStream
  useEffect(() => {
    getUserMediaStream();
  }, [getUserMediaStream]);

  // ------------------ WebRTC State Monitoring ------------------
  useEffect(() => {
    if (!peer) return;

    const handleConnectionStateChange = () => {
      console.log("🔗 Connection State:", peer.connectionState);
      dispatch({ type: "SET_CONNECTION_STATE", payload: peer.connectionState });
      
      if (peer.connectionState === "connected") {
        console.log("✅ WebRTC connection established");
        // Auto-enable echo cancellation for cross-device calls
        if (!state.isMobileDevice) {
          toggleEchoCancellation(true);
        }
      } else if (peer.connectionState === "failed" || peer.connectionState === "disconnected") {
        console.log("⚠️ WebRTC connection failed/disconnected");
        // Attempt reconnection
        if (connectionAttempts.current < 3) {
          connectionAttempts.current += 1;
          console.log(`🔄 Reconnection attempt ${connectionAttempts.current}/3`);
          setTimeout(() => {
            if (remoteSocketIdRef.current && state.streamReady) {
              handleNewUserJoined({
                emailId: state.remoteEmail,
                name: state.remoteName,
                socketId: remoteSocketIdRef.current
              });
            }
          }, 1000 * connectionAttempts.current);
        }
      }
    };

    const handleIceConnectionStateChange = () => {
      console.log("❄️ ICE Connection State:", peer.iceConnectionState);
    };

    peer.addEventListener('connectionstatechange', handleConnectionStateChange);
    peer.addEventListener('iceconnectionstatechange', handleIceConnectionStateChange);

    return () => {
      peer.removeEventListener('connectionstatechange', handleConnectionStateChange);
      peer.removeEventListener('iceconnectionstatechange', handleIceConnectionStateChange);
    };
  }, [peer, state.streamReady, state.remoteEmail, state.remoteName, handleNewUserJoined, state.isMobileDevice]);

  // ------------------ ICE Candidates ------------------
  useEffect(() => {
    if (!socket || !peer) return;

    const handleIncomingIceCandidate = ({ candidate, from }) => {
      console.log("📥 Received ICE candidate from:", from);
      if (candidate && peer.remoteDescription) {
        peer.addIceCandidate(new RTCIceCandidate(candidate)).catch(err => {
          console.log("❌ Could not add ICE candidate (may be normal):", err.message);
        });
      }
    };

    const handleLocalIceCandidate = (event) => {
      if (event.candidate && remoteSocketIdRef.current && socket) {
        socket.emit("ice-candidate", {
          to: remoteSocketIdRef.current,
          candidate: event.candidate,
        });
      }
    };

    socket.on("ice-candidate", handleIncomingIceCandidate);
    peer.onicecandidate = handleLocalIceCandidate;

    return () => {
      socket.off("ice-candidate", handleIncomingIceCandidate);
      if (peer) {
        peer.onicecandidate = null;
      }
    };
  }, [socket, peer]);

  // ------------------ Remote Track ------------------
  useEffect(() => {
    let playTimeout;

    const handleTrackEvent = (event) => {
      if (event.streams && event.streams[0]) {
        remoteStreamRef.current = event.streams[0];

        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = remoteStreamRef.current;

          clearTimeout(playTimeout);
          playTimeout = setTimeout(() => {
            if (remoteVideoRef.current.paused) {
              remoteVideoRef.current.play().catch((err) => {
                if (err.name !== "AbortError") console.error("❌ Error playing remote video:", err);
              });
            }
          }, 50);
        }
      }
    };

    peer.addEventListener("track", handleTrackEvent);
    return () => {
      peer.removeEventListener("track", handleTrackEvent);
      clearTimeout(playTimeout);
    };
  }, [peer]);

  // ------------------ Auto-reconnection ------------------
  useEffect(() => {
    if (!remoteStreamRef.current && state.remoteEmail && state.streamReady && state.connectionState !== "connected") {
      console.log("🔄 Auto-reconnecting to remote user...");
      const retry = setTimeout(() => {
        handleNewUserJoined({ 
          emailId: state.remoteEmail, 
          name: state.remoteName,
          socketId: remoteSocketIdRef.current 
        });
      }, 2000);
      return () => clearTimeout(retry);
    }
  }, [state.remoteEmail, state.remoteName, state.streamReady, state.connectionState, handleNewUserJoined]);

  // ------------------ Enhanced Controls ------------------

  // Echo Cancellation with device-specific optimization
  const toggleEchoCancellation = useCallback(async (forceEnable = false) => {
    if (!state.myStream) return;
    
    const newEchoState = forceEnable ? true : !state.echoCancellationEnabled;
    echoCancellationRef.current = newEchoState;
    
    const audioTracks = state.myStream.getAudioTracks();
    
    for (const track of audioTracks) {
      try {
        const constraints = {
          echoCancellation: newEchoState,
          noiseSuppression: state.noiseSuppressionEnabled,
          autoGainControl: true,
          // Device-specific optimizations
          ...(state.isMobileDevice && newEchoState && {
            googEchoCancellation: true,
            googNoiseSuppression: true,
            googAutoGainControl: true
          })
        };
        
        await track.applyConstraints(constraints);
        console.log(`✅ Echo cancellation ${newEchoState ? 'enabled' : 'disabled'} for ${state.isMobileDevice ? 'mobile' : 'desktop'}`);
      } catch (err) {
        console.log("Could not toggle echo cancellation, continuing anyway");
      }
    }
    
    if (!forceEnable) {
      dispatch({ type: "TOGGLE_ECHO_CANCELLATION" });
      toast(newEchoState ? "Echo Cancellation: ON" : "Echo Cancellation: OFF", {
        icon: newEchoState ? "✅" : "❌",
        duration: 2000
      });
    }
  }, [state.myStream, state.echoCancellationEnabled, state.noiseSuppressionEnabled, state.isMobileDevice]);

  // Smart Speaker/Headphone toggle with echo prevention
  const toggleHandfree = useCallback(async () => {
    if (!state.myStream) return;

    const newSpeakerMode = !state.speakerMode;
    const micTracks = state.myStream.getAudioTracks();

    if (newSpeakerMode) {
      // Entering speaker mode - critical for echo prevention
      console.log("🔊 Switching to SPEAKER mode");
      
      // Mute microphone IMMEDIATELY to prevent echo
      micTracks.forEach(track => {
        track.enabled = false;
        console.log("🎤 Microphone muted to prevent echo");
      });

      // Try to force audio output to speakers
      if (remoteVideoRef.current && remoteVideoRef.current.setSinkId) {
        try {
          await remoteVideoRef.current.setSinkId('');
        } catch (err) {
          console.log("Could not set sink ID, using default");
        }
      }

      dispatch({ type: "SET_SPEAKER_MODE", payload: true });
      isUsingHeadphonesRef.current = false;
      
      toast.custom(
        (t) => (
          <div className="bg-yellow-900 text-white px-4 py-2 rounded-lg shadow-lg">
            <div className="flex items-center gap-2">
              <Volume2 className="w-5 h-5" />
              <span className="font-semibold">Speaker Mode ON</span>
            </div>
            <div className="text-xs mt-1">Microphone muted to prevent echo</div>
          </div>
        ),
        { duration: 4000 }
      );
    } else {
      // Entering headphone mode
      console.log("🎧 Switching to HEADPHONE mode");
      
      // Unmute microphone
      micTracks.forEach(track => {
        track.enabled = true;
        console.log("🎤 Microphone unmuted");
      });

      // Re-enable echo cancellation
      if (echoCancellationRef.current) {
        setTimeout(() => {
          toggleEchoCancellation(true);
        }, 500);
      }

      dispatch({ type: "SET_SPEAKER_MODE", payload: false });
      isUsingHeadphonesRef.current = true;
      
      toast("🎧 Headphone Mode ON", { duration: 2000 });
    }
  }, [state.myStream, state.speakerMode, toggleEchoCancellation]);

  // Apply echo cancellation when mic is toggled
  const toggleMic = () => {
    if (!state.myStream) return;
    
    const newMicState = !state.micOn;
    state.myStream.getAudioTracks().forEach((t) => {
      t.enabled = newMicState;
    });
    
    dispatch({ type: "TOGGLE_MIC" });
    
    // When enabling mic, ensure echo cancellation is on
    if (newMicState && echoCancellationRef.current) {
      setTimeout(() => {
        toggleEchoCancellation(true);
      }, 100);
    }
    
    toast(newMicState ? "🎤 Mic ON" : "🔇 Mic OFF", { duration: 2000 });
  };

  // ------------------ Chat Handle ---------------------
  const handleChat = () => {
    dispatch({ type: "SET_CHATCLOSE", payload: !state.chatClose });
  };

  // ------------------ handle Swipped ----------------------
  const handleSwipped = () => {
    dispatch({ type: "SET_IsSWAPPED", payload: !state.isSwapped });
  };

  // ------------------ handleRemoteVideoRead ---------------------
  const handleRemoteVideoReady = () => {
    dispatch({ type: "SET_REMOTEVIDEOREADY", payload: true });

    if (!state.isCallActive) {
      dispatch({ type: "START_CALL" });
    }
    
    console.log("✅ Remote video ready, call started");
  };

  // ------------------ Copy Meeting Link ------------------
  const copyMeetingLink = async () => {
    const link = `${window.location.origin}/room/${roomId}`;
    
    const message = `📹 Join my video meeting on MeetNow\n\n🔑 Room ID: ${roomId}\n🔗 Link: ${link}\n🌐 Live on: ${window.location.origin}`;

    try {
      await navigator.clipboard.writeText(message);
      toast.success("Meeting link copied!", { 
        icon: "🔗",
        autoClose: 500 
      });
    } catch {
      const textArea = document.createElement("textarea");
      textArea.value = message;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      toast.success("Meeting link copied!", { 
        icon: "🔗",
        autoClose: 500 
      });
    }
  };

  // ------------------ Leave Room ------------------
  const leaveRoom = () => {
    const callDuration = getCallDurationText();

    if (state.isCallActive) {
      toast.success(`Call ended. Duration: ${callDuration}`, {
        duration: 5000,
        icon: "📞",
        style: {
          background: "#1e293b",
          color: "#fff",
          padding: "16px",
          borderRadius: "8px",
        },
      });
    } else {
      toast.success("Left the room", { 
        icon: "👋",
        autoClose: 500 
      });
    }

    // Stop all local tracks
    if (state.myStream) {
      state.myStream.getTracks().forEach((track) => track.stop());
      console.log("🛑 Local media tracks stopped");
    }

    // Reset remote video
    if (remoteVideoRef.current) {
      if (remoteVideoRef.current.srcObject) {
        remoteVideoRef.current.srcObject.getTracks().forEach((t) => t.stop());
      }
      remoteVideoRef.current.srcObject = null;
    }

    // Reset local video
    if (myVideoRef.current) {
      myVideoRef.current.srcObject = null;
    }

    // Reset peer connection
    if (peer) {
      peer.close();
      console.log("🛑 Peer connection closed");
    }

    // Reset call timer
    dispatch({ type: "END_CALL" });

    // Notify server you left
    if (socket && roomId) {
      socket.emit("leave-room", { roomId });
      console.log("📤 Leave room notification sent");
    }

    // Redirect after a short delay to allow toast to show
    setTimeout(() => {
      window.location.href = "/";
    }, 1000);
  };

  // ------------------ Socket Events ------------------
  useEffect(() => {
    if (!socket) return;

    console.log("🔌 Socket connected, setting up listeners...");

    socket.on("joined-room", () => {
      dispatch({ type: "SET_HAS_JOINED_ROOM", payload: true });
      console.log("✅ Joined room successfully");
    });

    socket.on("user-joined", handleNewUserJoined);
    
    socket.on("incoming-call", handleIncomingCall);
    
    socket.on("call-accepted", handleCallAccepted);
    
    socket.on("ice-candidate", (data) => {
      console.log("📥 Received ICE candidate");
      // Handled in separate useEffect
    });

    socket.on("user-left", ({ socketId }) => {
      console.log("🚪 User left:", socketId);
      
      // Reset connection state
      dispatch({ type: "SET_CONNECTION_STATE", payload: "disconnected" });
      connectionAttempts.current = 0;
      
      // Reset refs
      remoteSocketIdRef.current = null;
      pendingIncomingCall.current = null;
      isSettingRemoteAnswer.current = false;

      // Stop remote stream
      if (remoteVideoRef.current && remoteVideoRef.current.srcObject) {
        remoteVideoRef.current.srcObject.getTracks().forEach(t => t.stop());
        remoteVideoRef.current.srcObject = null;
      }

      remoteStreamRef.current = null;

      // Reset UI state
      dispatch({ type: "SET_REMOTE_NAME", payload: null });
      dispatch({ type: "SET_REMOTE_EMAIL", payload: null });
      dispatch({ type: "SET_REMOTE_CAMERA", payload: false });
      dispatch({ type: "SET_REMOTEVIDEOREADY", payload: false });
      dispatch({ type: "END_CALL" });

      toast("👋 User disconnected", { icon: "ℹ️" });
    });

    return () => {
      socket.off("joined-room");
      socket.off("user-joined");
      socket.off("incoming-call");
      socket.off("call-accepted");
      socket.off("ice-candidate");
      socket.off("user-left");
    };
  }, [socket, handleNewUserJoined, handleIncomingCall, handleCallAccepted]);

  // ------------------ UI Render ------------------
  return (
    <div className="min-h-screen text-white flex bg-gradient-to-br from-gray-900 via-black to-blue-900">
      {/* Header */}
      <header className="fixed h-18 sm:h-16 flex items-center justify-between bg-[#000000] text-white shadow-2xl w-full p-2 sm:px-4">
        <div className="sm:flex items-center sm:space-x-4">
          <span className={`flex items-center font-sans font-semibold px-3 py-1 text-lg rounded-full ${state.connectionState === 'connected' ? 'bg-green-900' : 'bg-red-900'}`}>
            <Circle className={`${state.connectionState === 'connected' ? 'text-green-400' : 'text-red-400'} w-4 h-4 rounded-full mr-1`} />
            {state.connectionState === 'connected' ? 'Connected' : 
             state.connectionState === 'connecting' ? 'Connecting...' : 'Disconnected'}
          </span>

          <div className="flex items-center space-x-4 mt-1 sm:mt-0">
            <span className="rounded-md text-lg font-bold">
              Room: <span className="text-blue-500"> {roomId}</span>
            </span>

            {state.remoteName && (
              <span className="p-0.5 sm:px-2 rounded-md font-sans font-semibold text-white text-lg">
                {state.isCallActive ? <CallTime state={state} dispatch={dispatch} /> : "00:00"}
              </span>
            )}
          </div>
        </div>

        <div className="sm:flex sm:items-center sm:space-x-3 my-auto">
          <span className="flex items-center space-x-2 bg-gray-800 p-0.5 sm:px-2 rounded-md font-sans">
            <Users className="w-5 h-5 mr-1 text-green-500" /> {totalUsers} online
            {state.isMobileDevice && <Smartphone className="w-4 h-4 ml-2 text-blue-400" />}
          </span>
          <span className="flex items-center mt-1 sm:mt-0">
            <Clock className="w-5 h-5 my-1 mr-1 text-amber-500 font-bold" /> <RealTimeClock />
          </span>
        </div>
      </header>

      {/* Video Capture */}
      <div className="relative w-screen py-2 mt-17 sm:mt-14">
        {/* REMOTE VIDEO */}
        <div
          onClick={handleSwipped}
          className={`absolute transition-all duration-300 rounded-md bg-[#0d1321]
      ${state.isSwapped ? "top-4 right-4 w-56 sm:w-56 h-36 z-20 shadow-2xl" : "top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 inset-0 w-full xl:max-w-4xl h-[95%] z-10"}
    `}
        >
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            onCanPlay={handleRemoteVideoReady}
            className={`w-full h-full object-cover shadow-2xl rounded-md bg-[#0d1321] ${state.remoteCameraOn ? "block" : "hidden"} `}
          />

          {(remoteStreamRef.current || state.remoteEmail) && (
            <span className="absolute top-2 left-2 z-40 font-sans font-semibold bg-green-700 px-3 py-1 text-sm rounded-full">
              {state.remoteName}
            </span>
          )}

          {/* Overlay when camera is off */}
          {!state.remoteCameraOn && state.remoteName && (
            <div className="absolute inset-0 flex items-center justify-center z-40">
              <span className="flex items-center justify-center w-18 h-18 rounded-full bg-blue-700 text-white text-4xl sm:text-5xl font-semibold shadow-lg">
                {state.remoteName ? state.remoteName.charAt(0).toUpperCase() : ""}
              </span>
            </div>
          )}

          {/* status */}
          {!state.remoteVideoReady && (
            <span className="absolute top-4 left-2 z-40 font-sans font-semibold bg-[#931cfb] px-3 py-1 text-sm rounded-full">
              Waiting for participants... {state.remoteCameraOn}
            </span>
          )}

          {/* Waiting */}
          {!state.remoteVideoReady && !state.isSwapped && (
            <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-40 font-sans text-lg text-center">
              <CircleAlert className="text-center mx-auto my-2 w-10 h-10 text-yellow-600" />
              Share the meeting Link to invite others
            </span>
          )}
        </div>

        {/* MY VIDEO */}
        <div
          onClick={handleSwipped}
          className={`absolute transition-all duration-300 rounded-md bg-[#0d1321]
      ${state.isSwapped ? "top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 inset-0 w-full xl:max-w-4xl h-[95%] z-10" : "top-4 right-4 w-56 sm:w-56 h-36 z-20 shadow-2xl bg-gray-800"}
    `}
        >
          <video
            ref={myVideoRef}
            autoPlay
            playsInline
            muted
            className={`w-full h-full rounded-md object-cover shadow-2xl bg-[#0d1321] ${state.cameraOn ? "block" : "hidden"} `}
          />

          {/* Local Video User A Name */}
          <span className="absolute top-2 left-2 z-40 font-sans font-semibold bg-green-700 px-3 py-1 text-sm rounded-full">
            {state.myName}
          </span>

          {!state.cameraOn && (
            <div className="absolute inset-0 flex items-center justify-center z-40">
              <span className="flex items-center justify-center w-18 h-18 rounded-full bg-blue-700 text-white text-4xl sm:text-5xl font-semibold shadow-lg">
                {state.myName.charAt(0).toUpperCase()}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Chat Content */}
      {state.chatClose && (
        <div className="absolute top-0 right-0 h-full w-80 sm:96 bg-gray-900/95 backdrop-blur-xl border-l border-gray-800 z-50 flex flex-col">
          <div className="p-4 border-b border-gray-800 flex justify-between items-center">
            <h3 className="text-lg font-semibold">Chat</h3>
            <button
              onClick={handleChat}
              className="p-2 hover:bg-gray-800 rounded-full transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          <div className="flex-1 p-4 overflow-y-auto space-y-4">
            {state.messages.map((msg, idx) => {
              const isMe = msg.from === socket?.id;
              return (
                <div key={idx} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[70%] rounded-2xl px-4 py-2 ${isMe ? "bg-gradient-to-r from-blue-600 to-indigo-600" : "bg-gray-800"}`}
                  >
                    <div className="text-xs opacity-75 mb-1">
                      {isMe ? state.myName : state.remoteName} • {msg.timestamp || "Just now"}
                    </div>
                    <div className="text-sm">{msg.text}</div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="p-4 border-t border-gray-800">
            <div className="flex gap-2">
              <input
                type="text"
                value={state.messageText}
                onChange={(e) => dispatch({ type: "SET_MESSAGE_TEXT", payload: e.target.value })}
                onKeyPress={(e) => e.key === "Enter" && sendMessage()}
                placeholder="Type a message..."
                className="flex-1 bg-gray-800 rounded-full px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={sendMessage}
                className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 px-6 rounded-full font-medium transition-all duration-300"
              >
                Send
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Connection Status Banner */}
      {state.connectionState === 'connecting' && (
        <div className="fixed top-20 left-1/2 transform -translate-x-1/2 bg-blue-900 text-white px-6 py-3 rounded-lg shadow-lg z-50 flex items-center gap-3">
          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
          <span>Connecting to {state.remoteName}...</span>
        </div>
      )}

      {/* Echo Prevention Instructions */}
      {state.speakerMode && (
        <div className="fixed top-24 left-1/2 transform -translate-x-1/2 bg-yellow-900 text-white px-6 py-3 rounded-lg shadow-lg z-50">
          <div className="flex items-center gap-2 mb-1">
            <Volume2 className="w-5 h-5" />
            <span className="font-semibold">Speaker Mode Active</span>
          </div>
          <div className="text-sm">Microphone is muted to prevent echo</div>
        </div>
      )}

      {/* Cross-Device Audio Tips */}
      {state.connectionState === 'connected' && state.isMobileDevice && !state.speakerMode && (
        <div className="fixed top-32 left-1/2 transform -translate-x-1/2 bg-blue-800 text-white px-4 py-2 rounded-lg shadow-lg z-50 text-sm">
          💡 For best audio: Use headphones or keep device volume low
        </div>
      )}

      {/* Leave when display message */}
      <Toaster position="top-right" reverseOrder={false} />

      {/* BOTTOM CONTROL BAR */}
      <div className="fixed flex flex-wrap w-full max-w-92 sm:max-w-md justify-center place-items-center gap-2.5 sm:gap-4 bottom-6 left-1/2 z-10 -translate-x-1/2 bg-[#0b1018] backdrop-blur-lg sm:px-2 py-3 rounded-xl shadow-lg">
        <div
          onClick={toggleCamera}
          className={`p-3 rounded-full bg-[#364355] hover:bg-[#2e4361] cursor-pointer ${state.cameraOn ? "bg-gray-900" : ""} `}
        >
          {state.cameraOn ? <Camera /> : <CameraOff />}
        </div>

        <div
          onClick={toggleMic}
          className={`p-3 rounded-full bg-[#364355] hover:bg-[#2e4361] cursor-pointer ${state.micOn ? "bg-gray-900" : ""} `}
        >
          {state.micOn ? <Mic /> : <MicOff />}
        </div>

        <div
          onClick={toggleHandfree}
          className={`p-3 rounded-full bg-[#364355] hover:bg-[#2e4361] cursor-pointer ${state.speakerMode ? "bg-gray-900" : ""} `}
        >
          {state.speakerMode ? <Headphones /> : <Volume2 />}
        </div>

        {/* Enhanced Audio Controls */}
        <div
          onClick={() => toggleEchoCancellation()}
          className={`p-3 rounded-full ${state.echoCancellationEnabled ? 'bg-green-700' : 'bg-[#364355]'} hover:bg-[#2e4361] cursor-pointer`}
          title="Toggle Echo Cancellation"
        >
          <Ear className="w-5 h-5" />
        </div>

        <div
          onClick={() => {
            dispatch({ type: "TOGGLE_NOISE_SUPPRESSION" });
            toast(state.noiseSuppressionEnabled ? "Noise Suppression OFF" : "Noise Suppression ON");
          }}
          className={`p-3 rounded-full ${state.noiseSuppressionEnabled ? 'bg-green-700' : 'bg-[#364355]'} hover:bg-[#2e4361] cursor-pointer`}
          title="Toggle Noise Suppression"
        >
          <Mic className="w-5 h-5" />
        </div>

        <div
          onClick={handleChat}
          className={`relative p-3 rounded-full bg-[#364355] hover:bg-[#2e4361] cursor-pointer ${state.chatClose ? "bg-gray-900" : ""} `}
        >
          {state.chatClose ? <MessageSquareText /> : <MessageSquareOff />}
        </div>

        <div
          onClick={copyMeetingLink}
          className={`p-3 rounded-full bg-[#009776] hover:bg-[#048166] cursor-pointer`}
        >
          <Share2 className="mr-2 w-5 h-5" />
        </div>
        <div
          onClick={leaveRoom}
          className={`p-3 rounded-full bg-[#ea002e] hover:bg-[#c7082e] gray-800 cursor-pointer`}
        >
          <PhoneOff />
        </div>
      </div>
    </div>
  );
};

export default RoomPage;

