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
  FlipHorizontal2,
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

  // ================ ADD THESE STATES ================
  const [cameras, setCameras] = useState([]);
  const [currentCameraIndex, setCurrentCameraIndex] = useState(0);
  const [isFrontCamera, setIsFrontCamera] = useState(true);
  // =================================================

  // Enhanced initialState
  const enhancedInitialState = useMemo(
    () => ({
      ...initialState,
      echoCancellationEnabled: true,
      noiseSuppressionEnabled: true,
      audioDevices: [],
      selectedAudioDevice: null,
      audioProcessingActive: false,
    }),
    [],
  );

  // useReducer
  const [state, dispatch] = useReducer(roomReducer, enhancedInitialState);

  // useRef
  const pendingIncomingCall = useRef(null);
  const myVideoRef = useRef();
  const remoteVideoRef = useRef();
  const remoteStreamRef = useRef(null);
  const remoteSocketIdRef = useRef(null);
  const audioContextRef = useRef(null);
  const audioProcessorRef = useRef(null);
  const localAudioStreamRef = useRef(null);
  const analyserRef = useRef(null);

  // totalUsers
  const totalUsers = useMemo(() => (state.remoteName ? 2 : 1), [state.remoteName]);

  // ------------------ Incoming Call ------------------
  const handleIncomingCall = useCallback(
    async ({ from, offer, fromName }) => {
      dispatch({ type: "SET_REMOTE_EMAIL", payload: from });
      dispatch({ type: "SET_REMOTE_NAME", payload: fromName });

      // Store remote socket ID
      remoteSocketIdRef.current = from;
      if (setRemoteSocketId) {
        setRemoteSocketId(from);
      }
      console.log("📲 Incoming call from socket ID:", from);

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
          ans: answer,
        });
        console.log("📨 Answer sent to:", from);
      } catch (err) {
        console.error("❌ Error creating answer:", err);
      }
    },
    [createAnswer, socket, state.streamReady, setRemoteSocketId],
  );

  // ------------------ New User Joined ------------------
  const handleNewUserJoined = useCallback(
    async ({ emailId, name, socketId }) => {
      // ALWAYS set remote name immediately
      dispatch({ type: "SET_REMOTE_EMAIL", payload: emailId });
      dispatch({ type: "SET_REMOTE_NAME", payload: name });

      // Store remote socket ID for ICE candidates
      remoteSocketIdRef.current = socketId;
      if (setRemoteSocketId) {
        setRemoteSocketId(socketId);
      }
      console.log("✅ Remote socket ID stored:", socketId);

      // Store pending call if stream is not ready
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
          socketId: socketId,
        });
        console.log("📨 Offer sent to:", emailId);
      } catch (err) {
        console.error("❌ Error creating offer:", err);
      }
    },
    [createOffer, socket, state.streamReady, setRemoteSocketId],
  );

  // ------------------ Call Accepted ------------------
  const handleCallAccepted = useCallback(
    async ({ ans }) => {
      try {
        console.log("✅ Setting remote answer");
        await setRemoteAns(ans);
        console.log("✅ Remote answer set successfully");
      } catch (err) {
        console.error("❌ Error setting remote answer:", err);
      }
    },
    [setRemoteAns],
  );

  // ================ ADD CAMERA DETECTION FUNCTION ================
  const detectCameras = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(device => device.kind === 'videoinput');
      setCameras(videoDevices);
      
      console.log("📹 Available cameras:", videoDevices.map(cam => ({
        label: cam.label || `Camera ${cam.deviceId.slice(0, 8)}`,
        deviceId: cam.deviceId,
        facingMode: cam.label?.toLowerCase().includes('front') ? 'user' : 
                   cam.label?.toLowerCase().includes('back') ? 'environment' : 'user'
      })));
      
      if (videoDevices.length > 0) {
        // Check if any camera has facingMode info
        const frontCam = videoDevices.find(cam => 
          cam.label?.toLowerCase().includes('front') || 
          cam.label?.toLowerCase().includes('facing: user')
        );
        
        const backCam = videoDevices.find(cam => 
          cam.label?.toLowerCase().includes('back') || 
          cam.label?.toLowerCase().includes('facing: environment') ||
          cam.label?.toLowerCase().includes('rear')
        );
        
        if (frontCam) {
          setIsFrontCamera(true);
        } else if (backCam) {
          setIsFrontCamera(false);
        }
      }
    } catch (err) {
      console.error("Error detecting cameras:", err);
    }
  }, []);

  // ================ ADD SWITCH CAMERA FUNCTION ================
  const switchCamera = useCallback(async () => {
    if (cameras.length < 2) {
      toast.error("Only one camera available");
      return;
    }

    if (!state.myStream) {
      toast.error("No active camera stream");
      return;
    }

    try {
      // Calculate next camera index
      const nextIndex = (currentCameraIndex + 1) % cameras.length;
      const nextCamera = cameras[nextIndex];
      
      console.log("🔄 Switching to camera:", nextCamera.label || `Camera ${nextIndex + 1}`);
      
      // Get current audio track
      const audioTrack = state.myStream.getAudioTracks()[0];
      
      // Stop current video tracks
      state.myStream.getVideoTracks().forEach(track => track.stop());
      
      // Determine facing mode based on camera label
      const cameraLabel = nextCamera.label?.toLowerCase() || '';
      let facingMode = 'user'; // Default to front
      
      if (cameraLabel.includes('back') || cameraLabel.includes('rear') || 
          cameraLabel.includes('environment') || cameraLabel.includes('external')) {
        facingMode = 'environment';
        setIsFrontCamera(false);
        toast("📷 Switched to Back Camera", { icon: "🔄" });
      } else {
        setIsFrontCamera(true);
        toast("📷 Switched to Front Camera", { icon: "🔄" });
      }
      
      // Get new video stream with selected camera
      const constraints = {
        video: {
          deviceId: { exact: nextCamera.deviceId },
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 },
          facingMode: facingMode,
        },
        audio: audioTrack ? {
          deviceId: audioTrack.getSettings().deviceId,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        } : true
      };

      const newStream = await navigator.mediaDevices.getUserMedia(constraints);
      
      // Update state
      dispatch({ type: "SET_MY_STREAM", payload: newStream });
      setCurrentCameraIndex(nextIndex);
      
      // Update video element
      if (myVideoRef.current) {
        myVideoRef.current.srcObject = newStream;
      }
      
      // Update peer connection
      if (sendStream) {
        await sendStream(newStream);
      }
      
      console.log(`✅ Switched to ${facingMode === 'user' ? 'front' : 'back'} camera`);
      
    } catch (err) {
      console.error("❌ Error switching camera:", err);
      toast.error("Failed to switch camera");
      
      // Try fallback with simpler constraints
      try {
        const fallbackStream = await navigator.mediaDevices.getUserMedia({
          video: state.cameraOn,
          audio: true
        });
        
        dispatch({ type: "SET_MY_STREAM", payload: fallbackStream });
        
        if (sendStream) {
          await sendStream(fallbackStream);
        }
        
        toast.success("Camera reset to default");
      } catch (fallbackErr) {
        console.error("Fallback also failed:", fallbackErr);
      }
    }
  }, [cameras, currentCameraIndex, state.myStream, sendStream, state.cameraOn]);

  // ================ UPDATE getUserMediaStream FUNCTION ================
  const getUserMediaStream = useCallback(async (useFrontCamera = true) => {
    try {
      console.log("🎥 Requesting camera and microphone access...");

      await detectCameras();

      // Get available cameras
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(device => device.kind === 'videoinput');
      
      let selectedCamera = null;
      
      if (videoDevices.length > 0) {
        // Try to find front camera if requested
        if (useFrontCamera) {
          selectedCamera = videoDevices.find(device => 
            device.label?.toLowerCase().includes('front') ||
            device.label?.toLowerCase().includes('facing: user')
          ) || videoDevices[0];
          setIsFrontCamera(true);
        } else {
          // Try to find back camera
          selectedCamera = videoDevices.find(device => 
            device.label?.toLowerCase().includes('back') ||
            device.label?.toLowerCase().includes('facing: environment') ||
            device.label?.toLowerCase().includes('rear')
          ) || videoDevices[0];
          setIsFrontCamera(false);
        }
        
        setCurrentCameraIndex(videoDevices.findIndex(device => device.deviceId === selectedCamera.deviceId));
      }

      const constraints = {
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 },
          facingMode: useFrontCamera ? "user" : "environment",
          ...(selectedCamera && { deviceId: { exact: selectedCamera.deviceId } })
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      };

      console.log("📹 Camera constraints:", constraints.video);

      const stream = await navigator.mediaDevices.getUserMedia(constraints);

      // Verify camera info
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        const settings = videoTrack.getSettings();
        console.log("📹 Camera settings:", settings);
        console.log("📹 Camera label:", videoTrack.label);
      }

      const audioTracks = stream.getAudioTracks();
      audioTracks.forEach((track) => {
        const settings = track.getSettings();
        console.log("🔊 Audio settings after getUserMedia:", settings);

        track
          .applyConstraints({
            echoCancellation: true,
            noiseSuppression: true,
          })
          .catch((err) => {
            console.warn("Could not apply audio constraints:", err);
          });
      });

      console.log("✅ Media devices accessed successfully");
      dispatch({ type: "SET_MY_STREAM", payload: stream });

      if (myVideoRef.current) {
        myVideoRef.current.srcObject = stream;
        console.log("✅ Local video stream attached");
      }

      await sendStream(stream);
      dispatch({ type: "SET_STREAM_READY", payload: true });
      console.log("✅ Stream ready for WebRTC");

      if (pendingIncomingCall.current) {
        console.log("🔄 Processing pending incoming call...");
        handleIncomingCall(pendingIncomingCall.current);
        pendingIncomingCall.current = null;
      }
    } catch (err) {
      console.error("❌ Error accessing media devices:", err);

      if (err.name === "OverconstrainedError" || err.name === "ConstraintNotSatisfiedError") {
        try {
          console.log("🔄 Trying fallback constraints...");
          const fallbackStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true,
          });

          dispatch({ type: "SET_MY_STREAM", payload: fallbackStream });
          await sendStream(fallbackStream);
          dispatch({ type: "SET_STREAM_READY", payload: true });
        } catch (fallbackErr) {
          console.error("Fallback also failed:", fallbackErr);
          toast.error("Please allow camera and microphone access");
        }
      } else {
        toast.error("Failed to access camera/microphone");
      }
    }
  }, [sendStream, handleIncomingCall, detectCameras]);

  // ================ ADD toggleCamera FUNCTION ================
  const toggleCamera = useCallback(async () => {
    if (!state.myStream) return;

    const newCameraState = !state.cameraOn;

    if (newCameraState) {
      // Turn camera ON
      if (state.myStream.getVideoTracks().length === 0) {
        // Need to get new stream with camera
        try {
          await getUserMediaStream(isFrontCamera);
        } catch (err) {
          console.error("Failed to enable camera:", err);
          toast.error("Failed to enable camera");
          return;
        }
      } else {
        // Enable existing track
        state.myStream.getVideoTracks().forEach((track) => {
          track.enabled = true;
          track.applyConstraints({
            facingMode: isFrontCamera ? 'user' : 'environment'
          }).catch(console.warn);
        });
      }
    } else {
      // Turn camera OFF - disable tracks but don't stop them
      state.myStream.getVideoTracks().forEach((track) => {
        track.enabled = false;
      });
    }

    dispatch({ type: "TOGGLE_CAMERA" });

    socket.emit("camera-toggle", {
      cameraOn: newCameraState,
      roomId,
    });

    toast(newCameraState ? "Camera ON" : "Camera OFF", {
      icon: newCameraState ? "📹" : "📵",
    });
  }, [state.myStream, state.cameraOn, socket, roomId, getUserMediaStream, isFrontCamera]);

  // ================ ADD toggleMic FUNCTION ================
  const toggleMic = useCallback(() => {
    if (!state.myStream) return;

    const newMicState = !state.micOn;
    state.myStream.getAudioTracks().forEach((t) => {
      t.enabled = newMicState;
    });

    dispatch({ type: "TOGGLE_MIC" });

    toast(newMicState ? "Mic ON" : "Mic OFF", {
      icon: newMicState ? "🎤" : "🔇",
    });
  }, [state.myStream, state.micOn]);

  // ================ ADD toggleHandfree FUNCTION ================
  const toggleHandfree = useCallback(async () => {
    if (!remoteVideoRef.current || !state.myStream) return;

    if (!state.usingHandfree && state.handfreeDeviceId) {
      // Switch to speaker mode
      try {
        await remoteVideoRef.current.setSinkId(state.handfreeDeviceId);

        // DO NOT mute microphone - browser handles echo cancellation
        dispatch({ type: "TOGGLE_HANDFREE" });
        toast("Speaker Mode ON", {
          icon: "🔊",
          duration: 3000,
        });
      } catch (err) {
        console.error("Failed to switch to speaker:", err);
        toast.error("Failed to switch to speaker mode");
      }
    } else {
      // Switch back to normal mode
      try {
        await remoteVideoRef.current.setSinkId("");
        dispatch({ type: "TOGGLE_HANDFREE" });
        toast("Headphone Mode ON", { icon: "🎧" });
      } catch (err) {
        console.error("Failed to switch to headphones:", err);
      }
    }
  }, [state.usingHandfree, state.handfreeDeviceId, state.myStream]);

  // ================ ADD cleanupEverything FUNCTION ================
  const cleanupEverything = useCallback(() => {
    console.log("🧹 Cleaning up all resources...");
    
    // Stop local stream
    if (state.myStream) {
      state.myStream.getTracks().forEach(track => track.stop());
    }
    
    // Stop remote stream
    if (remoteVideoRef.current?.srcObject) {
      remoteVideoRef.current.srcObject.getTracks().forEach(track => track.stop());
    }
    
    // Close peer connection
    if (peer) {
      peer.close();
    }
    
    // Close audio context
    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      audioContextRef.current.close();
    }
    
    // Reset remote video
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
    
    // Reset local video
    if (myVideoRef.current) {
      myVideoRef.current.srcObject = null;
    }
    
    // Reset call timer
    dispatch({ type: "END_CALL" });
    
    // Reset remote-related state
    dispatch({ type: "SET_REMOTE_NAME", payload: null });
    dispatch({ type: "SET_REMOTE_EMAIL", payload: null });
    dispatch({ type: "SET_REMOTE_CAMERA", payload: false });
    dispatch({ type: "SET_REMOTEVIDEOREADY", payload: false });
    
    // Reset camera state
    setCurrentCameraIndex(0);
    setIsFrontCamera(true);
  }, [state.myStream, peer]);

  // ================ ADD Helper Functions ================
  const getCallDurationText = useCallback(() => {
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
  }, [state.callStartTime]);

  //  -------------------Copy Meeting Link---------------------------------
  const copyMeetingLink = useCallback(async () => {
    const link = `${window.location.origin}/room/${roomId}`;

    const message = `📹 Join my video meeting on MeetNow\n\n🔑 Room ID: ${roomId}\n🔗 Link: ${link}\n🌐 Live on: ${window.location.origin}`;

    try {
      await navigator.clipboard.writeText(message);
      toast.success("Meeting link copied!", {
        icon: "🔗",
        autoClose: 500,
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
        autoClose: 500,
      });
    }
  }, [roomId]);

  // ================ ADD leaveRoom FUNCTION ================
  const leaveRoom = useCallback(() => {
    console.log("👋 Leaving room...");
    
    // Show leaving message
    toast.success("Leaving call...", {
      duration: 1500,
      icon: "👋",
    });
    
    // Notify server I'm leaving
    if (socket && roomId) {
      socket.emit("leave-room", { roomId });
    }
    
    // Clean up and redirect myself in 2 seconds
    setTimeout(() => {
      cleanupEverything();
      window.location.href = "/";
    }, 2000);
  }, [socket, roomId, cleanupEverything]);

  // ================ ADD Chat Functions ================
  const handleChat = useCallback(() => {
    dispatch({ type: "SET_CHATCLOSE", payload: !state.chatClose });
  }, [state.chatClose]);

  const handleSwipped = useCallback(() => {
    dispatch({ type: "SET_IsSWAPPED", payload: !state.isSwapped });
  }, []);

  const handleRemoteVideoReady = useCallback(() => {
    dispatch({ type: "SET_REMOTEVIDEOREADY", payload: true });

    if (!state.isCallActive) {
      dispatch({ type: "START_CALL" });
    }

    console.log("✅ Remote video ready, call started");
  }, [state.isCallActive]);

  const sendMessage = useCallback(() => {
    if (!state.messageText.trim()) return;

    socket.emit("chat-message", { roomId, from: socket.id, text: state.messageText });

    dispatch({
      type: "ADD_MESSAGE",
      payload: {
        from: socket.id,
        text: state.messageText,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      },
    });

    dispatch({ type: "SET_MESSAGE_TEXT", payload: "" });
  }, [state.messageText, socket, roomId]);

  // ================ USE EFFECTS START HERE ================
  // Initial call to getUserMediaStream
  useEffect(() => {
    getUserMediaStream(true); // Start with front camera
  }, [getUserMediaStream]);

  // Detect cameras on component mount
  useEffect(() => {
    detectCameras();
  }, [detectCameras]);

  // Beforeunload handler
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (socket && roomId) {
        socket.emit("leave-room", { roomId });
      }
    };
    
    window.addEventListener("beforeunload", handleBeforeUnload);
    
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [socket, roomId]);

  // Audio Processing
  useEffect(() => {
    return () => {
      if (audioProcessorRef.current) {
        audioProcessorRef.current.disconnect();
      }
      if (audioContextRef.current && audioContextRef.current.state !== "closed") {
        audioContextRef.current.close();
      }
    };
  }, []);

  // Debug WebRTC Connection
  useEffect(() => {
    if (!peer) return;

    const logConnectionState = () => {
      console.log("🔍 WebRTC Debug Info:", {
        connectionState: peer.connectionState,
        iceConnectionState: peer.iceConnectionState,
        iceGatheringState: peer.iceGatheringState,
        signalingState: peer.signalingState,
      });
    };

    peer.addEventListener("connectionstatechange", logConnectionState);
    peer.addEventListener("iceconnectionstatechange", logConnectionState);
    peer.addEventListener("icegatheringstatechange", logConnectionState);
    peer.addEventListener("signalingstatechange", logConnectionState);

    return () => {
      peer.removeEventListener("connectionstatechange", logConnectionState);
      peer.removeEventListener("iceconnectionstatechange", logConnectionState);
      peer.removeEventListener("icegatheringstatechange", logConnectionState);
      peer.removeEventListener("signalingstatechange", logConnectionState);
    };
  }, [peer]);

  // ICE Candidates
  useEffect(() => {
    if (!socket || !peer) return;

    const handleIncomingIceCandidate = ({ candidate, from }) => {
      console.log("📥 Received ICE candidate from:", from, candidate);
      if (candidate && peer.remoteDescription) {
        peer.addIceCandidate(new RTCIceCandidate(candidate)).catch((err) => {
          console.error("❌ Error adding ICE candidate:", err);
        });
      }
    };

    const handleLocalIceCandidate = (event) => {
      if (event.candidate && remoteSocketIdRef.current && socket) {
        console.log("📤 Sending ICE candidate to:", remoteSocketIdRef.current, event.candidate);
        socket.emit("ice-candidate", {
          to: remoteSocketIdRef.current,
          candidate: event.candidate,
        });
      }
    };

    socket.on("ice-candidate", handleIncomingIceCandidate);
    peer.onicecandidate = handleLocalIceCandidate;

    peer.oniceconnectionstatechange = () => {
      console.log("❄️ ICE Connection State:", peer.iceConnectionState);
      if (peer.iceConnectionState === "failed") {
        console.log("🔄 ICE failed, trying to restart...");
        try {
          peer.restartIce();
        } catch (err) {
          console.error("❌ Failed to restart ICE:", err);
        }
      }
    };

    return () => {
      socket.off("ice-candidate", handleIncomingIceCandidate);
      if (peer) {
        peer.onicecandidate = null;
        peer.oniceconnectionstatechange = null;
      }
    };
  }, [socket, peer]);

  // Remote Track
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

  // If remote video is not received yet, retry connecting after 1 second
  useEffect(() => {
    if (!remoteStreamRef.current && state.remoteEmail && state.streamReady) {
      console.log("🔄 Retrying connection to remote user...");
      const retry = setTimeout(() => {
        handleNewUserJoined({
          emailId: state.remoteEmail,
          name: state.remoteName,
          socketId: remoteSocketIdRef.current,
        });
      }, 1000);
      return () => clearTimeout(retry);
    }
  }, [state.remoteEmail, state.remoteName, state.streamReady, handleNewUserJoined]);

  // Start call timer when remote video becomes ready
  useEffect(() => {
    if (state.remoteVideoReady && !state.isCallActive) {
      dispatch({ type: "START_CALL" });
      console.log("⏱️ Call timer started");
    }
  }, [state.remoteVideoReady, state.isCallActive]);

  // Attach my own camera stream to my video element
  useEffect(() => {
    if (myVideoRef.current && state.myStream) {
      myVideoRef.current.srcObject = state.myStream;
    }
  }, [state.myStream]);

  // Attach remote user's video stream to remote video element
  useEffect(() => {
    if (remoteVideoRef.current && remoteStreamRef.current) {
      remoteVideoRef.current.srcObject = remoteStreamRef.current;
    }
  }, [remoteStreamRef.current]);

  // Detect Audio Devices
  useEffect(() => {
    const detectAudioDevices = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioInputDevices = devices.filter((d) => d.kind === "audioinput");
        const audioOutputDevices = devices.filter((d) => d.kind === "audiooutput");

        dispatch({ type: "SET_AUDIO_DEVICES", payload: audioInputDevices });

        // Store first speaker for handfree mode
        if (audioOutputDevices.length > 0) {
          dispatch({ type: "SET_HANDFREE_DEVICE", payload: audioOutputDevices[0].deviceId });
          console.log(
            "🔊 Available speakers:",
            audioOutputDevices.map((s) => s.label),
          );
        }
      } catch (err) {
        console.error("Failed to enumerate devices:", err);
      }
    };

    detectAudioDevices();
  }, []);

  // This code waits until the microphone and camera are ready, then it automatically accepts the incoming call
  useEffect(() => {
    if (pendingIncomingCall.current && state.streamReady) {
      console.log("🔄 Processing pending call now that stream is ready");
      handleIncomingCall(pendingIncomingCall.current);
      pendingIncomingCall.current = null;
    }
  }, [state.streamReady, handleIncomingCall]);

  // SavedName Display MyName (You) ex: Ali => A
  useEffect(() => {
    const savedData = localStorage.getItem("userData");
    if (savedData) {
      const { name: savedName } = JSON.parse(savedData);
      dispatch({ type: "SET_MY_NAME", payload: savedName });
      console.log("👤 User name loaded:", savedName);
    }
  }, []);

  // Socket Events
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

    socket.on("chat-message", (data) => {
      dispatch({ type: "ADD_MESSAGE", payload: data });

      if (data.from !== socket.id) {
        toast.custom(
          (t) => (
            <div className="bg-green-800 shadow-2xl text-white p-4 rounded-xl flex items-center gap-2 z-50">
              <MessageSquareText className="w-5 h-5" />
              <span>
                {data.senderName || "Guest"}: {data.text}
              </span>
            </div>
          ),
          { duration: 3000 },
        );
      }
    });

    // user-left event - WHEN SOMEONE ELSE LEAVES
    socket.on("user-left", ({ socketId, reason }) => {
      console.log("🚪 Another user left:", socketId, "Reason:", reason);
      
      // Show message
      const callDuration = getCallDurationText();
      toast.custom(
        (t) => (
          <div className="bg-red-900 w-80 shadow-2xl text-white p-4 font-sans rounded-xl flex flex-col">
            <div className="flex items-center gap-2">
              <X className="w-5 h-5 text-red-300" />
              <span className="font-semibold">Call Ended</span>
            </div>
            <div className="mt-2 text-sm">
              Other participant left the call
            </div>
            {state.isCallActive && (
              <div className="mt-1 text-xs opacity-90">
                Call duration: <span className="font-bold">{callDuration}</span>
              </div>
            )}
            <div className="mt-3 text-xs opacity-75">
              Redirecting to home in 3 seconds...
            </div>
          </div>
        ),
        { duration: 3000 },
      );
      
      // Clean up and redirect in 3 seconds
      setTimeout(() => {
        cleanupEverything();
        window.location.href = "/";
      }, 3000);
    });

    // Socket error handling
    socket.on("connect_error", (error) => {
      console.error("❌ Socket connection error:", error);
      toast.error("Connection error. Please refresh.");
    });

    return () => {
      console.log("🧹 Cleaning up socket listeners...");
      socket.off("joined-room");
      socket.off("user-joined", handleNewUserJoined);
      socket.off("incoming-call", handleIncomingCall);
      socket.off("call-accepted", handleCallAccepted);
      socket.off("chat-message");
      socket.off("user-left");
      socket.off("connect_error");
    };
  }, [socket, handleNewUserJoined, handleIncomingCall, handleCallAccepted, state.isCallActive, getCallDurationText, cleanupEverything]);

  // Camera toggle listener
  useEffect(() => {
    if (!socket) return;

    const handleCameraToggle = ({ cameraOn }) => {
      console.log("Remote Camera on:", cameraOn);
      dispatch({ type: "SET_REMOTE_CAMERA", payload: cameraOn });
    };

    socket.on("camera-toggle", handleCameraToggle);

    return () => socket.off("camera-toggle", handleCameraToggle);
  }, [socket]);

  // ================ RENDER UI ================
  return (
    <div className="min-h-screen text-white flex bg-gradient-to-br from-gray-900 via-black to-blue-900">
      {/* Header Inside Status & Clock */}
      <header className="fixed h-18 sm:h-16 flex items-center justify-between bg-[#000000] text-white shadow-2xl w-full p-2 sm:px-4">
        <div className="sm:flex items-center sm:space-x-4">
          {!remoteStreamRef.current || !state.remoteVideoReady ? (
            <span className="flex items-center font-sans font-semibold text-lg rounded-full">
              <Circle className="bg-[#ff403f] text-[#ff403f] w-3.5 h-3.5 rounded-full mr-1" />{" "}
              Disconnected
            </span>
          ) : (
            <span className="flex items-center font-sans font-semibold px-3 py-1 text-lg rounded-full">
              <Circle className="bg-[#4ab22e] text-[#4ab22e] w-4 h-4 rounded-full mr-1" /> Connected
            </span>
          )}

          {/* Room ID display */}
          <div className="flex items-center space-x-4 mt-1 sm:mt-0">
            <span className="rounded-md text-lg font-bold">
              Room: <span className="text-blue-500"> {roomId}</span>
            </span>

            {/* call Duration */}
            {state.remoteName && (
              <span className="p-0.5 sm:px-2 rounded-md font-sans font-semibold text-white text-lg">
                {state.isCallActive ? <CallTime state={state} dispatch={dispatch} /> : "00:00"}
              </span>
            )}
          </div>
        </div>

        <div className="sm:flex sm:items-center sm:space-x-3 my-auto">
          <span className="flex items-center space-x-4 bg-gray-800 p-0.5 sm:px-2 rounded-md font-sans">
            <Users className="w-5 h-5 mr-1 text-green-500" /> {totalUsers} online
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
            className={`w-full h-full object-cover shadow-2xl rounded-md bg-[#0d1321] transform -scale-x-100 ${state.remoteCameraOn ? "block" : "hidden"} `}
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
            className={`w-full h-full rounded-md object-cover shadow-2xl bg-[#0d1321] transform -scale-x-100 ${state.cameraOn ? "block" : "hidden"} `}
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

      {/* Leave when display message */}
      <Toaster position="top-right" reverseOrder={false} />

      {/* BOTTOM CONTROL BAR */}
      <div className="fixed flex flex-wrap w-full max-w-92 sm:max-w-xl justify-center place-items-center gap-2.5 sm:gap-4 bottom-6 left-1/2 z-10 -translate-x-1/2 bg-[#0b1018] backdrop-blur-lg sm:px-2 py-3 rounded-xl shadow-lg">
        {/* Camera Toggle */}
        <div
          onClick={toggleCamera}
          className={`p-3 rounded-full bg-[#364355] hover:bg-[#2e4361] cursor-pointer ${state.cameraOn ? "bg-gray-900" : ""} `}
          title="Toggle Camera"
        >
          {state.cameraOn ? <Camera /> : <CameraOff />}
        </div>

        {/* Camera Switch - Only show if multiple cameras available */}
        {cameras.length > 1 && (
          <div
            onClick={switchCamera}
            className="p-3 rounded-full bg-[#364355] hover:bg-[#2e4361] cursor-pointer"
            title={`Switch to ${isFrontCamera ? "Back" : "Front"} Camera`}
          >
            <FlipHorizontal2 className="w-5 h-5" />
          </div>
        )}

        {/* Mic Toggle */}
        <div
          onClick={toggleMic}
          className={`p-3 rounded-full bg-[#364355] hover:bg-[#2e4361] cursor-pointer ${state.micOn ? "bg-gray-900" : ""} `}
          title="Toggle Microphone"
        >
          {state.micOn ? <Mic /> : <MicOff />}
        </div>

        {/* Handfree/Speaker Toggle */}
        <div
          onClick={toggleHandfree}
          className={`p-3 rounded-full bg-[#364355] hover:bg-[#2e4361] cursor-pointer ${state.usingHandfree ? "bg-gray-900" : ""} `}
          title="Toggle Speaker/Headphone Mode"
        >
          {state.usingHandfree ? <Headphones /> : <Volume2 />}
        </div>

        {/* Chat Toggle */}
        <div
          onClick={handleChat}
          className={`relative p-3 rounded-full bg-[#364355] hover:bg-[#2e4361] cursor-pointer ${state.chatClose ? "bg-gray-900" : ""} `}
          title="Toggle Chat"
        >
          {state.chatClose ? <MessageSquareText /> : <MessageSquareOff />}
        </div>

        {/* Share Link */}
        <div
          onClick={copyMeetingLink}
          className="p-3 rounded-full bg-[#009776] hover:bg-[#048166] cursor-pointer"
          title="Share Meeting Link"
        >
          <Share2 className="w-5 h-5" />
        </div>

        {/* Leave Call */}
        <div
          onClick={leaveRoom}
          className="p-3 rounded-full bg-[#ea002e] hover:bg-[#c7082e] cursor-pointer"
          title="Leave Call"
        >
          <PhoneOff className="w-5 h-5" />
        </div>
      </div>

      {/* Camera Indicator (Optional - shows current camera) */}
      {state.cameraOn && cameras.length > 1 && (
        <div className="fixed bottom-24 left-1/2 transform -translate-x-1/2 bg-black/70 backdrop-blur-sm text-white text-xs px-3 py-1.5 rounded-full z-20">
          {isFrontCamera ? "📱 Front Camera" : "📷 Back Camera"}
        </div>
      )}
    </div>
  );
};

export default RoomPage;
