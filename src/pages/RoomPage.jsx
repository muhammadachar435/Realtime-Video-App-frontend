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
  FlipHorizontal,
  Headset,
  VolumeX,
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
    audioProcessingActive: false,
    mirrorSelfView: true,
    autoMuteWhenSpeaking: false, // NEW: Auto-mute when remote is speaking
    isRemoteSpeaking: false, // NEW: Track if remote is speaking
    volumeLevel: 0.5, // NEW: Control output volume
    usingHeadphones: false, // NEW: Headphone detection
  }), []);

  // useReducer
  const [state, dispatch] = useReducer(roomReducer, enhancedInitialState);

  // useRef
  const pendingIncomingCall = useRef(null);
  const myVideoRef = useRef();
  const remoteVideoRef = useRef();
  const remoteStreamRef = useRef(null);
  const remoteSocketIdRef = useRef(null);
  const audioContextRef = useRef(null);
  const audioAnalyserRef = useRef(null);
  const localAudioStreamRef = useRef(null);
  const gainNodeRef = useRef(null);
  const remoteAudioAnalyserRef = useRef(null);
  const echoCheckIntervalRef = useRef(null);
  const [detectedFeedback, setDetectedFeedback] = useState(false);

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

  // ------------------ Toggle Mirror ------------------
  const toggleMirror = () => {
    dispatch({ type: "TOGGLE_MIRROR" });
    toast(state.mirrorSelfView ? "Mirror OFF" : "Mirror ON", {
      icon: "🪞",
      duration: 1000,
    });
  };

  // ------------------ AUTO ECHO DETECTION & FIX ------------------
  useEffect(() => {
    if (!state.myStream || !remoteStreamRef.current) return;

    const detectAndFixEcho = () => {
      try {
        // Create audio context for echo detection
        if (!audioContextRef.current) {
          audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
        }

        // Monitor local microphone
        if (state.myStream.getAudioTracks().length > 0 && !audioAnalyserRef.current) {
          const source = audioContextRef.current.createMediaStreamSource(state.myStream);
          audioAnalyserRef.current = audioContextRef.current.createAnalyser();
          audioAnalyserRef.current.fftSize = 256;
          source.connect(audioAnalyserRef.current);
        }

        // Monitor remote audio
        if (remoteStreamRef.current && remoteStreamRef.current.getAudioTracks().length > 0 && !remoteAudioAnalyserRef.current) {
          const remoteSource = audioContextRef.current.createMediaStreamSource(remoteStreamRef.current);
          remoteAudioAnalyserRef.current = audioContextRef.current.createAnalyser();
          remoteAudioAnalyserRef.current.fftSize = 256;
          remoteSource.connect(remoteAudioAnalyserRef.current);
        }

        // Check for echo/feedback
        if (audioAnalyserRef.current && remoteAudioAnalyserRef.current) {
          const localData = new Uint8Array(audioAnalyserRef.current.frequencyBinCount);
          const remoteData = new Uint8Array(remoteAudioAnalyserRef.current.frequencyBinCount);
          
          audioAnalyserRef.current.getByteFrequencyData(localData);
          remoteAudioAnalyserRef.current.getByteFrequencyData(remoteData);

          // Calculate average volumes
          const localAvg = localData.reduce((a, b) => a + b) / localData.length;
          const remoteAvg = remoteData.reduce((a, b) => a + b) / remoteData.length;

          // ECHO DETECTION LOGIC
          // If remote volume is high but I'm not speaking, it's likely echo
          if (remoteAvg > 50 && localAvg < 20) {
            // Remote is loud but I'm quiet - could be echo feedback
            setDetectedFeedback(true);
            
            // Auto-reduce remote volume to prevent echo
            if (remoteVideoRef.current && state.volumeLevel > 0.3) {
              dispatch({ type: "SET_VOLUME_LEVEL", payload: 0.3 });
              toast.warning("Reducing volume to prevent echo", { 
                icon: "🔇",
                duration: 2000 
              });
            }
          } else {
            setDetectedFeedback(false);
          }

          // If both are loud at same time, it's echo loop!
          if (localAvg > 40 && remoteAvg > 40) {
            console.warn("⚠️ ECHO LOOP DETECTED! Auto-muting...");
            
            // Auto-mute local mic to break loop
            if (state.micOn) {
              toggleMic();
              toast.error("Auto-muted to stop echo", {
                icon: "🔇",
                duration: 3000
              });
            }
          }
        }
      } catch (err) {
        console.log("Echo detection error:", err);
      }
    };

    // Run echo detection every 2 seconds
    echoCheckIntervalRef.current = setInterval(detectAndFixEcho, 2000);

    return () => {
      if (echoCheckIntervalRef.current) {
        clearInterval(echoCheckIntervalRef.current);
      }
    };
  }, [state.myStream, remoteStreamRef.current, state.micOn, state.volumeLevel]);

  // ------------------ Apply Volume to Remote Audio ------------------
  useEffect(() => {
    if (!remoteVideoRef.current) return;

    // Set volume on remote video element
    remoteVideoRef.current.volume = state.volumeLevel;
    
    // Also control via Web Audio API for better quality
    if (remoteStreamRef.current && audioContextRef.current) {
      try {
        if (gainNodeRef.current) {
          gainNodeRef.current.gain.value = state.volumeLevel;
        } else {
          const remoteSource = audioContextRef.current.createMediaStreamSource(remoteStreamRef.current);
          gainNodeRef.current = audioContextRef.current.createGain();
          gainNodeRef.current.gain.value = state.volumeLevel;
          const destination = audioContextRef.current.createMediaStreamDestination();
          
          remoteSource.connect(gainNodeRef.current);
          gainNodeRef.current.connect(destination);
          
          // Replace remote audio track
          const newAudioTrack = destination.stream.getAudioTracks()[0];
          remoteStreamRef.current.getAudioTracks().forEach(track => track.stop());
          remoteStreamRef.current.addTrack(newAudioTrack);
        }
      } catch (err) {
        console.log("Volume control error:", err);
      }
    }
  }, [state.volumeLevel, remoteStreamRef.current]);

  // ------------------ Auto Headphone Detection ------------------
  useEffect(() => {
    const detectHeadphones = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioOutputs = devices.filter(d => d.kind === 'audiooutput');
        
        // Check if headphones are connected
        const hasHeadphones = audioOutputs.some(device => 
          device.label.toLowerCase().includes('headphone') || 
          device.label.toLowerCase().includes('earphone') ||
          device.label.toLowerCase().includes('headset')
        );
        
        if (hasHeadphones && !state.usingHeadphones) {
          dispatch({ type: "SET_USING_HEADPHONES", payload: true });
          console.log("🎧 Headphones detected");
        }
      } catch (err) {
        console.log("Headphone detection error:", err);
      }
    };

    detectHeadphones();
  }, []);

  // ------------------ Incoming Call ------------------
  const handleIncomingCall = useCallback(
    async ({ from, offer, fromName }) => {
      dispatch({ type: "SET_REMOTE_EMAIL", payload: from });
      dispatch({ type: "SET_REMOTE_NAME", payload: fromName });
      
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
          ans: answer 
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
      dispatch({ type: "SET_REMOTE_EMAIL", payload: emailId });
      dispatch({ type: "SET_REMOTE_NAME", payload: name });
      
      remoteSocketIdRef.current = socketId;
      if (setRemoteSocketId) {
        setRemoteSocketId(socketId);
      }
      console.log("✅ Remote socket ID stored:", socketId);

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

  // ------------------ Local Media - OPTIMIZED FOR NO ECHO ------------------
  const getUserMediaStream = useCallback(async () => {
    try {
      console.log("🎥 Requesting camera and microphone access...");
      
      // OPTIMIZED CONSTRAINTS TO PREVENT ECHO
      const constraints = {
        video: { 
          width: { ideal: 1280 }, 
          height: { ideal: 720 }, 
          frameRate: { ideal: 30 },
          facingMode: "user"
        },
        audio: { 
          // CRITICAL: Enable all echo cancellation features
          echoCancellation: { exact: true },
          noiseSuppression: { exact: true },
          autoGainControl: { exact: true },
          
          // Set LOW latency to reduce echo
          latency: { ideal: 0.01 },
          
          // Use mono to reduce complexity
          channelCount: { ideal: 1 },
          
          // Browser-specific optimizations
          googEchoCancellation: true,
          googNoiseSuppression: true,
          googAutoGainControl: true,
          googHighpassFilter: true,
          
          // Disable audio mirroring (causes echo)
          googAudioMirroring: false,
          
          // Volume control
          volume: { ideal: 0.5, max: 0.7 }
        }
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);

      // Apply additional constraints to audio track
      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length > 0) {
        const audioTrack = audioTracks[0];
        
        // Get and log settings
        const settings = audioTrack.getSettings();
        console.log("🔊 FINAL Audio Settings:", settings);
        
        // Force echo cancellation
        try {
          await audioTrack.applyConstraints({
            echoCancellation: { exact: true },
            noiseSuppression: { exact: true },
            autoGainControl: { exact: true }
          });
          console.log("✅ Audio constraints forced");
        } catch (err) {
          console.warn("Could not force audio constraints:", err);
        }

        // Create noise gate to mute when not speaking
        try {
          const audioContext = new (window.AudioContext || window.webkitAudioContext)();
          const source = audioContext.createMediaStreamSource(stream);
          const analyser = audioContext.createAnalyser();
          const gainNode = audioContext.createGain();
          
          analyser.fftSize = 256;
          source.connect(analyser);
          source.connect(gainNode);
          
          const destination = audioContext.createMediaStreamDestination();
          gainNode.connect(destination);
          
          // Add noise gate (auto-mute when quiet)
          const dataArray = new Uint8Array(analyser.frequencyBinCount);
          const checkVolume = () => {
            analyser.getByteFrequencyData(dataArray);
            const avg = dataArray.reduce((a, b) => a + b) / dataArray.length;
            
            // Noise gate: mute when volume < 15
            if (avg < 15) {
              gainNode.gain.setTargetAtTime(0.001, audioContext.currentTime, 0.1);
            } else {
              gainNode.gain.setTargetAtTime(1.0, audioContext.currentTime, 0.1);
            }
            
            requestAnimationFrame(checkVolume);
          };
          checkVolume();
          
          // Replace original track with processed one
          const processedTrack = destination.stream.getAudioTracks()[0];
          stream.removeTrack(audioTrack);
          stream.addTrack(processedTrack);
          
          console.log("✅ Noise gate applied");
        } catch (err) {
          console.log("Noise gate setup failed:", err);
        }
      }

      console.log("✅ Media devices accessed successfully");
      dispatch({ type: "SET_MY_STREAM", payload: stream });
      
      if (myVideoRef.current) {
        myVideoRef.current.srcObject = stream;
        console.log("✅ Local video stream attached");
      }
      
      // Send the processed stream
      await sendStream(stream);
      dispatch({ type: "SET_STREAM_READY", payload: true });
      console.log("✅ Stream ready for WebRTC");

      // Handle pending incoming call
      if (pendingIncomingCall.current) {
        console.log("🔄 Processing pending incoming call...");
        handleIncomingCall(pendingIncomingCall.current);
        pendingIncomingCall.current = null;
      }
    } catch (err) {
      console.error("❌ Error accessing media devices:", err);
      
      // ULTRA SIMPLE FALLBACK
      if (err.name === 'OverconstrainedError' || err.name === 'ConstraintNotSatisfiedError') {
        try {
          console.log("🔄 Trying ULTRA simple constraints...");
          const fallbackStream = await navigator.mediaDevices.getUserMedia({
            video: false, // NO VIDEO - reduces complexity
            audio: {
              echoCancellation: true,
              noiseSuppression: true
            }
          });
          
          dispatch({ type: "SET_MY_STREAM", payload: fallbackStream });
          await sendStream(fallbackStream);
          dispatch({ type: "SET_STREAM_READY", payload: true });
          toast.success("Audio-only mode (better for echo prevention)");
        } catch (fallbackErr) {
          console.error("Fallback also failed:", fallbackErr);
          toast.error("Please allow microphone access");
        }
      } else {
        toast.error("Failed to access camera/microphone");
      }
    }
  }, [sendStream, handleIncomingCall]);

  // ------------------ Cleanup ------------------
  useEffect(() => {
    return () => {
      if (echoCheckIntervalRef.current) {
        clearInterval(echoCheckIntervalRef.current);
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close();
      }
    };
  }, []);

  // ------------------ Initial call to getUserMediaStream ------------------
  useEffect(() => {
    getUserMediaStream();
  }, [getUserMediaStream]);

  // ------------------ Debug WebRTC Connection ------------------
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

    peer.addEventListener('connectionstatechange', logConnectionState);
    peer.addEventListener('iceconnectionstatechange', logConnectionState);
    peer.addEventListener('icegatheringstatechange', logConnectionState);
    peer.addEventListener('signalingstatechange', logConnectionState);

    return () => {
      peer.removeEventListener('connectionstatechange', logConnectionState);
      peer.removeEventListener('iceconnectionstatechange', logConnectionState);
      peer.removeEventListener('icegatheringstatechange', logConnectionState);
      peer.removeEventListener('signalingstatechange', logConnectionState);
    };
  }, [peer]);

  // ------------------ ICE Candidates ------------------
  useEffect(() => {
    if (!socket || !peer) return;

    const handleIncomingIceCandidate = ({ candidate, from }) => {
      console.log("📥 Received ICE candidate from:", from, candidate);
      if (candidate && peer.remoteDescription) {
        peer.addIceCandidate(new RTCIceCandidate(candidate)).catch(err => {
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

  // ------------------ Remote Track ------------------
  useEffect(() => {
    let playTimeout;

    const handleTrackEvent = (event) => {
      if (event.streams && event.streams[0]) {
        remoteStreamRef.current = event.streams[0];

        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = remoteStreamRef.current;

          // Set initial volume to prevent loud echo
          remoteVideoRef.current.volume = 0.5;

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

  // ------------------ Retry connection ------------------
  useEffect(() => {
    if (!remoteStreamRef.current && state.remoteEmail && state.streamReady) {
      console.log("🔄 Retrying connection to remote user...");
      const retry = setTimeout(() => {
        handleNewUserJoined({ 
          emailId: state.remoteEmail, 
          name: state.remoteName,
          socketId: remoteSocketIdRef.current 
        });
      }, 1000);
      return () => clearTimeout(retry);
    }
  }, [state.remoteEmail, state.remoteName, state.streamReady, handleNewUserJoined]);

  // ------------------ Start call timer ------------------
  useEffect(() => {
    if (state.remoteVideoReady && !state.isCallActive) {
      dispatch({ type: "START_CALL" });
      console.log("⏱️ Call timer started");
    }
  }, [state.remoteVideoReady, state.isCallActive]);

  // ------------------ Attach streams ------------------
  useEffect(() => {
    if (myVideoRef.current && state.myStream) {
      myVideoRef.current.srcObject = state.myStream;
    }
  }, [state.myStream]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStreamRef.current) {
      remoteVideoRef.current.srcObject = remoteStreamRef.current;
    }
  }, [remoteStreamRef.current]);

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

    // Cleanup intervals
    if (echoCheckIntervalRef.current) {
      clearInterval(echoCheckIntervalRef.current);
    }

    // Stop all local tracks
    if (state.myStream) {
      state.myStream.getTracks().forEach((track) => track.stop());
      console.log("🛑 Local media tracks stopped");
    }

    // Cleanup audio context
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close();
    }

    // Reset videos
    if (remoteVideoRef.current) {
      if (remoteVideoRef.current.srcObject) {
        remoteVideoRef.current.srcObject.getTracks().forEach((t) => t.stop());
      }
      remoteVideoRef.current.srcObject = null;
    }

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

    // Notify server
    if (socket && roomId) {
      socket.emit("leave-room", { roomId });
      console.log("📤 Leave room notification sent");
    }

    // Redirect
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
    
    socket.on("user-left", ({ socketId }) => {
      pendingIncomingCall.current = null;
      remoteSocketIdRef.current = null;
      console.log("🚪 User left:", socketId);

      if (remoteVideoRef.current && remoteVideoRef.current.srcObject) {
        remoteVideoRef.current.srcObject.getTracks().forEach((t) => t.stop());
        remoteVideoRef.current.srcObject = null;
      }

      remoteStreamRef.current = null;

      if (state.isCallActive) {
        const callDuration = getCallDurationText();
        toast.custom(
          (t) => (
            <div className="bg-blue-900 w-72 shadow-2xl text-white p-4 font-sans rounded-xl flex flex-col">
              <div className="flex items-center gap-2">
                <CircleAlert className="w-5 h-5 text-yellow-400" />
                <span className="font-semibold">User Disconnected</span>
              </div>
              <div className="mt-2 text-sm opacity-90">
                Call duration: <span className="font-bold">{callDuration}</span>
              </div>
            </div>
          ),
          { duration: 5000 },
        );
      }

      dispatch({ type: "SET_REMOTE_NAME", payload: null });
      dispatch({ type: "SET_REMOTE_EMAIL", payload: null });
      dispatch({ type: "SET_REMOTE_CAMERA", payload: false });
      dispatch({ type: "SET_REMOTEVIDEOREADY", payload: false });
      dispatch({ type: "END_CALL" });
    });

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
  }, [socket, handleNewUserJoined, handleIncomingCall, handleCallAccepted, state.isCallActive]);

  // ------------------ Camera Toggle ------------------
  const toggleCamera = () => {
    if (!state.myStream) return;

    const newCameraState = !state.cameraOn;
    state.myStream.getVideoTracks().forEach((track) => (track.enabled = newCameraState));
    dispatch({ type: "TOGGLE_CAMERA" });

    socket.emit("camera-toggle", {
      cameraOn: newCameraState,
      roomId,
    });

    toast(newCameraState ? "Camera ON" : "Camera OFF", {
      icon: newCameraState ? "📹" : "📵",
    });
  };

  useEffect(() => {
    if (!socket) return;

    const handleCameraToggle = ({ cameraOn }) => {
      console.log("Remote Camera on:", cameraOn);
      dispatch({ type: "SET_REMOTE_CAMERA", payload: cameraOn });
    };

    socket.on("camera-toggle", handleCameraToggle);
    return () => socket.off("camera-toggle", handleCameraToggle);
  }, [socket]);

  // ------------------ toggleMic ------------------
  const toggleMic = () => {
    if (!state.myStream) return;
    
    const newMicState = !state.micOn;
    state.myStream.getAudioTracks().forEach((t) => {
      t.enabled = newMicState;
    });
    
    dispatch({ type: "TOGGLE_MIC" });
    
    toast(newMicState ? "Mic ON" : "Mic OFF", {
      icon: newMicState ? "🎤" : "🔇",
    });
  };

  // ------------------ toggleHandFree ------------------
  const toggleHandfree = async () => {
    if (!remoteVideoRef.current || !state.myStream) return;

    if (!state.usingHandfree && state.handfreeDeviceId) {
      try {
        await remoteVideoRef.current.setSinkId(state.handfreeDeviceId);
        dispatch({ type: "TOGGLE_HANDFREE" });
        toast("Speaker Mode ON", { 
          icon: "🔊",
          duration: 3000 
        });
      } catch (err) {
        console.error("Failed to switch to speaker:", err);
        toast.error("Failed to switch to speaker mode");
      }
    } else {
      try {
        await remoteVideoRef.current.setSinkId("");
        dispatch({ type: "TOGGLE_HANDFREE" });
        toast("Headphone Mode ON", { icon: "🎧" });
      } catch (err) {
        console.error("Failed to switch to headphones:", err);
      }
    }
  };

  // ------------------ Volume Control ------------------
  const adjustVolume = (level) => {
    dispatch({ type: "SET_VOLUME_LEVEL", payload: level });
    toast(`Volume: ${Math.round(level * 100)}%`, { duration: 1000 });
  };

  // ------------------ Echo Cancellation ------------------
  const toggleEchoCancellation = async () => {
    if (!state.myStream) return;
    
    const newEchoState = !state.echoCancellationEnabled;
    const audioTracks = state.myStream.getAudioTracks();
    
    for (const track of audioTracks) {
      try {
        await track.applyConstraints({
          echoCancellation: newEchoState
        });
      } catch (err) {
        console.warn("Could not toggle echo cancellation:", err);
      }
    }
    
    dispatch({ type: "TOGGLE_ECHO_CANCELLATION" });
    toast(newEchoState ? "Echo Cancellation ON" : "Echo Cancellation OFF", {
      icon: newEchoState ? "✅" : "❌"
    });
  };

  // ------------------ Noise Suppression ------------------
  const toggleNoiseSuppression = async () => {
    if (!state.myStream) return;
    
    const newNoiseState = !state.noiseSuppressionEnabled;
    const audioTracks = state.myStream.getAudioTracks();
    
    for (const track of audioTracks) {
      try {
        await track.applyConstraints({
          noiseSuppression: newNoiseState
        });
      } catch (err) {
        console.warn("Could not toggle noise suppression:", err);
      }
    }
    
    dispatch({ type: "TOGGLE_NOISE_SUPPRESSION" });
    toast(newNoiseState ? "Noise Suppression ON" : "Noise Suppression OFF", {
      icon: newNoiseState ? "🔇" : "🔊"
    });
  };

  // ------------------ Detect Audio Devices ------------------
  useEffect(() => {
    const detectAudioDevices = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioInputDevices = devices.filter((d) => d.kind === "audioinput");
        const audioOutputDevices = devices.filter((d) => d.kind === "audiooutput");
        
        dispatch({ type: "SET_AUDIO_DEVICES", payload: audioInputDevices });
        
        if (audioOutputDevices.length > 0) {
          dispatch({ type: "SET_HANDFREE_DEVICE", payload: audioOutputDevices[0].deviceId });
          console.log("🔊 Available speakers:", audioOutputDevices.map(s => s.label));
        }
      } catch (err) {
        console.error("Failed to enumerate devices:", err);
      }
    };

    detectAudioDevices();
  }, []);

  // ------------------ Select Audio Device ------------------
  const selectAudioDevice = async (deviceId) => {
    try {
      const videoTrack = state.myStream?.getVideoTracks()[0];
      const videoConstraints = videoTrack ? videoTrack.getSettings() : true;
      
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { 
          deviceId: { exact: deviceId },
          echoCancellation: true,
          noiseSuppression: true
        },
        video: videoConstraints
      });
      
      dispatch({ type: "SET_MY_STREAM", payload: stream });
      dispatch({ type: "SELECT_AUDIO_DEVICE", payload: deviceId });
      
      if (sendStream) {
        await sendStream(stream);
      }
      
      toast.success("Audio device changed");
    } catch (err) {
      console.error("Failed to switch audio device:", err);
      toast.error("Failed to change audio device");
    }
  };

  // ------------------ Chat Handle ------------------
  const handleChat = () => {
    dispatch({ type: "SET_CHATCLOSE", payload: !state.chatClose });
  };

  // ------------------ handle Swipped ------------------
  const handleSwipped = () => {
    dispatch({ type: "SET_IsSWAPPED", payload: !state.isSwapped });
  };

  // ------------------ handleRemoteVideoRead ------------------
  const handleRemoteVideoReady = () => {
    dispatch({ type: "SET_REMOTEVIDEOREADY", payload: true });

    if (!state.isCallActive) {
      dispatch({ type: "START_CALL" });
    }
    
    console.log("✅ Remote video ready, call started");
  };

  // ------------------ Chat ------------------
  const sendMessage = () => {
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
  };

  // ------------------ Auto-accept pending call ------------------
  useEffect(() => {
    if (pendingIncomingCall.current && state.streamReady) {
      console.log("🔄 Processing pending call now that stream is ready");
      handleIncomingCall(pendingIncomingCall.current);
      pendingIncomingCall.current = null;
    }
  }, [state.streamReady, handleIncomingCall]);

  // ------------------ Load saved name ------------------
  useEffect(() => {
    const savedData = localStorage.getItem("userData");
    if (savedData) {
      const { name: savedName } = JSON.parse(savedData);
      dispatch({ type: "SET_MY_NAME", payload: savedName });
      console.log("👤 User name loaded:", savedName);
    }
  }, []);

  // ------------------ UI ------------------
  return (
    <div className="min-h-screen text-white flex bg-gradient-to-br from-gray-900 via-black to-blue-900">
      {/* Header */}
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
            className={`w-full h-full object-cover shadow-2xl rounded-md bg-[#0d1321] ${state.remoteCameraOn ? "block" : "hidden"} `}
          />

          {(remoteStreamRef.current || state.remoteEmail) && (
            <span className="absolute top-2 left-2 z-40 font-sans font-semibold bg-green-700 px-3 py-1 text-sm rounded-full">
              {state.remoteName}
            </span>
          )}

          {!state.remoteCameraOn && state.remoteName && (
            <div className="absolute inset-0 flex items-center justify-center z-40">
              <span className="flex items-center justify-center w-18 h-18 rounded-full bg-blue-700 text-white text-4xl sm:text-5xl font-semibold shadow-lg">
                {state.remoteName ? state.remoteName.charAt(0).toUpperCase() : ""}
              </span>
            </div>
          )}

          {!state.remoteVideoReady && (
            <span className="absolute top-4 left-2 z-40 font-sans font-semibold bg-[#931cfb] px-3 py-1 text-sm rounded-full">
              Waiting for participants...
            </span>
          )}

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
            className={`w-full h-full rounded-md object-cover shadow-2xl bg-[#0d1321] ${state.cameraOn ? "block" : "hidden"} 
            ${state.mirrorSelfView ? 'scale-x-[-1]' : ''}`}
          />

          <span className={`absolute top-2 left-2 z-40 font-sans font-semibold bg-green-700 px-3 py-1 text-sm rounded-full
            ${state.mirrorSelfView ? 'scale-x-[-1]' : ''}`}>
            {state.myName}
          </span>

          {!state.cameraOn && (
            <div className="absolute inset-0 flex items-center justify-center z-40">
              <span className="flex items-center justify-center w-18 h-18 rounded-full bg-blue-700 text-white text-4xl sm:text-5xl font-semibold shadow-lg">
                {state.myName.charAt(0).toUpperCase()}
              </span>
            </div>
          )}

          {/* Echo Detection Indicator */}
          {detectedFeedback && (
            <div className="absolute bottom-2 left-2 z-40 bg-red-600/80 px-2 py-1 rounded-full text-xs flex items-center">
              <VolumeX className="w-3 h-3 mr-1" /> Echo detected
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
      <div className="fixed flex flex-wrap w-full max-w-92 sm:max-w-md justify-center place-items-center gap-2.5 sm:gap-4 bottom-6 left-1/2 z-10 -translate-x-1/2 bg-[#0b1018] backdrop-blur-lg sm:px-2 py-3 rounded-xl shadow-lg">
        <div
          onClick={toggleCamera}
          className={`p-3 rounded-full bg-[#364355] hover:bg-[#2e4361] cursor-pointer ${state.cameraOn ? "bg-gray-900" : ""} `}
          title="Toggle Camera"
        >
          {state.cameraOn ? <Camera /> : <CameraOff />}
        </div>

        <div
          onClick={toggleMic}
          className={`p-3 rounded-full bg-[#364355] hover:bg-[#2e4361] cursor-pointer ${state.micOn ? "bg-gray-900" : ""} `}
          title="Toggle Microphone"
        >
          {state.micOn ? <Mic /> : <MicOff />}
        </div>

        <div
          onClick={toggleHandfree}
          className={`p-3 rounded-full bg-[#364355] hover:bg-[#2e4361] cursor-pointer ${state.usingHandfree ? "bg-gray-900" : ""} `}
          title="Toggle Speaker/Headphone Mode"
        >
          {state.usingHandfree ? <Headphones /> : <Volume2 />}
        </div>

        {/* Volume Control */}
        <div
          onClick={() => adjustVolume(Math.max(0.1, state.volumeLevel - 0.2))}
          className="p-3 rounded-full bg-[#364355] hover:bg-[#2e4361] cursor-pointer"
          title="Reduce Volume"
        >
          <VolumeX className="w-5 h-5" />
        </div>

        {/* Mirror Toggle */}
        <div
          onClick={toggleMirror}
          className={`p-3 rounded-full ${state.mirrorSelfView ? 'bg-blue-700' : 'bg-[#364355]'} hover:bg-[#2e4361] cursor-pointer`}
          title="Mirror Self View"
        >
          <FlipHorizontal className="w-5 h-5" />
        </div>

        {/* Echo Cancellation */}
        <div
          onClick={toggleEchoCancellation}
          className={`p-3 rounded-full ${state.echoCancellationEnabled ? 'bg-green-700' : 'bg-[#364355]'} hover:bg-[#2e4361] cursor-pointer`}
          title="Toggle Echo Cancellation"
        >
          <Ear className="w-5 h-5" />
        </div>

        {/* Chat */}
        <div
          onClick={handleChat}
          className={`relative p-3 rounded-full bg-[#364355] hover:bg-[#2e4361] cursor-pointer ${state.chatClose ? "bg-gray-900" : ""} `}
          title="Toggle Chat"
        >
          {state.chatClose ? <MessageSquareText /> : <MessageSquareOff />}
        </div>

        {/* Share */}
        <div
          onClick={copyMeetingLink}
          className={`p-3 rounded-full bg-[#009776] hover:bg-[#048166] cursor-pointer`}
          title="Share Meeting Link"
        >
          <Share2 className="w-5 h-5" />
        </div>
        
        {/* Leave */}
        <div
          onClick={leaveRoom}
          className={`p-3 rounded-full bg-[#ea002e] hover:bg-[#c7082e] cursor-pointer`}
          title="Leave Call"
        >
          <PhoneOff className="w-5 h-5" />
        </div>
      </div>

      {/* Echo Warning Toast */}
      {detectedFeedback && (
        <div className="fixed top-24 left-1/2 transform -translate-x-1/2 bg-red-600 text-white px-4 py-2 rounded-lg shadow-lg z-50 animate-pulse">
          <div className="flex items-center">
            <VolumeX className="w-4 h-4 mr-2" />
            <span>Echo detected! Lowering volume...</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default RoomPage;
