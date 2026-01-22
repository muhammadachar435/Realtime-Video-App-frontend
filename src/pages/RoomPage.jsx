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
  VolumeX,
  Volume1,
  RefreshCw,
  Wifi,
  WifiOff,
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
    microphoneGain: 0.5,
    isEchoTested: false,
    connectionStatus: "disconnected",
    iceRestartAttempts: 0,
    videoRetryCount: 0,
    isReconnecting: false,
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
  const iceRestartTimeout = useRef(null);
  const videoRetryTimeout = useRef(null);
  const lastIceConnectionState = useRef("new");
  const peerRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const isInitialized = useRef(false);
  const connectionAttempts = useRef(0);

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

  // ------------------ Connection Management ------------------
  const updateConnectionStatus = (status) => {
    dispatch({ type: "SET_CONNECTION_STATUS", payload: status });
  };

  const restartICE = useCallback(async () => {
    if (state.iceRestartAttempts >= 3) {
      console.log("❌ Max ICE restart attempts reached");
      return;
    }

    try {
      dispatch({ type: "INCREMENT_ICE_RESTARTS" });
      dispatch({ type: "SET_RECONNECTING", payload: true });
      
      console.log("🔄 Restarting ICE connection...");
      
      if (peer && peer.iceConnectionState !== "closed") {
        // Create and set new offer
        const offer = await peer.createOffer({ iceRestart: true });
        await peer.setLocalDescription(offer);
        
        // Send new offer to remote peer
        if (socket && remoteSocketIdRef.current) {
          socket.emit("ice-restart", {
            to: remoteSocketIdRef.current,
            offer: offer
          });
        }
        
        toast("Reconnecting...", { icon: "🔄" });
      }
      
      // Reset reconnecting state after 5 seconds
      setTimeout(() => {
        dispatch({ type: "SET_RECONNECTING", payload: false });
      }, 5000);
      
    } catch (err) {
      console.error("❌ Error restarting ICE:", err);
      dispatch({ type: "SET_RECONNECTING", payload: false });
    }
  }, [peer, socket, state.iceRestartAttempts]);

  // ------------------ Video Retry Mechanism ------------------
  const retryVideoConnection = useCallback(() => {
    if (state.videoRetryCount >= 5 || !state.remoteEmail || !state.streamReady) {
      console.log("❌ Max video retry attempts reached");
      return;
    }

    dispatch({ type: "INCREMENT_VIDEO_RETRY" });
    console.log(`🔄 Retrying video connection (attempt ${state.videoRetryCount + 1}/5)...`);

    if (remoteSocketIdRef.current) {
      handleNewUserJoined({
        emailId: state.remoteEmail,
        name: state.remoteName,
        socketId: remoteSocketIdRef.current
      });
    }
  }, [state.videoRetryCount, state.remoteEmail, state.remoteName, state.streamReady, handleNewUserJoined]);

  // ------------------ Audio Quality Functions ------------------
  const applyAudioConstraints = useCallback(async (track, options = {}) => {
    try {
      const constraints = {
        echoCancellation: { exact: true },
        noiseSuppression: { exact: true },
        autoGainControl: { exact: false },
        channelCount: { exact: 1 },
        sampleRate: 16000,
        ...options
      };
      
      await track.applyConstraints(constraints);
      console.log("✅ Audio constraints applied");
      return true;
    } catch (err) {
      console.warn("⚠️ Could not apply audio constraints:", err);
      return false;
    }
  }, []);

  // ------------------ Advanced Echo Cancellation ------------------
  const createAdvancedAudioProcessor = useCallback(async (audioTrack) => {
    try {
      // Close previous audio context
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        await audioContextRef.current.close();
      }

      const audioContext = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: 16000,
        latencyHint: 'interactive'
      });
      audioContextRef.current = audioContext;

      const source = audioContext.createMediaStreamSource(new MediaStream([audioTrack]));
      
      // Create analyser for monitoring
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.8;
      analyserRef.current = analyser;
      
      // Advanced audio processing pipeline
      const highPassFilter = audioContext.createBiquadFilter();
      highPassFilter.type = 'highpass';
      highPassFilter.frequency.value = 100;
      highPassFilter.Q.value = 0.5;
      
      const lowPassFilter = audioContext.createBiquadFilter();
      lowPassFilter.type = 'lowpass';
      lowPassFilter.frequency.value = 6000;
      
      const notchFilter = audioContext.createBiquadFilter();
      notchFilter.type = 'notch';
      notchFilter.frequency.value = 2000; // Common feedback frequency
      notchFilter.Q.value = 10;
      
      const compressor = audioContext.createDynamicsCompressor();
      compressor.threshold.value = -30;
      compressor.knee.value = 20;
      compressor.ratio.value = 6;
      compressor.attack.value = 0.01;
      compressor.release.value = 0.1;
      
      // Adaptive noise gate with echo detection
      const noiseGate = audioContext.createScriptProcessor(4096, 1, 1);
      let echoBuffer = new Float32Array(4096);
      let bufferIndex = 0;
      
      noiseGate.onaudioprocess = (event) => {
        const input = event.inputBuffer.getChannelData(0);
        const output = event.outputBuffer.getChannelData(0);
        
        // Calculate RMS
        let sum = 0;
        for (let i = 0; i < input.length; i++) {
          sum += input[i] * input[i];
          echoBuffer[bufferIndex] = input[i];
          bufferIndex = (bufferIndex + 1) % echoBuffer.length;
        }
        const rms = Math.sqrt(sum / input.length);
        
        // Adaptive threshold based on mode
        let threshold = state.usingHandfree ? 0.008 : 0.005;
        let gain = state.usingHandfree ? 0.5 : 0.7;
        
        // Echo detection (check for delayed similarity)
        let echoScore = 0;
        const delay = 200; // 200ms delay check
        const delaySamples = Math.floor(delay * 16); // 16000Hz sample rate
        
        for (let i = 0; i < 100; i++) {
          const currentIdx = (bufferIndex - i + echoBuffer.length) % echoBuffer.length;
          const delayedIdx = (currentIdx - delaySamples + echoBuffer.length) % echoBuffer.length;
          
          if (Math.abs(echoBuffer[currentIdx] - echoBuffer[delayedIdx]) < 0.01) {
            echoScore++;
          }
        }
        
        // Reduce gain if echo is detected
        if (echoScore > 20) {
          gain *= 0.5; // Halve the gain
          console.log("⚠️ Echo detected, reducing gain");
        }
        
        // Apply noise gate
        if (rms < threshold * 0.3) {
          // Complete silence
          for (let i = 0; i < output.length; i++) {
            output[i] = 0;
          }
        } else if (rms < threshold) {
          // Fade zone
          const fadeFactor = (rms - threshold * 0.3) / (threshold * 0.7);
          for (let i = 0; i < output.length; i++) {
            output[i] = input[i] * fadeFactor * gain * 0.3;
          }
        } else {
          // Normal audio
          for (let i = 0; i < output.length; i++) {
            output[i] = input[i] * gain;
          }
        }
      };

      const destination = audioContext.createMediaStreamDestination();
      
      // Connect processing chain
      source.connect(highPassFilter);
      highPassFilter.connect(lowPassFilter);
      lowPassFilter.connect(notchFilter);
      notchFilter.connect(analyser);
      analyser.connect(compressor);
      compressor.connect(noiseGate);
      noiseGate.connect(destination);
      
      audioProcessorRef.current = noiseGate;
      localAudioStreamRef.current = destination.stream;
      
      console.log("✅ Advanced audio processor created");
      return destination.stream;
      
    } catch (error) {
      console.warn("❌ Audio processing setup failed:", error);
      return null;
    }
  }, [state.usingHandfree]);

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
      console.log("📲 Incoming call from:", from);

      if (!state.streamReady) {
        pendingIncomingCall.current = { from, offer, fromName };
        console.log("⏳ Stream not ready, incoming call pending...");
        return;
      }

      try {
        console.log("📝 Creating answer...");
        const answer = await createAnswer(offer);
        socket.emit("call-accepted", { 
          to: from, 
          ans: answer 
        });
        console.log("✅ Answer sent");
        updateConnectionStatus("connecting");
      } catch (err) {
        console.error("❌ Error creating answer:", err);
        toast.error("Failed to accept call");
      }
    },
    [createAnswer, socket, state.streamReady, setRemoteSocketId],
  );

  // ------------------ New User Joined ------------------
  const handleNewUserJoined = useCallback(
    async ({ emailId, name, socketId }) => {
      console.log("👤 New user joined:", name, "socket:", socketId);
      
      // Reset retry count on new connection attempt
      if (connectionAttempts.current > 0) {
        connectionAttempts.current = 0;
        dispatch({ type: "RESET_VIDEO_RETRY" });
      }

      // Set remote info
      dispatch({ type: "SET_REMOTE_EMAIL", payload: emailId });
      dispatch({ type: "SET_REMOTE_NAME", payload: name });
      
      // Store remote socket ID
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
        connectionAttempts.current++;
        console.log(`📞 Creating offer (attempt ${connectionAttempts.current})...`);
        
        const offer = await createOffer();
        socket.emit("call-user", { 
          emailId, 
          offer,
          socketId: socketId
        });
        
        console.log("✅ Offer sent");
        updateConnectionStatus("connecting");
        
        // Set timeout to retry if no response
        setTimeout(() => {
          if (!remoteStreamRef.current && state.connectionStatus === "connecting") {
            console.log("⏰ No response, retrying...");
            retryVideoConnection();
          }
        }, 3000);
        
      } catch (err) {
        console.error("❌ Error creating offer:", err);
        if (connectionAttempts.current < 3) {
          setTimeout(() => handleNewUserJoined({ emailId, name, socketId }), 1000);
        }
      }
    },
    [createOffer, socket, state.streamReady, setRemoteSocketId, retryVideoConnection, state.connectionStatus],
  );

  // ------------------ Call Accepted ------------------
  const handleCallAccepted = useCallback(
    async ({ ans }) => {
      try {
        console.log("✅ Setting remote answer");
        await setRemoteAns(ans);
        console.log("✅ Remote answer set successfully");
        updateConnectionStatus("connected");
      } catch (err) {
        console.error("❌ Error setting remote answer:", err);
        toast.error("Failed to establish connection");
      }
    },
    [setRemoteAns],
  );

  // ------------------ Local Media Setup ------------------
  const getUserMediaStream = useCallback(async () => {
    try {
      console.log("🎥 Requesting media access...");
      
      // Stop existing stream if any
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(track => track.stop());
      }

      // Simple constraints for maximum compatibility
      const constraints = {
        video: { 
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 24 },
          facingMode: "user"
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: false,
          channelCount: 1
        }
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      mediaStreamRef.current = stream;
      
      // Store audio track reference
      const audioTrack = stream.getAudioTracks()[0];
      audioTrackRef.current = audioTrack;
      
      // Apply constraints
      await applyAudioConstraints(audioTrack);
      
      // Create processed audio stream
      const processedAudioStream = await createAdvancedAudioProcessor(audioTrack);
      let finalStream = stream;
      
      if (processedAudioStream) {
        finalStream = new MediaStream([
          ...stream.getVideoTracks(),
          ...processedAudioStream.getAudioTracks()
        ]);
      }

      dispatch({ type: "SET_MY_STREAM", payload: finalStream });
      
      // Attach to video element
      if (myVideoRef.current) {
        myVideoRef.current.srcObject = finalStream;
        console.log("✅ Local video attached");
      }
      
      // Send to peer
      if (sendStream) {
        await sendStream(finalStream);
      }
      
      dispatch({ type: "SET_STREAM_READY", payload: true });
      console.log("✅ Stream ready");

      // Handle pending call
      if (pendingIncomingCall.current) {
        console.log("🔄 Processing pending call...");
        handleIncomingCall(pendingIncomingCall.current);
        pendingIncomingCall.current = null;
      }
      
    } catch (err) {
      console.error("❌ Error accessing media:", err);
      toast.error("Camera/microphone access required");
    }
  }, [sendStream, handleIncomingCall, applyAudioConstraints, createAdvancedAudioProcessor]);

  // ------------------ Fix Camera Freeze ------------------
  const resetVideoStream = useCallback(async () => {
    try {
      console.log("🔄 Resetting video stream...");
      
      // Stop current video track
      if (mediaStreamRef.current) {
        const videoTracks = mediaStreamRef.current.getVideoTracks();
        videoTracks.forEach(track => track.stop());
      }
      
      // Get new video only
      const videoStream = await navigator.mediaDevices.getUserMedia({
        video: { 
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 24 }
        }
      });
      
      const videoTrack = videoStream.getVideoTracks()[0];
      
      // Replace video track in existing stream
      if (mediaStreamRef.current) {
        const oldVideoTrack = mediaStreamRef.current.getVideoTracks()[0];
        if (oldVideoTrack) {
          mediaStreamRef.current.removeTrack(oldVideoTrack);
        }
        mediaStreamRef.current.addTrack(videoTrack);
        
        // Update state
        dispatch({ type: "SET_MY_STREAM", payload: mediaStreamRef.current });
        
        // Update video element
        if (myVideoRef.current) {
          myVideoRef.current.srcObject = mediaStreamRef.current;
        }
        
        // Send updated stream
        if (sendStream) {
          await sendStream(mediaStreamRef.current);
        }
        
        toast.success("Camera reset");
      }
      
    } catch (err) {
      console.error("❌ Error resetting video:", err);
      toast.error("Failed to reset camera");
    }
  }, [sendStream]);

  // ------------------ Audio Processing Setup ------------------
  useEffect(() => {
    if (!state.myStream || !state.audioProcessingActive) return;

    const setupAudioProcessing = async () => {
      const audioTrack = state.myStream.getAudioTracks()[0];
      if (!audioTrack) return;
      
      await createAdvancedAudioProcessor(audioTrack);
    };

    setupAudioProcessing();

    return () => {
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
  }, [state.myStream, state.audioProcessingActive, createAdvancedAudioProcessor]);

  // ------------------ ICE Connection Monitoring ------------------
  useEffect(() => {
    if (!peer) return;

    const handleICEConnectionChange = () => {
      console.log("❄️ ICE State:", peer.iceConnectionState);
      
      if (peer.iceConnectionState !== lastIceConnectionState.current) {
        lastIceConnectionState.current = peer.iceConnectionState;
        
        switch (peer.iceConnectionState) {
          case "connected":
          case "completed":
            updateConnectionStatus("connected");
            toast.success("Connected!");
            dispatch({ type: "RESET_VIDEO_RETRY" });
            break;
            
          case "disconnected":
            updateConnectionStatus("disconnected");
            toast.warning("Connection lost, reconnecting...");
            restartICE();
            break;
            
          case "failed":
            updateConnectionStatus("failed");
            toast.error("Connection failed");
            restartICE();
            break;
            
          case "checking":
            updateConnectionStatus("connecting");
            break;
        }
      }
    };

    peer.addEventListener("iceconnectionstatechange", handleICEConnectionChange);
    
    return () => {
      peer.removeEventListener("iceconnectionstatechange", handleICEConnectionChange);
    };
  }, [peer, restartICE]);

  // ------------------ Peer Connection Tracking ------------------
  useEffect(() => {
    if (!peer) return;

    const handleTrack = (event) => {
      console.log("📹 Track received:", event.streams.length, "stream(s)");
      
      if (event.streams && event.streams[0]) {
        remoteStreamRef.current = event.streams[0];
        console.log("✅ Remote stream received with tracks:", 
          remoteStreamRef.current.getTracks().map(t => `${t.kind}:${t.id}`));

        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = remoteStreamRef.current;
          
          // Force play with error handling
          const playVideo = () => {
            if (remoteVideoRef.current && remoteVideoRef.current.paused) {
              remoteVideoRef.current.play()
                .then(() => {
                  console.log("▶️ Remote video playing");
                  handleRemoteVideoReady();
                })
                .catch(err => {
                  if (err.name !== "AbortError") {
                    console.error("❌ Error playing remote video:", err);
                    setTimeout(playVideo, 100);
                  }
                });
            }
          };
          
          playVideo();
        }
      }
    };

    const handleConnectionChange = () => {
      console.log("🔗 Connection State:", peer.connectionState);
    };

    peer.addEventListener("track", handleTrack);
    peer.addEventListener("connectionstatechange", handleConnectionChange);
    
    return () => {
      peer.removeEventListener("track", handleTrack);
      peer.removeEventListener("connectionstatechange", handleConnectionChange);
    };
  }, [peer]);

  // ------------------ Remote Video Ready Handler ------------------
  const handleRemoteVideoReady = useCallback(() => {
    console.log("✅ Remote video ready");
    dispatch({ type: "SET_REMOTEVIDEOREADY", payload: true });
    
    if (!state.isCallActive) {
      dispatch({ type: "START_CALL" });
    }
  }, [state.isCallActive]);

  // ------------------ Automatic Retry for Missing Video ------------------
  useEffect(() => {
    if (state.remoteEmail && state.streamReady && !remoteStreamRef.current && state.videoRetryCount < 3) {
      console.log("🔍 No remote stream, scheduling retry...");
      
      videoRetryTimeout.current = setTimeout(() => {
        if (!remoteStreamRef.current && !state.isReconnecting) {
          retryVideoConnection();
        }
      }, 2000);
      
      return () => {
        if (videoRetryTimeout.current) {
          clearTimeout(videoRetryTimeout.current);
        }
      };
    }
  }, [state.remoteEmail, state.streamReady, state.videoRetryCount, state.isReconnecting, retryVideoConnection]);

  // ------------------ ICE Candidates ------------------
  useEffect(() => {
    if (!socket || !peer) return;

    const handleIncomingIceCandidate = ({ candidate, from }) => {
      console.log("📥 Received ICE candidate from:", from);
      if (candidate && peer.remoteDescription) {
        peer.addIceCandidate(new RTCIceCandidate(candidate)).catch(err => {
          console.error("❌ Error adding ICE candidate:", err);
        });
      }
    };

    const handleLocalIceCandidate = (event) => {
      if (event.candidate && remoteSocketIdRef.current && socket) {
        console.log("📤 Sending ICE candidate to:", remoteSocketIdRef.current);
        socket.emit("ice-candidate", {
          to: remoteSocketIdRef.current,
          candidate: event.candidate,
        });
      }
    };

    socket.on("ice-candidate", handleIncomingIceCandidate);
    peer.onicecandidate = handleLocalIceCandidate;

    // Handle ICE restart
    socket.on("ice-restart", async ({ offer, from }) => {
      try {
        console.log("🔄 Processing ICE restart offer");
        await peer.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);
        
        socket.emit("ice-restart-answer", {
          to: from,
          answer: answer
        });
      } catch (err) {
        console.error("Error handling ICE restart:", err);
      }
    });

    socket.on("ice-restart-answer", async ({ answer }) => {
      try {
        await peer.setRemoteDescription(new RTCSessionDescription(answer));
      } catch (err) {
        console.error("Error setting ICE restart answer:", err);
      }
    });

    return () => {
      socket.off("ice-candidate", handleIncomingIceCandidate);
      socket.off("ice-restart");
      socket.off("ice-restart-answer");
      if (peer) {
        peer.onicecandidate = null;
      }
    };
  }, [socket, peer]);

  // ------------------ Initial Setup ------------------
  useEffect(() => {
    if (!isInitialized.current) {
      isInitialized.current = true;
      getUserMediaStream();
    }
  }, [getUserMediaStream]);

  // ------------------ Socket Events ------------------
  useEffect(() => {
    if (!socket) return;

    console.log("🔌 Setting up socket listeners...");

    socket.on("joined-room", () => {
      dispatch({ type: "SET_HAS_JOINED_ROOM", payload: true });
      console.log("✅ Joined room");
    });

    socket.on("user-joined", handleNewUserJoined);
    socket.on("incoming-call", handleIncomingCall);
    socket.on("call-accepted", handleCallAccepted);
    
    socket.on("chat-message", (data) => {
      dispatch({ type: "ADD_MESSAGE", payload: data });
    });

    socket.on("user-left", ({ socketId }) => {
      console.log("🚪 User left:", socketId);
      
      // Cleanup
      pendingIncomingCall.current = null;
      remoteSocketIdRef.current = null;
      
      if (remoteVideoRef.current && remoteVideoRef.current.srcObject) {
        remoteVideoRef.current.srcObject.getTracks().forEach(t => t.stop());
        remoteVideoRef.current.srcObject = null;
      }
      
      remoteStreamRef.current = null;
      
      // Update state
      dispatch({ type: "SET_REMOTE_NAME", payload: null });
      dispatch({ type: "SET_REMOTE_EMAIL", payload: null });
      dispatch({ type: "SET_REMOTE_CAMERA", payload: false });
      dispatch({ type: "SET_REMOTEVIDEOREADY", payload: false });
      dispatch({ type: "END_CALL" });
      updateConnectionStatus("disconnected");
      
      toast("Other participant left", { icon: "👋" });
    });

    socket.on("connect_error", (error) => {
      console.error("❌ Socket error:", error);
      toast.error("Connection error");
    });

    return () => {
      socket.off("joined-room");
      socket.off("user-joined", handleNewUserJoined);
      socket.off("incoming-call", handleIncomingCall);
      socket.off("call-accepted", handleCallAccepted);
      socket.off("chat-message");
      socket.off("user-left");
      socket.off("connect_error");
    };
  }, [socket, handleNewUserJoined, handleIncomingCall, handleCallAccepted]);

  // ------------------ Media Controls ------------------
  const toggleCamera = async () => {
    if (!state.myStream) return;

    const newCameraState = !state.cameraOn;
    const videoTracks = state.myStream.getVideoTracks();
    
    videoTracks.forEach(track => {
      track.enabled = newCameraState;
    });

    dispatch({ type: "TOGGLE_CAMERA" });

    socket.emit("camera-toggle", {
      cameraOn: newCameraState,
      roomId,
    });

    toast(newCameraState ? "Camera ON" : "Camera OFF", {
      icon: newCameraState ? "📹" : "📵",
    });
  };

  const toggleMic = async () => {
    if (!state.myStream) return;
    
    const newMicState = !state.micOn;
    const audioTracks = state.myStream.getAudioTracks();
    
    for (const track of audioTracks) {
      track.enabled = newMicState;
      
      if (newMicState) {
        await applyAudioConstraints(track);
      }
    }
    
    dispatch({ type: "TOGGLE_MIC" });
    
    toast(newMicState ? "Mic ON" : "Mic OFF", {
      icon: newMicState ? "🎤" : "🔇",
    });
  };

  const toggleHandfree = async () => {
    if (!remoteVideoRef.current) return;
    
    const newHandfreeState = !state.usingHandfree;
    
    try {
      if (newHandfreeState && state.handfreeDeviceId) {
        // Switch to speaker
        await remoteVideoRef.current.setSinkId(state.handfreeDeviceId);
        
        // Adjust audio for speaker mode
        const audioTracks = state.myStream?.getAudioTracks();
        if (audioTracks?.length > 0) {
          await audioTracks[0].applyConstraints({
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: false,
            gain: 0.4 // Lower gain in speaker mode
          });
        }
        
        toast("Speaker Mode ON - Speak clearly", { 
          icon: "🔊",
          duration: 3000 
        });
      } else {
        // Switch to normal mode
        await remoteVideoRef.current.setSinkId("");
        
        // Restore normal settings
        const audioTracks = state.myStream?.getAudioTracks();
        if (audioTracks?.length > 0) {
          await audioTracks[0].applyConstraints({
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: false,
            gain: 0.6
          });
        }
        
        toast("Headphone Mode ON", { 
          icon: "🎧",
          duration: 2000 
        });
      }
      
      dispatch({ type: "TOGGLE_HANDFREE" });
      
    } catch (err) {
      console.error("Failed to toggle handfree:", err);
      toast.error("Failed to switch audio mode");
    }
  };

  // ------------------ UI Components ------------------
  const copyMeetingLink = async () => {
    const link = `${window.location.origin}/room/${roomId}`;
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Link copied!", { icon: "🔗" });
    } catch {
      toast.error("Failed to copy link");
    }
  };

  const leaveRoom = () => {
    // Cleanup
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
    }
    
    if (peer) {
      peer.close();
    }
    
    // Redirect
    setTimeout(() => {
      window.location.href = "/";
    }, 1000);
  };

  // Connection status indicator
  const getConnectionIndicator = () => {
    switch(state.connectionStatus) {
      case "connected":
        return <Wifi className="w-5 h-5 text-green-500" />;
      case "connecting":
        return <RefreshCw className="w-5 h-5 text-yellow-500 animate-spin" />;
      case "disconnected":
        return <WifiOff className="w-5 h-5 text-red-500" />;
      default:
        return <WifiOff className="w-5 h-5 text-gray-500" />;
    }
  };

  return (
    <div className="min-h-screen text-white bg-gradient-to-br from-gray-900 via-black to-blue-900">
      {/* Header */}
      <header className="fixed h-16 flex items-center justify-between bg-black/80 backdrop-blur-lg w-full px-4 z-50">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            {getConnectionIndicator()}
            <span className="font-semibold">
              {state.connectionStatus === "connected" ? "Connected" : 
               state.connectionStatus === "connecting" ? "Connecting..." : "Disconnected"}
            </span>
          </div>
          
          <div className="flex items-center space-x-4">
            <span className="font-bold">
              Room: <span className="text-blue-400">{roomId}</span>
            </span>
            
            {state.isCallActive && (
              <span className="px-3 py-1 rounded-full bg-green-900/50">
                <CallTime state={state} dispatch={dispatch} />
              </span>
            )}
          </div>
        </div>
        
        <div className="flex items-center space-x-4">
          <span className="flex items-center bg-gray-800 px-3 py-1 rounded-full">
            <Users className="w-4 h-4 mr-2" /> {totalUsers} online
          </span>
          <RealTimeClock />
        </div>
      </header>

      {/* Main Video Area */}
      <div className="pt-16 h-screen flex">
        {/* Remote Video */}
        <div className="flex-1 relative bg-black">
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className="w-full h-full object-cover"
          />
          
          {!state.remoteCameraOn && state.remoteName && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-32 h-32 rounded-full bg-blue-700 flex items-center justify-center text-4xl font-bold">
                {state.remoteName.charAt(0).toUpperCase()}
              </div>
            </div>
          )}
          
          {/* Status Overlay */}
          {!remoteStreamRef.current && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50">
              <div className="text-center">
                <CircleAlert className="w-16 h-16 mx-auto mb-4 text-yellow-500" />
                <h3 className="text-xl font-semibold mb-2">Waiting for participant</h3>
                <p className="text-gray-400">Share the link below to invite others</p>
                {state.isReconnecting && (
                  <div className="mt-4 flex items-center justify-center">
                    <RefreshCw className="w-5 h-5 mr-2 animate-spin" />
                    <span>Reconnecting...</span>
                  </div>
                )}
              </div>
            </div>
          )}
          
          {/* Remote Name */}
          {state.remoteName && (
            <div className="absolute bottom-4 left-4 bg-black/50 px-4 py-2 rounded-full">
              {state.remoteName}
            </div>
          )}
        </div>
        
        {/* Local Video */}
        <div className="absolute bottom-24 right-6 w-64 h-48 rounded-xl overflow-hidden shadow-2xl border-2 border-white/20">
          <video
            ref={myVideoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
          />
          
          {!state.cameraOn && (
            <div className="absolute inset-0 flex items-center justify-center bg-black">
              <div className="w-20 h-20 rounded-full bg-blue-700 flex items-center justify-center text-2xl font-bold">
                {state.myName.charAt(0).toUpperCase()}
              </div>
            </div>
          )}
          
          {/* Local Name */}
          <div className="absolute bottom-2 left-2 bg-black/50 px-3 py-1 rounded-full text-sm">
            {state.myName} (You)
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 flex items-center space-x-4 bg-black/80 backdrop-blur-lg px-6 py-3 rounded-full shadow-2xl">
        {/* Camera */}
        <button
          onClick={toggleCamera}
          className={`p-3 rounded-full ${state.cameraOn ? 'bg-gray-700' : 'bg-red-600'}`}
          title={state.cameraOn ? "Turn off camera" : "Turn on camera"}
        >
          {state.cameraOn ? <Camera /> : <CameraOff />}
        </button>
        
        {/* Microphone */}
        <button
          onClick={toggleMic}
          className={`p-3 rounded-full ${state.micOn ? 'bg-gray-700' : 'bg-red-600'}`}
          title={state.micOn ? "Mute microphone" : "Unmute microphone"}
        >
          {state.micOn ? <Mic /> : <MicOff />}
        </button>
        
        {/* Speaker/Headphone */}
        <button
          onClick={toggleHandfree}
          className={`p-3 rounded-full ${state.usingHandfree ? 'bg-blue-600' : 'bg-gray-700'}`}
          title={state.usingHandfree ? "Switch to headphones" : "Switch to speaker"}
        >
          {state.usingHandfree ? <Headphones /> : <Volume2 />}
        </button>
        
        {/* Reset Camera */}
        <button
          onClick={resetVideoStream}
          className="p-3 rounded-full bg-gray-700"
          title="Reset camera"
        >
          <RefreshCw className="w-5 h-5" />
        </button>
        
        {/* Share */}
        <button
          onClick={copyMeetingLink}
          className="p-3 rounded-full bg-green-600"
          title="Share meeting link"
        >
          <Share2 />
        </button>
        
        {/* Leave */}
        <button
          onClick={leaveRoom}
          className="p-3 rounded-full bg-red-600"
          title="Leave call"
        >
          <PhoneOff />
        </button>
      </div>

      {/* Connection Info */}
      <div className="fixed top-20 right-6 bg-black/70 backdrop-blur-sm p-4 rounded-xl max-w-xs">
        <h4 className="font-semibold mb-2">Connection Info</h4>
        <div className="space-y-1 text-sm">
          <div>Status: <span className="font-bold">{state.connectionStatus}</span></div>
          <div>ICE State: <span className="font-bold">{peer?.iceConnectionState || 'unknown'}</span></div>
          {state.remoteName && <div>Connected to: <span className="font-bold">{state.remoteName}</span></div>}
        </div>
      </div>

      <Toaster position="top-right" />
    </div>
  );
};

