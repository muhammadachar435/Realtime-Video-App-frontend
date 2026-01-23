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
    forceMonoAudio: false, // NEW: Add mono audio option
  }), []);

  // useReducer
  const [state, dispatch] = useReducer(roomReducer, enhancedInitialState);
  
  // Add state for camera facing mode
  const [cameraFacingMode, setCameraFacingMode] = useState('user');

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
  const audioInputDevicesRef = useRef([]);
  const audioOutputDevicesRef = useRef([]);
  const isAudioProcessingInitializedRef = useRef(false);

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

  // ------------------ Enhanced Audio Setup ------------------
  const configureAudioStream = useCallback(async (stream) => {
    try {
      const audioTracks = stream.getAudioTracks();
      
      if (audioTracks.length === 0) {
        console.warn("⚠️ No audio tracks available");
        return stream;
      }

      console.log("🔧 Configuring audio tracks with optimal settings...");
      
      for (const track of audioTracks) {
        try {
          // Get current settings
          const settings = track.getSettings();
          console.log("🎚️ Audio track settings before:", settings);
          
          // Apply optimized constraints to prevent echo
          await track.applyConstraints({
            // Core echo cancellation settings
            echoCancellation: { ideal: true },
            noiseSuppression: { ideal: true },
            autoGainControl: { ideal: true },
            
            // Force mono to reduce echo feedback (important!)
            channelCount: 1, // Mono instead of stereo
            
            // Limit sample rate and latency
            sampleRate: 16000, // Standard for voice
            sampleSize: 16,
            
            // Device-specific constraints
            deviceId: settings.deviceId ? { exact: settings.deviceId } : undefined,
            groupId: settings.groupId ? { exact: settings.groupId } : undefined
          });
          
          const newSettings = track.getSettings();
          console.log("✅ Audio track settings after:", newSettings);
          
          // Test if echo cancellation is actually working
          const constraints = track.getConstraints();
          console.log("🔍 Applied constraints:", constraints);
        } catch (err) {
          console.warn("⚠️ Could not apply all audio constraints:", err);
          
          // Fallback to basic constraints
          try {
            await track.applyConstraints({
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
              channelCount: 1 // Still force mono
            });
          } catch (fallbackErr) {
            console.error("❌ Fallback constraints also failed:", fallbackErr);
          }
        }
      }
      
      return stream;
    } catch (err) {
      console.error("❌ Error configuring audio stream:", err);
      return stream;
    }
  }, []);

  // ------------------ Local Media ------------------
  const getUserMediaStream = useCallback(async () => {
    try {
      console.log("🎥 Requesting camera and microphone access...");
      
      // Stop any existing tracks first
      if (state.myStream) {
        state.myStream.getTracks().forEach(track => track.stop());
      }
      
      // Get available devices first
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices.filter(d => d.kind === 'audioinput');
      const audioOutputs = devices.filter(d => d.kind === 'audiooutput');
      
      audioInputDevicesRef.current = audioInputs;
      audioOutputDevicesRef.current = audioOutputs;
      
      console.log("🎤 Available audio inputs:", audioInputs.map(d => d.label));
      console.log("🔊 Available audio outputs:", audioOutputs.map(d => d.label));
      
      // Try to find an optimal audio device
      let preferredDevice = null;
      
      // Prefer built-in microphones (they usually have better echo cancellation)
      const builtInMic = audioInputs.find(d => 
        d.label.toLowerCase().includes('built') || 
        d.label.toLowerCase().includes('internal') ||
        d.label.toLowerCase().includes('default') ||
        d.label === '' || // Often the default system mic
        d.label.toLowerCase().includes('microphone')
      );
      
      preferredDevice = builtInMic || (audioInputs.length > 0 ? audioInputs[0] : null);
      
      const constraints = {
        video: { 
          width: { ideal: 1280 }, 
          height: { ideal: 720 }, 
          frameRate: { ideal: 30 },
          facingMode: "user"
        },
        audio: { 
          // Use specific device if available
          deviceId: preferredDevice ? { exact: preferredDevice.deviceId } : undefined,
          
          // Advanced echo cancellation settings
          echoCancellation: { 
            ideal: true,
            exact: true 
          },
          noiseSuppression: { 
            ideal: true,
            exact: true 
          },
          autoGainControl: { 
            ideal: true,
            exact: true 
          },
          
          // Force mono audio to prevent echo
          channelCount: 1,
          
          // Optimize for voice
          sampleRate: 16000,
          latency: 0.01,
          
          // Disable automatic features that might cause echo
          googAutoGainControl: false,
          googNoiseSuppression: false,
          googHighpassFilter: false,
          googEchoCancellation: true
        }
      };

      console.log("🎯 Using audio constraints:", JSON.stringify(constraints.audio));
      
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (initialError) {
        console.warn("⚠️ Initial constraints failed, trying simplified:", initialError);
        
        // Fallback to simpler constraints
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            channelCount: 1
          }
        });
      }

      // Configure audio tracks
      const configuredStream = await configureAudioStream(stream);

      // Detect camera facing mode
      const videoTrack = configuredStream.getVideoTracks()[0];
      if (videoTrack) {
        const settings = videoTrack.getSettings();
        if (settings.facingMode) {
          setCameraFacingMode(settings.facingMode);
          console.log("📸 Camera facing mode:", settings.facingMode);
        }
      }

      console.log("✅ Media devices accessed successfully");
      dispatch({ type: "SET_MY_STREAM", payload: configuredStream });
      
      if (myVideoRef.current) {
        myVideoRef.current.srcObject = configuredStream;
        console.log("✅ Local video stream attached");
      }
      
      // Send the configured stream
      await sendStream(configuredStream);
      dispatch({ type: "SET_STREAM_READY", payload: true });
      console.log("✅ Stream ready for WebRTC");

      // Handle pending incoming call automatically
      if (pendingIncomingCall.current) {
        console.log("🔄 Processing pending incoming call...");
        handleIncomingCall(pendingIncomingCall.current);
        pendingIncomingCall.current = null;
      }
    } catch (err) {
      console.error("❌ Error accessing media devices:", err);
      
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        toast.error("Please allow camera and microphone access in your browser settings");
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        toast.error("No camera/microphone found. Please connect a microphone.");
      } else if (err.name === 'OverconstrainedError' || err.name === 'ConstraintNotSatisfiedError') {
        // Last resort: audio only
        try {
          toast("⚠️ Camera constraints failed, trying audio only...");
          const audioOnlyStream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
              channelCount: 1
            }
          });
          
          const configuredStream = await configureAudioStream(audioOnlyStream);
          dispatch({ type: "SET_MY_STREAM", payload: configuredStream });
          await sendStream(configuredStream);
          dispatch({ type: "SET_STREAM_READY", payload: true });
          
          toast.success("Audio connected (camera unavailable)");
        } catch (audioErr) {
          console.error("Audio-only also failed:", audioErr);
          toast.error("Failed to access microphone. Please check permissions.");
        }
      } else {
        toast.error("Failed to access camera/microphone");
      }
    }
  }, [sendStream, handleIncomingCall, configureAudioStream, state.myStream]);

  // ------------------ Audio Processing ------------------
  useEffect(() => {
    // Initialize Web Audio API for monitoring (but don't process)
    const initAudioMonitoring = async () => {
      if (!state.myStream || isAudioProcessingInitializedRef.current) return;
      
      try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)({
          sampleRate: 16000,
          latencyHint: 'interactive'
        });
        audioContextRef.current = audioContext;
        
        // Create analyser for volume meter (monitoring only)
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        analyserRef.current = analyser;
        
        const source = audioContext.createMediaStreamSource(state.myStream);
        source.connect(analyser);
        
        // Don't connect to destination to avoid echo
        // Just monitor, don't process
        
        isAudioProcessingInitializedRef.current = true;
        console.log("🎚️ Audio monitoring initialized (no processing to avoid echo)");
      } catch (err) {
        console.warn("⚠️ Could not initialize audio monitoring:", err);
      }
    };
    
    if (state.myStream) {
      initAudioMonitoring();
    }
    
    return () => {
      // Cleanup
      if (audioProcessorRef.current) {
        audioProcessorRef.current.disconnect();
        audioProcessorRef.current = null;
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close();
      }
      if (analyserRef.current) {
        analyserRef.current.disconnect();
        analyserRef.current = null;
      }
      isAudioProcessingInitializedRef.current = false;
    };
  }, [state.myStream]);

  // ------------------ Handle Speaker Output ------------------
  useEffect(() => {
    const setupAudioOutput = async () => {
      if (!remoteVideoRef.current || !remoteStreamRef.current) return;
      
      try {
        // Use headphones/speakers appropriately
        if (state.usingHandfree && state.handfreeDeviceId) {
          // Using speakers - reduce volume to prevent echo
          await remoteVideoRef.current.setSinkId(state.handfreeDeviceId);
          remoteVideoRef.current.volume = 0.7; // Reduced volume for speakers
          console.log("🔊 Using speakers at reduced volume (70%)");
        } else {
          // Using headphones/earphones - safer for echo
          await remoteVideoRef.current.setSinkId("");
          remoteVideoRef.current.volume = 1.0; // Full volume for headphones
          console.log("🎧 Using default audio output (headphones recommended)");
        }
      } catch (err) {
        console.warn("⚠️ Could not set audio output device:", err);
      }
    };
    
    setupAudioOutput();
  }, [state.usingHandfree, state.handfreeDeviceId, remoteStreamRef.current]);

  // Initial call to getUserMediaStream
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

    // Handle incoming ICE candidates
    const handleIncomingIceCandidate = ({ candidate, from }) => {
      console.log("📥 Received ICE candidate from:", from, candidate);
      if (candidate && peer.remoteDescription) {
        peer.addIceCandidate(new RTCIceCandidate(candidate)).catch(err => {
          console.error("❌ Error adding ICE candidate:", err);
        });
      }
    };

    // Handle local ICE candidate generation
    const handleLocalIceCandidate = (event) => {
      if (event.candidate && remoteSocketIdRef.current && socket) {
        console.log("📤 Sending ICE candidate to:", remoteSocketIdRef.current, event.candidate);
        socket.emit("ice-candidate", {
          to: remoteSocketIdRef.current,
          candidate: event.candidate,
        });
      }
    };

    // Set up event listeners
    socket.on("ice-candidate", handleIncomingIceCandidate);
    peer.onicecandidate = handleLocalIceCandidate;

    // Handle ICE connection state changes
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

          // Small delay to avoid AbortError
          clearTimeout(playTimeout);
          playTimeout = setTimeout(() => {
            // Only play if paused
            if (remoteVideoRef.current.paused) {
              remoteVideoRef.current.play().catch((err) => {
                if (err.name !== "AbortError") console.error("❌ Error playing remote video:", err);
              });
            }
          }, 100);
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
          socketId: remoteSocketIdRef.current 
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
      
      // Set initial volume based on output mode
      if (state.usingHandfree) {
        remoteVideoRef.current.volume = 0.7; // Lower volume for speakers
      } else {
        remoteVideoRef.current.volume = 1.0; // Full volume for headphones
      }
    }
  }, [remoteStreamRef.current, state.usingHandfree]);

  //  -------------------Copy Meeting Link---------------------------------
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
    // Calculate total call duration
    const callDuration = getCallDurationText();

    // Show toast with call duration
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
      state.myStream.getTracks().forEach((track) => {
        track.stop();
        track.enabled = false;
      });
      console.log("🛑 Local media tracks stopped");
    }

    // Cleanup audio processing
    if (audioProcessorRef.current) {
      audioProcessorRef.current.disconnect();
      audioProcessorRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (analyserRef.current) {
      analyserRef.current.disconnect();
      analyserRef.current = null;
    }

    // Reset remote video
    if (remoteVideoRef.current) {
      if (remoteVideoRef.current.srcObject) {
        remoteVideoRef.current.srcObject.getTracks().forEach((t) => t.stop());
      }
      remoteVideoRef.current.srcObject = null;
      remoteVideoRef.current.volume = 0;
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

    socket.on("chat-message", (data) => {
      // Add to chat
      dispatch({ type: "ADD_MESSAGE", payload: data });

      // Show toast for messages from others
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
    
    // user-left
    socket.on("user-left", ({ socketId }) => {
      pendingIncomingCall.current = null;
      remoteSocketIdRef.current = null;
      console.log("🚪 User left:", socketId);

      // Stop and reset remote video
      if (remoteVideoRef.current && remoteVideoRef.current.srcObject) {
        remoteVideoRef.current.srcObject.getTracks().forEach((t) => t.stop());
        remoteVideoRef.current.srcObject = null;
        remoteVideoRef.current.volume = 0;
      }

      // Reset remote stream reference
      remoteStreamRef.current = null;

      // Show toast for call duration when remote user leaves
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

      // Reset remote-related state
      dispatch({ type: "SET_REMOTE_NAME", payload: null });
      dispatch({ type: "SET_REMOTE_EMAIL", payload: null });
      dispatch({ type: "SET_REMOTE_CAMERA", payload: false });
      dispatch({ type: "SET_REMOTEVIDEOREADY", payload: false });

      // End the call
      dispatch({ type: "END_CALL" });
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
  }, [socket, handleNewUserJoined, handleIncomingCall, handleCallAccepted, state.isCallActive]);

  // ------------------ Camera, Mic, Handfree ------------------

  // ------------------ toggleCamera ------------------
  const toggleCamera = async () => {
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

  //   ----------------- ToggleCamera ---------------------
  useEffect(() => {
    if (!socket) return;

    const handleCameraToggle = ({ cameraOn }) => {
      console.log("Remote Camera on:", cameraOn);
      dispatch({ type: "SET_REMOTE_CAMERA", payload: cameraOn });
    };

    socket.on("camera-toggle", handleCameraToggle);

    return () => socket.off("camera-toggle", handleCameraToggle);
  }, [socket]);

  // --------------- toggleMic ----------------------
  const toggleMic = async () => {
    if (!state.myStream) return;
    
    const newMicState = !state.micOn;
    const audioTracks = state.myStream.getAudioTracks();
    
    // Disable/enable all audio tracks
    audioTracks.forEach((t) => {
      t.enabled = newMicState;
    });
    
    dispatch({ type: "TOGGLE_MIC" });
    
    if (newMicState) {
      toast("Microphone ON - Speak clearly", {
        icon: "🎤",
        duration: 2000,
      });
    } else {
      toast("Microphone OFF", {
        icon: "🔇",
        duration: 1000,
      });
    }
  };

  // ---------------- toggleHandFree -----------------------
  const toggleHandfree = async () => {
    if (!remoteVideoRef.current || !state.myStream) return;

    const newHandfreeState = !state.usingHandfree;
    
    try {
      if (newHandfreeState && state.handfreeDeviceId) {
        // Switching to speakers - IMPORTANT: Reduce volume to prevent echo
        await remoteVideoRef.current.setSinkId(state.handfreeDeviceId);
        remoteVideoRef.current.volume = 0.5; // Even lower volume for speakers
        dispatch({ type: "TOGGLE_HANDFREE" });
        
        toast("⚠️ Speaker Mode - Keep microphone away from speakers", { 
          icon: "🔊",
          duration: 4000,
          style: {
            background: "#f59e0b",
            color: "white"
          }
        });
        
        // Also show important tip
        setTimeout(() => {
          toast("💡 Tip: Use headphones for best audio quality and no echo", {
            duration: 5000,
            icon: "🎧"
          });
        }, 1000);
      } else {
        // Switching to headphones (default) - safer for echo
        await remoteVideoRef.current.setSinkId("");
        remoteVideoRef.current.volume = 1.0;
        dispatch({ type: "TOGGLE_HANDFREE" });
        toast("Headphone Mode (Recommended)", { 
          icon: "🎧",
          duration: 3000 
        });
      }
    } catch (err) {
      console.error("Failed to switch audio output:", err);
      toast.error("Failed to switch audio mode");
    }
  };

  // ------------------ Enhanced Audio Controls ------------------

  // Toggle echo cancellation
  const toggleEchoCancellation = async () => {
    if (!state.myStream) return;
    
    const newEchoState = !state.echoCancellationEnabled;
    const audioTracks = state.myStream.getAudioTracks();
    
    for (const track of audioTracks) {
      try {
        await track.applyConstraints({
          echoCancellation: newEchoState,
          // Keep other settings consistent
          noiseSuppression: state.noiseSuppressionEnabled,
          autoGainControl: true,
          channelCount: 1
        });
      } catch (err) {
        console.warn("Could not toggle echo cancellation:", err);
      }
    }
    
    dispatch({ type: "TOGGLE_ECHO_CANCELLATION" });
    
    if (newEchoState) {
      toast("✅ Echo cancellation enabled", {
        icon: "✅",
        duration: 2000
      });
    } else {
      toast("❌ Echo cancellation disabled (may cause echo)", {
        icon: "⚠️",
        duration: 3000
      });
    }
  };

  // Toggle noise suppression
  const toggleNoiseSuppression = async () => {
    if (!state.myStream) return;
    
    const newNoiseState = !state.noiseSuppressionEnabled;
    const audioTracks = state.myStream.getAudioTracks();
    
    for (const track of audioTracks) {
      try {
        await track.applyConstraints({
          noiseSuppression: newNoiseState,
          echoCancellation: state.echoCancellationEnabled,
          autoGainControl: true,
          channelCount: 1
        });
      } catch (err) {
        console.warn("Could not toggle noise suppression:", err);
      }
    }
    
    dispatch({ type: "TOGGLE_NOISE_SUPPRESSION" });
    toast(newNoiseState ? "Noise suppression ON" : "Noise suppression OFF", {
      icon: newNoiseState ? "🔇" : "🔊"
    });
  };

  // NEW: Toggle Mono Audio (helps reduce echo)
  const toggleMonoAudio = async () => {
    if (!state.myStream) return;
    
    const newMonoState = !state.forceMonoAudio;
    const audioTracks = state.myStream.getAudioTracks();
    
    for (const track of audioTracks) {
      try {
        await track.applyConstraints({
          channelCount: newMonoState ? 1 : 2, // 1 for mono, 2 for stereo
          echoCancellation: state.echoCancellationEnabled,
          noiseSuppression: state.noiseSuppressionEnabled
        });
      } catch (err) {
        console.warn("Could not toggle mono audio:", err);
      }
    }
    
    dispatch({ type: "TOGGLE_MONO_AUDIO" });
    toast(newMonoState ? "Mono audio ON (better for calls)" : "Stereo audio ON", {
      icon: newMonoState ? "🎙️" : "🎛️"
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
        
        // Find and store a good speaker device
        if (audioOutputDevices.length > 0) {
          // Prefer built-in speakers
          const builtInSpeaker = audioOutputDevices.find(d => 
            d.label.toLowerCase().includes('built') || 
            d.label.toLowerCase().includes('internal') ||
            d.label.toLowerCase().includes('default') ||
            d.label === ''
          );
          
          const speakerDevice = builtInSpeaker || audioOutputDevices[0];
          dispatch({ type: "SET_HANDFREE_DEVICE", payload: speakerDevice.deviceId });
          console.log("🔊 Selected speaker device:", speakerDevice.label);
        }
      } catch (err) {
        console.error("Failed to enumerate devices:", err);
      }
    };

    detectAudioDevices();
    
    // Listen for device changes
    navigator.mediaDevices.addEventListener('devicechange', detectAudioDevices);
    
    return () => {
      navigator.mediaDevices.removeEventListener('devicechange', detectAudioDevices);
    };
  }, []);

  // ------------------ Select Audio Device ------------------
  const selectAudioDevice = async (deviceId) => {
    try {
      // Get current video stream
      const videoTrack = state.myStream?.getVideoTracks()[0];
      const videoConstraints = videoTrack ? {
        deviceId: { exact: videoTrack.getSettings().deviceId },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      } : false;
      
      // Get stream with new audio device
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { 
          deviceId: { exact: deviceId },
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1
        },
        video: videoConstraints
      });
      
      // Configure the new stream
      const configuredStream = await configureAudioStream(stream);
      
      // Replace the old stream
      dispatch({ type: "SET_MY_STREAM", payload: configuredStream });
      dispatch({ type: "SELECT_AUDIO_DEVICE", payload: deviceId });
      
      // Update peer connection with new stream
      if (sendStream) {
        await sendStream(configuredStream);
      }
      
      toast.success("Microphone changed");
    } catch (err) {
      console.error("Failed to switch audio device:", err);
      toast.error("Failed to change microphone");
    }
  };

  //  ----------------- Chat Handle ---------------------
  const handleChat = () => {
    dispatch({ type: "SET_CHATCLOSE", payload: !state.chatClose });
  };

  //  ----------------- handle Swipped---------------------
  const handleSwipped = () => {
    dispatch({ type: "SET_IsSWAPPED", payload: !state.isSwapped });
  };

  //  ----------------- handleRemoteVideoRead ---------------------
  const handleRemoteVideoReady = () => {
    dispatch({ type: "SET_REMOTEVIDEOREADY", payload: true });

    // Start call timer if not already started
    if (!state.isCallActive) {
      dispatch({ type: "START_CALL" });
    }
    
    console.log("✅ Remote video ready, call started");
  };

  // ------------------ Chat ------------------
  const sendMessage = () => {
    if (!state.messageText.trim()) return;

    // Send message to other users in the room via socket
    socket.emit("chat-message", { roomId, from: socket.id, text: state.messageText });

    // Add message to local chat list (sender side)
    dispatch({
      type: "ADD_MESSAGE",
      payload: {
        from: socket.id,
        text: state.messageText,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      },
    });

    // Clear input box after sending
    dispatch({ type: "SET_MESSAGE_TEXT", payload: "" });
  };

  // ------------------ Chat Message Listener ------------------
 
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

  // Debug function for audio issues
  const debugAudio = () => {
    console.log("🔊 AUDIO DEBUG INFO:");
    console.log("My Stream:", state.myStream);
    console.log("Audio Tracks:", state.myStream?.getAudioTracks());
    
    if (state.myStream) {
      const audioTracks = state.myStream.getAudioTracks();
      audioTracks.forEach((track, i) => {
        console.log(`Track ${i}:`, {
          enabled: track.enabled,
          settings: track.getSettings(),
          constraints: track.getConstraints(),
          label: track.label
        });
      });
    }
    
    console.log("Remote Stream:", remoteStreamRef.current);
    console.log("Remote Video Volume:", remoteVideoRef.current?.volume);
    console.log("Using Handfree:", state.usingHandfree);
    console.log("Echo Cancellation:", state.echoCancellationEnabled);
    console.log("Noise Suppression:", state.noiseSuppressionEnabled);
    console.log("Mono Audio:", state.forceMonoAudio);
  };

  // UI/UX Design - CORRECTED FOR CAMERA MIRRORING
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

        {/* MY VIDEO - FIXED MIRRORING ISSUE */}
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
            // FIX: Apply horizontal flip only to front camera
            className={`w-full h-full rounded-md object-cover shadow-2xl bg-[#0d1321] ${
              state.cameraOn ? "block" : "hidden"
            } ${cameraFacingMode === 'user' ? 'transform -scale-x-100' : ''}`}
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

        {/* Enhanced Audio Controls */}
        <div
          onClick={toggleEchoCancellation}
          className={`p-3 rounded-full ${state.echoCancellationEnabled ? 'bg-green-700' : 'bg-[#364355]'} hover:bg-[#2e4361] cursor-pointer`}
          title="Toggle Echo Cancellation"
        >
          <Ear className="w-5 h-5" />
        </div>

        <div
          onClick={toggleNoiseSuppression}
          className={`p-3 rounded-full ${state.noiseSuppressionEnabled ? 'bg-green-700' : 'bg-[#364355]'} hover:bg-[#2e4361] cursor-pointer`}
          title="Toggle Noise Suppression"
        >
          <Mic className="w-5 h-5" />
        </div>

        {/* NEW: Mono Audio Toggle */}
        <div
          onClick={toggleMonoAudio}
          className={`p-3 rounded-full ${state.forceMonoAudio ? 'bg-blue-700' : 'bg-[#364355]'} hover:bg-[#2e4361] cursor-pointer`}
          title="Toggle Mono/Stereo Audio"
        >
          <span className="text-xs font-bold">Mono</span>
        </div>

        <div
          onClick={handleChat}
          className={`relative p-3 rounded-full bg-[#364355] hover:bg-[#2e4361] cursor-pointer ${state.chatClose ? "bg-gray-900" : ""} `}
          title="Toggle Chat"
        >
          {state.chatClose ? <MessageSquareText /> : <MessageSquareOff />}
        </div>

        <div
          onClick={copyMeetingLink}
          className={`p-3 rounded-full bg-[#009776] hover:bg-[#048166] cursor-pointer`}
          title="Share Meeting Link"
        >
          <Share2 className="w-5 h-5" />
        </div>
        
        <div
          onClick={leaveRoom}
          className={`p-3 rounded-full bg-[#ea002e] hover:bg-[#c7082e] cursor-pointer`}
          title="Leave Call"
        >
          <PhoneOff className="w-5 h-5" />
        </div>
      </div>

      {/* Echo Prevention Tips Overlay (appears on first connection) */}
      {state.remoteVideoReady && !localStorage.getItem('echoTipsShown') && (
        <div className="fixed top-20 left-1/2 transform -translate-x-1/2 bg-yellow-900/90 text-white p-4 rounded-lg z-50 max-w-md">
          <div className="flex items-center gap-2 mb-2">
            <CircleAlert className="w-5 h-5" />
            <h3 className="font-bold">Audio Tips for Best Quality:</h3>
          </div>
          <ul className="text-sm space-y-1">
            <li>• Use headphones to prevent echo</li>
            <li>• Keep microphone away from speakers</li>
            <li>• Speak clearly and at normal volume</li>
            <li>• Enable echo cancellation in audio settings</li>
          </ul>
          <button
            onClick={() => localStorage.setItem('echoTipsShown', 'true')}
            className="mt-3 text-xs bg-yellow-700 hover:bg-yellow-600 px-3 py-1 rounded"
          >
            Got it, don't show again
          </button>
        </div>
      )}
    </div>
  );
};

export default RoomPage;
