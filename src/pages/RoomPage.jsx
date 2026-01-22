// Import hooks
import { useEffect, useCallback, useRef, useReducer, useMemo } from "react";

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
  VolumeX,
  Volume1,
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
    audioProcessingActive: true,
    speakerVolume: 0.5,
    microphoneGain: 0.7,
    isEchoTested: false
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
  const audioProcessorRef = useRef(null);
  const localAudioStreamRef = useRef(null);
  const analyserRef = useRef(null);
  const echoTestInterval = useRef(null);
  const audioTrackRef = useRef(null);

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

  // ------------------ Audio Quality Functions ------------------
  const applyAudioConstraints = useCallback(async (track, options = {}) => {
    try {
      const constraints = {
        echoCancellation: options.echoCancellation ?? true,
        noiseSuppression: options.noiseSuppression ?? true,
        autoGainControl: options.autoGainControl ?? false, // Manual control is better
        channelCount: 1, // Mono reduces echo
        sampleRate: 16000,
        ...options
      };
      
      await track.applyConstraints(constraints);
      console.log("✅ Audio constraints applied:", constraints);
      return true;
    } catch (err) {
      console.warn("Could not apply audio constraints:", err);
      return false;
    }
  }, []);

  const createAudioProcessor = useCallback(async (audioTrack) => {
    try {
      // Close previous audio context if exists
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close();
      }

      const audioContext = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: 16000,
        latencyHint: 'interactive'
      });
      audioContextRef.current = audioContext;

      const source = audioContext.createMediaStreamSource(new MediaStream([audioTrack]));
      
      // Create analyser for monitoring
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.8;
      analyserRef.current = analyser;
      source.connect(analyser);
      
      // Advanced audio processing chain
      const highPassFilter = audioContext.createBiquadFilter();
      highPassFilter.type = 'highpass';
      highPassFilter.frequency.value = 80; // Remove low frequency rumble
      
      const lowPassFilter = audioContext.createBiquadFilter();
      lowPassFilter.type = 'lowpass';
      lowPassFilter.frequency.value = 7000; // Remove high frequency noise
      
      const compressor = audioContext.createDynamicsCompressor();
      compressor.threshold.value = -50;
      compressor.knee.value = 40;
      compressor.ratio.value = 10;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.25;
      
      const noiseGate = audioContext.createScriptProcessor(2048, 1, 1);
      noiseGate.onaudioprocess = (event) => {
        const input = event.inputBuffer.getChannelData(0);
        const output = event.outputBuffer.getChannelData(0);
        
        // Calculate RMS volume
        let sum = 0;
        for (let i = 0; i < input.length; i++) {
          sum += input[i] * input[i];
        }
        const rms = Math.sqrt(sum / input.length);
        
        // Adaptive threshold based on state
        const threshold = state.usingHandfree ? 0.02 : 0.01;
        const closeThreshold = threshold * 0.4; // Hysteresis for smooth transitions
        
        if (rms < closeThreshold) {
          // Complete silence for noise gate
          for (let i = 0; i < output.length; i++) {
            output[i] = 0;
          }
        } else if (rms > threshold) {
          // Audio detected - apply processing
          const gain = state.usingHandfree ? 0.6 : 0.8; // Lower gain in speaker mode
          for (let i = 0; i < output.length; i++) {
            output[i] = input[i] * gain;
          }
        } else {
          // Fade zone - smooth transition
          const fade = (rms - closeThreshold) / (threshold - closeThreshold);
          for (let i = 0; i < output.length; i++) {
            output[i] = input[i] * fade * 0.5;
          }
        }
      };

      const destination = audioContext.createMediaStreamDestination();
      
      // Connect processing chain
      source.connect(highPassFilter);
      highPassFilter.connect(lowPassFilter);
      lowPassFilter.connect(compressor);
      compressor.connect(noiseGate);
      noiseGate.connect(destination);
      
      audioProcessorRef.current = noiseGate;
      localAudioStreamRef.current = destination.stream;
      
      return destination.stream;
      
    } catch (error) {
      console.warn("Audio processing setup failed:", error);
      return null;
    }
  }, [state.usingHandfree]);

  // ------------------ Echo Test Function ------------------
  const runEchoTest = useCallback(async () => {
    if (!state.myStream || state.isEchoTested) return;
    
    try {
      console.log("🔊 Running echo cancellation test...");
      
      const audioTrack = state.myStream.getAudioTracks()[0];
      if (!audioTrack) return;
      
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const source = audioContext.createMediaStreamSource(new MediaStream([audioTrack]));
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 1024;
      
      source.connect(analyser);
      
      // Play test tone through speakers
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      gainNode.gain.value = 0.1; // Low volume test
      
      oscillator.frequency.value = 1000;
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      oscillator.start();
      
      // Measure after tone
      setTimeout(() => {
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(dataArray);
        
        let echoLevel = 0;
        for (let i = 0; i < dataArray.length; i++) {
          if (dataArray[i] > 50) echoLevel++;
        }
        
        console.log("🔊 Echo test result:", echoLevel);
        
        if (echoLevel > 10) {
          console.warn("⚠️ Echo detected - adjusting settings");
          
          // Apply stronger echo cancellation
          audioTrack.applyConstraints({
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: false,
            channelCount: 1
          }).catch(console.warn);
        }
        
        oscillator.stop();
        audioContext.close();
        dispatch({ type: "SET_ECHO_TESTED", payload: true });
        
      }, 1000);
      
    } catch (error) {
      console.warn("Echo test failed:", error);
    }
  }, [state.myStream, state.isEchoTested]);

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

  // ------------------ Local Media Setup ------------------
  const getUserMediaStream = useCallback(async () => {
    try {
      console.log("🎥 Requesting camera and microphone access...");
      
      // Get available devices first
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices.filter(d => d.kind === 'audioinput');
      
      // Try to find a device with good echo cancellation
      let selectedDevice = null;
      const preferredDevices = ['Jabra', 'Logitech', 'Poly', 'Plantronics', 'Sennheiser'];
      
      for (const device of audioInputs) {
        if (preferredDevices.some(name => device.label.includes(name))) {
          selectedDevice = device.deviceId;
          break;
        }
      }
      
      // Enhanced audio constraints
      const constraints = {
        video: { 
          width: { ideal: 1280 }, 
          height: { ideal: 720 }, 
          frameRate: { ideal: 30 },
          facingMode: "user"
        },
        audio: {
          // Core constraints
          echoCancellation: { ideal: true, exact: true },
          noiseSuppression: { ideal: true, exact: true },
          autoGainControl: { ideal: false }, // We'll control manually
          
          // Audio quality
          channelCount: 1,
          sampleRate: 16000,
          sampleSize: 16,
          latency: 0.01,
          
          // Device selection
          ...(selectedDevice && { deviceId: { exact: selectedDevice } }),
          
          // Browser-specific optimizations
          ...(navigator.userAgent.includes('Chrome') && {
            googEchoCancellation: true,
            googNoiseSuppression: true,
            googAutoGainControl: false,
            googHighpassFilter: true,
            googAudioMirroring: false, // CRITICAL: Prevent audio mirroring
          }),
          
          ...(navigator.userAgent.includes('Firefox') && {
            mozNoiseSuppression: true,
            mozEchoCancellation: true,
            mozAutoGainControl: false
          })
        }
      };

      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (err) {
        console.log("First attempt failed, trying fallback...");
        // Fallback to simpler constraints
        constraints.audio = {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: false,
          channelCount: 1
        };
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      }

      // Store the original audio track reference
      const audioTrack = stream.getAudioTracks()[0];
      audioTrackRef.current = audioTrack;
      
      // Verify settings
      const settings = audioTrack.getSettings();
      console.log("🔊 Audio Settings Applied:", {
        echoCancellation: settings.echoCancellation,
        noiseSuppression: settings.noiseSuppression,
        channelCount: settings.channelCount,
        deviceId: settings.deviceId?.substring(0, 20)
      });

      // Apply audio processing
      const processedAudioStream = await createAudioProcessor(audioTrack);
      let finalStream = stream;
      
      if (processedAudioStream) {
        finalStream = new MediaStream([
          ...stream.getVideoTracks(),
          ...processedAudioStream.getAudioTracks()
        ]);
      }

      dispatch({ type: "SET_MY_STREAM", payload: finalStream });
      
      if (myVideoRef.current) {
        myVideoRef.current.srcObject = finalStream;
        console.log("✅ Local video stream attached");
      }
      
      // Send stream to peer
      await sendStream(finalStream);
      dispatch({ type: "SET_STREAM_READY", payload: true });
      console.log("✅ Stream ready for WebRTC");

      // Run echo test
      setTimeout(() => {
        runEchoTest();
      }, 1000);

      // Handle pending incoming call
      if (pendingIncomingCall.current) {
        console.log("🔄 Processing pending incoming call...");
        handleIncomingCall(pendingIncomingCall.current);
        pendingIncomingCall.current = null;
      }
      
    } catch (err) {
      console.error("❌ Error accessing media devices:", err);
      toast.error("Please allow camera and microphone access");
    }
  }, [sendStream, handleIncomingCall, createAudioProcessor, runEchoTest]);

  // ------------------ Audio Processing Setup ------------------
  useEffect(() => {
    if (!state.myStream || !state.audioProcessingActive) return;

    const setupAudioProcessing = async () => {
      const audioTrack = state.myStream.getAudioTracks()[0];
      if (!audioTrack) return;
      
      await createAudioProcessor(audioTrack);
    };

    setupAudioProcessing();

    return () => {
      // Cleanup
      if (audioProcessorRef.current) {
        audioProcessorRef.current.disconnect();
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close();
      }
      if (echoTestInterval.current) {
        clearInterval(echoTestInterval.current);
      }
    };
  }, [state.myStream, state.audioProcessingActive, createAudioProcessor]);

  // ------------------ Continuous Echo Monitoring ------------------
  useEffect(() => {
    if (!state.myStream || !state.micOn) return;
    
    const monitorAudioQuality = () => {
      if (!analyserRef.current) return;
      
      const analyser = analyserRef.current;
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(dataArray);
      
      // Calculate audio metrics
      let sum = 0;
      let peak = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i];
        if (dataArray[i] > peak) peak = dataArray[i];
      }
      const avg = sum / dataArray.length;
      
      // Detect potential echo (delayed frequency patterns)
      let echoPatterns = 0;
      for (let i = 10; i < dataArray.length; i += 10) {
        if (dataArray[i] > 80 && dataArray[i-10] > 80) {
          echoPatterns++;
        }
      }
      
      // Auto-adjust if echo is detected
      if (echoPatterns > 3 && audioTrackRef.current) {
        console.log("🔄 Auto-adjusting for echo reduction");
        
        const newGain = Math.max(0.3, state.microphoneGain - 0.1);
        dispatch({ type: "SET_MICROPHONE_GAIN", payload: newGain });
        
        audioTrackRef.current.applyConstraints({
          echoCancellation: true,
          gain: newGain
        }).catch(console.warn);
      }
    };
    
    echoTestInterval.current = setInterval(monitorAudioQuality, 3000);
    
    return () => {
      if (echoTestInterval.current) {
        clearInterval(echoTestInterval.current);
      }
    };
  }, [state.myStream, state.micOn, state.microphoneGain]);

  // Initial call to getUserMediaStream
  useEffect(() => {
    getUserMediaStream();
  }, [getUserMediaStream]);

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

  // Retry connection if remote video not received
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

  // Start call timer
  useEffect(() => {
    if (state.remoteVideoReady && !state.isCallActive) {
      dispatch({ type: "START_CALL" });
      console.log("⏱️ Call timer started");
    }
  }, [state.remoteVideoReady, state.isCallActive]);

  // Attach streams to video elements
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

  // ------------------ Meeting Link ------------------
  const copyMeetingLink = async () => {
    const link = `${window.location.origin}/room/${roomId}`;
    const message = `📹 Join my video meeting on MeetNow\n\n🔑 Room ID: ${roomId}\n🔗 Link: ${link}`;

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

    // Stop all tracks
    if (state.myStream) {
      state.myStream.getTracks().forEach((track) => track.stop());
      console.log("🛑 Local media tracks stopped");
    }

    // Cleanup audio
    if (audioProcessorRef.current) {
      audioProcessorRef.current.disconnect();
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close();
    }

    // Reset videos
    if (remoteVideoRef.current && remoteVideoRef.current.srcObject) {
      remoteVideoRef.current.srcObject.getTracks().forEach((t) => t.stop());
      remoteVideoRef.current.srcObject = null;
    }
    if (myVideoRef.current) {
      myVideoRef.current.srcObject = null;
    }

    // Close peer
    if (peer) {
      peer.close();
      console.log("🛑 Peer connection closed");
    }

    // Reset state
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

  // ------------------ Media Controls ------------------

  // Toggle Camera
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

  // Toggle Mic
  const toggleMic = async () => {
    if (!state.myStream) return;
    
    const newMicState = !state.micOn;
    const audioTracks = state.myStream.getAudioTracks();
    
    for (const track of audioTracks) {
      track.enabled = newMicState;
      
      if (newMicState) {
        await applyAudioConstraints(track, {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: false
        });
      }
    }
    
    dispatch({ type: "TOGGLE_MIC" });
    
    toast(newMicState ? "Mic ON - Echo cancellation active" : "Mic OFF", {
      icon: newMicState ? "🎤" : "🔇",
      duration: 2000
    });
  };

  // Toggle Handfree/Speaker Mode
  const toggleHandfree = async () => {
    if (!remoteVideoRef.current) return;
    
    const newHandfreeState = !state.usingHandfree;
    
    try {
      if (newHandfreeState && state.handfreeDeviceId) {
        // Switch to speaker mode
        await remoteVideoRef.current.setSinkId(state.handfreeDeviceId);
        
        // Adjust audio settings for speaker mode
        const audioTracks = state.myStream?.getAudioTracks();
        if (audioTracks?.length > 0) {
          await applyAudioConstraints(audioTracks[0], {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: false,
            gain: 0.6 // Lower gain in speaker mode
          });
        }
        
        toast("Speaker Mode ON - Enhanced echo cancellation", { 
          icon: "🔊",
          duration: 3000 
        });
      } else {
        // Switch to headphone/normal mode
        await remoteVideoRef.current.setSinkId("");
        
        // Restore normal audio settings
        const audioTracks = state.myStream?.getAudioTracks();
        if (audioTracks?.length > 0) {
          await applyAudioConstraints(audioTracks[0], {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: false,
            gain: 0.8
          });
        }
        
        toast("Headphone Mode ON", { 
          icon: "🎧",
          duration: 2000 
        });
      }
      
      dispatch({ type: "TOGGLE_HANDFREE" });
      
    } catch (err) {
      console.error("Failed to toggle handfree mode:", err);
      toast.error("Failed to switch audio mode");
    }
  };

  // Adjust Speaker Volume
  const adjustSpeakerVolume = (volume) => {
    if (remoteVideoRef.current) {
      remoteVideoRef.current.volume = volume;
      dispatch({ type: "SET_SPEAKER_VOLUME", payload: volume });
    }
  };

  // Adjust Microphone Gain
  const adjustMicrophoneGain = async (gain) => {
    if (!state.myStream) return;
    
    const audioTracks = state.myStream.getAudioTracks();
    if (audioTracks.length > 0) {
      try {
        await audioTracks[0].applyConstraints({
          echoCancellation: true,
          gain: gain
        });
        dispatch({ type: "SET_MICROPHONE_GAIN", payload: gain });
        toast.success(`Microphone gain set to ${Math.round(gain * 100)}%`);
      } catch (err) {
        console.warn("Could not adjust microphone gain:", err);
      }
    }
  };

  // Remote Camera Toggle Listener
  useEffect(() => {
    if (!socket) return;

    const handleCameraToggle = ({ cameraOn }) => {
      console.log("Remote Camera on:", cameraOn);
      dispatch({ type: "SET_REMOTE_CAMERA", payload: cameraOn });
    };

    socket.on("camera-toggle", handleCameraToggle);

    return () => socket.off("camera-toggle", handleCameraToggle);
  }, [socket]);

  // ------------------ Enhanced Audio Controls ------------------

  const toggleEchoCancellation = async () => {
    if (!state.myStream) return;
    
    const newEchoState = !state.echoCancellationEnabled;
    const audioTracks = state.myStream.getAudioTracks();
    
    for (const track of audioTracks) {
      try {
        await track.applyConstraints({
          echoCancellation: newEchoState,
          noiseSuppression: true,
          autoGainControl: false
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

  const toggleNoiseSuppression = async () => {
    if (!state.myStream) return;
    
    const newNoiseState = !state.noiseSuppressionEnabled;
    const audioTracks = state.myStream.getAudioTracks();
    
    for (const track of audioTracks) {
      try {
        await track.applyConstraints({
          echoCancellation: true,
          noiseSuppression: newNoiseState,
          autoGainControl: false
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

  const toggleAudioProcessing = () => {
    const newAudioProcessingState = !state.audioProcessingActive;
    dispatch({ type: "SET_AUDIO_PROCESSING_ACTIVE", payload: newAudioProcessingState });
    
    toast(newAudioProcessingState ? "Audio Processing ON" : "Audio Processing OFF", {
      icon: newAudioProcessingState ? "🎚️" : "🔇"
    });
  };

  // ------------------ Audio Devices ------------------
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

  const selectAudioDevice = async (deviceId) => {
    try {
      const videoTrack = state.myStream?.getVideoTracks()[0];
      const videoConstraints = videoTrack ? videoTrack.getSettings() : true;
      
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { 
          deviceId: { exact: deviceId },
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: false,
          channelCount: 1
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

  // ------------------ Chat ------------------
  const handleChat = () => {
    dispatch({ type: "SET_CHATCLOSE", payload: !state.chatClose });
  };

  const handleSwipped = () => {
    dispatch({ type: "SET_IsSWAPPED", payload: !state.isSwapped });
  };

  const handleRemoteVideoReady = () => {
    dispatch({ type: "SET_REMOTEVIDEOREADY", payload: true });

    if (!state.isCallActive) {
      dispatch({ type: "START_CALL" });
    }
    
    console.log("✅ Remote video ready, call started");
  };

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

  // Chat Message Listener
  useEffect(() => {
    if (!socket) return;

    const handleChatMessage = (data) => {
      if (data.from !== socket.id && !state.remoteName && data.senderName) {
        dispatch({ type: "SET_REMOTE_NAME", payload: data.senderName });
      }
      dispatch({ type: "ADD_MESSAGE", payload: data });

      if (data.from !== socket.id) {
        toast.custom(
          (t) => (
            <div className="fixed top-4 right-4 bg-green-800 shadow-xl text-white p-4 rounded-xl flex items-center gap-3 z-50 max-w-xs">
              <MessageSquareText className="w-5 h-5" />
              <div>
                <div className="font-semibold">{data.senderName || "Guest"}</div>
                <div className="text-sm">{data.text}</div>
              </div>
            </div>
          ),
          { duration: 3000 },
        );
      }
    };

    socket.on("chat-message", handleChatMessage);
    return () => socket.off("chat-message", handleChatMessage);
  }, [socket, state.remoteName]);

  // Process pending calls
  useEffect(() => {
    if (pendingIncomingCall.current && state.streamReady) {
      console.log("🔄 Processing pending call now that stream is ready");
      handleIncomingCall(pendingIncomingCall.current);
      pendingIncomingCall.current = null;
    }
  }, [state.streamReady, handleIncomingCall]);

  // Load user name
  useEffect(() => {
    const savedData = localStorage.getItem("userData");
    if (savedData) {
      const { name: savedName } = JSON.parse(savedData);
      dispatch({ type: "SET_MY_NAME", payload: savedName });
      console.log("👤 User name loaded:", savedName);
    }
  }, []);

  return (
    <div className="min-h-screen text-white flex bg-gradient-to-br from-gray-900 via-black to-blue-900">
      {/* Header */}
      <header className="fixed h-18 sm:h-16 flex items-center justify-between bg-[#000000] text-white shadow-2xl w-full p-2 sm:px-4">
        <div className="sm:flex items-center sm:space-x-4">
          {!remoteStreamRef.current || !state.remoteVideoReady ? (
            <span className="flex items-center font-sans font-semibold text-lg rounded-full">
              <Circle className="bg-[#ff403f] text-[#ff403f] w-3.5 h-3.5 rounded-full mr-1" /> Disconnected
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
              Waiting for participants... {state.remoteCameraOn}
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
            className={`w-full h-full rounded-md object-cover shadow-2xl bg-[#0d1321] ${state.cameraOn ? "block" : "hidden"} `}
          />

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

      {/* Audio Controls Panel (Collapsible) */}
      {state.showAudioControls && (
        <div className="fixed bottom-32 left-4 bg-gray-900/90 backdrop-blur-lg p-4 rounded-xl shadow-2xl z-40 w-64">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-semibold">Audio Settings</h3>
            <button 
              onClick={() => dispatch({ type: "TOGGLE_AUDIO_CONTROLS" })}
              className="p-1 hover:bg-gray-800 rounded"
            >
              <X size={16} />
            </button>
          </div>
          
          <div className="space-y-4">
            <div>
              <label className="text-sm opacity-75 mb-1 block">Speaker Volume</label>
              <div className="flex items-center gap-2">
              <VolumeX size={16} />
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={state.speakerVolume}
                onChange={(e) => adjustSpeakerVolume(parseFloat(e.target.value))}
                className="flex-1"
              />
              <Volume2 size={16} />
              </div>
              <div className="text-xs text-right mt-1">{Math.round(state.speakerVolume * 100)}%</div>
            </div>
            
            <div>
              <label className="text-sm opacity-75 mb-1 block">Microphone Gain</label>
              <div className="flex items-center gap-2">
              <Volume1 size={16} />
              <input
                type="range"
                min="0.1"
                max="1"
                step="0.1"
                value={state.microphoneGain}
                onChange={(e) => adjustMicrophoneGain(parseFloat(e.target.value))}
                className="flex-1"
              />
              <Volume2 size={16} />
              </div>
              <div className="text-xs text-right mt-1">{Math.round(state.microphoneGain * 100)}%</div>
            </div>
          </div>
        </div>
      )}

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

        <div
          onClick={() => dispatch({ type: "TOGGLE_AUDIO_CONTROLS" })}
          className="p-3 rounded-full bg-[#364355] hover:bg-[#2e4361] cursor-pointer"
          title="Audio Settings"
        >
          <Volume1 />
        </div>

        <div
          onClick={toggleEchoCancellation}
          className={`p-3 rounded-full ${state.echoCancellationEnabled ? 'bg-green-700' : 'bg-[#364355]'} hover:bg-[#2e4361] cursor-pointer`}
          title="Toggle Echo Cancellation"
        >
          <Ear className="w-5 h-5" />
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

      {/* Audio Device Selection */}
      {state.audioDevices.length > 0 && (
        <div className="fixed bottom-28 right-4 bg-gray-800 p-2 rounded-lg shadow-lg z-50">
          <select
            onChange={(e) => selectAudioDevice(e.target.value)}
            value={state.selectedAudioDevice || ''}
            className="bg-gray-700 text-white p-2 rounded text-sm"
          >
            <option value="">Select Audio Device</option>
            {state.audioDevices.map((device) => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label || `Microphone ${device.deviceId.slice(0, 8)}`}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Tips for better audio quality */}
      {state.usingHandfree && (
        <div className="fixed top-20 left-1/2 transform -translate-x-1/2 bg-blue-900/90 text-white p-3 rounded-lg shadow-lg z-50 max-w-sm backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <CircleAlert className="w-5 h-5" />
            <span className="font-semibold">Speaker Mode Tips:</span>
          </div>
          <ul className="mt-2 text-sm space-y-1">
            <li>• Keep microphone away from speakers</li>
            <li>• Reduce volume if you hear echo</li>
            <li>• Use headphones for best quality</li>
          </ul>
        </div>
      )}
    </div>
  );
};

export default RoomPage;

// Update your roomReducer to include new actions
export const initialState = {
  myStream: null,
  remoteStream: null,
  cameraOn: true,
  remoteCameraOn: true,
  isSwapped: false,
  unreadMessages: 0,
  remoteVideoReady: false,
  micOn: true,
  streamReady: false,
  hasJoinedRoom: false,
  remoteEmail: "",
  remoteName: "",
  myName: "",
  messages: [],
  messageText: "",
  screenSharing: false,
  handfreeDeviceId: null,
  usingHandfree: false,
  chatClose: false,
  callStartTime: null,
  callDuration: { hours: 0, minutes: 0, seconds: 0 },
  isCallActive: false,
  echoCancellationEnabled: true,
  noiseSuppressionEnabled: true,
  audioDevices: [],
  selectedAudioDevice: null,
  audioProcessingActive: true,
  speakerVolume: 0.5,
  microphoneGain: 0.7,
  isEchoTested: false,
  showAudioControls: false,
};

export function roomReducer(state, action) {
  switch (action.type) {
    case "SET_MY_STREAM":
      return { ...state, myStream: action.payload };
    case "SET_REMOTE_STREAM":
      return { ...state, remoteStream: action.payload };
    case "TOGGLE_CAMERA":
      return { ...state, cameraOn: !state.cameraOn };
    case "SET_REMOTE_CAMERA":
      return { ...state, remoteCameraOn: action.payload };
    case "TOGGLE_MIC":
      return { ...state, micOn: !state.micOn };
    case "SET_STREAM_READY":
      return { ...state, streamReady: action.payload };
    case "SET_HAS_JOINED_ROOM":
      return { ...state, hasJoinedRoom: action.payload };
    case "SET_REMOTE_EMAIL":
      return { ...state, remoteEmail: action.payload };
    case "SET_MY_NAME":
      return { ...state, myName: action.payload };
    case "SET_REMOTE_NAME":
      return { ...state, remoteName: action.payload };
    case "SET_MESSAGES":
      return { ...state, messages: action.payload };
    case "ADD_MESSAGE":
      return { ...state, messages: [...state.messages, action.payload] };
    case "SET_MESSAGE_TEXT":
      return { ...state, messageText: action.payload };
    case "SET_SCREEN_SHARING":
      return { ...state, screenSharing: action.payload };
    case "SET_HANDFREE_DEVICE":
      return { ...state, handfreeDeviceId: action.payload };
    case "TOGGLE_HANDFREE":
      return { ...state, usingHandfree: !state.usingHandfree };
    case "INCREMENT_UNREAD":
      return { ...state, unreadMessages: state.unreadMessages + 1 };
    case "RESET_UNREAD":
      return { ...state, unreadMessages: 0 };
    case "SET_CHATCLOSE":
      return { ...state, chatClose: action.payload };
    case "SET_IsSWAPPED":
      return { ...state, isSwapped: action.payload };
    case "SET_REMOTEVIDEOREADY":
      return { ...state, remoteVideoReady: action.payload };
    case "START_CALL":
      return {
        ...state,
        callStartTime: Date.now(),
        isCallActive: true,
      };
    case "UPDATE_CALL_DURATION":
      return {
        ...state,
        callDuration: action.payload,
      };
    case "END_CALL":
      return {
        ...state,
        callStartTime: null,
        isCallActive: false,
        callDuration: { hours: 0, minutes: 0, seconds: 0 },
      };
    case "TOGGLE_ECHO_CANCELLATION":
      return { ...state, echoCancellationEnabled: !state.echoCancellationEnabled };
    case "TOGGLE_NOISE_SUPPRESSION":
      return { ...state, noiseSuppressionEnabled: !state.noiseSuppressionEnabled };
    case "SET_AUDIO_DEVICES":
      return { ...state, audioDevices: action.payload };
    case "SELECT_AUDIO_DEVICE":
      return { ...state, selectedAudioDevice: action.payload };
    case "SET_AUDIO_PROCESSING_ACTIVE":
      return { ...state, audioProcessingActive: action.payload };
    case "SET_SPEAKER_VOLUME":
      return { ...state, speakerVolume: action.payload };
    case "SET_MICROPHONE_GAIN":
      return { ...state, microphoneGain: action.payload };
    case "SET_ECHO_TESTED":
      return { ...state, isEchoTested: action.payload };
    case "TOGGLE_AUDIO_CONTROLS":
      return { ...state, showAudioControls: !state.showAudioControls };
    default:
      return state;
  }
}