export default RoomPage;

// Updated roomReducer with new actions
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
  microphoneGain: 0.5,
  isEchoTested: false,
  connectionStatus: "disconnected",
  iceRestartAttempts: 0,
  videoRetryCount: 0,
  isReconnecting: false,
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
    case "SET_HANDFREE_DEVICE":
      return { ...state, handfreeDeviceId: action.payload };
    case "TOGGLE_HANDFREE":
      return { ...state, usingHandfree: !state.usingHandfree };
    case "SET_REMOTEVIDEOREADY":
      return { ...state, remoteVideoReady: action.payload };
    case "START_CALL":
      return {
        ...state,
        callStartTime: Date.now(),
        isCallActive: true,
      };
    case "END_CALL":
      return {
        ...state,
        callStartTime: null,
        isCallActive: false,
        callDuration: { hours: 0, minutes: 0, seconds: 0 },
      };
    case "SET_CONNECTION_STATUS":
      return { ...state, connectionStatus: action.payload };
    case "INCREMENT_ICE_RESTARTS":
      return { ...state, iceRestartAttempts: state.iceRestartAttempts + 1 };
    case "INCREMENT_VIDEO_RETRY":
      return { ...state, videoRetryCount: state.videoRetryCount + 1 };
    case "RESET_VIDEO_RETRY":
      return { ...state, videoRetryCount: 0 };
    case "SET_RECONNECTING":
      return { ...state, isReconnecting: action.payload };
    default:
      return state;
  }
}
