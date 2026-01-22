// RoomPage.jsx
import { useEffect, useCallback, useRef, useReducer, useMemo } from "react";
import { useParams } from "react-router-dom";
import { useSocket } from "../providers/Socket";
import { usePeer } from "../providers/Peer";
import { initialState, roomReducer } from "./roomReducer"; // Updated import
import RealTimeClock from "../components/RealTimeClock";
import CallTime from "../components/CallTime";
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
  RefreshCw,
} from "lucide-react";
import toast, { Toaster } from "react-hot-toast";

const RoomPage = () => {
  // Socket Destruction
  const { socket } = useSocket();
  const { peer, createOffer, createAnswer, setRemoteAns, sendStream, setRemoteSocketId } = usePeer();

  // RoomID
  const { roomId } = useParams();

  // Enhanced initialState
  const enhancedInitialState = useMemo(
    () => ({
      ...initialState,
      echoCancellationEnabled: true,
      noiseSuppressionEnabled: true,
      audioDevices: [],
      selectedAudioDevice: null,
      audioProcessingActive: true,
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
  const retryCountRef = useRef(0);
  const maxRetries = 3;

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
          ans: answer,
        });
        console.log("📨 Answer sent to:", from);
      } catch (err) {
        console.error("❌ Error creating answer:", err);
        toast.error("Failed to answer call");
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

      // Reset retry counter
      retryCountRef.current = 0;

      // Store pending call if stream is not ready
      if (!state.streamReady) {
        pendingIncomingCall.current = { fromEmail: emailId, fromName: name, socketId };
        console.log("⏳ Stream not ready, call pending...");
        return;
      }

      try {
        console.log("📞 Creating offer for:", emailId);
        const offer = await createOffer(socketId);
        socket.emit("call-user", {
          emailId,
          offer,
          socketId: socketId,
        });
        console.log("📨 Offer sent to:", emailId);
      } catch (err) {
        console.error("❌ Error creating offer:", err);
        toast.error("Failed to initiate call");
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
        toast.error("Failed to establish connection");
      }
    },
    [setRemoteAns],
  );

  // ------------------ Local Media ------------------
  const getUserMediaStream = useCallback(async () => {
    try {
      console.log("🎥 Requesting camera and microphone access...");

      // Stop existing stream first
      if (state.myStream) {
        state.myStream.getTracks().forEach(track => track.stop());
      }

      // Simplified constraints - let browser handle optimization
      const constraints = {
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 24 },
          facingMode: "user",
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      
      // Apply additional constraints to audio track
      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack) {
        try {
          await audioTrack.applyConstraints({
            channelCount: 1, // Force mono to reduce echo
            sampleRate: 16000,
          });
        } catch (constraintErr) {
          console.warn("Could not apply audio constraints:", constraintErr);
        }
      }

      console.log("✅ Media devices accessed successfully");
      
      // Update state first
      dispatch({ type: "SET_MY_STREAM", payload: stream });
      
      // Then send stream to peer connection
      if (sendStream) {
        await sendStream(stream);
      }
      
      // Update video element
      if (myVideoRef.current) {
        myVideoRef.current.srcObject = stream;
        console.log("✅ Local video stream attached");
      }

      dispatch({ type: "SET_STREAM_READY", payload: true });
      console.log("✅ Stream ready for WebRTC");

      // Handle pending calls
      if (pendingIncomingCall.current) {
        console.log("🔄 Processing pending incoming call...");
        handleIncomingCall(pendingIncomingCall.current);
        pendingIncomingCall.current = null;
      }
    } catch (err) {
      console.error("❌ Error accessing media devices:", err);
      toast.error("Failed to access camera/microphone");
    }
  }, [sendStream, handleIncomingCall, state.myStream]);

  // ------------------ Audio Processing ------------------
  useEffect(() => {
    if (!state.myStream || !state.audioProcessingActive) return;

    let audioContext = null;
    let source = null;
    let processor = null;
    let destination = null;

    const setupAudioProcessing = async () => {
      try {
        // Get audio track
        const audioTrack = state.myStream.getAudioTracks()[0];
        if (!audioTrack) return;

        // Create audio context with echo cancellation
        audioContext = new (window.AudioContext || window.webkitAudioContext)({
          sampleRate: 16000,
          latencyHint: 'interactive'
        });

        source = audioContext.createMediaStreamSource(new MediaStream([audioTrack]));
        destination = audioContext.createMediaStreamDestination();

        // Create a worklet node for better echo cancellation
        if (audioContext.audioWorklet) {
          try {
            await audioContext.audioWorklet.addModule('/audio-processor.js');
            processor = new AudioWorkletNode(audioContext, 'echo-cancellation-processor');
            
            // Connect nodes
            source.connect(processor);
            processor.connect(destination);
            
            console.log("✅ Audio worklet processor loaded");
          } catch (workletError) {
            console.log("Using fallback script processor");
            // Fallback to script processor
            createScriptProcessorFallback();
          }
        } else {
          createScriptProcessorFallback();
        }

        // Store references
        audioContextRef.current = audioContext;
        audioProcessorRef.current = processor;
        localAudioStreamRef.current = destination.stream;

        // Update peer connection with processed audio
        if (peer && sendStream && state.streamReady) {
          const videoTrack = state.myStream.getVideoTracks()[0];
          const processedStream = new MediaStream([
            ...(videoTrack ? [videoTrack] : []),
            ...destination.stream.getAudioTracks()
          ]);

          await sendStream(processedStream);
          console.log("✅ Audio processing applied");
        }

      } catch (error) {
        console.warn("Audio processing setup failed:", error);
        // Continue without audio processing
      }
    };

    // Fallback script processor
    const createScriptProcessorFallback = () => {
      processor = audioContext.createScriptProcessor(2048, 1, 1);
      
      let lastInput = 0;
      let noiseFloor = 0.01;
      
      processor.onaudioprocess = function(event) {
        const input = event.inputBuffer.getChannelData(0);
        const output = event.outputBuffer.getChannelData(0);
        
        // Calculate RMS
        let sum = 0;
        for (let i = 0; i < input.length; i++) {
          sum += input[i] * input[i];
        }
        const rms = Math.sqrt(sum / input.length);
        
        // Adaptive noise gate
        if (rms < 0.005) {
          noiseFloor = noiseFloor * 0.99 + rms * 0.01;
        }
        
        const threshold = Math.max(0.008, noiseFloor * 2);
        
        if (rms < threshold) {
          // Silence - noise gate active
          for (let i = 0; i < output.length; i++) {
            output[i] = 0;
          }
        } else {
          // Apply processing
          for (let i = 0; i < output.length; i++) {
            // High-pass filter (remove low frequencies that cause echo)
            const highPass = input[i] - lastInput * 0.8;
            lastInput = input[i];
            
            // Soft compression
            const compressed = Math.tanh(highPass * 2) / 2;
            
            // Output with reduced gain
            output[i] = compressed * 0.7;
          }
        }
      };
      
      source.connect(processor);
      processor.connect(destination);
    };

    setupAudioProcessing();

    return () => {
      // Cleanup
      if (processor) {
        processor.disconnect();
      }
      if (source) {
        source.disconnect();
      }
      if (audioContext && audioContext.state !== 'closed') {
        audioContext.close();
      }
    };
  }, [state.myStream, state.audioProcessingActive, peer, sendStream, state.streamReady]);

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

  // ------------------ Connection State Monitoring ------------------
  useEffect(() => {
    if (!peer) return;

    const handleStateChange = () => {
      console.log("🔍 Peer Connection State:", peer.connectionState);
      console.log("❄️ ICE Connection State:", peer.iceConnectionState);
      
      // If connection is stable, ensure remote video is playing
      if (peer.connectionState === 'connected' && remoteStreamRef.current) {
        setTimeout(() => {
          if (remoteVideoRef.current && remoteVideoRef.current.paused) {
            remoteVideoRef.current.play().catch(console.error);
          }
        }, 500);
      }
      
      // Handle connection failures
      if (peer.iceConnectionState === 'failed' || peer.iceConnectionState === 'disconnected') {
        console.log("🔄 Attempting to reconnect...");
        
        if (retryCountRef.current < maxRetries && state.remoteEmail && socket && remoteSocketIdRef.current) {
          retryCountRef.current++;
          
          setTimeout(() => {
            socket.emit("reconnect-request", {
              to: remoteSocketIdRef.current,
              roomId: roomId
            });
            toast(`Reconnecting... (${retryCountRef.current}/${maxRetries})`);
          }, 2000);
        }
      }
    };

    peer.addEventListener('connectionstatechange', handleStateChange);
    peer.addEventListener('iceconnectionstatechange', handleStateChange);

    return () => {
      peer.removeEventListener('connectionstatechange', handleStateChange);
      peer.removeEventListener('iceconnectionstatechange', handleStateChange);
    };
  }, [peer, socket, state.remoteEmail, roomId]);

  // ------------------ ICE Candidates ------------------
  useEffect(() => {
    if (!socket || !peer) return;

    // Handle incoming ICE candidates
    const handleIncomingIceCandidate = ({ candidate, from }) => {
      console.log("📥 Received ICE candidate from:", from, candidate);
      if (candidate && peer.remoteDescription) {
        peer.addIceCandidate(new RTCIceCandidate(candidate)).catch((err) => {
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

    // Handle renegotiation
    const handleRenegotiate = async ({ from, offer }) => {
      console.log("🔄 Renegotiation request from:", from);
      try {
        const answer = await createAnswer(offer);
        socket.emit("renegotiate-answer", {
          to: from,
          answer: answer,
        });
      } catch (err) {
        console.error("Renegotiation failed:", err);
      }
    };

    // Set up event listeners
    socket.on("ice-candidate", handleIncomingIceCandidate);
    socket.on("renegotiate", handleRenegotiate);
    peer.onicecandidate = handleLocalIceCandidate;

    return () => {
      socket.off("ice-candidate", handleIncomingIceCandidate);
      socket.off("renegotiate", handleRenegotiate);
      if (peer) {
        peer.onicecandidate = null;
      }
    };
  }, [socket, peer, createAnswer]);

  // ------------------ Remote Track ------------------
  useEffect(() => {
    if (!peer) return;

    const handleTrackEvent = (event) => {
      console.log("🎬 Track event received:", event.track.kind);
      
      if (event.streams && event.streams[0]) {
        const remoteStream = event.streams[0];
        remoteStreamRef.current = remoteStream;

        // Check if we have video tracks
        const hasVideo = remoteStream.getVideoTracks().length > 0;
        const hasAudio = remoteStream.getAudioTracks().length > 0;
        
        console.log(`Remote stream: Video: ${hasVideo}, Audio: ${hasAudio}`);

        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = remoteStream;
          
          // Play the video
          const playVideo = () => {
            if (remoteVideoRef.current && remoteVideoRef.current.paused) {
              remoteVideoRef.current.play()
                .then(() => {
                  console.log("✅ Remote video playing");
                  dispatch({ type: "SET_REMOTEVIDEOREADY", payload: true });
                })
                .catch(err => {
                  if (err.name !== "AbortError") {
                    console.error("❌ Error playing remote video:", err);
                  }
                });
            }
          };

          // Try playing with delay
          setTimeout(playVideo, 100);
          
          // Also try on canplay event
          remoteVideoRef.current.oncanplay = playVideo;
        }
      }
    };

    // Also listen for addstream event for backward compatibility
    const handleAddStream = (event) => {
      console.log("AddStream event:", event.stream);
      if (event.stream) {
        remoteStreamRef.current = event.stream;
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = event.stream;
        }
      }
    };

    peer.addEventListener("track", handleTrackEvent);
    peer.addEventListener("addstream", handleAddStream);

    return () => {
      peer.removeEventListener("track", handleTrackEvent);
      peer.removeEventListener("addstream", handleAddStream);
    };
  }, [peer]);

  // If remote video is not received yet, retry connecting
  useEffect(() => {
    if (!remoteStreamRef.current && state.remoteEmail && state.streamReady) {
      console.log("🔄 Retrying connection to remote user...");
      const retry = setTimeout(() => {
        if (remoteSocketIdRef.current && retryCountRef.current < maxRetries) {
          retryCountRef.current++;
          handleNewUserJoined({
            emailId: state.remoteEmail,
            name: state.remoteName,
            socketId: remoteSocketIdRef.current,
          });
        }
      }, 2000);
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

  // -------------------Copy Meeting Link---------------------------------
  const copyMeetingLink = async () => {
    const link = `${window.location.origin}/room/${roomId}`;

    // Updated message for production
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
        autoClose: 500,
      });
    }

    // Stop all local tracks
    if (state.myStream) {
      state.myStream.getTracks().forEach((track) => track.stop());
      console.log("🛑 Local media tracks stopped");
    }

    // Cleanup audio processing
    if (audioProcessorRef.current) {
      audioProcessorRef.current.disconnect();
    }
    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      audioContextRef.current.close();
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

    // Reset call timer
    dispatch({ type: "END_CALL" });

    // Reset retry counter
    retryCountRef.current = 0;

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

  // ------------------ Camera, Mic, Handfree ------------------

  // ------------------ toggleCamera ------------------
  const toggleCamera = async () => {
    if (!state.myStream) return;

    const newCameraState = !state.cameraOn;
    const videoTrack = state.myStream.getVideoTracks()[0];
    
    if (videoTrack) {
      try {
        // Enable/disable the track
        videoTrack.enabled = newCameraState;
        
        // If turning camera back on, refresh the track to prevent freezing
        if (newCameraState && !videoTrack.enabled) {
          // Get new video track with current constraints
          const stream = await navigator.mediaDevices.getUserMedia({
            video: {
              deviceId: videoTrack.getSettings().deviceId,
              width: { ideal: 640 },
              height: { ideal: 480 }
            },
            audio: false
          });
          
          const newVideoTrack = stream.getVideoTracks()[0];
          
          // Replace the track in our local stream
          state.myStream.removeTrack(videoTrack);
          state.myStream.addTrack(newVideoTrack);
          
          // Replace in peer connection
          const sender = peer.getSenders().find(s => s.track?.kind === 'video');
          if (sender) {
            sender.replaceTrack(newVideoTrack);
          }
          
          // Update video element
          if (myVideoRef.current) {
            myVideoRef.current.srcObject = state.myStream;
          }
        }
      } catch (err) {
        console.error("Error toggling camera:", err);
      }
    }

    dispatch({ type: "TOGGLE_CAMERA" });
    
    // Send camera state to remote
    if (socket && remoteSocketIdRef.current) {
      socket.emit("camera-toggle", {
        cameraOn: newCameraState,
        to: remoteSocketIdRef.current
      });
    }

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
  const toggleMic = () => {
    if (!state.myStream) return;

    const newMicState = !state.micOn;
    state.myStream.getAudioTracks().forEach((t) => {
      t.enabled = newMicState;
      // Apply echo cancellation when enabling mic
      if (newMicState) {
        t.applyConstraints({
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }).catch((err) => console.warn("Could not apply audio constraints:", err));
      }
    });

    dispatch({ type: "TOGGLE_MIC" });

    toast(newMicState ? "Mic ON" : "Mic OFF", {
      icon: newMicState ? "🎤" : "🔇",
    });
  };

  // ---------------- toggleHandFree -----------------------
  const toggleHandfree = async () => {
    if (!remoteVideoRef.current || !state.myStream) return;

    const micTracks = state.myStream.getAudioTracks();
    const newHandfreeState = !state.usingHandfree;

    if (newHandfreeState) {
      // Switch to speaker mode
      try {
        if (state.handfreeDeviceId) {
          await remoteVideoRef.current.setSinkId(state.handfreeDeviceId);
        }
        
        // Apply more aggressive echo cancellation in speaker mode
        micTracks.forEach(async (track) => {
          try {
            await track.applyConstraints({
              echoCancellation: { ideal: true },
              noiseSuppression: true,
              autoGainControl: false, // Disable auto gain in speaker mode
              channelCount: 1,
            });
            
            // Reduce microphone sensitivity
            const settings = track.getSettings();
            if (settings.volume !== undefined) {
              track.applyConstraints({ volume: 0.5 });
            }
          } catch (err) {
            console.warn("Could not apply speaker mode constraints:", err);
          }
        });

        dispatch({ type: "TOGGLE_HANDFREE" });
        toast("Speaker Mode ON - Echo cancellation enhanced", {
          icon: "🔊",
          duration: 3000,
        });
      } catch (err) {
        console.error("Failed to switch to speaker:", err);
        toast.error("Failed to switch to speaker mode");
      }
    } else {
      // Switch back to headphone mode
      try {
        await remoteVideoRef.current.setSinkId('');
        
        // Restore normal audio constraints
        micTracks.forEach(async (track) => {
          try {
            await track.applyConstraints({
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
              channelCount: 1,
            });
            
            // Restore normal volume
            const settings = track.getSettings();
            if (settings.volume !== undefined) {
              track.applyConstraints({ volume: 1.0 });
            }
          } catch (err) {
            console.warn("Could not apply headphone mode constraints:", err);
          }
        });

        dispatch({ type: "TOGGLE_HANDFREE" });
        toast("Headphone Mode ON", { icon: "🎧" });
      } catch (err) {
        console.error("Failed to switch to headphones:", err);
      }
    }
  };

  // ------------------ Enhanced Audio Controls ------------------

  // Add hardware echo cancellation toggle
  const toggleEchoCancellation = async () => {
    if (!state.myStream) return;

    const newEchoState = !state.echoCancellationEnabled;
    const audioTracks = state.myStream.getAudioTracks();

    for (const track of audioTracks) {
      try {
        await track.applyConstraints({
          echoCancellation: newEchoState,
          noiseSuppression: true,
          autoGainControl: true,
        });
      } catch (err) {
        console.warn("Could not toggle echo cancellation:", err);
      }
    }

    dispatch({ type: "TOGGLE_ECHO_CANCELLATION" });
    toast(newEchoState ? "Echo Cancellation ON" : "Echo Cancellation OFF", {
      icon: newEchoState ? "✅" : "❌",
    });
  };

  // Toggle noise suppression
  const toggleNoiseSuppression = async () => {
    if (!state.myStream) return;

    const newNoiseState = !state.noiseSuppressionEnabled;
    const audioTracks = state.myStream.getAudioTracks();

    for (const track of audioTracks) {
      try {
        await track.applyConstraints({
          echoCancellation: true,
          noiseSuppression: newNoiseState,
          autoGainControl: true,
        });
      } catch (err) {
        console.warn("Could not toggle noise suppression:", err);
      }
    }

    dispatch({ type: "TOGGLE_NOISE_SUPPRESSION" });
    toast(newNoiseState ? "Noise Suppression ON" : "Noise Suppression OFF", {
      icon: newNoiseState ? "🔇" : "🔊",
    });
  };

  // Toggle audio processing
  const toggleAudioProcessing = () => {
    const newAudioProcessingState = !state.audioProcessingActive;
    dispatch({ type: "SET_AUDIO_PROCESSING_ACTIVE", payload: newAudioProcessingState });

    toast(newAudioProcessingState ? "Audio Processing ON" : "Audio Processing OFF", {
      icon: newAudioProcessingState ? "🎚️" : "🔇",
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

  // ------------------ Select Audio Device ------------------
  const selectAudioDevice = async (deviceId) => {
    try {
      // Get current video constraints
      const videoTrack = state.myStream?.getVideoTracks()[0];
      const videoConstraints = videoTrack ? videoTrack.getSettings() : true;

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: { exact: deviceId },
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
        video: videoConstraints,
      });

      dispatch({ type: "SET_MY_STREAM", payload: stream });
      dispatch({ type: "SELECT_AUDIO_DEVICE", payload: deviceId });

      // Update peer connection with new stream
      if (sendStream) {
        await sendStream(stream);
      }

      toast.success("Audio device changed");
    } catch (err) {
      console.error("Failed to switch audio device:", err);
      toast.error("Failed to change audio device");
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
        // Use data.senderName that comes from backend
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
      retryCountRef.current = 0;
      console.log("🚪 User left:", socketId);

      // Stop and reset remote video
      if (remoteVideoRef.current && remoteVideoRef.current.srcObject) {
        remoteVideoRef.current.srcObject.getTracks().forEach((t) => t.stop());
        remoteVideoRef.current.srcObject = null;
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

    // Reconnection events
    socket.on("reconnect", (attemptNumber) => {
      console.log("✅ Reconnected after", attemptNumber, "attempts");
      toast.success("Reconnected!");
    });

    socket.on("reconnect_error", (error) => {
      console.error("❌ Reconnection error:", error);
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
      socket.off("reconnect");
      socket.off("reconnect_error");
    };
  }, [socket, handleNewUserJoined, handleIncomingCall, handleCallAccepted, state.isCallActive]);

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
  useEffect(() => {
    if (!socket) return;

    const handleChatMessage = (data) => {
      // If this is first message from remote user, store their name
      if (data.from !== socket.id && !state.remoteName && data.senderName) {
        dispatch({ type: "SET_REMOTE_NAME", payload: data.senderName });
      }
      // Add to messages
      dispatch({ type: "ADD_MESSAGE", payload: data });

      // Show toast if from other user
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

  // Process pending calls when stream is ready
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

  // Debug function (optional, can be removed)
  const debugWebRTC = () => {
    console.log("=== WEBRTC DEBUG INFO ===");
    console.log("Remote Socket ID:", remoteSocketIdRef.current);
    console.log("Peer Connection:", peer);
    console.log("ICE Servers:", peer?.getConfiguration()?.iceServers);
    console.log("Connection State:", peer?.connectionState);
    console.log("ICE Connection State:", peer?.iceConnectionState);
    console.log("Remote Stream:", remoteStreamRef.current);
    console.log("My Stream:", state.myStream);
    console.log("Socket Connected:", socket?.connected);
    console.log("Audio Processing Active:", state.audioProcessingActive);
    console.log("Echo Cancellation:", state.echoCancellationEnabled);
    console.log("Noise Suppression:", state.noiseSuppressionEnabled);
    console.log("Retry Count:", retryCountRef.current);
    console.log("=========================");
  };

  // Refresh connection
  const refreshConnection = () => {
    if (state.remoteEmail && remoteSocketIdRef.current) {
      retryCountRef.current = 0;
      handleNewUserJoined({
        emailId: state.remoteEmail,
        name: state.remoteName,
        socketId: remoteSocketIdRef.current,
      });
      toast("Refreshing connection...");
    }
  };

  // UI/UX Design
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
          className={`p-3 rounded-full ${state.echoCancellationEnabled ? "bg-green-700" : "bg-[#364355]"} hover:bg-[#2e4361] cursor-pointer`}
          title="Toggle Echo Cancellation"
        >
          <Ear className="w-5 h-5" />
        </div>

        <div
          onClick={toggleNoiseSuppression}
          className={`p-3 rounded-full ${state.noiseSuppressionEnabled ? "bg-green-700" : "bg-[#364355]"} hover:bg-[#2e4361] cursor-pointer`}
          title="Toggle Noise Suppression"
        >
          <Mic className="w-5 h-5" />
        </div>

        <div
          onClick={toggleAudioProcessing}
          className={`p-3 rounded-full ${state.audioProcessingActive ? "bg-green-700" : "bg-[#364355]"} hover:bg-[#2e4361] cursor-pointer`}
          title="Toggle Audio Processing"
        >
          <Volume2 className="w-5 h-5" />
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
          onClick={refreshConnection}
          className={`p-3 rounded-full bg-[#FF9800] hover:bg-[#F57C00] cursor-pointer`}
          title="Refresh Connection"
        >
          <RefreshCw className="w-5 h-5" />
        </div>

        <div
          onClick={leaveRoom}
          className={`p-3 rounded-full bg-[#ea002e] hover:bg-[#c7082e] cursor-pointer`}
          title="Leave Call"
        >
          <PhoneOff className="w-5 h-5" />
        </div>
      </div>

      {/* Audio Device Selection Dropdown (Optional - can be hidden by default) */}
      {state.audioDevices.length > 0 && (
        <div className="fixed bottom-28 right-4 bg-gray-800 p-2 rounded-lg shadow-lg z-50">
          <select
            onChange={(e) => selectAudioDevice(e.target.value)}
            value={state.selectedAudioDevice || ""}
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

      {/* Debug button (optional - remove in production) */}
      {process.env.NODE_ENV === "development" && (
        <button
          onClick={debugWebRTC}
          className="fixed bottom-24 left-4 bg-gray-800 text-white p-2 rounded-full text-xs z-50"
        >
          🐛 Debug
        </button>
      )}
    </div>
  );
};

export default RoomPage;
